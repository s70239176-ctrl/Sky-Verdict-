import React, { useEffect, useState, useRef } from "react";
import { getPolicy, evaluateClaim, appeal, claimRefund } from "../lib/genlayerClient";
import { statusMeta, formatUnixUtc, formatGen } from "../lib/format";
import ConsensusRadar from "../components/ConsensusRadar";
import { useWallet } from "../context/WalletContext";
import { useToast } from "../context/ToastContext";

const STAGES = ["PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED"];

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
            className="flex-1 rounded-md border border-grid bg-panel px-3 py-2 font-mono text-xs text-ink-primary outline-none focus:border-cyan/60"
          />
          {urls.length > 1 && (
            <button type="button" onClick={() => remove(i)} className="px-2 text-ink-faint hover:text-signal-red">
              ✕
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={add} className="w-fit text-xs text-cyan hover:underline">
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
  const [pending, setPending] = useState(null); // 'evaluate' | 'appeal' | 'refund' | null
  const [stage, setStage] = useState(null);
  const stageTimer = useRef(null);

  const load = async () => {
    setError(null);
    try {
      const p = await getPolicy(policyId);
      setPolicy(p);
    } catch (e) {
      setError(e.message || String(e));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyId]);

  const runWithRadar = async (kind, fn) => {
    if (!account) {
      toast.error("Connect a wallet or start demo mode first.");
      return;
    }
    setPending(kind);
    let i = 0;
    setStage(STAGES[0]);
    // Indicative animation only — cycles through the real GenLayer consensus
    // stage names while the transaction confirms. Not a live per-validator
    // feed (genlayer-js doesn't stream that here); it's what to expect,
    // not a claim about what's happening at each instant.
    stageTimer.current = setInterval(() => {
      i = Math.min(i + 1, STAGES.length - 2);
      setStage(STAGES[i]);
    }, 1400);

    try {
      const result = await fn();
      clearInterval(stageTimer.current);
      setStage("ACCEPTED");
      setTimeout(() => setStage(null), 1200);
      toast.success(`${kind === "evaluate" ? "Evaluation" : kind === "appeal" ? "Appeal" : "Refund"} confirmed.`);
      await load();
      return result;
    } catch (e) {
      clearInterval(stageTimer.current);
      setStage(null);
      toast.error(e.message || String(e));
      setError(e.message || String(e));
    } finally {
      setPending(null);
    }
  };

  if (error && !policy) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14">
        <button onClick={() => setView("policies")} className="text-sm text-cyan hover:underline">
          ← Back to my policies
        </button>
        <div className="mt-6 rounded-md border border-signal-red/40 bg-signal-red/10 px-4 py-3 text-sm text-signal-red">
          {error}
        </div>
      </div>
    );
  }

  if (!policy) {
    return <div className="mx-auto max-w-2xl px-6 py-14 font-mono text-sm text-ink-dim">Loading policy…</div>;
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

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <button onClick={() => setView("policies")} className="text-sm text-cyan hover:underline">
        ← Back to my policies
      </button>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-mono text-3xl font-bold text-ink-primary">
            {policy.airline_code}{policy.flight_number}
          </h1>
          <p className="mt-1 text-sm text-ink-dim">
            {policy.departure_airport} · scheduled arrival {formatUnixUtc(policy.scheduled_arrival_utc)}
          </p>
          <span className={`mt-3 inline-flex items-center gap-1.5 text-sm font-medium ${meta.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        </div>
        <ConsensusRadar stage={stage} size={160} />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 rounded-lg border border-grid bg-panel/60 p-5 font-mono text-sm sm:grid-cols-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Premium</div>
          <div className="text-amber">{formatGen(policy.premium)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Threshold</div>
          <div>{policy.threshold_minutes}m</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Max coverage</div>
          <div>{formatGen(policy.max_coverage)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Appeal used</div>
          <div>{policy.appeal_used ? "Yes" : "No"}</div>
        </div>
      </div>

      {verdict && (
        <div className="mt-6 rounded-lg border border-grid bg-panel/60 p-5">
          <h2 className="font-mono text-xs uppercase tracking-wide text-ink-faint">Last verdict</h2>
          <pre className="mt-2 overflow-x-auto font-mono text-xs text-cyan">
            {JSON.stringify(verdict, null, 2)}
          </pre>
        </div>
      )}

      {(canEvaluate || canAppeal) && (
        <div className="mt-6 rounded-lg border border-grid bg-panel/60 p-5">
          <h2 className="font-mono text-xs uppercase tracking-wide text-ink-faint">
            {canEvaluate ? "Evaluate claim" : "Appeal — one more try with new sources"}
          </h2>
          <p className="mt-1 text-sm text-ink-dim">
            Give validators the live tracker pages to check for this flight. Each validator fetches independently.
          </p>
          <div className="mt-4">
            <SourceUrlList urls={sourceUrls} setUrls={setSourceUrls} />
          </div>
          <button
            onClick={() =>
              runWithRadar(canEvaluate ? "evaluate" : "appeal", () =>
                canEvaluate
                  ? evaluateClaim(policyId, sourceUrls.filter(Boolean))
                  : appeal(policyId, sourceUrls.filter(Boolean))
              )
            }
            disabled={pending !== null || sourceUrls.filter(Boolean).length < 1}
            className="mt-4 rounded-md bg-cyan px-4 py-2 text-sm font-semibold text-void hover:bg-cyan/90 disabled:opacity-60"
          >
            {pending === "evaluate" || pending === "appeal" ? "Awaiting consensus…" : canEvaluate ? "Evaluate now" : "Submit appeal"}
          </button>
        </div>
      )}

      {canRefund && (
        <div className="mt-6 rounded-lg border border-grid bg-panel/60 p-5">
          <h2 className="font-mono text-xs uppercase tracking-wide text-ink-faint">Claim refund</h2>
          <p className="mt-1 text-sm text-ink-dim">
            Only succeeds once the claim-expiry window has passed with no resolved verdict — the contract enforces this, not the UI.
          </p>
          <button
            onClick={() => runWithRadar("refund", () => claimRefund(policyId))}
            disabled={pending !== null}
            className="mt-4 rounded-md border border-grid px-4 py-2 text-sm font-medium text-ink-primary hover:border-amber/50 hover:text-amber disabled:opacity-60"
          >
            {pending === "refund" ? "Confirming…" : "Claim refund"}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-md border border-signal-red/40 bg-signal-red/10 px-4 py-3 text-sm text-signal-red">
          {error}
        </div>
      )}
    </div>
  );
}
