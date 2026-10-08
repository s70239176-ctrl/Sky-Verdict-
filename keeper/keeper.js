#!/usr/bin/env node
// SkyVerdict keeper — settles due claims automatically and collects the
// on-chain keeper bounty. It holds no special power: evaluate_claim is
// permissionless and the contract, not this bot, decides every outcome.
//
//   KEEPER_PRIVATE_KEY=0x... SKYVERDICT_ADDRESS=0x... node keeper.js
//   node keeper.js --dry-run     # list what it WOULD settle, send nothing
//   node keeper.js --once        # one pass, then exit (cron / CI friendly)
//
// Env: GENLAYER_CHAIN (default studionet), GENLAYER_RPC_URL (optional),
//      POLL_SECONDS (default 300), MAX_PER_PASS (default 3).
// Hosted Studio rate-limits RPC (~30 req/min), so calls are spaced out.
import { createClient, createAccount } from "genlayer-js";
import * as chains from "genlayer-js/chains";
import { sourceUrlsFor, shouldSettle, shouldFinalize } from "./sources.js";

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const ONCE = args.has("--once");
const ADDRESS = process.env.SKYVERDICT_ADDRESS;
const POLL_MS = Number(process.env.POLL_SECONDS || 300) * 1000;
const MAX_PER_PASS = Number(process.env.MAX_PER_PASS || 3);
const SPACING_MS = 3000;

if (!ADDRESS) {
  console.error("Set SKYVERDICT_ADDRESS to the deployed contract address.");
  process.exit(1);
}
if (!DRY && !process.env.KEEPER_PRIVATE_KEY) {
  console.error("Set KEEPER_PRIVATE_KEY (a throwaway funded key), or use --dry-run.");
  process.exit(1);
}

const chain = chains[process.env.GENLAYER_CHAIN || "studionet"];
if (!chain) throw new Error("Unknown GENLAYER_CHAIN");
const account = process.env.KEEPER_PRIVATE_KEY ? createAccount(process.env.KEEPER_PRIVATE_KEY) : undefined;
const client = createClient({
  chain,
  ...(account ? { account } : {}),
  ...(process.env.GENLAYER_RPC_URL ? { endpoint: process.env.GENLAYER_RPC_URL } : {}),
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);
const handled = new Set(); // policy ids this process already attempted

async function finalizePass() {
  let queue;
  try {
    queue = await client.readContract({ address: ADDRESS, functionName: "get_finalize_queue", args: [MAX_PER_PASS * 3] });
  } catch { return; } // pre-v3 contract: no court, nothing to finalize
  if (queue.length) log(`finalize queue: ${queue.map((i) => "#" + i).join(" ")}`);
  let sent = 0;
  for (const id of queue) {
    if (sent >= MAX_PER_PASS) break;
    await sleep(SPACING_MS);
    const policy = await client.readContract({ address: ADDRESS, functionName: "get_policy", args: [Number(id)] });
    if (!shouldFinalize(policy, Math.floor(Date.now() / 1000), handled)) continue;
    if (DRY) { log(`[dry-run] would finalize #${id} (${policy.provisional_decision})`); continue; }
    handled.add("f" + policy.policy_id);
    log(`finalizing #${id} …`);
    try {
      const hash = await client.writeContract({ address: ADDRESS, functionName: "finalize_claim", args: [Number(id)] });
      await client.waitForTransactionReceipt({ hash, status: "ACCEPTED", retries: 60, interval: 5000 });
      const after = await client.readContract({ address: ADDRESS, functionName: "get_policy", args: [Number(id)] });
      log(`#${id} -> ${after.status} (payout ${after.payout_amount_wei}, bounty ${after.keeper_bounty_wei})`);
      sent++;
    } catch (e) {
      log(`#${id} finalize failed: ${e?.message || e}`);
    }
  }
}

async function pass() {
  let bufferSec = 3 * 3600;
  try {
    const pool = await client.readContract({ address: ADDRESS, functionName: "get_pool", args: [] });
    bufferSec = Number(pool.settlement_buffer_seconds ?? bufferSec);
  } catch { /* keep default */ }
  await finalizePass();
  const queue = await client.readContract({
    address: ADDRESS, functionName: "get_keeper_queue", args: [MAX_PER_PASS * 3],
  });
  log(`queue: ${queue.length ? queue.map((i) => "#" + i).join(" ") : "empty"}`);
  let sent = 0;
  for (const id of queue) {
    if (sent >= MAX_PER_PASS) break;
    await sleep(SPACING_MS);
    const policy = await client.readContract({ address: ADDRESS, functionName: "get_policy", args: [Number(id)] });
    if (!shouldSettle(policy, Math.floor(Date.now() / 1000), handled, bufferSec)) continue;
    const urls = sourceUrlsFor(policy);
    if (DRY) {
      log(`[dry-run] would settle #${id} ${policy.airline_code}${policy.flight_number} with`, urls);
      continue;
    }
    handled.add(policy.policy_id); // never retry blindly: a NO_QUORUM leaves it INDETERMINATE for a human appeal
    log(`settling #${id} …`);
    try {
      const hash = await client.writeContract({
        address: ADDRESS, functionName: "evaluate_claim", args: [Number(id), urls],
      });
      await client.waitForTransactionReceipt({ hash, status: "ACCEPTED", retries: 60, interval: 5000 });
      const after = await client.readContract({ address: ADDRESS, functionName: "get_policy", args: [Number(id)] });
      log(`#${id} -> ${after.status} (payout ${after.payout_amount_wei}, bounty ${after.keeper_bounty_wei})`);
      sent++;
    } catch (e) {
      log(`#${id} failed: ${e?.message || e}`);
    }
  }
}

(async () => {
  log(`keeper up · contract ${ADDRESS} · ${DRY ? "DRY RUN" : "live"} · ${account?.address || "no account"}`);
  do {
    try { await pass(); } catch (e) { log("pass failed:", e?.message || e); }
    if (ONCE) break;
    await sleep(POLL_MS);
  } while (true);
})();
