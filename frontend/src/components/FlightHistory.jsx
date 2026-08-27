import React from "react";
import { motion } from "framer-motion";
import { statusMeta } from "../lib/format";

/**
 * Verdict history table — real on-chain rows only. Each row is one
 * policy's current state, read live from the contract by the caller.
 */
export default function FlightHistory({ rows = [], emptyLabel = "No flights yet.", onRowClick }) {
  if (rows.length === 0) {
    return (
      <div className="border rule px-6 py-14 text-center">
        <p className="font-mono text-sm text-ivory-soft/50">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="border rule">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b rule px-4 py-3">
        {["Flight", "Threshold", "Premium", "Status"].map((h) => (
          <span key={h} className="eyebrow text-ivory-soft/40">{h}</span>
        ))}
      </div>
      <div className="divide-y divide-ivory-soft/10">
        {rows.map((row, i) => {
          const meta = statusMeta(row.status);
          return (
            <motion.div
              key={row.policyId ?? i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-3.5 font-mono text-sm transition-colors ${
                onRowClick ? "cursor-pointer hover:bg-graphite" : ""
              }`}
            >
              <span className="split-flap tabular text-ivory">
                {row.airlineCode} {row.flightNumber}{" "}
                <span className="text-ivory-soft/35">· {row.departureAirport}</span>
              </span>
              <span className="tabular text-ivory-soft/50">{row.thresholdMinutes}m</span>
              <span className="tabular text-ivory-soft/70">{row.premium?.toLocaleString?.() ?? row.premium}</span>
              <span className={`flex items-center gap-1.5 justify-self-end ${meta.color}`}>
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
