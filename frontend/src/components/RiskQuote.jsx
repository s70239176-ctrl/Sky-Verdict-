import React, { useEffect, useState } from "react";
import { getQuote, contractConfigured } from "../lib/genlayerClient";

/**
 * Live, on-chain price check for the terms being entered (get_quote).
 * Shows the contract's own risk estimate and the highest multiplier it will
 * accept, and flags when the pool has no free capital to back the policy —
 * so a rejected purchase is explained *before* the wallet prompt.
 * Debounced: hosted Studio rate-limits RPC, so this must not fire per keystroke.
 */
export default function RiskQuote({ airlineCode, departureAirport, thresholdMinutes, multiplierBps, premiumWei }) {
  const [q, setQ] = useState(null);
  const [err, setErr] = useState(false);

  const netPremium = Math.floor((Number(premiumWei) || 0) * 0.75);
  const intendedCoverage = Math.floor((netPremium * (Number(multiplierBps) || 0)) / 10000);

  useEffect(() => {
    if (!contractConfigured() || !airlineCode || !departureAirport || !Number(thresholdMinutes)) return;
    setErr(false);
    const t = setTimeout(async () => {
      try {
        setQ(await getQuote(airlineCode, departureAirport, thresholdMinutes, Math.max(intendedCoverage, 1)));
      } catch {
        setErr(true); // older deployment without v2 pricing — stay silent
      }
    }, 700);
    return () => clearTimeout(t);
  }, [airlineCode, departureAirport, thresholdMinutes, intendedCoverage]);

  if (err || !q) return null;
  const overMax = Number(multiplierBps) > Number(q.max_multiplier_bps);
  return (
    <div className="border rule px-4 py-3 font-mono text-xs text-ivory-soft/60">
      <div>
        On-chain risk estimate:{" "}
        <span className="text-ivory">{(Number(q.risk_bps) / 100).toFixed(1)}%</span> chance of payout · max multiplier{" "}
        <span className={overMax ? "text-amber" : "text-green"}>
          {(Number(q.max_multiplier_bps) / 10000).toFixed(2)}×
        </span>
      </div>
      {overMax && (
        <div className="mt-1 text-amber">
          This multiplier is above the contract's risk-priced maximum — the purchase would be rejected.
        </div>
      )}
      {!q.capacity_ok && (
        <div className="mt-1 text-amber">
          The underwriting pool doesn't currently have free capital to back this much cover. Lower the payout,
          or add liquidity on the Underwrite page.
        </div>
      )}
    </div>
  );
}
