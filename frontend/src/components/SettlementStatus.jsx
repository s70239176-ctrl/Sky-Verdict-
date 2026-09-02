import React from "react";
import { formatGen } from "../lib/format";

/**
 * amountWei is policy.payout_amount_wei — the ground-truth amount the
 * contract actually transferred, NOT a client-side re-derivation of the
 * theoretical entitlement (premium * multiplier / 10000, capped at
 * max_coverage). Those two can legitimately differ: if the shared pool
 * didn't have enough liquidity to cover the full entitled amount at
 * settlement time, the contract pays out what it can and records
 * status PAID_PARTIAL — recomputing the theoretical figure here would
 * silently show the holder an amount they were never actually sent.
 *
 * entitledWei is optional and only used to render the shortfall note
 * when isPartial is true — it's informational context, not the number
 * displayed as "Settled".
 */
export default function SettlementStatus({ amountWei, isPartial = false, entitledWei = null }) {
  return (
    <div className={isPartial ? "border border-amber/30 bg-amber/5 px-6 py-6" : "border border-green/30 bg-green/5 px-6 py-6"}>
      <span className={isPartial ? "eyebrow text-amber" : "eyebrow text-green"}>
        {isPartial ? "Settlement executed — partial" : "Settlement executed"}
      </span>
      <p className="mt-2 text-2xl font-bold text-ivory">Automatically</p>
      <p className="mt-3 text-sm text-ivory-soft/60">
        Nothing was filed. Nobody manually approved this. Consensus resolved the claim and the pool
        contract transferred funds in the same transaction.
      </p>
      {isPartial && (
        <p className="mt-2 text-sm text-amber">
          The shared pool didn't hold enough liquidity to cover the full entitled payout at
          settlement time, so this policy received what the pool could actually cover
          {entitledWei != null ? ` (entitled to ${formatGen(entitledWei)})` : ""}.
        </p>
      )}
      <div className="mt-4 flex items-baseline gap-2 border-t rule pt-4">
        <span className="font-mono text-xs uppercase tracking-[0.08em] text-ivory-soft/40">Settled</span>
        <span className={isPartial ? "font-mono text-lg font-semibold text-amber" : "font-mono text-lg font-semibold text-green"}>
          {formatGen(amountWei)}
        </span>
      </div>
    </div>
  );
}
