import React from "react";

const MIN_SOURCES_REQUIRED = 2; // mirrors contracts/SkyVerdict.py — kept in sync manually

/**
 * "How this verdict was reached" — the transparency differentiator.
 *
 * Deliberately scoped to what the contract actually stores and what its
 * aggregation logic (_derive_verdict in SkyVerdict.py) actually does:
 * a real quorum count, a real median-delay calculation, a real
 * majority-vote cancellation rule. It does NOT claim to show which URL
 * each individual validator fetched or their raw LLM reasoning — the
 * contract only ever stores the final agreed numbers, not a per-validator
 * transcript, so showing more than that would be inventing data.
 */
export default function ReasoningPanel({ verdict, thresholdMinutes }) {
  if (!verdict) return null;
  const { decision, cancelled, delay_minutes, sources_used, sources_total } = verdict;
  const quorumMet = sources_used >= MIN_SOURCES_REQUIRED;

  return (
    <div className="border rule px-6 py-6">
      <span className="eyebrow text-ivory-soft/40">How this verdict was reached</span>

      <div className="mt-5 flex flex-col gap-4">
        <Step
          n="1"
          label="Independent reads"
          done
          detail={`Each validator fetched the submitted sources on its own and extracted a status. ${sources_used} of ${sources_total} reads came back usable (clear status, confidence ≥ 50%).`}
        />
        <Step
          n="2"
          label="Quorum check"
          done={quorumMet}
          detail={
            quorumMet
              ? `At least ${MIN_SOURCES_REQUIRED} independent sources agreed enough to proceed.`
              : `Fewer than ${MIN_SOURCES_REQUIRED} sources came back usable, so the network correctly refused to guess — that's the fail-safe working, not a bug.`
          }
        />
        {quorumMet && (
          <>
            <Step
              n="3"
              label="Cancellation vote"
              done
              detail={
                cancelled
                  ? "A majority of valid reads reported the flight as cancelled."
                  : "No majority reported cancellation — evaluated as a delay/on-time case instead."
              }
            />
            {!cancelled && (
              <Step
                n="4"
                label="Delay calculation"
                done
                detail={`The median delay across valid reads was ${delay_minutes} minutes (median, not average, so one hallucinated outlier can't skew it) — checked against your ${thresholdMinutes}-minute threshold.`}
              />
            )}
          </>
        )}
        <Step
          n={quorumMet ? (cancelled ? "4" : "5") : "3"}
          label="Final decision"
          done
          highlight
          detail={`${decision}${cancelled ? " (cancelled)" : ""} — this is what every validator that reached quorum independently agreed on, not a value any single party asserted.`}
        />
      </div>

      <p className="mt-5 border-t rule pt-4 text-xs text-ivory-soft/40">
        The contract stores this aggregate outcome, not a per-validator transcript — so this shows
        exactly what SkyVerdict itself has to check its work against, nothing embellished.
      </p>
    </div>
  );
}

function Step({ n, label, detail, done, highlight }) {
  return (
    <div className="flex gap-3">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center font-mono text-[10px] ${
          highlight ? "bg-orange text-ink" : done ? "border border-green/50 text-green" : "border border-ivory-soft/20 text-ivory-soft/30"
        }`}
      >
        {n}
      </span>
      <div>
        <p className={`text-sm font-medium ${highlight ? "text-orange" : "text-ivory"}`}>{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ivory-soft/50">{detail}</p>
      </div>
    </div>
  );
}
