import React, { useState } from "react";
import { createTrip, getTotalPolicies } from "../lib/genlayerClient";
import { trackPolicyId } from "../lib/localPolicies";
import { useWallet } from "../context/WalletContext";
import { useToast } from "../context/ToastContext";

const BLANK_LEG = {
  airlineCode: "",
  flightNumber: "",
  departureAirport: "",
  scheduledDepartureUtc: "",
  scheduledArrivalUtc: "",
};

const inputClass =
  "border rule bg-near-black px-3 py-2.5 font-mono text-sm text-ivory outline-none focus:border-orange/60";

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-xs uppercase tracking-[0.06em] text-ivory-soft/50">{label}</span>
      {children}
      {hint && <span className="text-xs text-ivory-soft/40">{hint}</span>}
    </label>
  );
}

export default function BuyTrip({ setView, openPolicy }) {
  const { account } = useWallet();
  const toast = useToast();
  const [legs, setLegs] = useState([{ ...BLANK_LEG }, { ...BLANK_LEG }]);
  const [thresholdMinutes, setThresholdMinutes] = useState(180);
  const [payoutMultiplierBps, setPayoutMultiplierBps] = useState(20000);
  const [maxCoveragePerLeg, setMaxCoveragePerLeg] = useState(1000);
  const [totalPremiumWei, setTotalPremiumWei] = useState(1500);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const updateLeg = (i, field) => (e) => {
    const next = [...legs];
    next[i] = { ...next[i], [field]: e.target.value };
    setLegs(next);
  };
  const addLeg = () => setLegs([...legs, { ...BLANK_LEG }]);
  const removeLeg = (i) => legs.length > 2 && setLegs(legs.filter((_, idx) => idx !== i));

  // Mirrors the contract's own split exactly (see create_trip in
  // SkyVerdict.py) — base = total // n, last leg absorbs the remainder —
  // so this pre-submit check can't disagree with what actually happens.
  const n = legs.length;
  const base = Math.floor(Number(totalPremiumWei) / n);
  const legPremiums = legs.map((_, i) => (i < n - 1 ? base : Number(totalPremiumWei) - base * (n - 1)));
  const maxTheoreticalPerLeg = legPremiums.map((p) => (p * Number(payoutMultiplierBps)) / 10000);
  const coverageTooHigh = maxTheoreticalPerLeg.some((m) => Number(maxCoveragePerLeg) > m);

  const legsValid = legs.every(
    (l) =>
      l.flightNumber &&
      l.scheduledDepartureUtc &&
      l.scheduledArrivalUtc &&
      Number(l.scheduledArrivalUtc) > Number(l.scheduledDepartureUtc)
  );

  const submit = async () => {
    setError(null);
    if (!account) {
      setError("Connect a wallet or start demo mode before buying coverage.");
      return;
    }
    if (!legsValid) {
      setError("Every leg needs a flight number and both scheduled times, with arrival after departure.");
      return;
    }
    if (coverageTooHigh) {
      setError("Max coverage per leg exceeds that leg's share of the premium × multiplier — lower it or raise the total premium.");
      return;
    }

    setBusy(true);
    try {
      await createTrip(
        legs.map((l) => ({
          ...l,
          thresholdMinutes,
          payoutMultiplierBps,
          maxCoverage: maxCoveragePerLeg,
        })),
        Number(totalPremiumWei)
      );

      // The contract creates n sequential Policy rows in this one
      // transaction — the newest n policy_ids (by get_total_policies)
      // are exactly this trip's legs.
      let newPolicyIds = [];
      try {
        const total = await getTotalPolicies();
        newPolicyIds = Array.from({ length: n }, (_, i) => total - n + 1 + i);
        newPolicyIds.forEach(trackPolicyId);
      } catch {
        // optional convenience only — My Flights' wallet scan still finds
        // these policies even if this tracking step fails
      }

      toast.success(`Trip protected — ${n} flights covered.`);
      if (newPolicyIds.length > 0) {
        openPolicy(newPolicyIds[0]);
      } else {
        setView("policies");
      }
    } catch (err) {
      setError(err.message || String(err));
      toast.error("Couldn't buy trip coverage — see details below.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-14 md:py-20">
      <span className="eyebrow text-ivory-soft/40">Protect a trip</span>
      <h1 className="mt-3 text-display-3 font-extrabold text-ivory">MULTIPLE FLIGHTS, ONE POLICY</h1>
      <p className="mt-2 max-w-lg text-sm text-ivory-soft/50">
        Covers every leg independently — a delay on one flight doesn't affect the others. Premium
        is split evenly across legs by the contract itself.{" "}
        <button onClick={() => setView("buy")} className="text-orange underline underline-offset-4">
          Just one flight instead?
        </button>
      </p>

      <div className="mt-8 flex flex-col gap-4">
        {legs.map((leg, i) => (
          <div key={i} className="border rule px-4 py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.06em] text-orange">
                Leg {i + 1}
              </span>
              {legs.length > 2 && (
                <button onClick={() => removeLeg(i)} className="text-xs text-ivory-soft/40 hover:text-amber">
                  Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Airline">
                <input className={inputClass} value={leg.airlineCode} onChange={updateLeg(i, "airlineCode")} maxLength={3} />
              </Field>
              <Field label="Flight #">
                <input className={inputClass} value={leg.flightNumber} onChange={updateLeg(i, "flightNumber")} />
              </Field>
              <Field label="Departure airport">
                <input className={inputClass} value={leg.departureAirport} onChange={updateLeg(i, "departureAirport")} maxLength={3} />
              </Field>
              <Field label="Sched. departure" hint="Unix UTC">
                <input className={inputClass} type="number" value={leg.scheduledDepartureUtc} onChange={updateLeg(i, "scheduledDepartureUtc")} />
              </Field>
              <Field label="Sched. arrival" hint="Unix UTC, after departure">
                <input className={inputClass} type="number" value={leg.scheduledArrivalUtc} onChange={updateLeg(i, "scheduledArrivalUtc")} />
              </Field>
              <div className="flex items-end font-mono text-xs text-ivory-soft/40">
                Share of premium: {legPremiums[i]?.toLocaleString()} wei
              </div>
            </div>
          </div>
        ))}
        <button onClick={addLeg} className="w-fit text-sm text-orange hover:underline">
          + Add another flight
        </button>
      </div>

      <div className="mt-8 border-t rule pt-8">
        <span className="eyebrow text-ivory-soft/40">Shared terms — applied to every leg</span>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Delay threshold" hint="Minutes late before it pays out">
            <input className={inputClass} type="number" value={thresholdMinutes} onChange={(e) => setThresholdMinutes(e.target.value)} />
          </Field>
          <Field label="Payout multiplier" hint="Basis points, 20000 = 2×">
            <input className={inputClass} type="number" value={payoutMultiplierBps} onChange={(e) => setPayoutMultiplierBps(e.target.value)} />
          </Field>
          <Field label="Max coverage per leg" hint="GEN wei, hard cap">
            <input className={inputClass} type="number" value={maxCoveragePerLeg} onChange={(e) => setMaxCoveragePerLeg(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Total premium" hint="Paid once, split evenly across legs (remainder to the last leg)">
            <input className={inputClass} type="number" value={totalPremiumWei} onChange={(e) => setTotalPremiumWei(e.target.value)} />
          </Field>
        </div>
        <div className={`mt-4 border px-4 py-3 font-mono text-xs ${coverageTooHigh ? "border-amber/40 bg-amber/5 text-amber" : "rule text-ivory-soft/50"}`}>
          Smallest leg's theoretical max payout: {Math.min(...maxTheoreticalPerLeg).toLocaleString()} wei
          {coverageTooHigh && " — below your max coverage per leg. Lower it or raise the total premium."}
        </div>
      </div>

      {error && <div className="mt-6 border border-amber/40 bg-amber/5 px-4 py-3 text-sm text-amber">{error}</div>}

      <button
        onClick={submit}
        disabled={busy}
        className="mt-8 bg-orange px-6 py-3 font-mono text-xs uppercase tracking-[0.06em] font-semibold text-ink hover:bg-orange/90 disabled:opacity-60"
      >
        {busy ? "Confirming on-chain…" : `Protect ${n} flights`}
      </button>
    </div>
  );
}
