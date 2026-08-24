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
        className="group flex items-center gap-2 rounded-md border border-grid bg-panel px-3 py-1.5 text-sm text-ink-primary hover:border-signal-red/50 hover:text-signal-red"
        title="Disconnect"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${account.type === "demo" ? "bg-amber" : "bg-cyan"}`} />
        <span className="font-mono tabular">{shortAddress(account.address)}</span>
        {account.type === "demo" && (
          <span className="rounded bg-amber/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber">
            Demo
          </span>
        )}
        <span className="hidden text-ink-faint group-hover:inline">Disconnect</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={connecting}
        className="rounded-md bg-cyan px-4 py-1.5 text-sm font-semibold text-void hover:bg-cyan/90 disabled:opacity-60"
      >
        {connecting ? "Connecting…" : "Connect"}
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-64 rounded-lg border border-grid bg-panel p-2 shadow-2xl">
          <button
            onClick={() => {
              setOpen(false);
              connectReal();
            }}
            className="block w-full rounded-md px-3 py-2 text-left text-sm text-ink-primary hover:bg-panel2"
          >
            <div className="font-medium">Connect wallet</div>
            <div className="text-xs text-ink-dim">MetaMask or another browser wallet</div>
          </button>
          <button
            onClick={() => {
              setOpen(false);
              connectDemo();
            }}
            className="block w-full rounded-md px-3 py-2 text-left text-sm text-ink-primary hover:bg-panel2"
          >
            <div className="font-medium">Try demo mode</div>
            <div className="text-xs text-ink-dim">Instant session key, no wallet install needed</div>
          </button>
        </div>
      )}
    </div>
  );
}
