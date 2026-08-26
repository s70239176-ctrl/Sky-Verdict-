import React from "react";
import WalletButton from "./WalletButton";

const LINKS = [
  { id: "home", label: "Home" },
  { id: "buy", label: "Protect a flight" },
  { id: "policies", label: "My flights" },
  { id: "transparency", label: "Verdict history" },
];

export default function Navbar({ view, setView }) {
  return (
    <header className="sticky top-0 z-40 border-b rule bg-ink/90 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-6 py-4 md:px-10 lg:px-16">
        <button
          onClick={() => setView("home")}
          className="flex items-center gap-2 font-mono text-sm font-semibold tracking-[0.08em] text-ivory"
        >
          <span className="flex h-6 w-6 items-center justify-center border border-orange/60 text-orange">
            ✈
          </span>
          SKYVERDICT
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <button
              key={l.id}
              onClick={() => setView(l.id)}
              className={`px-3 py-1.5 font-mono text-xs uppercase tracking-[0.08em] transition-colors ${
                view === l.id
                  ? "text-orange"
                  : "text-ivory-soft/60 hover:text-ivory"
              }`}
            >
              {l.label}
            </button>
          ))}
        </nav>

        <WalletButton />
      </div>
    </header>
  );
}
