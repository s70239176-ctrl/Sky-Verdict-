import React from "react";
import { decisionMeta, statusMeta } from "../lib/format";

/**
 * The dominant verdict word — the focal point of the Verdict Room. Renders
 * from real policy status / verdict decision only.
 */
export default function VerdictStatus({ status, decision }) {
  const meta = decision ? decisionMeta(decision) : statusMeta(status);
  const headline = decision ? decisionMeta(decision).headline : (statusMeta(status).verb || status);
  const color = decision ? decisionMeta(decision).color : statusMeta(status).color;

  return (
    <div className="flex flex-col gap-2">
      <span className="eyebrow text-ivory-soft/40">
        {status === "ACTIVE" ? "Monitoring" : "Verdict finalized"}
      </span>
      <h2 className={`text-display-2 font-extrabold ${color}`}>{headline}</h2>
    </div>
  );
}
