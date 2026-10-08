import React, { useCallback, useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { useToast } from "../context/ToastContext";
import { getAffiliate, affiliateWithdraw } from "../lib/v3Client";
import { contractConfigured } from "../lib/genlayerClient";
import { buildLink } from "../lib/referral";
import { formatGen } from "../lib/format";

const inputClass =
  "w-full border rule bg-near-black px-3 py-2.5 font-mono text-sm text-ivory outline-none focus:border-orange/60";

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-xs uppercase tracking-[0.06em] text-ivory-soft/50">{label}</span>
      {children}
    </label>
  );
}

/**
 * Partner console: build a referral link / embeddable widget, see on-chain
 * earnings, withdraw. The referrer share (5% of premium) is carved out of the
 * creator fee by the contract — it never touches underwriter capital.
 */
export default function Partners() {
  const { account } = useWallet();
  const toast = useToast();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const [ref, setRef] = useState(account?.address || "");
  const [f, setF] = useState({ airline: "AA", flight: "100", from: "JFK", dep: "", arr: "" });
  const [aff, setAff] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (account?.address) setRef(account.address); }, [account]);

  const refresh = useCallback(async () => {
    if (!contractConfigured() || !account) return;
    try { setAff(await getAffiliate(account.address)); } catch { setAff(null); }
  }, [account]);
  useEffect(() => { refresh(); }, [refresh]);

  const link = buildLink(origin, { ref, ...f });
  const snippet =
    `<div data-skyverdict-widget\n` +
    `     data-ref="${ref}"\n` +
    `     data-airline="${f.airline}" data-flight="${f.flight}" data-from="${f.from}"\n` +
    `     data-dep="${f.dep}" data-arr="${f.arr}"></div>\n` +
    `<script async src="${origin}/widget.js"></script>`;

  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); toast?.success?.(`${what} copied.`); }
    catch { toast?.error?.("Couldn't copy — select the text and copy it manually."); }
  };

  const withdraw = async () => {
    if (!aff || !Number(aff.balance_wei)) return;
    setBusy(true);
    try {
      await affiliateWithdraw(aff.balance_wei);
      toast?.success?.("Withdrawal submitted — refreshing…");
      [6000, 18000, 36000].forEach((ms) => setTimeout(refresh, ms));
    } catch (e) {
      toast?.error?.(e?.message || "Withdrawal failed");
    } finally {
      setBusy(false);
    }
  };

  const update = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 md:px-10">
      <h1 className="font-mono text-2xl text-ivory">Partners</h1>
      <p className="mt-3 max-w-2xl text-sm text-ivory-soft/60">
        Embed flight-delay protection in a travel site, newsletter or app. Every policy bought through your link
        or widget pays you <b className="text-ivory">5% of the premium</b>, written on-chain at purchase. It comes out of
        the creator fee — never out of underwriter capital — and you can withdraw it any time.
      </p>

      <section className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="border rule p-5">
          <h2 className="font-mono text-sm uppercase tracking-[0.08em] text-orange">Your link & widget</h2>
          <div className="mt-4 grid grid-cols-1 gap-3">
            <Field label="Payout address (referrer)">
              <input className={inputClass} value={ref} onChange={(e) => setRef(e.target.value.trim())} placeholder="0x… (defaults to your connected wallet)" />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Airline"><input className={inputClass} value={f.airline} onChange={update("airline")} /></Field>
              <Field label="Flight #"><input className={inputClass} value={f.flight} onChange={update("flight")} /></Field>
              <Field label="From"><input className={inputClass} value={f.from} onChange={update("from")} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Departure (unix UTC)"><input className={inputClass} type="number" value={f.dep} onChange={update("dep")} /></Field>
              <Field label="Arrival (unix UTC)"><input className={inputClass} type="number" value={f.arr} onChange={update("arr")} /></Field>
            </div>
          </div>
          <div className="mt-4 text-xs text-ivory-soft/50">Referral link</div>
          <textarea readOnly rows={3} className={`${inputClass} mt-1 text-xs`} value={link} />
          <button onClick={() => copy(link, "Link")} className="mt-2 border rule px-3 py-2 font-mono text-xs uppercase text-ivory-soft/70 hover:text-orange">
            Copy link
          </button>
          <div className="mt-4 text-xs text-ivory-soft/50">Embeddable widget</div>
          <textarea readOnly rows={6} className={`${inputClass} mt-1 text-xs`} value={snippet} />
          <button onClick={() => copy(snippet, "Widget code")} className="mt-2 border rule px-3 py-2 font-mono text-xs uppercase text-ivory-soft/70 hover:text-orange">
            Copy widget code
          </button>
        </div>

        <div className="border rule p-5">
          <h2 className="font-mono text-sm uppercase tracking-[0.08em] text-orange">Earnings (on-chain)</h2>
          {account && aff ? (
            <>
              <div className="mt-4 font-mono text-lg text-ivory">{formatGen(aff.balance_wei)}</div>
              <div className="text-xs text-ivory-soft/40">withdrawable now · lifetime {formatGen(aff.lifetime_earned_wei)}</div>
              <button
                disabled={busy || !Number(aff.balance_wei)}
                onClick={withdraw}
                className="mt-4 w-full border border-orange/60 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.08em] text-orange hover:bg-orange/10 disabled:opacity-40"
              >
                Withdraw earnings
              </button>
            </>
          ) : (
            <p className="mt-4 text-sm text-ivory-soft/50">
              {account ? "Loading…" : "Connect the wallet you use as referrer to see its earnings."}
            </p>
          )}
          <p className="mt-6 text-xs text-ivory-soft/40">
            Self-referrals pay nothing. The widget is one script and a link: no cookies, no tracking, no third-party
            requests. A buyer's referrer is remembered in their browser so a later visit still credits you.
          </p>
        </div>
      </section>
    </main>
  );
}
