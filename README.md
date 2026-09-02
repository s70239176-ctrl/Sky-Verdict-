# SkyVerdict

Parametric flight-delay & cancellation insurance, settled trustlessly on
[GenLayer](https://genlayer.com) — no oracle, no claims desk, no human
adjudicator.

## Project summary

Flight-delay insurance today means filing a claim, attaching boarding
passes, and waiting weeks for a human to decide whether you're owed
anything — if the insurer even offers it at all, since verifying delays
across airlines and data sources is expensive and slow. **SkyVerdict**
removes that entirely: buy coverage for a specific flight (or several,
or by describing what you want in plain English), and once it lands,
independent GenLayer validators each fetch live tracker pages
*on their own*, extract a structured verdict, and reach consensus on
delay/cancellation — with payout transferred automatically, in the same
transaction, the moment consensus is reached. The GenLayer advantage
this depends on: Intelligent Contracts that read the live web and
reason over unstructured text natively, and Optimistic-Democracy
consensus so no single fetch, no single LLM call, and no single party
is ever trusted alone — if validators can't agree, the contract fails
closed (`NO_QUORUM`) rather than guessing.

## Live demo

| | |
|---|---|
| Frontend | [sky-verdicts.vercel.app](https://sky-verdicts.vercel.app/) |
| Try it without a wallet | Click **Connect → Try demo mode** on the live site — generates a throwaway session key instantly, no installs needed |

## Contract details

| | |
|---|---|
| Network | GenLayer Studio (hosted) — `studionet` |
| RPC | `https://studio.genlayer.com/api` |
| Chain ID | Confirm current value in Studio's own network settings before deploying/connecting — GenLayer's docs show `61999` for Studio-class networks, but hosted Studio's exact backing config is operated independently of this repo and can change |
| Contract address | `0x005805a09aE697652eD0D8577e7769e3eDcE5585` |
| Explorer | [explorer-studio.genlayer.com](https://explorer-studio.genlayer.com/) |

This is a **Studio-stage deployment for active testing**, not a Testnet
Bradbury or mainnet deployment. See [`docs/SDLC.md`](docs/SDLC.md) for
current phase status.

## Tech stack

- **Contract**: a single Python [Intelligent
  Contract](contracts/SkyVerdict.py) running in GenVM — no backend, no
  database. All state (policies, pool balances, verdicts) lives on-chain.
- **Frontend**: Vite + React + Tailwind, `genlayer-js` (pinned to
  `1.1.8` — see gotcha #6/#9 in `docs/genvm-gotchas.md` for why the
  version matters), `framer-motion` for the consensus/route
  visualizations. Deployed on Vercel, including a small serverless
  function (`frontend/api/rpc.js`) that proxies RPC calls server-side to
  route around hosted Studio's CORS restrictions (gotcha #7).
- **Wallet**: real MetaMask (auto-prompts a network switch/add if
  needed) or a one-click Demo Mode session key — no custody service, no
  backend auth.
- **Agent interface**: [`skills/skyverdict-agent/SKILL.md`](skills/skyverdict-agent/SKILL.md)
  — a Claude-Skills-format manifest so an AI agent can discover and
  correctly call the contract without custom per-framework integration
  code. See [`docs/agent-integration.md`](docs/agent-integration.md) for
  the honest scope of what "agent-native" means here today.

## How it works

1. **Buy coverage.** Three entrypoints, same underlying contract logic:
   a plain form (`create_policy`), a multi-flight trip in one purchase
   with the premium split automatically across legs (`create_trip`), or
   a free-text description an LLM parses into the same schema
   (`create_policy_from_text` — e.g. *"Cover DL202 from JFK, delayed
   more than 90 minutes, up to 3x premium."*). Premium is paid as the
   transaction's native value; a 5% protocol fee + up to 20% creator fee
   are taken at intake, before anything touches the payout pool.
2. **Flight happens.** Coverage is `ACTIVE` until the flight's scheduled
   arrival passes, plus a 3-hour settlement buffer (a deliberate
   anti-moral-hazard rule — no evaluating a claim before you'd
   realistically know the outcome).
3. **Evaluate the claim.** Anyone (the holder, a keeper bot, an agent)
   calls `evaluate_claim` with ≥2 tracker-page URLs from the contract's
   domain allowlist. Each validator independently fetches every URL,
   extracts a structured status via an LLM, and the contract aggregates:
   median delay across valid reads (resistant to one hallucinated
   outlier), majority vote on cancellation, requiring quorum before
   proceeding at all. If validators can't reach quorum, the result is
   `NO_QUORUM` — a deliberate refusal to guess — and the holder gets one
   `appeal()` with fresh sources.
4. **Settlement.** `PAYOUT` transfers funds to the holder automatically,
   in the same transaction — no separate claims process. `NO_PAYOUT`
   just closes the policy. If nothing ever resolves within 14 days,
   `claim_refund()` returns the premium.
5. **See why.** The Reasoning Explorer (in the app's Verdict Room and
   Verdict History pages) shows the real aggregation math applied to
   that policy's real numbers — not a black box. An optional,
   informational-only `classify_delay_cause` can additionally attribute
   a resolved claim's likely cause (airline-controllable vs.
   weather/ATC) without ever touching the payout amount.

## How to run locally

### Contract

```bash
# 1. Fast, offline unit tests — no network, no Studio needed
pip install pytest
pytest tests/direct -v
# or, without pytest (this sandbox never had network access to install it):
python3 tests/direct/smoke_tests.py

# 2. Against GenLayer Studio (integration)
genlayer up
gltest tests/integration -v

# 3. Deploy
python deploy/deploy.py --network studionet --creator 0xYourCreatorAddress
# or: genlayer deploy --contract contracts/SkyVerdict.py --args 0xYourCreatorAddress --network studionet
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # then set VITE_SKYVERDICT_ADDRESS to your deployed address
npm run dev
```

Required env vars (`.env.local`):

| Var | Value |
|---|---|
| `VITE_SKYVERDICT_ADDRESS` | your deployed contract address |
| `VITE_GENLAYER_CHAIN` | `studionet` |
| `VITE_GENLAYER_RPC_URL` | `same-origin` (a sentinel resolved to the deployed domain at runtime — routes through `frontend/api/rpc.js` to avoid CORS; see gotcha #7) |

## Demo evidence

Real values, verified working end-to-end against a live deployment
during this project's own testing — safe to paste directly.

**Buy coverage (plain form or trip):**
```
airline_code: AA
flight_number: 100
departure_airport: JFK
threshold_minutes: 60
payout_multiplier_bps: 20000
premium: 1000
```
(use near-future Unix UTC timestamps for departure/arrival — the
contract rejects already-departed flights)

**Buy via natural language:**
```
Cover DL202 from JFK, delayed more than 90 minutes, up to 3x premium.
```

**Evaluate a claim** — these two sources are on the default allowlist
and confirmed to return real, usable data for flight AA100:
```
https://www.flightaware.com/live/flight/AAL100
https://www.flightstats.com/v2/flight-tracker/AA/100
```
(a single source, or an unverified guessed URL pattern, will often
correctly resolve as `NO_QUORUM` — that's the fail-safe working, not a
bug; `flightradar24.com`'s clean-slug URL pattern in particular has
repeatedly failed to resolve real content in testing)

**Classify a resolved claim's cause** (after `evaluate_claim` has
already run):
```
classify_delay_cause(policy_id, "https://www.flightaware.com/live/flight/AAL100")
```

## Fee model

- 5% protocol fee, up to 20% creator fee (`CREATOR_FEE_BPS`), taken from
  every premium at intake.
- Owner withdraws protocol fees via `admin_withdraw_protocol_fees`;
  creator withdraws their share via `creator_withdraw_fees`. Both are
  accounted separately from `pool_balance`, so fee withdrawal never
  touches funds backing outstanding policies.

## Security considerations & trust model

See [`docs/architecture.md` §6](docs/architecture.md#6-security-model--trust-assumptions)
for the full write-up. Summary: no trusted fetcher, source allowlist,
explicit prompt-injection fencing (applied to both scraped web content
and free-text user input in `create_policy_from_text`), structured
output + confidence-floor + multi-source majority aggregation, fail-closed
timing windows, and single-use appeals. Consensus comparisons
deliberately exclude free-text model output (explanations/reasons) from
equality checks — requiring exact agreement on prose caused real
consensus failures during testing; see gotcha #17.

## Known limitations

Stated plainly:

- **Not yet security-audited.** Do not point real-value funds at this
  contract before an independent audit.
- **Payout is capped by the shared premium pool**, not an independent
  underwriting capital base — see `docs/reliability.md`.
- **Evidence sources are scraped tracker pages**, not signed
  airline/GDS APIs. Many trackers are JavaScript-rendered and return no
  usable content to `gl.nondet.web.render`; the domain allowlist and
  demo evidence above reflect what's actually been confirmed to work.
- **Real LLM extraction quality can't be verified offline.** Every
  nondet contract method has an offline mock test suite
  (`tests/direct/smoke_tests.py`, 26 checks) that verifies the
  surrounding contract logic (validation, fee math, fail-closed
  behavior) — it cannot test real model output quality or real GenVM
  consensus timing, which only live Studio testing can confirm.
- **No off-chain keeper bot yet** — `evaluate_claim` must currently be
  triggered manually after the settlement buffer elapses.
- **Agent-native purchasing is a discoverability layer today, not a
  delegation system.** Any funded wallet — human or agent-controlled —
  can already call the contract directly; a bounded, revocable
  ERC-7710-style delegation (a human capping what an agent may spend on
  their behalf) is designed but not built. See
  `docs/agent-integration.md`.
- **This is a Studio-stage deployment**, not Testnet Bradbury or
  mainnet, and redeploys during active development, meaning the
  contract address changes — always confirm the current one in this
  README's Contract Details section before pointing anything at it.

## Future roadmap

- **Signed data sources.** Land at least one signed airline/GDS
  delay-status API to reduce reliance on scraped HTML (`docs/reliability.md`).
- **Visual verification.** Screenshot tracker pages (`gl.nondet.web.render`)
  and pass images to a vision model as a second confirmation channel
  alongside text extraction.
- **Keeper bot + monitoring.** Auto-call `evaluate_claim` once the
  settlement buffer elapses for every `ACTIVE` policy, plus a
  circuit-breaker/monitoring service (`docs/reliability.md`).
- **Underwriting capital tranche**, so payouts are no longer capped by
  same-pool premium float alone.
- **Bounded agent delegation.** A real ERC-7710-based flow — a human
  grants an agent a capped, revocable spending permission through their
  own wallet UI, matching Internet Court's own published safety
  guardrails (never a raw private key, never unattended signing) —
  see `docs/agent-integration.md` for the full design constraints.
- **White-label SDK / B2B API**, so other travel apps or OTAs can embed
  SkyVerdict coverage at checkout (`docs/distribution.md`).
- **Independent security audit** before any real-value usage.
- **Backtesting.** Validate `_derive_verdict`'s parameters (quorum
  size, confidence floor, delay tolerance) against historical BTS/DOT
  on-time performance data.

## Project structure

```
contracts/SkyVerdict.py      # the only on-chain contract
tests/direct/                 # fast, offline, mocked unit tests (no Studio needed)
tests/integration/            # gltest-based tests against GenLayer Studio
frontend/                     # Vite + React + Tailwind app — see frontend/README.md
skills/skyverdict-agent/      # agent-discoverable capability manifest
deploy/deploy.py              # scripted deployment entrypoint
gltest.config.yaml            # network + test config for the GenLayer CLI
```

## Further reading

- **PRD**: [`docs/PRD.md`](docs/PRD.md)
- **TRD**: [`docs/TRD.md`](docs/TRD.md)
- **SDLC / current project status**: [`docs/SDLC.md`](docs/SDLC.md)
- **Architecture**: [`docs/architecture.md`](docs/architecture.md)
- **Reliability roadmap (50% → 99%)**: [`docs/reliability.md`](docs/reliability.md)
- **Distribution / go-to-market**: [`docs/distribution.md`](docs/distribution.md)
- **Agent integration & Internet Court scope**: [`docs/agent-integration.md`](docs/agent-integration.md)
- **Every GenVM/SDK surprise hit while shipping this** (18 documented
  gotchas — read this before touching the contract, seriously):
  [`docs/genvm-gotchas.md`](docs/genvm-gotchas.md)
