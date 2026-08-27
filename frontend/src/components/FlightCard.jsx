import React from "react";
import { statusMeta, formatUnixUtc, formatGen } from "../lib/format";

export default function FlightCard({ policy, onOpen }) {
  if (!policy) return null;
  const meta = statusMeta(policy.status);
  return (
    <button
      onClick={onOpen}
      className="flex w-full flex-col gap-4 border rule px-5 py-5 text-left transition-colors hover:border-orange/40"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xl font-semibold tracking-tight text-ivory">
          {policy.airline_code} {policy.flight_number}
        </span>
        <span className={`flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] ${meta.color}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
      </div>

      <div className="flex items-center gap-3 font-mono text-xs text-ivory-soft/50">
        <span>{policy.departure_airport}</span>
        <span className="h-px flex-1 bg-ivory-soft/15" />
        <span>{formatUnixUtc(policy.scheduled_arrival_utc)}</span>
      </div>

      <div className="grid grid-cols-2 gap-y-1.5 border-t rule pt-4 font-mono text-xs">
        <span className="text-ivory-soft/40">Premium</span>
        <span className="text-right text-ivory">{formatGen(policy.premium)}</span>
        <span className="text-ivory-soft/40">Max coverage</span>
        <span className="text-right text-ivory">{formatGen(policy.max_coverage)}</span>
      </div>
    </button>
  );
}
