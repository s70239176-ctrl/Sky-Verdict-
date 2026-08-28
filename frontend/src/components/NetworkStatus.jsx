import React, { useEffect, useState } from "react";
import { getPool, getTotalPolicies, contractConfigured } from "../lib/genlayerClient";
import { formatGen } from "../lib/format";

function Stat({ label, value, accent = "text-ivory" }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="eyebrow text-ivory-soft/40">{label}</span>
      <span className={`font-mono text-xl font-semibold tabular ${accent}`}>{value}</span>
    </div>
  );
}

export default function NetworkStatus() {
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
      <div className="border border-amber/30 bg-amber/5 px-4 py-3 text-sm text-amber">
        Set <code className="font-mono">VITE_SKYVERDICT_ADDRESS</code> in <code className="font-mono">.env.local</code> to load live network status.
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-amber/30 bg-amber/5 px-4 py-3 text-sm text-amber">
        <p className="font-medium">Couldn't reach the network.</p>
        <p className="mt-1 break-words font-mono text-xs opacity-80">{error}</p>
      </div>
    );
  }

  return (
    <div className="border rule px-6 py-5">
      <div className="mb-5 flex items-center justify-between">
        <span className="eyebrow text-ivory-soft/50">Network</span>
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-orange">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-orange" />
          LIVE
        </span>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <Stat label="Pool balance" value={pool ? formatGen(pool.pool_balance) : "—"} accent="text-blue" />
        <Stat label="Policies written" value={total !== null ? total.toLocaleString() : "—"} accent="text-orange" />
        <Stat label="Protocol fees" value={pool ? formatGen(pool.protocol_fees_accrued) : "—"} />
        <Stat label="Creator fees" value={pool ? formatGen(pool.creator_fees_accrued) : "—"} />
      </div>
    </div>
  );
}
