import React, { useEffect, useState, useRef } from "react";
import { getPolicy, evaluateClaim, appeal, claimRefund, classifyDelayCause } from "../lib/genlayerClient";
import { statusMeta, formatUnixUtc, formatGen } from "../lib/format";
import { validateSourceUrls } from "../lib/sourceValidation";
import VerdictStatus from "../components/VerdictStatus";
import ValidatorConsensus from "../components/ValidatorConsensus";
import EvidenceTimeline from "../components/EvidenceTimeline";
import SettlementStatus from "../components/SettlementStatus";
import ReasoningPanel from "../components/ReasoningPanel";
import { useWallet } from "../context/WalletContext";
import { useToast } from "../context/ToastContext";

const STAGES = ["PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED"];
const POLL_INTERVAL_MS = 4000;
const MAX_WAIT_MS = 120000; // 2 minutes — after this, stop blocking the UI and say so plainly

function SourceUrlList({ urls, setUrls }) {
  const update = (i) => (e) => {
    const next = [...urls];
    next[i] = e.target.value;
    setUrls(next);
  };
  const add = () => setUrls([...urls, ""]);
  const remove = (i) => setUrls(urls.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-col gap-2">
      {urls.map((u, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={u}
            onChange={update(i)}
            placeholder="https://flightaware.com/live/…"
            className="flex-1 border rule bg-near-black px-3 py-2 font-mono text-xs text-ivory outline-none focus:border-orange/60"
          />
          {urls.length > 1 && (
            <button type="button" onClick={() => remove(i)} className="px-2 text-ivory-soft/40 hover:text-amber">
              ✕
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={add} className="w-fit text-xs text-orange hover:underline">
        + Add another source
      </button>
    </div>
  );
}

export default function PolicyDetail({ policyId, setView }) {
  const { account } = useWallet();
  const toast = useToast();
  const [policy, setPolicy] = useState(null);
  const [error, setError] = useState(null);
  const [sourceUrls, setSourceUrls] = useState(["https://flightaware.com/live/", "https://flightradar24.com/"]);
  const [causeUrl, setCauseUrl] = useState("https://flightaware.com/live/");
  const [pending, setPending] = useState(null); // 'evaluate' | 'appeal' | 'refund' | 'classify' | null
  const [stage, setStage] = useState(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const stageTimer = useRef(null);
  const pollTimer = useRef(null);
  const elapsedTimer = useRef(null);
  const settledRef = useRef(false);

  const load = async () => {
    setError(null);
    try {
      const p = await getPolicy(policyId);
      setPolicy(p);
      return p;
    } catch (e) {
      setError(e.message || String(e));
      return null;
    }
  };

  useEffect(() => {
    load();
    return () => {
      clearInterval(stageTimer.current);
      clearInterval(pollTimer.current);
      clearInterval(elapsedTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyId]);

  const finishPending = (successMessage) => {
    if (settledRef.current) return; // already handled by the other race branch
    settledRef.current = true;
    clearInterval(stageTimer.current);
    clearInterval(pollTimer.current);
    clearInterval(elapsedTimer.current);
    setStage("ACCEPTED");
    setTimeout(() => setStage(null), 1200);
    setPending(null);
    setTimedOut(false);
    if (successMessage) toast.success(successMessage);
  };

  const runWithRadar = async (kind, fn) => {
    if (!account) {
      toast.error("Connect a wallet or start demo mode first.");
      return;
    }
    const beforeStatus = policy?.status;
    const beforeVerdict = policy?.last_verdict_json;
    const beforeCause = policy?.delay_cause_json;
    settledRef.current = false;
    setTimedOut(false);
    setElapsedSec(0);
    setPending(kind);

    let i = 0;
    setStage(STAGES[0]);
    // Indicative animation only — cycles through the real GenLayer consensus
    // stage names while we wait. Not a live per-validator feed (genlayer-js
    // doesn't stream that here); it's what to expect, not a claim about
    // what's happening at each instant.
    stageTimer.current = setInterval(() => {
      i = Math.min(i + 1, STAGES.length - 2);
      setStage(STAGES[i]);
    }, 1400);

    elapsedTimer.current = setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);

    const kindLabel = { evaluate: "Evaluation", appeal: "Appeal", refund: "Refund", classify: "Classification" }[kind] || "Action";

    // Independent background poll of the REAL on-chain state. This exists
    // because genlayer-js's write-call promise has, in practice, sometimes
    // hung indefinitely even after the transaction actually finished
    // on-chain (see docs/genvm-gotchas.md) — without this, the button would
    // stay stuck on "Awaiting consensus…" forever with no way out, and the
    // only fix would be a manual page refresh. Polling means we notice a
    // real state change even if the write promise itself never resolves.
    //
    // classify_delay_cause changes neither status nor last_verdict_json —
    // only delay_cause_json — so that field needs checking too, or a
    // successful classification would never be detected and would
    // falsely time out.
    const hasChanged = (fresh) =>
      fresh.status !== beforeStatus ||
      fresh.last_verdict_json !== beforeVerdict ||
      fresh.delay_cause_json !== beforeCause;

    const startedAt = Date.now();
    pollTimer.current = setInterval(async () => {
      if (settledRef.current) return;
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        settledRef.current = true;
        clearInterval(stageTimer.current);
        clearInterval(pollTimer.current);
        clearInterval(elapsedTimer.current);
        setStage(null);
        setPending(null);
        setTimedOut(true);
        return;
      }
      const fresh = await load();
      if (!fresh) return;
      if (hasChanged(fresh)) {
        finishPending(`${kindLabel} confirmed.`);
      }
    }, POLL_INTERVAL_MS);

    try {
      await fn();
      // The write call itself resolved — great, but only actually finish if
      // the poll above hasn't already caught it (avoids a duplicate toast).
      const fresh = await load();
      if (fresh && hasChanged(fresh)) {
        finishPending(`${kindLabel} confirmed.`);
      }
      // If it resolved but state genuinely hasn't changed yet, keep polling —
      // don't clear pending here; let the poll loop or timeout handle it.
    } catch (e) {
      if (!settledRef.current) {
        settledRef.current = true;
        clearInterval(stageTimer.current);
        clearInterval(pollTimer.current);
        clearInterval(elapsedTimer.current);
        setStage(null);
        setPending(null);
        toast.error(e.message || String(e));
        setError(e.message || String(e));
      }
    }
  };

  if (error && !policy) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14">
        <button onClick={() => setView("policies")} className="text-sm text-orange hover:underline">
          ← Back to my flights
        </button>
        <div className="mt-6 border border-amber/40 bg-amber/5 px-4 py-3 text-sm text-amber">
          {error}
        </div>
      </div>
    );
  }

  if (!policy) {
    return <div className="mx-auto max-w-2xl px-6 py-14 font-mono text-sm text-ivory-soft/50">Loading policy…</div>;
  }

  const meta = statusMeta(policy.status);
  let verdict = null;
  try {
    verdict = policy.last_verdict_json ? JSON.parse(policy.last_verdict_json) : null;
  } catch {
    verdict = null;
  }

  const canEvaluate = policy.status === "ACTIVE";
  const canAppeal = policy.status === "INDETERMINATE" && !policy.appeal_used;
  const canRefund = policy.status === "ACTIVE" || policy.status === "INDETERMINATE";
  // PAID_PARTIAL is still a fully resolved verdict (just an underfunded
  // one) — classify_delay_cause's own eligibility check accepts it
  // alongside PAID/EXPIRED_NO_PAYOUT, so the UI must too.
  const canClassify =
    policy.status === "PAID" ||
    policy.status === "PAID_PARTIAL" ||
    policy.status === "EXPIRED_NO_PAYOUT";
  const isSettled = policy.status === "PAID" || policy.status === "PAID_PARTIAL";
  const isPending = pending === "evaluate" || pending === "appeal";
  let delayCause = null;
  try {
    delayCause = policy.delay_cause_json ? JSON.parse(policy.delay_cause_json) : null;
  } catch {
    delayCause = null;
  }

  // The contract's own recorded ground truth of what actually moved —
  // NOT re-derived here from premium * multiplier / max_coverage. That
  // theoretical figure is only what the holder was *entitled* to; if the
  // shared pool lacked enough liquidity at settlement time the contract
  // pays out less and marks the policy PAID_PARTIAL, and showing the
  // theoretical number in that case would misrepresent what was actually
  // sent. payout_amount_wei is the number that must be shown as "Settled".
  const settlementAmount = policy.payout_amount_wei;
  const entitledAmount = Math.min(
    (Number(policy.premium) * Number(policy.payout_multiplier_bps)) / 10000,
    Number(policy.max_coverage)
  );

  const timelineItems = [
    { time: formatUnixUtc(policy.scheduled_departure_utc).split(",")[0], label: "Scheduled departure", sub: policy.departure_airport, done: true },
    { time: formatUnixUtc(policy.scheduled_arrival_utc).split(",")[0], label: "Scheduled arrival", done: true },
  ];
  if (verdict) {
    timelineItems.push({
      time: "—",
      label: `Evidence sources checked (${verdict.sources_used}/${verdict.sources_total})`,
      done: verdict.sources_used > 0,
    });
    timelineItems.push({
      time: "—",
      label: `Verdict finalized — ${verdict.decision}${verdict.cancelled ? " (cancelled)" : ""}`,
      sub: verdict.decision !== "NO_QUORUM" ? `Delay: ${verdict.delay_minutes}m` : undefined,
      done: true,
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-14 md:py-20">
      <div className="flex items-center justify-between">
        <button onClick={() => setView("policies")} className="text-sm text-orange hover:underline">
          ← Back to my flights
        </button>
        <span className="eyebrow text-ivory-soft/40">Verdict room</span>
      </div>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-6 border-b rule pb-8">
        <div>
          <h1 className="font-mono text-display-3 font-bold text-ivory">
            {policy.airline_code} {policy.flight_number}
          </h1>
          <p className="mt-1 text-sm text-ivory-soft/50">
            {policy.departure_airport} · scheduled arrival {formatUnixUtc(policy.scheduled_arrival_utc)}
          </p>
          {policy.trip_id > 0 && (
            <span className="mt-2 inline-block border border-orange/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-orange">
              Part of trip #{policy.trip_id}
            </span>
          )}
        </div>
        <VerdictStatus status={policy.status} decision={verdict?.decision} />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-5 border-b rule pb-8 font-mono text-sm sm:grid-cols-4">
        <div>
          <div className="eyebrow text-ivory-soft/40">Premium</div>
          <div className="mt-1 text-ivory">{formatGen(policy.premium)}</div>
        </div>
        <div>
          <div className="eyebrow text-ivory-soft/40">Threshold</div>
          <div className="mt-1 text-ivory">{policy.threshold_minutes}m</div>
        </div>
        <div>
          <div className="eyebrow text-ivory-soft/40">Max coverage</div>
          <div className="mt-1 text-ivory">{formatGen(policy.max_coverage)}</div>
        </div>
        <div>
          <div className="eyebrow text-ivory-soft/40">Appeal used</div>
          <div className="mt-1 text-ivory">{policy.appeal_used ? "Yes" : "No"}</div>
        </div>
      </div>

      {isSettled && (
        <div className="mt-8">
          <SettlementStatus
            amountWei={settlementAmount}
            isPartial={policy.status === "PAID_PARTIAL"}
            entitledWei={policy.status === "PAID_PARTIAL" ? entitledAmount : null}
          />
        </div>
      )}

      <div className="mt-8">
        <EvidenceTimeline items={timelineItems} />
      </div>

      {verdict && (
        <div className="mt-8">
          <ReasoningPanel verdict={verdict} thresholdMinutes={policy.threshold_minutes} />
        </div>
      )}

      {delayCause && (
        <div className="mt-8 border rule px-6 py-6">
          <span className="eyebrow text-ivory-soft/40">Likely cause</span>
          <p className="mt-3 text-lg font-semibold text-ivory">
            {delayCause.cause === "airline_fault"
              ? "Airline-controllable"
              : delayCause.cause === "weather_or_atc"
              ? "Weather / air traffic control"
              : "Unclear from available sources"}
          </p>
          {delayCause.explanation && (
            <p className="mt-1 text-sm text-ivory-soft/50">{delayCause.explanation}</p>
          )}
          <p className="mt-4 border-t rule pt-3 text-xs text-ivory-soft/35">
            Informational only — does not affect the payout amount, which was already finalized
            when this claim was evaluated.
          </p>
        </div>
      )}

      {canClassify && pending !== "classify" && (
        <div className="mt-8 border-t rule pt-8">
          <span className="eyebrow text-ivory-soft/40">
            {delayCause ? "Re-classify the cause" : "Why did this happen?"}
          </span>
          <p className="mt-2 text-sm text-ivory-soft/60">
            Have a validator read a source page and classify whether this delay looks
            airline-controllable or weather/ATC-related. Purely informational — this can never
            change the payout, which is already final.
          </p>
          <div className="mt-4 flex gap-2">
            <input
              value={causeUrl}
              onChange={(e) => setCauseUrl(e.target.value)}
              placeholder="https://flightaware.com/live/…"
              className="flex-1 border rule bg-near-black px-3 py-2 font-mono text-xs text-ivory outline-none focus:border-orange/60"
            />
          </div>
          <button
            onClick={() => runWithRadar("classify", () => classifyDelayCause(policyId, causeUrl))}
            disabled={pending !== null || !causeUrl.trim()}
            className="mt-4 border rule px-5 py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-ivory hover:border-blue/50 hover:text-blue disabled:opacity-60"
          >
            Classify cause
          </button>
        </div>
      )}

      {pending === "classify" && (
        <div className="mt-8 border border-blue/30 bg-blue/5 px-6 py-6">
          <ValidatorConsensus stage={stage} />
          <p className="mt-4 text-sm text-ivory">
            Validators are independently reading the source and classifying the cause.
          </p>
          <p className="mt-1 text-sm text-ivory-soft/50">
            Informational only — nothing about the payout changes while this runs.
            <span className="ml-1 font-mono text-ivory-soft/30">({elapsedSec}s elapsed)</span>
          </p>
        </div>
      )}

      {isPending && (
        <div className="mt-8 border border-orange/30 bg-orange/5 px-6 py-6">
          <ValidatorConsensus stage={stage} />
          <p className="mt-4 text-sm text-ivory">Validators are independently checking this flight now.</p>
          <p className="mt-1 text-sm text-ivory-soft/50">
            This usually takes 30–90 seconds — each validator fetches and judges the data on its own
            before they agree. No need to refresh; this page will update itself.
            <span className="ml-1 font-mono text-ivory-soft/30">({elapsedSec}s elapsed)</span>
          </p>
        </div>
      )}

      {timedOut && (
        <div className="mt-8 border border-amber/30 bg-amber/5 px-6 py-5 text-sm text-amber">
          <p className="font-medium">This is taking longer than expected.</p>
          <p className="mt-1 text-ivory-soft/60">
            The transaction may still complete in the background — GenLayer validator consensus can
            occasionally run long. It's safe to check again in a moment.
          </p>
          <button
            onClick={load}
            className="mt-3 border border-amber/40 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.06em] text-amber hover:bg-amber/10"
          >
            Check now
          </button>
        </div>
      )}

      {(canEvaluate || canAppeal) && (
        <div className="mt-8 border-t rule pt-8">
          <span className="eyebrow text-ivory-soft/40">
            {canEvaluate ? "Evaluate claim" : "Appeal — one more try with new sources"}
          </span>
          <p className="mt-2 text-sm text-ivory-soft/60">
            Give validators the live tracker pages to check for this flight. Each validator fetches independently.
          </p>
          <div className="mt-4">
            <SourceUrlList urls={sourceUrls} setUrls={setSourceUrls} />
          </div>
          {(() => {
            const filled = sourceUrls.filter(Boolean);
            const { ok, error: sourceError } = validateSourceUrls(filled);
            const belowMin = filled.length < 2; // mirrors MIN_SOURCES_REQUIRED
            const disabled = pending !== null || belowMin || !ok;
            return (
              <>
                {filled.length > 0 && !ok && (
                  <p className="mt-2 text-xs text-amber">{sourceError}</p>
                )}
                {filled.length > 0 && ok && belowMin && (
                  <p className="mt-2 text-xs text-amber">At least 2 independent sources are required.</p>
                )}
                <button
                  onClick={() =>
                    runWithRadar(canEvaluate ? "evaluate" : "appeal", () =>
                      canEvaluate ? evaluateClaim(policyId, filled) : appeal(policyId, filled)
                    )
                  }
                  disabled={disabled}
                  className="mt-4 bg-orange px-5 py-2.5 font-mono text-xs uppercase tracking-[0.06em] font-semibold text-ink hover:bg-orange/90 disabled:opacity-60"
                >
                  {isPending ? "Awaiting consensus…" : canEvaluate ? "Evaluate now" : "Submit appeal"}
                </button>
              </>
            );
          })()}
        </div>
      )}

      {canRefund && (
        <div className="mt-8 border-t rule pt-8">
          <span className="eyebrow text-ivory-soft/40">Claim refund</span>
          <p className="mt-2 text-sm text-ivory-soft/60">
            Only succeeds once the claim-expiry window has passed with no resolved verdict — the
            contract enforces this, not the UI.
          </p>
          <button
            onClick={() => runWithRadar("refund", () => claimRefund(policyId))}
            disabled={pending !== null}
            className="mt-4 border rule px-5 py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-ivory hover:border-amber/50 hover:text-amber disabled:opacity-60"
          >
            {pending === "refund" ? "Confirming…" : "Claim refund"}
          </button>
          {pending === "refund" && (
            <p className="mt-3 font-mono text-xs text-ivory-soft/40">
              Confirming on-chain — no need to refresh. ({elapsedSec}s elapsed)
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-8 border border-amber/40 bg-amber/5 px-4 py-3 text-sm text-amber">{error}</div>
      )}
    </div>
  );
}
