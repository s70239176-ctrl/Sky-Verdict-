import { createClient } from "genlayer-js";
import * as chains from "genlayer-js/chains";
const c = createClient({ chain: chains.studionet });
const t = await c.getTransaction({ hash: process.argv[2] });
const lr = t?.consensus_data?.leader_receipt;
const arr = Array.isArray(lr) ? lr : [lr];
for (const r of arr) {
  if (!r) continue;
  console.log("mode", r.mode, "result", JSON.stringify(r.result)?.slice(0, 400));
  for (const k of ["genvm_result", "stderr", "stdout"]) if (r[k]) console.log(k, JSON.stringify(r[k]).slice(0, 1500));
  const p = r?.result?.payload;
  if (typeof p === "string") { try { console.log("decoded:", Buffer.from(p, "base64").toString("utf8")); } catch {} }
}
