import React, { useEffect, useState } from "react";
import { getCalibration, getLossStats, getFinalizeQueue } from "../lib/v3Client";
import { formatGen } from "../lib/format";

const inputClass =
  "border rule bg-near-black px-3 py-2 font-mono text-sm text-ivory outline-none focus:border-orange/60";

function Stat({ label, value, sub }) {
  return (
    <div className="border rule px-4 py-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ivory-soft/40">{label}</div>
      <div className="mt-1 font-mono text-lg text-ivory">{value}</div>
      {sub && <div className="mt-1 text-xs text-ivory-soft/40">{sub}</div>}
    </div>
  );
}

const pct = (bps) => `${(Number(bps) / 100).toFixed(1)}%`;

/**
 * Self-calibrating pricing, made visible: what the model expected to pay,
 * what settled verdicts actually cost, and how each airline's risk estimate
 * has moved because of real outcomes. Plus verdicts ready to finalize.
 */
export default function ProtocolHealth() {
  const [loss, setLoss] = useState(null);
  const [queue, setQueue] = useState(null);
  const [airline, setAirline] = useState("AA");
  const [cal, setCal] = useState(null);
  const [calErr, setCalErr] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const l = await getLossStats(); if (alive) setLoss(l); } catch { /* older deployment */ }
      try { const q = await getFinalizeQueue(10); if (alive) setQueue(q); } catch { /* older deployment */ }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const code = airline.trim().toUpperCase();
    if (code.length < 2) return;
    setCalErr(false);
    const t = setTimeout(async () => {
      try { setCal(await getCalibration(code)); } catch { setCal(null); setCalErr(true); }
    }, 600);
    return () => clearTimeout(t);
  }, [airline]);

  if (!loss && !cal && calErr) return null; // pre-v3 contract: stay silent

  const ratio = loss && Number(loss.expected_loss_wei) > 0 ? Number(loss.realized_vs_expected_bps) / 100 : null;

  return (
    <section className="mt-8 border rule p-5">
      <h2 className="font-mono text-sm uppercase tracking-[0.08em] text-orange">Protocol health</h2>
      <p className="mt-2 max-w-2xl text-xs text-ivory-soft/50">
        Prices are not set by an admin. Every settled verdict feeds back into the risk estimate of that airline
        (credibility-weighted, clamped to 0.5×–3× of the prior), so the pool re-prices itself from what actually happens.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Expected payouts" value={loss ? formatGen(loss.expected_loss_wei) : "…"} sub="what pricing predicted" />
        <Stat label="Realized payouts" value={loss ? formatGen(loss.realized_loss_wei) : "…"} sub="actually paid" />
        <Stat
          label="Realized / expected"
          value={ratio === null ? "—" : `${ratio.toFixed(0)}%`}
          sub={ratio === null ? "no settled policies yet" : ratio > 100 ? "claims ran hotter than priced" : "claims ran cooler than priced"}
        />
        <Stat label="Policies written" value={loss ? Number(loss.policies_total).toLocaleString() : "…"} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs uppercase text-ivory-soft/50">Airline risk</span>
        <input className={`${inputClass} w-24`} value={airline} onChange={(e) => setAirline(e.target.value)} maxLength={3} />
        {cal && (
          <span className="font-mono text-xs text-ivory-soft/70">
            prior {pct(cal.prior_base_bps)} · observed over {Number(cal.observations)} settled{" "}
            {Number(cal.observations) > 0 ? `(${pct(cal.observed_base_bps)})` : ""} · weight {pct(cal.credibility_bps)} →{" "}
            <b className="text-ivory">effective {pct(cal.effective_base_bps)}</b>
            {!cal.calibrating && <span className="text-ivory-soft/40"> · needs 5 settled policies before it adapts</span>}
          </span>
        )}
      </div>

      <div className="mt-6 text-xs text-ivory-soft/50">
        Verdicts ready to finalize (challenge window closed — anyone can settle and earn the bounty):{" "}
        <span className="font-mono text-ivory">
          {queue === null ? "…" : queue.length ? queue.map((id) => `#${id}`).join("  ") : "none"}
        </span>
      </div>
    </section>
  );
}
