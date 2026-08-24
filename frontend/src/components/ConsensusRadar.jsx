import React from "react";
import { motion } from "framer-motion";

const STAGES = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED"];

/**
 * The signature visual for SkyVerdict: a radar screen where each blip is
 * one GenLayer validator independently fetching and judging the same
 * flight data. This mirrors the real consensus lifecycle Studio reports
 * (Consensus History: PENDING -> PROPOSING -> COMMITTING -> REVEALING ->
 * ACCEPTED) rather than an invented loading animation — it's meant to make
 * "independent validators reaching agreement" legible at a glance, which
 * is the actual mechanism this product is selling trust on.
 *
 * Props:
 *   stage       — current stage string, one of STAGES, or null for idle/ambient
 *   validators  — [{ label, agreed: true|false|null }] null = still deciding
 *   size        — px, default 280
 */
export default function ConsensusRadar({ stage = null, validators = [], size = 280 }) {
  const idle = !stage;
  const stageIndex = Math.max(0, STAGES.indexOf(stage));
  const nodeCount = Math.max(validators.length, idle ? 5 : validators.length);
  const nodes = idle
    ? Array.from({ length: 5 }, (_, i) => ({ label: `validator-${i + 1}`, agreed: null }))
    : validators;

  const radius = size / 2;
  const ringRadii = [0.28, 0.55, 0.85].map((f) => f * (radius - 24));

  return (
    <div className="flex flex-col items-center gap-4" role="img" aria-label={idle ? "Consensus radar, idle" : `Consensus stage: ${stage}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="absolute inset-0">
          <circle cx={radius} cy={radius} r={radius - 2} className="radar-grid-line" />
          {ringRadii.map((r, i) => (
            <circle key={i} cx={radius} cy={radius} r={r} className="radar-grid-line" opacity={0.6} />
          ))}
          <line x1={radius} y1={8} x2={radius} y2={size - 8} className="radar-grid-line" opacity={0.35} />
          <line x1={8} y1={radius} x2={size - 8} y2={radius} className="radar-grid-line" opacity={0.35} />
        </svg>

        {/* Sweep */}
        <motion.div
          className="absolute inset-0 origin-center"
          animate={{ rotate: 360 }}
          transition={{ duration: idle ? 8 : 3, repeat: Infinity, ease: "linear" }}
        >
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 h-1/2 w-[2px] origin-bottom"
            style={{
              background: "linear-gradient(to top, rgba(45,212,207,0.55), transparent)",
            }}
          />
        </motion.div>

        {/* Validator nodes */}
        {nodes.map((n, i) => {
          const angle = (i / nodeCount) * 2 * Math.PI - Math.PI / 2;
          const r = radius - 24;
          const x = radius + r * Math.cos(angle);
          const y = radius + r * Math.sin(angle);
          const color =
            n.agreed === true ? "#2DD4CF" : n.agreed === false ? "#FF5C5C" : "#FFB020";
          return (
            <motion.div
              key={n.label || i}
              className="absolute rounded-full"
              style={{
                left: x - 6,
                top: y - 6,
                width: 12,
                height: 12,
                background: color,
                boxShadow: `0 0 12px ${color}`,
              }}
              animate={n.agreed === null ? { scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] } : { scale: 1, opacity: 1 }}
              transition={n.agreed === null ? { duration: 1.6, repeat: Infinity } : { duration: 0.3 }}
              title={n.label}
            />
          );
        })}

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
            {idle ? "Standing by" : "Consensus"}
          </span>
          <span className={`font-mono text-sm font-semibold ${idle ? "text-ink-dim" : "text-cyan"}`}>
            {idle ? "—" : stage}
          </span>
        </div>
      </div>

      {/* Stage stepper */}
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider">
        {STAGES.map((s, i) => (
          <React.Fragment key={s}>
            <span
              className={
                !idle && i <= stageIndex ? "text-cyan" : "text-ink-faint"
              }
            >
              {s}
            </span>
            {i < STAGES.length - 1 && <span className="text-ink-faint">›</span>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
