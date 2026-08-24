import React from "react";
import WalletButton from "./WalletButton";

const LINKS = [
  { id: "home", label: "Home" },
  { id: "buy", label: "Buy coverage" },
  { id: "policies", label: "My policies" },
  { id: "transparency", label: "Transparency" },
];

export default function Navbar({ view, setView }) {
  return (
    <header className="sticky top-0 z-40 border-b border-grid bg-void/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <button
          onClick={() => setView("home")}
          className="flex items-center gap-2 font-mono text-sm font-semibold tracking-wide text-ink-primary"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan/50 text-cyan">
            ✈
          </span>
          SKYVERDICT
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <button
              key={l.id}
              onClick={() => setView(l.id)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                view === l.id
                  ? "bg-panel2 text-ink-primary"
                  : "text-ink-dim hover:text-ink-primary"
              }`}
            >
              {l.label}
            </button>
          ))}
        </nav>

        <WalletButton />
      </div>

      {/* mobile nav */}
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-grid px-4 py-2 md:hidden">
        {LINKS.map((l) => (
          <button
            key={l.id}
            onClick={() => setView(l.id)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs transition-colors ${
              view === l.id ? "bg-panel2 text-ink-primary" : "text-ink-dim"
            }`}
          >
            {l.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
