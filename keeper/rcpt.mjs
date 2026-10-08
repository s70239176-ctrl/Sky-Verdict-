import { createClient } from "genlayer-js";
import * as chains from "genlayer-js/chains";
const c = createClient({ chain: chains.studionet });
const t = await c.getTransaction({ hash: process.argv[2] });
const drop = new Set(["calldata", "raw", "base64", "eq_outputs", "contract_state", "node_config"]);
const s = JSON.stringify(t, (k, v) => drop.has(k) ? "…" : typeof v === "bigint" ? v.toString() : v, 1);
console.log(s.replace(/\n\s*\d+,?/g, "").slice(0, 4000));
