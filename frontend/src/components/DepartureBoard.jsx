import React from "react";
import { motion } from "framer-motion";
import { statusMeta } from "../lib/format";

/**
 * Rows styled after an airport split-flap departure board — the natural
 * vernacular for "flight status, publicly displayed" that this product's
 * whole premise is built on. Each row is one policy's real on-chain state.
 */
export default function DepartureBoard({ rows = [], emptyLabel = "No flights yet.", onRowClick }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-grid bg-panel/60 px-6 py-10 text-center">
        <p className="font-mono text-sm text-ink-dim">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-grid bg-panel/60">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-grid px-4 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-faint">
        <span>Flight</span>
        <span>Threshold</span>
        <span>Premium</span>
        <span>Status</span>
      </div>
      <div className="divide-y divide-grid">
        {rows.map((row, i) => {
          const meta = statusMeta(row.status);
          return (
            <motion.div
              key={row.policyId ?? i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.04 }}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-3 font-mono text-sm transition-colors ${
                onRowClick ? "cursor-pointer hover:bg-panel2/50" : ""
              }`}
            >
              <span className="split-flap tabular text-ink-primary">
                {row.airlineCode}{row.flightNumber} <span className="text-ink-faint">· {row.departureAirport}</span>
              </span>
              <span className="tabular text-ink-dim">{row.thresholdMinutes}m</span>
              <span className="tabular text-amber">{row.premium?.toLocaleString?.() ?? row.premium}</span>
              <span className={`flex items-center gap-1.5 ${meta.color}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
