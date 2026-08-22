import React, { useState } from "react";
import { createPolicy, evaluateClaim, getPolicy, getClaimStatus, claimRefund } from "./skyverdictClient";

/**
 * Minimal functional skeleton — three panels:
 *   1. Buy Coverage      -> create_policy
 *   2. Policy Status      -> get_policy / get_claim_status
 *   3. Trigger Evaluation -> evaluate_claim (for keepers / power users)
 *
 * Styling intentionally omitted here — see docs/architecture.md for the
 * product surface; wire this into your design system / the
 * frontend-design conventions used elsewhere in your app shell.
 */

const DEFAULT_SOURCES = [
  "https://flightaware.com/live/flight/",
  "https://flightradar24.com/",
];

function BuyCoverage() {
  const [form, setForm] = useState({
    airlineCode: "DL",
    flightNumber: "",
    departureAirport: "JFK",
    scheduledDepartureUtc: "",
    scheduledArrivalUtc: "",
    thresholdMinutes: 180,
    payoutMultiplierBps: 30000,
    maxCoverage: 3000,
    premiumWei: 1000,
  });
  const [policyId, setPolicyId] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const tx = await createPolicy({
        airlineCode: form.airlineCode,
        flightNumber: form.flightNumber,
        departureAirport: form.departureAirport,
        scheduledDepartureUtc: Number(form.scheduledDepartureUtc),
        scheduledArrivalUtc: Number(form.scheduledArrivalUtc),
        thresholdMinutes: Number(form.thresholdMinutes),
        payoutMultiplierBps: Number(form.payoutMultiplierBps),
        maxCoverage: Number(form.maxCoverage),
        premiumWei: Number(form.premiumWei),
      });
      setPolicyId(tx.returnValue ?? tx.return_value);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2>Buy Coverage</h2>
      <label>Airline code <input value={form.airlineCode} onChange={update("airlineCode")} /></label>
      <label>Flight number <input value={form.flightNumber} onChange={update("flightNumber")} /></label>
      <label>Departure airport <input value={form.departureAirport} onChange={update("departureAirport")} /></label>
      <label>Scheduled departure (unix UTC) <input value={form.scheduledDepartureUtc} onChange={update("scheduledDepartureUtc")} /></label>
      <label>Scheduled arrival (unix UTC) <input value={form.scheduledArrivalUtc} onChange={update("scheduledArrivalUtc")} /></label>
      <label>Delay threshold (minutes) <input value={form.thresholdMinutes} onChange={update("thresholdMinutes")} /></label>
      <label>Payout multiplier (bps, 30000 = 3x) <input value={form.payoutMultiplierBps} onChange={update("payoutMultiplierBps")} /></label>
      <label>Max coverage (GEN wei) <input value={form.maxCoverage} onChange={update("maxCoverage")} /></label>
      <label>Premium to pay (GEN wei) <input value={form.premiumWei} onChange={update("premiumWei")} /></label>
      <button onClick={submit} disabled={busy}>{busy ? "Submitting..." : "Buy Coverage"}</button>
      {policyId != null && <p>Policy created: #{String(policyId)}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function PolicyStatus() {
  const [id, setId] = useState("");
  const [policy, setPolicy] = useState(null);
  const [error, setError] = useState(null);

  const lookup = async () => {
    setError(null);
    try {
      const p = await getPolicy(Number(id));
      setPolicy(p);
    } catch (e) {
      setError(String(e));
    }
  };

  const refund = async () => {
    try {
      await claimRefund(Number(id));
      await lookup();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <section>
      <h2>Policy Status</h2>
      <input placeholder="Policy ID" value={id} onChange={(e) => setId(e.target.value)} />
      <button onClick={lookup}>Look up</button>
      {policy && (
        <pre>{JSON.stringify(policy, null, 2)}</pre>
      )}
      {policy?.status === "ACTIVE" || policy?.status === "INDETERMINATE" ? (
        <button onClick={refund}>Claim refund (if window expired)</button>
      ) : null}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function TriggerEvaluation() {
  const [id, setId] = useState("");
  const [sources, setSources] = useState(DEFAULT_SOURCES.join("\n"));
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const trigger = async () => {
    setBusy(true);
    setError(null);
    try {
      const urls = sources.split("\n").map((s) => s.trim()).filter(Boolean);
      const res = await evaluateClaim(Number(id), urls);
      setResult(res);
      const status = await getClaimStatus(Number(id));
      setResult((r) => ({ verdict: r, status }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2>Trigger Evaluation (keeper action)</h2>
      <input placeholder="Policy ID" value={id} onChange={(e) => setId(e.target.value)} />
      <textarea
        rows={4}
        value={sources}
        onChange={(e) => setSources(e.target.value)}
        placeholder="one allowlisted source URL per line"
      />
      <button onClick={trigger} disabled={busy}>{busy ? "Evaluating..." : "Evaluate Claim"}</button>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export default function App() {
  return (
    <main>
      <h1>SkyVerdict</h1>
      <p>Parametric flight-delay insurance, settled trustlessly on GenLayer.</p>
      <BuyCoverage />
      <PolicyStatus />
      <TriggerEvaluation />
    </main>
  );
}
