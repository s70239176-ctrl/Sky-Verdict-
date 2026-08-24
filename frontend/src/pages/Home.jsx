import React from "react";
import ConsensusRadar from "../components/ConsensusRadar";
import StatsBar from "../components/StatsBar";
import DepartureBoard from "../components/DepartureBoard";

const HOW_IT_WORKS = [
  {
    n: "01",
    title: "Buy coverage",
    body: "Set a flight, a delay threshold, and a payout multiplier. Pay the premium as the transaction value — coverage is active immediately.",
  },
  {
    n: "02",
    title: "Validators judge, independently",
    body: "After the settlement buffer, anyone triggers evaluation. Each GenLayer validator fetches live tracker data on its own and extracts a structured verdict with an LLM — no shared oracle, no single source of truth.",
  },
  {
    n: "03",
    title: "Consensus settles the claim",
    body: "Validators reach Optimistic-Democracy agreement on the verdict in the same transaction. If it's a payout, funds move immediately — no claims desk, no waiting.",
  },
];

const EXAMPLE_ROWS = [
  { policyId: "ex-1", airlineCode: "DL", flightNumber: "202", departureAirport: "JFK", thresholdMinutes: 180, premium: 1000, status: "PAID" },
  { policyId: "ex-2", airlineCode: "AA", flightNumber: "100", departureAirport: "ORD", thresholdMinutes: 60, premium: 750, status: "ACTIVE" },
  { policyId: "ex-3", airlineCode: "UA", flightNumber: "884", departureAirport: "SFO", thresholdMinutes: 120, premium: 500, status: "EXPIRED_NO_PAYOUT" },
];

export default function Home({ setView }) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-24 px-6 pb-24 pt-16">
      {/* Hero */}
      <section className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-6">
          <span className="w-fit rounded-full border border-cyan/30 bg-cyan/5 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.15em] text-cyan">
            Built on GenLayer · Optimistic Democracy
          </span>
          <h1 className="text-4xl font-extrabold leading-[1.1] text-ink-primary sm:text-5xl">
            Flight delay insurance that
            <span className="text-cyan"> settles itself.</span>
          </h1>
          <p className="max-w-lg text-lg text-ink-dim">
            No claims desk. No trusted oracle. When your flight is late,
            independent validators check the real tracker data themselves
            and agree on your payout — on-chain, in one transaction.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setView("buy")}
              className="rounded-md bg-cyan px-5 py-2.5 text-sm font-semibold text-void shadow-glow hover:bg-cyan/90"
            >
              Buy coverage
            </button>
            <button
              onClick={() => setView("transparency")}
              className="rounded-md border border-grid px-5 py-2.5 text-sm font-medium text-ink-primary hover:border-ink-faint"
            >
              See the transparency feed
            </button>
          </div>
        </div>

        <div className="flex justify-center">
          <ConsensusRadar size={260} />
        </div>
      </section>

      {/* Stats */}
      <section>
        <StatsBar />
      </section>

      {/* How it works — a real sequence, so numbering is earned */}
      <section className="flex flex-col gap-8">
        <h2 className="font-mono text-sm uppercase tracking-[0.2em] text-ink-faint">How it works</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {HOW_IT_WORKS.map((s) => (
            <div key={s.n} className="flex flex-col gap-3 rounded-lg border border-grid bg-panel/60 p-6">
              <span className="font-mono text-xs text-cyan">{s.n}</span>
              <h3 className="text-lg font-semibold text-ink-primary">{s.title}</h3>
              <p className="text-sm leading-relaxed text-ink-dim">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sample board */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm uppercase tracking-[0.2em] text-ink-faint">Example verdicts</h2>
          <span className="rounded bg-panel2 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
            Illustrative — not live data
          </span>
        </div>
        <DepartureBoard rows={EXAMPLE_ROWS} />
        <p className="text-sm text-ink-dim">
          Want to see real ones?{" "}
          <button onClick={() => setView("transparency")} className="text-cyan underline underline-offset-2">
            Open the live transparency feed
          </button>
          .
        </p>
      </section>
    </div>
  );
}
