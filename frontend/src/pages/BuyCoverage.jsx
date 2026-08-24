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

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-primary">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-dim">{hint}</span>}
    </label>
  );
}

const inputClass =
  "rounded-md border border-grid bg-panel px-3 py-2 font-mono text-sm text-ink-primary outline-none focus:border-cyan/60";

export default function BuyCoverage({ setView, openPolicy }) {
  const { account } = useWallet();
  const toast = useToast();
  const [form, setForm] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const maxTheoreticalPayout = (Number(form.premiumWei) * Number(form.payoutMultiplierBps)) / 10000;
  const coverageTooHigh = Number(form.maxCoverage) > maxTheoreticalPayout;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!account) {
      setError("Connect a wallet or start demo mode before buying coverage.");
      return;
    }
    if (!form.flightNumber || !form.scheduledDepartureUtc || !form.scheduledArrivalUtc) {
      setError("Fill in the flight number and both scheduled times.");
      return;
    }
    if (Number(form.scheduledArrivalUtc) <= Number(form.scheduledDepartureUtc)) {
      setError("Scheduled arrival must be after scheduled departure.");
      return;
    }
    if (coverageTooHigh) {
      setError(
        `Max coverage can't exceed premium × multiplier (${maxTheoreticalPayout.toLocaleString()} wei here).`
      );
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
        toast.success(`Coverage bought — policy #${newId} is active.`);
        openPolicy(newId);
      } else {
        toast.success("Coverage bought. Add the policy ID on My Policies to track it.");
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
    <div className="mx-auto max-w-2xl px-6 py-14">
      <h1 className="text-2xl font-bold text-ink-primary">Buy coverage</h1>
      <p className="mt-2 text-sm text-ink-dim">
        Coverage activates the moment your premium is paid. Nothing here is
        adjudicated by us — validators judge the real flight data later.
      </p>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-6">
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

        <div className="rounded-md border border-grid bg-panel/60 px-4 py-3 font-mono text-xs text-ink-dim">
          Theoretical max payout at these terms:{" "}
          <span className={coverageTooHigh ? "text-signal-red" : "text-cyan"}>
            {maxTheoreticalPayout.toLocaleString()} wei
          </span>
        </div>

        {error && (
          <div className="rounded-md border border-signal-red/40 bg-signal-red/10 px-4 py-3 text-sm text-signal-red">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-cyan px-5 py-3 text-sm font-semibold text-void hover:bg-cyan/90 disabled:opacity-60"
        >
          {busy ? "Confirming on-chain…" : "Buy coverage"}
        </button>
      </form>
    </div>
  );
}
