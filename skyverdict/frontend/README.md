# SkyVerdict frontend

Vite + React + Tailwind. No backend, no database — every screen reads
and writes the deployed contract directly (see `docs/TRD.md` for why
that's a deliberate choice, not a missing feature).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in VITE_SKYVERDICT_ADDRESS if different
npm run dev
```

Open the printed local URL. No wallet needed to look around — reads
(stats, transparency feed) work immediately. Writes (buying coverage,
evaluating a claim) need a connected account.

## Feature tour

**Connect** — top-right button offers two paths:
- **Connect wallet** — any injected EIP-1193 wallet (MetaMask, etc.);
  signing happens in the wallet, this app never touches a private key.
- **Try demo mode** — generates a throwaway `genlayer-js` session key
  client-side via `createAccount()`. Zero install, one click, every write
  path works immediately. Built specifically so a judge can try the full
  flow without installing anything — labeled "Demo" everywhere it's active
  so it's never mistaken for a real funded wallet.

**Home** — the pitch in one screen: a live **Consensus Radar** (the
signature visual — see below), a stats bar reading real pool balances
straight from `get_pool()`, and a 3-step "how it works" section that
matches the actual contract lifecycle, not marketing copy.

**Buy coverage** — a real form wired to `create_policy`, with inline
validation that mirrors the contract's own checks (arrival after
departure, max coverage within the multiplier cap) so invalid
transactions never reach the chain. On success it tracks the new policy
locally and jumps straight to its detail view.

**My policies** — every policy this browser has created or explicitly
added (there's no on-chain "list my policies" — see `docs/TRD.md` for
why), each rendered from a live `get_policy` read, never cached state.
Add any policy by ID to start tracking it.

**Policy detail** — the core screen. Shows full policy terms, the last
verdict JSON pretty-printed, and live action buttons for whichever
transitions the contract actually allows right now (`evaluate_claim`,
`appeal`, `claim_refund`) — buttons that wouldn't succeed on-chain aren't
shown, rather than shown-then-erroring. Triggering an action animates the
**Consensus Radar** through GenLayer's real stage names
(`PROPOSING → COMMITTING → REVEALING → ACCEPTED`) while the transaction
confirms.

**Transparency feed** — a public, unfiltered list of real on-chain
policies, newest first, split-flap "departure board" styled. Uses the
optional `get_total_policies` view if the deployed contract has it
(added alongside this frontend — see `docs/genvm-gotchas.md`); falls back
to manual ID-range browsing if not, rather than silently showing nothing.

## The signature element: Consensus Radar

`src/components/ConsensusRadar.jsx`. This is the one deliberate visual
risk in the whole design (see `docs/` design notes) — instead of a
generic spinner, it's a radar screen where each blip is one GenLayer
validator, and the stage labels underneath are GenLayer's own consensus
lifecycle names, taken directly from real Studio transaction logs
encountered while building this contract (`PENDING → PROPOSING →
COMMITTING → REVEALING → ACCEPTED`). It's reused in two places: ambient
on the homepage, and functionally on the policy detail page during an
actual pending transaction.

**Honesty note:** the stage progression during a real transaction is an
*indicative* animation timed to the transaction's pending duration, not a
live per-validator telemetry stream — `genlayer-js`'s `writeContract`
doesn't expose that here. It shows what's happening in general, not a
literal live feed of each validator's individual state. Said plainly in
case anyone building on this wants to know where the line is.

## What would make this stronger for a live hackathon demo

- Wire a real event/log stream (if `genlayer-js` exposes transaction
  status callbacks) so the Consensus Radar reflects actual validator
  agreement in real time instead of an indicative animation.
- An admin panel view for `admin_add_domain` / `admin_set_paused` if a
  judge wants to see the allowlist mechanism, not just the claimant flow.
- A "seed demo data" button (Studio/testnet only) that creates 2–3 sample
  policies at varied statuses on load, so the Transparency feed and My
  Policies views aren't empty for a first-time judge with no existing
  policies to browse.
