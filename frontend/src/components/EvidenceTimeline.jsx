import React from "react";

/**
 * items: [{ time, label, done, sub }]
 * Caller builds this from real policy/verdict fields only (see
 * PolicyDetail) — no invented events like "aircraft departed" that the
 * contract has no data for.
 */
export default function EvidenceTimeline({ items = [] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col">
      {items.map((item, i) => (
        <div key={i} className="flex gap-4 border-b rule py-3.5 last:border-b-0">
          <span className="w-20 shrink-0 font-mono text-xs tabular text-ivory-soft/40">{item.time}</span>
          <div className="flex flex-1 items-start justify-between gap-3">
            <div>
              <p className="text-sm text-ivory">{item.label}</p>
              {item.sub && <p className="mt-0.5 font-mono text-xs text-ivory-soft/40">{item.sub}</p>}
            </div>
            <span className={item.done ? "text-green" : "text-ivory-soft/25"}>{item.done ? "✓" : "·"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
