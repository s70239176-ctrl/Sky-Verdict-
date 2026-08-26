import React from "react";
import FlightRoute from "../components/FlightRoute";
import NetworkStatus from "../components/NetworkStatus";
import FlightHistory from "../components/FlightHistory";

const STAGES = [
  {
    n: "01",
    title: "Monitor",
    body: "Flight data enters the system the moment coverage is bought — airline, flight number, departure airport, scheduled times.",
  },
  {
    n: "02",
    title: "Validate",
    body: "After the flight lands, GenLayer validators independently fetch live tracker pages and extract a structured verdict — each one on its own, with no shared source of truth.",
  },
  {
    n: "03",
    title: "Verdict",
    body: "Validators compare decisions, not bytes, and reach Optimistic-Democracy consensus on one outcome in the same transaction.",
  },
  {
    n: "04",
    title: "Settle",
    body: "When the delay threshold is met, the pool contract transfers funds automatically. No claims desk. Nothing to file.",
  },
];

const EXAMPLE_ROWS = [
  { policyId: "ex-1", airlineCode: "DL", flightNumber: "202", departureAirport: "JFK", thresholdMinutes: 180, premium: 1000, status: "PAID" },
  { policyId: "ex-2", airlineCode: "AA", flightNumber: "100", departureAirport: "ORD", thresholdMinutes: 60, premium: 750, status: "ACTIVE" },
  { policyId: "ex-3", airlineCode: "UA", flightNumber: "884", departureAirport: "SFO", thresholdMinutes: 120, premium: 500, status: "EXPIRED_NO_PAYOUT" },
];

export default function Home({ setView }) {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="border-b rule px-6 pb-16 pt-16 md:px-10 md:pb-24 md:pt-24 lg:px-16">
        <div className="mx-auto max-w-5xl">
          <span className="eyebrow text-orange">Built on GenLayer · Optimistic Democracy</span>
          <h1 className="mt-5 text-display-1 font-black text-ivory">
            FLIGHT PROTECTION,
            <br />
            DECIDED AUTONOMOUSLY.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ivory-soft/70">
            SkyVerdict monitors your flight in real time. When delay conditions are met, the network
            reaches a verifiable verdict and settlement happens automatically.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={() => setView("buy")}
              className="bg-orange px-6 py-3 font-mono text-xs uppercase tracking-[0.08em] font-semibold text-ink hover:bg-orange/90"
            >
              Protect a flight
            </button>
            <button
              onClick={() => setView("transparency")}
              className="border rule-strong px-6 py-3 font-mono text-xs uppercase tracking-[0.08em] text-ivory hover:border-orange/50"
            >
              See the verdict history
            </button>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-5xl border rule px-6 py-8 md:px-10">
          <FlightRoute
            originCode="LOS"
            originCity="Lagos"
            destCode="LHR"
            destCity="London"
            flightLabel="BA 75"
            dateLabel="31 AUG"
            live
            evidence={[
              { label: "Aircraft", done: true },
              { label: "Weather", done: true },
              { label: "Airport", done: true },
              { label: "Arrival", done: false },
              { label: "Network", done: false },
            ]}
          />
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.08em] text-ivory-soft/30">
            Illustrative — not a real policy
          </p>
        </div>
      </section>

      {/* Four-stage story */}
      <section className="border-b rule px-6 py-16 md:px-10 md:py-24 lg:px-16">
        <div className="mx-auto max-w-5xl">
          <span className="eyebrow text-ivory-soft/40">How it works</span>
          <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-14 md:grid-cols-2">
            {STAGES.map((s) => (
              <div key={s.n} className="flex flex-col gap-4">
                <span className="font-mono text-sm text-orange">{s.n}</span>
                <h3 className="text-display-3 font-extrabold text-ivory">{s.title.toUpperCase()}</h3>
                <p className="max-w-sm text-sm leading-relaxed text-ivory-soft/60">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Network status */}
      <section className="border-b rule px-6 py-16 md:px-10 md:py-24 lg:px-16">
        <div className="mx-auto max-w-5xl">
          <span className="eyebrow text-ivory-soft/40">Live network</span>
          <div className="mt-6">
            <NetworkStatus />
          </div>
        </div>
      </section>

      {/* Example verdicts */}
      <section className="px-6 py-16 md:px-10 md:py-24 lg:px-16">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between gap-4">
            <span className="eyebrow text-ivory-soft/40">Example verdicts</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ivory-soft/30">
              Illustrative — not live data
            </span>
          </div>
          <div className="mt-6">
            <FlightHistory rows={EXAMPLE_ROWS} />
          </div>
          <p className="mt-4 text-sm text-ivory-soft/50">
            Want to see real ones?{" "}
            <button onClick={() => setView("transparency")} className="text-orange underline underline-offset-4">
              Open the live verdict history
            </button>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
