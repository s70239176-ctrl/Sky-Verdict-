import React, { useEffect, useState } from "react";
import { getChallengeInfo, challengeClaim, finalizeClaim } from "../lib/v3Client";
import { validateSourceUrls } from "../lib/sourceValidation";
import { formatGen } from "../lib/format";

function mmss(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${String(r).padStart(2, "0")}s`;
}

/**
 * The challenge court for a PROVISIONAL verdict: the verdict is reached, but
 * no money moves until the window closes. In the window anyone can bond a
 * challenge and force a re-read with an extra source and a stricter quorum.
 * After it, anyone can finalize. All rules are enforced by the contract —
 * this panel only mirrors them so people can act without guessing.
 */
export default function CourtPanel({ policy, policyId, pending, runWithRadar }) {
  const [info, setInfo] = useState(null);
  const [extra, setExtra] = useState("");
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    getChallengeInfo(policyId).then((i) => alive && setInfo(i)).catch(() => {});
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => { alive = false; clearInterval(t); };
  }, [policyId, policy?.challenged]);

  const deadline = Number(policy.challenge_deadline_utc);
  const remaining = deadline - tick / 1000;
  const open = remaining > 0;
  const decision = policy.provisional_decision;
  const bond = info ? Number(info.bond_required_wei) : null;

  let originals = [];
  try { originals = JSON.parse(policy.sources_json || "[]"); } catch { originals = []; }
  const originalHosts = originals.map((u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } });
  const trimmed = extra.trim();
  const { ok, error: srcError } = trimmed ? validateSourceUrls([trimmed]) : { ok: false, error: null };
  let host = "";
  try { host = new URL(trimmed).hostname.replace(/^www\./, ""); } catch { host = ""; }
  const duplicate = host && originalHosts.includes(host);
  const canChallenge = open && !policy.challenged && ok && !duplicate && bond != null;

  return (
    <div className="mt-8 border border-blue/40 bg-blue/5 p-5">
      <span className="eyebrow text-blue">Challenge court</span>
      <p className="mt-2 text-sm text-ivory">
        Validators reached a provisional verdict:{" "}
        <b className={decision === "PAYOUT" ? "text-green" : "text-ivory"}>
          {decision === "PAYOUT" ? "DELAY VERIFIED — pays out" : "ON TIME — no payout"}
        </b>
        . No money has moved yet.
      </p>
      <p className="mt-2 font-mono text-xs text-ivory-soft/60">
        {open ? `Challenge window closes in ${mmss(remaining)}.` : "Challenge window closed — anyone can finalize."}
        {policy.challenged && open && " This verdict was already challenged once (inconclusive); it will finalize when the window closes."}
      </p>

      {open && !policy.challenged && (
        <div className="mt-4">
          <p className="text-xs text-ivory-soft/60">
            Think the verdict is wrong? Add one more independent tracker page and post a bond of{" "}
            <b className="text-ivory">{bond != null ? formatGen(bond) : "…"}</b>. Validators re-read all sources and need{" "}
            <b>one more valid read</b> than before. Overturned: you get the bond back plus a reward. Upheld: the bond goes
            to underwriters. Inconclusive: bond returned.
          </p>
          {originals.length > 0 && (
            <p className="mt-2 font-mono text-[11px] text-ivory-soft/40">
              Already used: {originalHosts.join(", ")}
            </p>
          )}
          <input
            className="mt-3 w-full border rule bg-near-black px-3 py-2.5 font-mono text-sm text-ivory outline-none focus:border-blue/60"
            placeholder="https://www.flightradar24.com/…  (a provider not listed above)"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          />
          {trimmed && !ok && srcError && <p className="mt-2 text-xs text-amber">{srcError}</p>}
          {duplicate && <p className="mt-2 text-xs text-amber">That provider was already used — pick a different one.</p>}
          <button
            disabled={pending !== null || !canChallenge}
            onClick={() => runWithRadar("challenge", () => challengeClaim(policyId, [trimmed], bond))}
            className="mt-3 border border-blue/60 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-blue hover:bg-blue/10 disabled:opacity-50"
          >
            {pending === "challenge" ? "Re-reading sources…" : "Challenge verdict"}
          </button>
          <p className="mt-2 text-[11px] text-ivory-soft/40">
            Heads-up: if the contract rejects a transaction, GenLayer keeps its attached value — so this button stays
            disabled until every check the UI can run passes.
          </p>
        </div>
      )}

      {!open && (
        <button
          disabled={pending !== null}
          onClick={() => runWithRadar("finalize", () => finalizeClaim(policyId))}
          className="mt-4 bg-blue px-5 py-2.5 font-mono text-xs uppercase tracking-[0.06em] font-semibold text-ink hover:bg-blue/90 disabled:opacity-60"
        >
          {pending === "finalize" ? "Settling…" : "Finalize & settle"}
        </button>
      )}
    </div>
  );
}
