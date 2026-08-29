import React, { useState } from "react";
import { createPolicyFromText, getTotalPolicies } from "../lib/genlayerClient";
import { trackPolicyId } from "../lib/localPolicies";
import { useWallet } from "../context/WalletContext";
import { useToast } from "../context/ToastContext";

const EXAMPLE = "Cover DL202 from JFK, delayed more than 90 minutes, up to 3x premium.";

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

export default function BuyByDescription({ setView, openPolicy }) {
  const { account } = useWallet();
  const toast = useToast();
  const [description, setDescription] = useState("");
  const [scheduledDepartureUtc, setScheduledDepartureUtc] = useState("");
  const [scheduledArrivalUtc, setScheduledArrivalUtc] = useState("");
  const [premiumWei, setPremiumWei] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setError(null);
    if (!account) {
      setError("Connect a wallet or start demo mode before buying coverage.");
      return;
    }
    if (!description.trim()) {
      setError("Describe the flight and coverage you want.");
      return;
    }
    if (!scheduledDepartureUtc || !scheduledArrivalUtc || Number(scheduledArrivalUtc) <= Number(scheduledDepartureUtc)) {
      setError("Both scheduled times are required, with arrival after departure.");
      return;
    }

    setBusy(true);
    try {
      await createPolicyFromText({
        description: description.trim(),
        scheduledDepartureUtc: Number(scheduledDepartureUtc),
        scheduledArrivalUtc: Number(scheduledArrivalUtc),
        premiumWei: Number(premiumWei),
      });
      let newId = null;
      try {
        newId = await getTotalPolicies();
      } catch {
        newId = null;
      }
      if (newId != null) {
        trackPolicyId(newId);
        toast.success(`Policy created from your description — #${newId}.`);
        openPolicy(newId);
      } else {
        toast.success("Coverage bought from your description.");
        setView("policies");
      }
    } catch (err) {
      setError(err.message || String(err));
      toast.error("Couldn't create a policy from that description.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-14 md:py-20">
      <span className="eyebrow text-ivory-soft/40">Describe your coverage</span>
      <h1 className="mt-3 text-display-3 font-extrabold text-ivory">SAY WHAT YOU WANT COVERED</h1>
      <p className="mt-2 max-w-lg text-sm text-ivory-soft/50">
        Validators independently read your description and agree on the exact terms before
        anything is created — if they can't agree, or your description is missing something
        essential, nothing is charged.{" "}
        <button onClick={() => setView("buy")} className="text-orange underline underline-offset-4">
          Prefer a plain form instead?
        </button>
      </p>

      <div className="mt-8 flex flex-col gap-6">
        <Field label="Describe the flight and coverage" hint='e.g. "Cover DL202 from JFK, delayed more than 90 minutes, up to 3x premium."'>
          <textarea
            className={`${inputClass} min-h-[100px] resize-y`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={EXAMPLE}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Scheduled departure" hint="Unix UTC timestamp">
            <input className={inputClass} type="number" value={scheduledDepartureUtc} onChange={(e) => setScheduledDepartureUtc(e.target.value)} />
          </Field>
          <Field label="Scheduled arrival" hint="Unix UTC timestamp, after departure">
            <input className={inputClass} type="number" value={scheduledArrivalUtc} onChange={(e) => setScheduledArrivalUtc(e.target.value)} />
          </Field>
        </div>

        <Field label="Premium" hint="Paid as the transaction value; the multiplier from your description determines max coverage">
          <input className={inputClass} type="number" value={premiumWei} onChange={(e) => setPremiumWei(e.target.value)} />
        </Field>

        <div className="border border-blue/20 bg-blue/5 px-4 py-3 text-xs text-ivory-soft/60">
          The airline, flight number, departure airport, and delay threshold must be stated or
          clearly implied — those aren't optional. A multiplier defaults to 2× if you don't state
          one; state an explicit max coverage cap (e.g. "max 500") if you want one below the
          multiplier's own ceiling.
        </div>

        {error && <div className="border border-amber/40 bg-amber/5 px-4 py-3 text-sm text-amber">{error}</div>}

        <button
          onClick={submit}
          disabled={busy}
          className="w-fit bg-orange px-6 py-3 font-mono text-xs uppercase tracking-[0.06em] font-semibold text-ink hover:bg-orange/90 disabled:opacity-60"
        >
          {busy ? "Reaching consensus on terms…" : "Create policy from description"}
        </button>
      </div>
    </div>
  );
}
