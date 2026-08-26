import React from "react";
import { motion } from "framer-motion";

const STAGES = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED"];

/**
 * The signature consensus visual, rebuilt clean and linear per the 2026
 * redesign brief — no glowing nodes, no radar sweep, no crypto-mining feel.
 *
 * Two honest data sources, nothing invented:
 *   1. `stage` — the real GenLayer consensus lifecycle name reported during
 *      a pending write (PENDING -> PROPOSING -> COMMITTING -> REVEALING ->
 *      ACCEPTED). Indicative of the real process, not a literal per-second
 *      telemetry feed.
 *   2. `sourcesUsed` / `sourcesTotal` — the contract's own real evidence
 *      count once a verdict resolves. The contract never exposes a
 *      validator count, so this component never claims one (no "8/8").
 */
export default function ValidatorConsensus({ stage = null, sourcesUsed = null, sourcesTotal = null }) {
  const resolved = sourcesUsed !== null && sourcesTotal !== null;
  const stageIndex = Math.max(0, STAGES.indexOf(stage));

  if (resolved) {
    return (
      <div className="flex flex-col gap-3">
        <div className="eyebrow flex items-center justify-between text-ivory-soft/50">
          <span>Evidence sources</span>
          <span className="text-ivory">
            {sourcesUsed} / {sourcesTotal}
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: Math.max(sourcesTotal, 1) }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 ${i < sourcesUsed ? "bg-green" : "bg-ivory-soft/15"}`}
            />
          ))}
        </div>
        <p className="text-xs text-ivory-soft/50">
          Independent validators fetched these sources on their own and reached the same decision.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      <div className="eyebrow text-ivory-soft/50">GenLayer consensus</div>
      <div className="flex items-center">
        {STAGES.map((s, i) => {
          const active = stage !== null && i <= stageIndex;
          const current = s === stage;
          return (
            <React.Fragment key={s}>
              <div className="flex flex-col items-center gap-2">
                <motion.span
                  className={`h-2.5 w-2.5 ${active ? "bg-orange" : "bg-ivory-soft/15"}`}
                  animate={current ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
                  transition={current ? { duration: 1.2, repeat: Infinity } : {}}
                />
                <span className={`eyebrow ${active ? "text-orange" : "text-ivory-soft/30"}`}>{s}</span>
              </div>
              {i < STAGES.length - 1 && (
                <div className={`mx-1 mb-6 h-px flex-1 ${i < stageIndex ? "bg-orange/60" : "bg-ivory-soft/15"}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
