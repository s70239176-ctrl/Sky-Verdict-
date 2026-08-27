import React, { useEffect, useState } from "react";
import { getPolicy, getTotalPolicies, contractConfigured } from "../lib/genlayerClient";
import { getTrackedPolicyIds, trackPolicyId } from "../lib/localPolicies";
import FlightCard from "../components/FlightCard";
import EmptyState from "../components/EmptyState";
import { useWallet } from "../context/WalletContext";

// How many policy IDs to scan looking for ones held by the connected
// wallet. The contract has no "policies by holder" index, so this is a
// linear scan over get_total_policies() — fine at hackathon/demo scale,
// worth replacing with a real index (or an off-chain indexer) before this
// is holding a large volume of real policies.
const SCAN_LIMIT = 200;

export default function MyPolicies({ openPolicy, setView }) {
  const { account } = useWallet();
  const [owned, setOwned] = useState([]);
  const [tracked, setTracked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addId, setAddId] = useState("");
  const [addError, setAddError] = useState(null);
  const [scanLimited, setScanLimited] = useState(false);

  const reload = async () => {
    setLoading(true);

    // Manually tracked IDs (kept for convenience — e.g. peeking at a
    // policy you don't hold, useful for demos). Not treated as "yours".
    const trackedIds = getTrackedPolicyIds();
    const trackedResults = await Promise.all(
      trackedIds.map(async (id) => {
        try {
          return await getPolicy(id);
        } catch {
          return null;
        }
      })
    );
    setTracked(trackedResults.filter(Boolean));

    // Real ownership: derived from the contract's own `holder` field on
    // each policy, matched against the connected wallet — not from
    // anything stored in this browser.
    if (account && contractConfigured()) {
      try {
        const total = await getTotalPolicies();
        const from = Math.max(1, total - SCAN_LIMIT + 1);
        setScanLimited(from > 1);
        const ids = [];
        for (let i = total; i >= from; i--) ids.push(i);
        const results = await Promise.all(
          ids.map(async (id) => {
            try {
              return await getPolicy(id);
            } catch {
              return null;
            }
          })
        );
        const mine = results
          .filter(Boolean)
          .filter((p) => p.holder?.toLowerCase() === account.address?.toLowerCase());
        setOwned(mine);
      } catch {
        setOwned([]);
      }
    } else {
      setOwned([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.address]);

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

  // De-dupe: don't show a policy in both lists if it happens to be both
  // owned and manually tracked.
  const ownedIds = new Set(owned.map((p) => p.policy_id));
  const trackedOnly = tracked.filter((p) => !ownedIds.has(p.policy_id));

  return (
    <div className="mx-auto max-w-5xl px-6 py-14 md:py-20">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b rule pb-6">
        <div>
          <span className="eyebrow text-ivory-soft/40">My flights</span>
          <h1 className="mt-2 text-display-3 font-extrabold text-ivory">MY FLIGHTS</h1>
          <p className="mt-2 max-w-lg text-sm text-ivory-soft/50">
            Matched to your connected wallet using the contract's own record of who bought each
            policy — not a local list, so it holds up across browsers and devices.
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

      <div className="mt-3 border border-blue/20 bg-blue/5 px-4 py-2.5 text-xs text-ivory-soft/60">
        SkyVerdict runs on a public blockchain — policy data isn't private. Anyone with a policy ID
        can look it up on the{" "}
        <button onClick={() => setView("transparency")} className="text-blue underline underline-offset-2">
          Verdict history
        </button>{" "}
        page. This list just filters to what's relevant to you.
      </div>

      {!account && (
        <div className="mt-8 border border-amber/30 bg-amber/5 px-4 py-3 text-sm text-amber">
          Connect a wallet to see policies held by your address.
        </div>
      )}

      <div className="mt-10">
        {loading ? (
          <p className="font-mono text-sm text-ivory-soft/50">Loading your flights…</p>
        ) : (
          <>
            {account && (
              <section className="mb-10">
                <div className="mb-4 flex items-center justify-between">
                  <span className="eyebrow text-ivory-soft/40">Held by your wallet</span>
                  {scanLimited && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ivory-soft/30">
                      Scanned last {SCAN_LIMIT} policies
                    </span>
                  )}
                </div>
                {owned.length === 0 ? (
                  <EmptyState
                    title="No flights held by this wallet yet"
                    body="Protect your first flight to see it appear here automatically."
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
                    {owned.map((p) => (
                      <FlightCard key={p.policy_id} policy={p} onOpen={() => openPolicy(p.policy_id)} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {trackedOnly.length > 0 && (
              <section>
                <span className="eyebrow text-ivory-soft/40">Manually tracked</span>
                <p className="mb-4 mt-1 text-xs text-ivory-soft/40">
                  Added by policy ID — not necessarily held by your wallet.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {trackedOnly.map((p) => (
                    <FlightCard key={p.policy_id} policy={p} onOpen={() => openPolicy(p.policy_id)} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
