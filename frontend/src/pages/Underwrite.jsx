import React, { useCallback, useEffect, useState } from "react";
import {
  getPool, getUnderwriter, getKeeperQueue, contractConfigured,
  depositLiquidity, requestWithdrawal, executeWithdrawal, cancelWithdrawal,
} from "../lib/genlayerClient";
import { useWallet } from "../context/WalletContext";
import { useToast } from "../context/ToastContext";
import { formatGen, formatUnixUtc } from "../lib/format";
import ProtocolHealth from "../components/ProtocolHealth";

const inputClass =
  "border rule bg-near-black px-3 py-2.5 font-mono text-sm text-ivory outline-none focus:border-orange/60";

function Stat({ label, value, sub }) {
  return (
    <div className="border rule px-4 py-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ivory-soft/40">{label}</div>
      <div className="mt-1 font-mono text-lg text-ivory">{value}</div>
      {sub && <div className="mt-1 text-xs text-ivory-soft/40">{sub}</div>}
    </div>
  );
}

/**
 * Underwriter console: back the pool, earn its premiums, absorb its claims.
 * Everything here is read from / written to the contract — no indexer.
 */
export default function Underwrite() {
  const { account } = useWallet();
  const toast = useToast();
  const [pool, setPool] = useState(null);
  const [me, setMe] = useState(null);
  const [queue, setQueue] = useState(null);
  const [amount, setAmount] = useState("10000");
  const [shares, setShares] = useState("");
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    if (!contractConfigured()) return;
    try {
      setPool(await getPool());
      if (account) setMe(await getUnderwriter(account.address));
      setQueue(await getKeeperQueue(10));
    } catch {
      setUnavailable(true);
    }
  }, [account]);

  useEffect(() => { refresh(); }, [refresh]);

  const run = async (label, fn) => {
    setBusy(true);
    try {
      await fn();
      toast?.success?.(`${label} submitted — refreshing…`);
      // Studio takes ~10-40s to accept a tx: re-read a few times instead of once.
      [6000, 18000, 36000].forEach((ms) => setTimeout(refresh, ms));
    } catch (e) {
      toast?.error?.(e?.message || `${label} failed`);
    } finally {
      setBusy(false);
    }
  };

  if (!contractConfigured() || unavailable) {
    return (
      <main className="px-6 py-12 md:px-10 lg:px-16">
        <p className="font-mono text-sm text-ivory-soft/60">
          Underwriting needs the v2 contract. Set VITE_SKYVERDICT_ADDRESS to a v2 deployment.
        </p>
      </main>
    );
  }

  const util = pool ? Number(pool.utilization_bps) / 100 : 0;
  const unlock = me ? Number(me.withdraw_unlock_utc) : 0;
  const hasRequest = me && Number(me.withdraw_requested_shares) > 0;
  const nowSec = Math.floor(Date.now() / 1000);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 md:px-10">
      <h1 className="font-mono text-2xl text-ivory">Underwrite SkyVerdict</h1>
      <p className="mt-3 max-w-2xl text-sm text-ivory-soft/60">
        Provide capital that backs every policy. You receive pool shares, earn the net premium of every flight
        that lands on time, and cover the payout when one doesn't. Policies can only be sold when free capital
        covers their worst case, so holders are always paid in full.
      </p>

      <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Pool capital" value={pool ? formatGen(pool.pool_balance) : "…"} />
        <Stat label="Reserved for open policies" value={pool ? formatGen(pool.reserved_exposure) : "…"} />
        <Stat label="Free capital" value={pool ? formatGen(pool.free_capital) : "…"} sub="available to new policies / exits" />
        <Stat
          label="Utilization"
          value={pool ? `${util.toFixed(1)}%` : "…"}
          sub={pool ? `share price ${(Number(pool.share_price_e6) / 1e6).toFixed(4)}× par` : undefined}
        />
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="border rule p-5">
          <h2 className="font-mono text-sm uppercase tracking-[0.08em] text-orange">Deposit</h2>
          <input className={`${inputClass} mt-4 w-full`} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button
            disabled={busy || !account}
            onClick={() => run("Deposit", () => depositLiquidity(BigInt(amount)))}
            className="mt-3 w-full border border-orange/60 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.08em] text-orange hover:bg-orange/10 disabled:opacity-40"
          >
            {account ? "Deposit liquidity" : "Connect a wallet first"}
          </button>
          <p className="mt-3 text-xs text-ivory-soft/40">
            Shares are priced at book value, so late depositors don't dilute earlier ones.
          </p>
        </div>

        <div className="border rule p-5">
          <h2 className="font-mono text-sm uppercase tracking-[0.08em] text-orange">Your position</h2>
          {me && Number(me.shares) > 0 ? (
            <>
              <div className="mt-3 font-mono text-sm text-ivory">
                {Number(me.shares).toLocaleString()} shares · {formatGen(me.value_wei)}
              </div>
              <div className="text-xs text-ivory-soft/40">{(Number(me.pool_share_bps) / 100).toFixed(2)}% of the pool</div>
              {hasRequest ? (
                <div className="mt-4 space-y-2">
                  <div className="text-xs text-ivory-soft/60">
                    Exit of {Number(me.withdraw_requested_shares).toLocaleString()} shares queued — unlocks{" "}
                    {formatUnixUtc(unlock)}.
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={busy || nowSec < unlock}
                      onClick={() => run("Withdrawal", executeWithdrawal)}
                      className="flex-1 border border-orange/60 px-3 py-2 font-mono text-xs uppercase text-orange disabled:opacity-40"
                    >
                      {nowSec < unlock ? "Cooling down" : "Withdraw"}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => run("Cancel", cancelWithdrawal)}
                      className="border rule px-3 py-2 font-mono text-xs uppercase text-ivory-soft/60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex gap-2">
                  <input className={`${inputClass} flex-1`} type="number" placeholder="shares to exit" value={shares} onChange={(e) => setShares(e.target.value)} />
                  <button
                    disabled={busy || !Number(shares)}
                    onClick={() => run("Exit request", () => requestWithdrawal(shares))}
                    className="border rule px-3 py-2 font-mono text-xs uppercase text-ivory-soft/70 disabled:opacity-40"
                  >
                    Request exit
                  </button>
                </div>
              )}
              <p className="mt-3 text-xs text-ivory-soft/40">
                Exits wait 24h so nobody can leave after spotting a delayed flight but before its claim settles.
                Only capital not reserved against open policies can leave.
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-ivory-soft/50">
              {account ? "No position yet." : "Connect a wallet to see your position."}
            </p>
          )}
        </div>
      </section>

      <ProtocolHealth />

      <section className="mt-8 border rule p-5">
        <h2 className="font-mono text-sm uppercase tracking-[0.08em] text-orange">Claims awaiting a keeper</h2>
        <p className="mt-2 text-xs text-ivory-soft/50">
          Anyone can settle these and earn a bounty paid from protocol fees. The keeper bot in <code>keeper/</code>{" "}
          does it automatically.
        </p>
        <div className="mt-3 font-mono text-sm text-ivory">
          {queue === null ? "…" : queue.length ? queue.map((id) => `#${id}`).join("  ") : "None right now"}
        </div>
      </section>
    </main>
  );
}
