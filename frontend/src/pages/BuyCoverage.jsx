import React, { useState } from "react";
import { createPolicy, getTotalPolicies } from "../lib/genlayerClient";
import { trackPolicyId } from "../lib/localPolicies";
import { useWallet } from "../context/WalletContext";
import { useToast } from "../context/ToastContext";

const DEFAULTS = {
  airlineCode: "DL",
  flightNumber: "202",
  departureAirport: "JFK",
  scheduledDepartureUtc: "",
  scheduledArrivalUtc: "",
  thresholdMinutes: 180,
  payoutMultiplierBps: 30000,
  maxCoverage: 3000,
  premiumWei: 1000,
};

const STEPS = ["Select flight", "Review protection", "Confirm"];

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-xs uppercase tracking-[0.06em] text-ivory-soft/50">{label}</span>
      {children}
      {hint && <span className="text-xs text-ivory-soft/40">{hint}</span>}
    </label>
  );
}

const inputClass =
  "border rule bg-near-black px-3 py-2.5 font-mono text-sm text-ivory outline-none focus:border-orange/60";

export default function BuyCoverage({ setView, openPolicy }) {
  const { account } = useWallet();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const maxTheoreticalPayout = (Number(form.premiumWei) * Number(form.payoutMultiplierBps)) / 10000;
  const coverageTooHigh = Number(form.maxCoverage) > maxTheoreticalPayout;

  const step0Valid = form.flightNumber && form.scheduledDepartureUtc && form.scheduledArrivalUtc &&
    Number(form.scheduledArrivalUtc) > Number(form.scheduledDepartureUtc);
  const step1Valid = !coverageTooHigh && Number(form.premiumWei) > 0;

  const goNext = () => {
    setError(null);
    if (step === 0 && !step0Valid) {
      setError("Fill in the flight number and both scheduled times — arrival must be after departure.");
      return;
    }
    if (step === 1 && !step1Valid) {
      setError(`Max coverage can't exceed premium × multiplier (${maxTheoreticalPayout.toLocaleString()} wei here).`);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  const submit = async () => {
    setError(null);
    if (!account) {
      setError("Connect a wallet or start demo mode before buying coverage.");
      return;
    }

    setBusy(true);
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

      // Prefer a direct return value if the SDK surfaces one; otherwise
      // fall back to the total-policies counter (this tx was the latest).
      let newId = tx?.returnValue ?? tx?.return_value ?? null;
      if (newId == null) {
        try {
          newId = await getTotalPolicies();
        } catch {
          newId = null;
        }
      }

      if (newId != null) {
        trackPolicyId(newId);
        toast.success(`Monitoring active — policy #${newId}.`);
        openPolicy(newId);
      } else {
        toast.success("Coverage bought. Add the policy ID on My flights to track it.");
        setView("policies");
      }
    } catch (err) {
      setError(err.message || String(err));
      toast.error("Couldn't buy coverage — see details below.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-14 md:py-20">
      <span className="eyebrow text-ivory-soft/40">Protect a flight</span>
      <h1 className="mt-3 text-display-3 font-extrabold text-ivory">
        {form.airlineCode || "—"} {form.flightNumber || "—"}
      </h1>
      <p className="mt-2 text-sm text-ivory-soft/50">
        Coverage activates the moment your premium is paid. Nothing here is adjudicated by us —
        validators judge the real flight data later.{" "}
        <button onClick={() => setView("buy-trip")} className="text-orange underline underline-offset-4">
          Covering more than one flight?
        </button>
      </p>

      {/* Step indicator */}
      <div className="mt-8 flex items-center gap-1">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div className="flex items-center gap-2">
              <span className={`font-mono text-xs ${i <= step ? "text-orange" : "text-ivory-soft/30"}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className={`hidden font-mono text-xs uppercase tracking-[0.06em] sm:inline ${i <= step ? "text-ivory" : "text-ivory-soft/30"}`}>
                {s}
              </span>
            </div>
            {i < STEPS.length - 1 && <span className="mx-2 h-px flex-1 bg-ivory-soft/15" />}
          </React.Fragment>
        ))}
      </div>

      <div className="mt-10 flex flex-col gap-6">
        {step === 0 && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Airline code">
                <input className={inputClass} value={form.airlineCode} onChange={update("airlineCode")} maxLength={3} />
              </Field>
              <Field label="Flight number">
                <input className={inputClass} value={form.flightNumber} onChange={update("flightNumber")} />
              </Field>
              <Field label="Departure airport">
                <input className={inputClass} value={form.departureAirport} onChange={update("departureAirport")} maxLength={3} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Scheduled departure" hint="Unix UTC timestamp">
                <input className={inputClass} type="number" value={form.scheduledDepartureUtc} onChange={update("scheduledDepartureUtc")} />
              </Field>
              <Field label="Scheduled arrival" hint="Unix UTC timestamp, after departure">
                <input className={inputClass} type="number" value={form.scheduledArrivalUtc} onChange={update("scheduledArrivalUtc")} />
              </Field>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Delay threshold" hint="Minutes late before it pays out">
                <input className={inputClass} type="number" value={form.thresholdMinutes} onChange={update("thresholdMinutes")} />
              </Field>
              <Field label="Payout multiplier" hint="Basis points, 30000 = 3×">
                <input className={inputClass} type="number" value={form.payoutMultiplierBps} onChange={update("payoutMultiplierBps")} />
              </Field>
              <Field label="Max coverage" hint="Hard cap, GEN wei">
                <input className={inputClass} type="number" value={form.maxCoverage} onChange={update("maxCoverage")} />
              </Field>
            </div>
            <Field label="Premium" hint="Paid as the transaction value">
              <input className={inputClass} type="number" value={form.premiumWei} onChange={update("premiumWei")} />
            </Field>
            <div className="border rule px-4 py-3 font-mono text-xs text-ivory-soft/50">
              Theoretical max payout at these terms:{" "}
              <span className={coverageTooHigh ? "text-amber" : "text-green"}>
                {maxTheoreticalPayout.toLocaleString()} wei
              </span>
            </div>
          </>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-0 border rule">
            {[
              ["Flight", `${form.airlineCode} ${form.flightNumber} · ${form.departureAirport}`],
              ["Delay threshold", `${form.thresholdMinutes}m`],
              ["Payout multiplier", `${(Number(form.payoutMultiplierBps) / 10000).toFixed(1)}×`],
              ["Max coverage", `${Number(form.maxCoverage).toLocaleString()} wei`],
              ["Premium", `${Number(form.premiumWei).toLocaleString()} wei`],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b rule px-4 py-3 last:border-b-0">
                <span className="font-mono text-xs uppercase tracking-[0.06em] text-ivory-soft/40">{label}</span>
                <span className="font-mono text-sm text-ivory">{value}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="border border-amber/40 bg-amber/5 px-4 py-3 text-sm text-amber">{error}</div>
        )}

        <div className="flex items-center justify-between gap-3">
          {step > 0 ? (
            <button
              onClick={goBack}
              className="border rule px-5 py-3 font-mono text-xs uppercase tracking-[0.06em] text-ivory-soft/60 hover:border-orange/40"
            >
              Back
            </button>
          ) : <span />}

          {step < STEPS.length - 1 ? (
            <button
              onClick={goNext}
              className="bg-orange px-6 py-3 font-mono text-xs uppercase tracking-[0.06em] font-semibold text-ink hover:bg-orange/90"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={busy}
              className="bg-orange px-6 py-3 font-mono text-xs uppercase tracking-[0.06em] font-semibold text-ink hover:bg-orange/90 disabled:opacity-60"
            >
              {busy ? "Confirming on-chain…" : "Confirm protection"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
