import React, { useState } from "react";
import { useWallet } from "../context/WalletContext";
import { shortAddress } from "../lib/format";

export default function WalletButton() {
  const { account, connecting, connectReal, connectDemo, disconnectAccount } = useWallet();
  const [open, setOpen] = useState(false);

  if (account) {
    return (
      <button
        onClick={disconnectAccount}
        className="group flex items-center gap-2 border rule px-3 py-1.5 font-mono text-xs text-ivory hover:border-orange/50 hover:text-orange"
        title="Disconnect"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${account.type === "demo" ? "bg-amber" : "bg-green"}`} />
        <span className="tabular">{shortAddress(account.address)}</span>
        {account.type === "demo" && (
          <span className="border border-amber/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber">
            Demo
          </span>
        )}
        <span className="hidden text-ivory-soft/50 group-hover:inline">Disconnect</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={connecting}
        className="bg-orange px-4 py-1.5 font-mono text-xs uppercase tracking-[0.06em] font-semibold text-ink hover:bg-orange/90 disabled:opacity-60"
      >
        {connecting ? "Connecting…" : "Connect"}
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-64 border rule bg-near-black p-1 shadow-2xl">
          <button
            onClick={() => {
              setOpen(false);
              connectReal();
            }}
            className="block w-full px-3 py-2.5 text-left hover:bg-graphite"
          >
            <div className="text-sm font-medium text-ivory">Connect wallet</div>
            <div className="mt-0.5 text-xs text-ivory-soft/50">MetaMask or another browser wallet</div>
          </button>
          <button
            onClick={() => {
              setOpen(false);
              connectDemo();
            }}
            className="block w-full px-3 py-2.5 text-left hover:bg-graphite"
          >
            <div className="text-sm font-medium text-ivory">Try demo mode</div>
            <div className="mt-0.5 text-xs text-ivory-soft/50">Instant session key, no wallet install needed</div>
          </button>
        </div>
      )}
    </div>
  );
}
