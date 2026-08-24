import React, { useEffect, useState } from "react";
import { getPool, getTotalPolicies, contractConfigured } from "../lib/genlayerClient";

function Stat({ label, value, accent = "text-ink-primary" }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-faint">{label}</span>
      <span className={`font-mono text-2xl font-semibold tabular ${accent}`}>{value}</span>
    </div>
  );
}

export default function StatsBar() {
  const [pool, setPool] = useState(null);
  const [total, setTotal] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!contractConfigured()) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await getPool();
        if (!cancelled) setPool(p);
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      }
      try {
        const t = await getTotalPolicies();
        if (!cancelled) setTotal(t);
      } catch {
        // optional view — not every deployment has it yet, fail silently
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!contractConfigured()) {
    return (
      <div className="rounded-lg border border-amber/30 bg-amber/5 px-4 py-3 text-sm text-amber">
        Set <code className="font-mono">VITE_SKYVERDICT_ADDRESS</code> in <code className="font-mono">.env.local</code> to load live contract data.
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-signal-red/30 bg-signal-red/5 px-4 py-3 text-sm text-signal-red">
        <p className="font-medium">Couldn't load contract data.</p>
        <p className="mt-1 font-mono text-xs opacity-80 break-words">{error}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-6 rounded-lg border border-grid bg-panel/60 px-6 py-5 sm:grid-cols-4">
      <Stat label="Pool balance" value={pool ? pool.pool_balance.toLocaleString() : "—"} accent="text-cyan" />
      <Stat label="Protocol fees" value={pool ? pool.protocol_fees_accrued.toLocaleString() : "—"} />
      <Stat label="Creator fees" value={pool ? pool.creator_fees_accrued.toLocaleString() : "—"} />
      <Stat label="Policies written" value={total !== null ? total.toLocaleString() : "—"} accent="text-amber" />
    </div>
  );
}
