import React from "react";
import { statusMeta, formatUnixUtc } from "../lib/format";

export default function PolicyCard({ policy, onOpen }) {
  if (!policy) return null;
  const meta = statusMeta(policy.status);
  return (
    <button
      onClick={onOpen}
      className="flex w-full flex-col gap-3 rounded-lg border border-grid bg-panel/60 p-5 text-left transition-colors hover:border-cyan/40 hover:bg-panel2/60"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-lg font-semibold text-ink-primary">
          {policy.airline_code}{policy.flight_number}
        </span>
        <span className={`flex items-center gap-1.5 text-xs font-medium ${meta.color}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 font-mono text-xs text-ink-dim">
        <span>Departure</span>
        <span className="text-right text-ink-primary">{policy.departure_airport}</span>
        <span>Scheduled arrival</span>
        <span className="text-right text-ink-primary">{formatUnixUtc(policy.scheduled_arrival_utc)}</span>
        <span>Premium</span>
        <span className="text-right text-amber">{policy.premium.toLocaleString()} wei</span>
        <span>Max coverage</span>
        <span className="text-right text-ink-primary">{policy.max_coverage.toLocaleString()} wei</span>
      </div>
    </button>
  );
}
