import React from "react";
import { motion } from "framer-motion";

/**
 * The hero flight-route visual. The contract only ever stores a departure
 * airport (no destination — see docs/TRD.md), so this component is honest
 * about that split:
 *   - Pass origin + destination for illustrative/marketing use (the hero
 *     example is clearly labeled illustrative where it's used).
 *   - Pass origin only for a real policy — renders a single-point
 *     "monitoring" state instead of inventing an endpoint.
 */
export default function FlightRoute({
  originCode,
  originCity,
  destCode,
  destCity,
  flightLabel,
  dateLabel,
  live = false,
  evidence = [],
}) {
  const hasRoute = Boolean(destCode);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-6">
        <div>
          <div className="eyebrow text-ivory-soft/50">{originCity || "Origin"}</div>
          <div className="mt-1 font-mono text-3xl font-semibold text-ivory">{originCode}</div>
        </div>

        {hasRoute && (
          <>
            <div className="relative h-px flex-1 bg-ivory-soft/15">
              <motion.div
                className="absolute -top-2 text-orange"
                initial={{ left: "0%" }}
                animate={{ left: live ? "92%" : "50%" }}
                transition={{ duration: 2.4, ease: "easeInOut" }}
              >
                ✈
              </motion.div>
            </div>
            <div className="text-right">
              <div className="eyebrow text-ivory-soft/50">{destCity || "Destination"}</div>
              <div className="mt-1 font-mono text-3xl font-semibold text-ivory">{destCode}</div>
            </div>
          </>
        )}

        {!hasRoute && (
          <div className="relative h-px flex-1 bg-gradient-to-r from-ivory-soft/15 to-transparent">
            <motion.div
              className="absolute -top-2 text-orange"
              animate={{ left: ["0%", "70%"] }}
              transition={{ duration: 2.8, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
              style={{ left: "0%" }}
            >
              ✈
            </motion.div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-ivory-soft/50">
        <span className="tracking-[0.08em]">
          {flightLabel}
          {dateLabel ? ` · ${dateLabel}` : ""}
        </span>
        {live && (
          <span className="flex items-center gap-1.5 text-orange">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-orange" />
            MONITORING FLIGHT
          </span>
        )}
      </div>

      {evidence.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t rule pt-4">
          {evidence.map((e) => (
            <span
              key={e.label}
              className={`eyebrow flex items-center gap-1.5 ${e.done ? "text-green" : "text-ivory-soft/35"}`}
            >
              {e.label}
              {e.done && <span aria-hidden="true">✓</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
