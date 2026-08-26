import React from "react";
import { formatGen } from "../lib/format";

/**
 * amountWei is derived client-side using the contract's own public formula
 * (min(premium * multiplier / 10000, max_coverage)) from real policy
 * fields — never an invented figure.
 */
export default function SettlementStatus({ amountWei }) {
  return (
    <div className="border border-green/30 bg-green/5 px-6 py-6">
      <span className="eyebrow text-green">Settlement executed</span>
      <p className="mt-2 text-2xl font-bold text-ivory">Automatically</p>
      <p className="mt-3 text-sm text-ivory-soft/60">
        Nothing was filed. Nobody manually approved this. Consensus resolved the claim and the pool
        contract transferred funds in the same transaction.
      </p>
      <div className="mt-4 flex items-baseline gap-2 border-t rule pt-4">
        <span className="font-mono text-xs uppercase tracking-[0.08em] text-ivory-soft/40">Settled</span>
        <span className="font-mono text-lg font-semibold text-green">{formatGen(amountWei)}</span>
      </div>
    </div>
  );
}
