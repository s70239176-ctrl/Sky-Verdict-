import React, { useEffect, useState } from "react";
import { getPolicy } from "../lib/genlayerClient";
import { getTrackedPolicyIds, trackPolicyId } from "../lib/localPolicies";
import FlightCard from "../components/FlightCard";
import EmptyState from "../components/EmptyState";
import { useWallet } from "../context/WalletContext";

export default function MyPolicies({ openPolicy, setView }) {
  const { account } = useWallet();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addId, setAddId] = useState("");
  const [addError, setAddError] = useState(null);

  const reload = async () => {
    setLoading(true);
    const ids = getTrackedPolicyIds();
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          return await getPolicy(id);
        } catch {
          return null;
        }
      })
    );
    setPolicies(results.filter(Boolean));
    setLoading(false);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setAddError(null);
    const id = Number(addId);
    if (!Number.isFinite(id) || id <= 0) {
      setAddError("Enter a valid policy ID.");
      return;
    }
    try {
      await getPolicy(id); // confirm it exists before tracking
      trackPolicyId(id);
      setAddId("");
      reload();
    } catch {
      setAddError(`No policy found with ID ${id}.`);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-14 md:py-20">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b rule pb-6">
        <div>
          <span className="eyebrow text-ivory-soft/40">My flights</span>
          <h1 className="mt-2 text-display-3 font-extrabold text-ivory">MY FLIGHTS</h1>
          <p className="mt-2 text-sm text-ivory-soft/50">
            Tracked in this browser only — every status shown is read fresh from the contract.
          </p>
        </div>
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <input
            value={addId}
            onChange={(e) => setAddId(e.target.value)}
            placeholder="Policy ID"
            className="w-28 border rule bg-near-black px-3 py-2.5 font-mono text-sm text-ivory outline-none focus:border-orange/60"
          />
          <button
            type="submit"
            className="border rule px-3 py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-ivory hover:border-orange/50"
          >
            Track
          </button>
        </form>
      </div>
      {addError && <p className="mt-2 text-sm text-amber">{addError}</p>}

      <div className="mt-10">
        {loading ? (
          <p className="font-mono text-sm text-ivory-soft/50">Loading your flights…</p>
        ) : policies.length === 0 ? (
          <EmptyState
            title="No flights tracked yet"
            body={
              account
                ? "Protect your first flight, or track an existing one by ID above."
                : "Connect a wallet, then protect your first flight — or track an existing one by ID above."
            }
            action={
              <button
                onClick={() => setView("buy")}
                className="bg-orange px-4 py-2.5 font-mono text-xs uppercase tracking-[0.06em] font-semibold text-ink hover:bg-orange/90"
              >
                Protect a flight
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {policies.map((p) => (
              <FlightCard key={p.policy_id} policy={p} onOpen={() => openPolicy(p.policy_id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
