import React, { useEffect, useState } from "react";
import { getPolicy } from "../lib/genlayerClient";
import { getTrackedPolicyIds, trackPolicyId } from "../lib/localPolicies";
import PolicyCard from "../components/PolicyCard";
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
    <div className="mx-auto max-w-4xl px-6 py-14">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-primary">My policies</h1>
          <p className="mt-1 text-sm text-ink-dim">
            Tracked in this browser only — every status shown is read fresh from the contract.
          </p>
        </div>
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <input
            value={addId}
            onChange={(e) => setAddId(e.target.value)}
            placeholder="Policy ID"
            className="w-28 rounded-md border border-grid bg-panel px-3 py-2 font-mono text-sm text-ink-primary outline-none focus:border-cyan/60"
          />
          <button
            type="submit"
            className="rounded-md border border-grid px-3 py-2 text-sm text-ink-primary hover:border-cyan/50"
          >
            Track
          </button>
        </form>
      </div>
      {addError && <p className="mt-2 text-sm text-signal-red">{addError}</p>}

      <div className="mt-8">
        {loading ? (
          <p className="font-mono text-sm text-ink-dim">Loading your policies…</p>
        ) : policies.length === 0 ? (
          <EmptyState
            title="No policies tracked yet"
            body={
              account
                ? "Buy your first policy, or track an existing one by ID above."
                : "Connect a wallet, then buy your first policy — or track an existing one by ID above."
            }
            action={
              <button
                onClick={() => setView("buy")}
                className="rounded-md bg-cyan px-4 py-2 text-sm font-semibold text-void hover:bg-cyan/90"
              >
                Buy coverage
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {policies.map((p) => (
              <PolicyCard key={p.policy_id} policy={p} onOpen={() => openPolicy(p.policy_id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
