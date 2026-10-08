// Live verification of the v3 features against a SANDBOX deployment
// (short challenge window, no settlement buffer, past flights insurable).
//   node live-v3.mjs deploy                       -> prints the new address
//   SKYVERDICT_ADDRESS=0x.. node live-v3.mjs seed|buy|evaluate|challenge|finalize|state
// Throwaway keys persist in .live-keys.json (git-ignored).
import fs from "node:fs";
import { createClient } from "genlayer-js";
import * as chains from "genlayer-js/chains";

// live-check.mjs reads SKYVERDICT_ADDRESS at import time; deploy needs none.
process.env.SKYVERDICT_ADDRESS ||= "0x0000000000000000000000000000000000000000";
const { lp, keeper, read, write, J } = await import("./live-check.mjs");

const now = () => Math.floor(Date.now() / 1000);
const URLS = [
  process.env.URL1 || "https://www.flightaware.com/live/flight/AAL100",
  process.env.URL2 || "https://www.flightstats.com/v2/flight-tracker/AA/100",
];
const EXTRA = [process.env.URL3 || "https://www.flightradar24.com/data/flights/aa100"];
const pid = Number(process.env.PID || 1);

async function state(label = "state") {
  const p = await read("get_policy", [pid]);
  console.log(label, J({
    status: p.status, prov: p.provisional_decision, deadline: p.challenge_deadline_utc,
    challenged: p.challenged, payout: p.payout_amount_wei, reserved: p.reserved_wei,
    bounty: p.keeper_bounty_wei, referrer: p.referrer, verdict: p.last_verdict_json,
  }));
}

const steps = {
  async deploy() {
    const { createAccount } = await import("genlayer-js");
    const code = fs.readFileSync("../contracts/SkyVerdict.py", "utf8");
    const args = process.env.DEPLOY_ARGS ? JSON.parse(process.env.DEPLOY_ARGS) : [lp.address, 120, 0, true];
    const c = createClient({ chain: chains.studionet, account: lp });
    const hash = await c.deployContract({ code, args, leaderOnly: false });
    const r = await c.waitForTransactionReceipt({ hash, status: "ACCEPTED", retries: 90, interval: 6000 });
    console.log("deploy tx", hash, r?.status_name ?? r?.status);
    console.log("NEW ADDRESS", r?.data?.contract_address ?? r?.txDataDecoded?.contractAddress ?? r?.to_address);
  },
  async seed() {
    await write(lp, "deposit_liquidity", [], 500000n);
    console.log("pool", J(await read("get_pool")));
  },
  async buy() {
    // A flight that has already happened: only insurable on a sandbox deployment.
    const dep = now() - 8 * 3600, arr = now() - 2 * 3600;
    await write(lp, "create_policy_referred",
      [keeper.address, "AA", "100", "JFK", dep, arr, 60, 20000, 20000], 10000n);
    console.log("total policies", await read("get_total_policies"));
    console.log("affiliate", J(await read("get_affiliate", [keeper.address])));
    await state("after buy");
  },
  async evaluate() {
    const r = await write(keeper, "evaluate_claim", [pid, URLS]);
    console.log("  result", J(r.result));
    await state("after evaluate");
  },
  async challenge() {
    const info = await read("get_challenge_info", [pid]);
    console.log("challenge info", J(info));
    const r = await write(lp, "challenge_claim", [pid, EXTRA], BigInt(info.bond_required_wei));
    console.log("  result", J(r.result));
    await state("after challenge");
  },
  async finalize() {
    const r = await write(keeper, "finalize_claim", [pid]);
    console.log("  result", J(r.result));
    await state("after finalize");
    console.log("pool", J(await read("get_pool")));
    console.log("calibration AA", J(await read("get_calibration", ["AA"])));
    console.log("loss stats", J(await read("get_loss_stats")));
  },
  async state() {
    await state();
    console.log("info", J(await read("get_challenge_info", [pid])));
    console.log("pool", J(await read("get_pool")));
  },
};
await steps[process.argv[2] || "state"]();
