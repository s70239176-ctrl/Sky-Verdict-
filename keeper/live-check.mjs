// Live regression against a deployed SkyVerdict v2 on Studio.
//   SKYVERDICT_ADDRESS=0x... node live-check.mjs [step]
// Uses throwaway keys generated in-process (Studionet needs no funded account).
// Throttled + retrying because hosted Studio allows ~30 RPC requests/min.
import { createClient, createAccount } from "genlayer-js";
import * as chains from "genlayer-js/chains";

const ADDRESS = process.env.SKYVERDICT_ADDRESS;
const chain = chains.studionet;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const J = (v) => JSON.stringify(v, (k, x) => (typeof x === "bigint" ? x.toString() : x));

async function retry(fn, label) {
  for (let i = 0; i < 8; i++) {
    try { return await fn(); } catch (e) {
      const m = String(e?.message || e);
      if (/32029|rate|fetch failed|<html/i.test(m)) { await sleep(15000); continue; }
      throw e;
    }
  }
  throw new Error(`${label}: retries exhausted`);
}

import fs from "node:fs";
// Keys persist between runs (KEYFILE) so shares/policies stay owned by the same account.
const KEYFILE = process.env.KEYFILE || ".live-keys.json";
let keys;
try { keys = JSON.parse(fs.readFileSync(KEYFILE, "utf8")); } catch {
  keys = { lp: generatePk(), keeper: generatePk() };
  fs.writeFileSync(KEYFILE, JSON.stringify(keys));
}
function generatePk() { return "0x" + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
export const lp = createAccount(keys.lp);
export const keeper = createAccount(keys.keeper);
const clientFor = (account) => createClient({ chain, account });
const reader = createClient({ chain });

export const read = (fn, args = []) =>
  retry(() => reader.readContract({ address: ADDRESS, functionName: fn, args }), fn);

export async function write(account, fn, args = [], value) {
  const c = clientFor(account);
  const hash = await retry(
    () => c.writeContract({ address: ADDRESS, functionName: fn, args, ...(value !== undefined ? { value } : {}) }),
    fn,
  );
  const r = await retry(
    () => c.waitForTransactionReceipt({ hash, status: "ACCEPTED", retries: 90, interval: 6000 }),
    fn + " receipt",
  );
  const result = r?.consensus_data?.leader_receipt?.[0]?.result ?? r?.consensus_data?.leader_receipt?.result;
  console.log(`  tx ${fn}: ${hash}  status=${r?.status_name ?? r?.status}`);
  return { hash, receipt: r, result };
}

const now = () => Math.floor(Date.now() / 1000);
const steps = {
  async deploy() {
    const code = fs.readFileSync("../contracts/SkyVerdict.py", "utf8");
    const c = clientFor(lp);
    const hash = await retry(() => c.deployContract({ code, args: [lp.address], leaderOnly: false }), "deploy");
    const r = await retry(() => c.waitForTransactionReceipt({ hash, status: "ACCEPTED", retries: 90, interval: 6000 }), "deploy receipt");
    const addr = r?.data?.contract_address ?? r?.txDataDecoded?.contractAddress ?? r?.to_address;
    console.log("  deploy tx", hash, "status", r?.status_name ?? r?.status);
    console.log("  NEW ADDRESS", addr);
  },
  async probe() {
    console.log("pool", J(await read("get_pool")));
  },
  async fund() {
    await write(lp, "deposit_liquidity", [], 200000n);
    console.log("pool", J(await read("get_pool")));
    console.log("lp", J(await read("get_underwriter", [lp.address])));
  },
  async buy() {
    const dep = now() + 2 * 3600, arr = now() + 3 * 3600, premium = 10000n;
    console.log("quote", J(await read("get_quote", ["DL", "JFK", 180, 22500])));
    await write(lp, "create_policy", ["DL", "DL202", "JFK", dep, arr, 180, 30000, 30000], premium);
    const n = await read("get_total_policies");
    console.log("policies", n, J(await read("get_policy", [Number(n)])));
    console.log("pool", J(await read("get_pool")));
  },
  async overpriced() {
    // 100x multiplier must be rejected by risk pricing; value stays in the contract on a failed tx, so keep it tiny.
    const dep = now() + 2 * 3600, arr = now() + 3 * 3600;
    const before = await read("get_total_policies");
    await write(lp, "create_policy", ["DL", "DL202", "JFK", dep, arr, 60, 1000000, 100], 100n).catch((e) => console.log("  rejected:", String(e.message).split(String.fromCharCode(10))[0]));
    console.log("policies before/after", before, await read("get_total_policies"));
  },
  async exit() {
    const u = await read("get_underwriter", [lp.address]);
    console.log("lp", J(u));
    await write(lp, "request_withdrawal", [1000]);
    console.log("lp", J(await read("get_underwriter", [lp.address])));
    const r = await write(lp, "execute_withdrawal", []);
    console.log("  execute result:", J(r.result), "(expected: cooldown revert)");
    console.log("lp", J(await read("get_underwriter", [lp.address])));
  },
  async early() {
    const urls = ["https://www.flightaware.com/live/flight/DAL202", "https://www.flightstats.com/v2/flight-tracker/DL/202"];
    const r = await write(keeper, "evaluate_claim", [1, urls]);
    console.log("  early evaluate result:", J(r.result), "(expected contract_error: buffer not elapsed)");
    const p = await read("get_policy", [1]);
    console.log("  policy status", p.status, "bounty", p.keeper_bounty_wei, "reserved", p.reserved_wei);
    const r2 = await write(lp, "claim_refund", [1]);
    console.log("  early refund result:", J(r2.result), "(expected contract_error: window not expired)");
    console.log("pool", J(await read("get_pool")));
  },
  async keeperq() {
    console.log("queue", J(await read("get_keeper_queue", [10])));
  },
};
if (process.argv[1].endsWith("live-check.mjs")) {
  const which = process.argv[2] || "probe";
  console.log("LP account", lp.address, "| keeper account", keeper.address);
  await steps[which]?.();
}
