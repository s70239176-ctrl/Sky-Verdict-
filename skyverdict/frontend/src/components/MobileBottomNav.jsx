import React from "react";

const LINKS = [
  { id: "home", label: "Home" },
  { id: "buy", label: "Protect" },
  { id: "policies", label: "Flights" },
  { id: "transparency", label: "History" },
];

export default function MobileBottomNav({ view, setView }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t rule bg-ink/95 backdrop-blur-md md:hidden"
      aria-label="Primary"
    >
      {LINKS.map((l) => {
        const active = view === l.id;
        return (
          <button
            key={l.id}
            onClick={() => setView(l.id)}
            className={`flex flex-col items-center gap-1 py-3 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
              active ? "text-orange" : "text-ivory-soft/50"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <span className={`h-1 w-1 rounded-full ${active ? "bg-orange" : "bg-transparent"}`} />
            {l.label}
          </button>
        );
      })}
    </nav>
  );
}
