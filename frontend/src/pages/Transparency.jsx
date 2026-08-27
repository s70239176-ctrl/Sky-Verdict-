import React, { useEffect, useState } from "react";
import { getPolicy, getTotalPolicies, contractConfigured } from "../lib/genlayerClient";
import FlightHistory from "../components/FlightHistory";
import EmptyState from "../components/EmptyState";

const PAGE_SIZE = 20;

export default function Transparency({ openPolicy }) {
  const [total, setTotal] = useState(null);
  const [notAvailable, setNotAvailable] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [manualFrom, setManualFrom] = useState("1");
  const [manualTo, setManualTo] = useState("10");

  const loadRange = async (from, to) => {
    setLoading(true);
    const ids = [];
    for (let i = to; i >= from; i--) ids.push(i);
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          return await getPolicy(id);
        } catch {
          return null;
        }
      })
    );
    setRows(
      results
        .filter(Boolean)
        .map((p) => ({
          policyId: p.policy_id,
          airlineCode: p.airline_code,
          flightNumber: p.flight_number,
          departureAirport: p.departure_airport,
          thresholdMinutes: p.threshold_minutes,
          premium: p.premium,
          status: p.status,
        }))
    );
    setLoading(false);
  };

  useEffect(() => {
    if (!contractConfigured()) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const t = await getTotalPolicies();
        setTotal(t);
        const from = Math.max(1, t - PAGE_SIZE + 1);
        await loadRange(from, t);
      } catch {
        setNotAvailable(true);
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualLoad = (e) => {
    e.preventDefault();
    const from = Number(manualFrom);
    const to = Number(manualTo);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return;
    loadRange(from, to);
  };

  if (!contractConfigured()) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-14">
        <EmptyState
          title="No contract configured"
          body="Set VITE_SKYVERDICT_ADDRESS in .env.local to load the verdict history."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-14 md:py-20">
      <span className="eyebrow text-ivory-soft/40">Verdict history</span>
      <h1 className="mt-2 text-display-3 font-extrabold text-ivory">VERIFIABLE OUTCOMES</h1>
      <p className="mt-3 max-w-lg text-sm text-ivory-soft/60">
        Every policy here is read live from the contract — nothing is cached or curated. Click a
        row to see its full verdict history.
      </p>

      {notAvailable && (
        <div className="mt-8 flex flex-col gap-3 border border-amber/30 bg-amber/5 px-4 py-4 text-sm text-amber">
          <p>
            This deployment doesn't expose <code className="font-mono">get_total_policies</code> yet
            (it's an optional, additive view — see <code className="font-mono">docs/genvm-gotchas.md</code>).
            Enter an ID range to browse manually instead.
          </p>
          <form onSubmit={handleManualLoad} className="flex items-center gap-2">
            <input
              value={manualFrom}
              onChange={(e) => setManualFrom(e.target.value)}
              className="w-20 border rule bg-near-black px-2 py-1.5 font-mono text-xs text-ivory"
              placeholder="From"
            />
            <span className="text-ivory-soft/30">–</span>
            <input
              value={manualTo}
              onChange={(e) => setManualTo(e.target.value)}
              className="w-20 border rule bg-near-black px-2 py-1.5 font-mono text-xs text-ivory"
              placeholder="To"
            />
            <button type="submit" className="border rule px-3 py-1.5 font-mono text-xs text-ivory hover:border-orange/50">
              Load
            </button>
          </form>
        </div>
      )}

      <div className="mt-8">
        {loading ? (
          <p className="font-mono text-sm text-ivory-soft/50">Loading the feed…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No policies found in this range" body="Try a different ID range, or check back after the first policy is written." />
        ) : (
          <>
            {total !== null && (
              <p className="mb-3 font-mono text-xs text-ivory-soft/30">
                Showing the {rows.length} most recent of {total} total policies
              </p>
            )}
            <FlightHistory rows={rows} onRowClick={(row) => openPolicy(row.policyId)} />
          </>
        )}
      </div>
    </div>
  );
}
