#!/usr/bin/env node
// Deploy SkyVerdict v3 to GenLayer Studio with genlayer-js (the same calls
// verified live in keeper/live-v3.mjs).
//
//   DEPLOY_PRIVATE_KEY=0x... node deploy.mjs --creator 0xFeeReceiver            # production defaults
//   DEPLOY_PRIVATE_KEY=0x... node deploy.mjs --creator 0x... --sandbox           # demo: 10 min court, no buffer, past flights OK
//   node deploy.mjs --creator 0x... --dry-run                                    # print the constructor args only
//
// The deploying key becomes the contract OWNER (pause, allowlist, risk tuning,
// protocol-fee withdrawal) — use a key you control, not a throwaway.
//
// Flags: --window <sec>  challenge window (default 86400, 0 disables the court)
//        --buffer <sec>  settlement buffer after arrival (default 10800)
//        --sandbox       sandbox_mode=true AND (unless overridden) window=600, buffer=0
import fs from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import * as chains from "genlayer-js/chains";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);

const sandbox = flag("sandbox");
const creator = opt("creator");
const windowSec = Number(opt("window", sandbox ? 600 : 86400));
const bufferSec = Number(opt("buffer", sandbox ? 0 : 10800));
if (!creator || !/^0x[0-9a-fA-F]{40}$/.test(creator)) {
  console.error("Pass --creator 0x… (the address that receives the creator fee share).");
  process.exit(1);
}
const args = [creator, windowSec, bufferSec, sandbox];
console.log("constructor args:", JSON.stringify(args), sandbox ? "(SANDBOX)" : "(production)");
if (flag("dry-run")) process.exit(0);

if (!process.env.DEPLOY_PRIVATE_KEY) {
  console.error("Set DEPLOY_PRIVATE_KEY to the key that should own the contract.");
  process.exit(1);
}
const code = fs.readFileSync(new URL("../contracts/SkyVerdict.py", import.meta.url), "utf8");
const client = createClient({ chain: chains.studionet, account: createAccount(process.env.DEPLOY_PRIVATE_KEY) });

const hash = await client.deployContract({ code, args, leaderOnly: false });
console.log("deploy tx:", hash);
const r = await client.waitForTransactionReceipt({ hash, status: "ACCEPTED", retries: 90, interval: 6000 });
console.log("status:", r?.status_name ?? r?.status);
console.log("CONTRACT ADDRESS:", r?.data?.contract_address ?? r?.txDataDecoded?.contractAddress ?? r?.to_address);
console.log("Next: deposit_liquidity (the pool starts empty), then set VITE_SKYVERDICT_ADDRESS.");
