# SkyVerdict

Parametric flight-delay & cancellation insurance, settled trustlessly on
[GenLayer](https://genlayer.com) — no oracle, no claims desk, no human
adjudicator.

**Version 0.2.0** · [changelog](CHANGELOG.md) · production `0xC21B201F6a4200788f5FE35620daE5f2072A3DF4`

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

## Version 0.2.0 — what's new

Release **0.2.0** is everything added since the accepted MVP (0.1.0). It
turns a premium-float prototype into a collateralized, contestable,
self-pricing insurance protocol. Full detail in [`CHANGELOG.md`](CHANGELOG.md).

| Capability | What changed |
|---|---|
| **Underwriter capital pool** | Anyone can `deposit_liquidity()` and earn the pool's premiums / absorb its payouts through shares; exits use a 24h-cooldown two-step withdrawal. |
| **Collateralized policies** | A policy is only sold if free capital covers its worst case, so a holder can never be shorted (the 0.1 `PAID_PARTIAL` gap). |
| **On-chain risk pricing** | `get_quote` + an enforced maximum payout multiplier from an owner-tunable risk model; live quote in the Buy flow. |
| **Self-calibrating risk** | Settled verdicts feed back into each airline's risk estimate (credibility-weighted, clamped 0.5x-3x); expected-vs-realized loss is public. |
| **Challenge court** | Verdicts are *provisional* for a challenge window. Anyone can bond a dispute with an extra independent source; validators re-read with a stricter quorum. Overturned: bond back + reward. Upheld: bond to underwriters. Inconclusive: bond returned. |
| **Keeper bounty + bot** | Settling a claim pays a bounty from protocol fees (split evaluator / finalizer); `get_keeper_queue` / `get_finalize_queue` need no indexer; [`keeper/`](keeper) automates both. |
| **Affiliates + widget** | `create_policy_referred` pays a referrer 5% of the premium from the creator fee; embeddable `widget.js`; Partners console with on-chain earnings. |
| **Underwrite + Partners UI** | Pool health, positions, exits, protocol health, challenge panel, referral/widget builder. |
| **Two real bugs fixed by live testing** | `gl.ContractAt` doesn't exist (no payout had ever worked on a real chain; now verified live) and `gl.message.timestamp` doesn't exist (time rules never applied). Gotchas #21-#24. |
| **Verified deploy path + sandbox mode** | `keeper/deploy.mjs`; sandbox deployments (short window, past flights insurable) show a full lifecycle in minutes. |

Design docs: [`docs/underwriting.md`](docs/underwriting.md) (pool, collateral,
pricing, keepers) and [`docs/court-calibration-affiliates.md`](docs/court-calibration-affiliates.md)
(court, calibration, affiliates, what was and wasn't verified live).
Offline suite: 127 pytest tests; keeper: 6 `node --test` tests.

## Live demo

| | |
|---|---|
| Frontend (production deployment) | [sky-verdicts.vercel.app](https://sky-verdicts.vercel.app/) |
| Try it without a wallet | Click **Connect -> Try demo mode** on the live site — generates a throwaway session key instantly, no installs needed |
| Sandbox demo (full lifecycle in ~12 min) | Run the frontend against the sandbox contract below (`VITE_SKYVERDICT_ADDRESS=0x9B646F38cf2A51B4bde67C01F52409F22e78290E`, see `frontend/.env.example`); it shows a SANDBOX banner. Or drive it from the CLI: `cd keeper && SKYVERDICT_ADDRESS=0x9B646F38cf2A51B4bde67C01F52409F22e78290E node live-v3.mjs buy` then `evaluate`, `finalize`. |

## Contract details (release 0.2.0)

| | Production | Sandbox demo |
|---|---|---|
| Network | GenLayer Studio (`studionet`) | GenLayer Studio (`studionet`) |
| Contract address | `0xC21B201F6a4200788f5FE35620daE5f2072A3DF4` | `0x9B646F38cf2A51B4bde67C01F52409F22e78290E` |
| Challenge window | 24 h (`86400`) | 10 min (`600`) |
| Settlement buffer after arrival | 3 h (`10800`) | none (`0`) |
| Past flights insurable | no | yes (`sandbox_mode`) |
| Use | real coverage terms | demonstrating buy -> evaluate -> challenge -> finalize -> payout quickly; shows a banner in the UI |
| Explorer | [explorer-studio.genlayer.com](https://explorer-studio.genlayer.com/) | same |

| | |
|---|---|
| RPC | `https://studio.genlayer.com/api` |
| Chain ID | Confirm current value in Studio's own network settings before deploying/connecting — GenLayer's docs show `61999` for Studio-class networks, but hosted Studio's exact backing config is operated independently of this repo and can change |
| Deprecated | `0x4A3cEB1d00F479b8F91A7CF478371D518F7f47E4` (0.2 pre-release: **cannot pay out**, uses the non-existent `gl.ContractAt`); `0x2FB45FC2CA611B6E992C589b458eF6f432aC3Afe` (0.1) |

Constructor (fixed at deploy, no admin setter):
`SkyVerdict(creator_address, challenge_window_seconds, settlement_buffer_seconds, sandbox_mode)`.
Deploy with `keeper/deploy.mjs`. **Sandbox deployments are for demos only.**

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

# 2. Against GenLayer Studio (integration) — gltest.config.yaml already
# points at hosted Studio by default, so no local `genlayer up` needed
# unless you'd rather test against a local instance (see the `localnet`
# entry in gltest.config.yaml)
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
and confirmed to return real, usable data for flight AA100. Both must
be `https://` specifically (`http://` is rejected, and so is submitting
the same provider twice, e.g. `flightaware.com` + `www.flightaware.com`
— see gotcha #19):
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
for the full write-up. Summary: no trusted fetcher, source allowlist
with real canonical-hostname parsing (not a substring match — see
gotcha #19), a genuine independence requirement (source URLs must
resolve to distinct providers, not just distinct strings), HTTPS
required specifically (not http-or-https), explicit prompt-injection
fencing (applied to both scraped web content and free-text user input
in `create_policy_from_text`), structured output + confidence-floor +
multi-source majority aggregation, fail-closed timing windows, and
single-use appeals. Consensus comparisons deliberately exclude
free-text model output (explanations/reasons) from equality checks —
requiring exact agreement on prose caused real consensus failures
during testing; see gotcha #17. Settlement accounting is honest by
construction: if the shared pool can't cover a claim's full entitled
payout, the policy is marked `PAID_PARTIAL`/`REFUNDED_PARTIAL` (never
a plain `PAID`/`REFUNDED` that would misrepresent a partial transfer),
and `payout_amount_wei` always records the real amount that moved —
see gotcha #19.

## Known limitations

Stated plainly:

- **Not yet security-audited.** Do not point real-value funds at this
  contract before an independent audit.
- **Payouts are backed by underwriter capital (v2).** With
  `collateral_required` on (default), policies are only sold against free
  capital, so shortfalls cannot occur for new policies. The honest
  `PAID_PARTIAL` accounting (gotcha #19) remains for the legacy mode. Risk
  parameters are conservative priors, not fitted — see `docs/underwriting.md`.
- **Evidence sources are scraped tracker pages**, not signed
  airline/GDS APIs. Many trackers are JavaScript-rendered and return no
  usable content to `gl.nondet.web.render`; the domain allowlist and
  demo evidence above reflect what's actually been confirmed to work.
- **Real LLM extraction quality can't be verified offline.** Every
  nondet contract method has an offline mock test suite
  (`tests/direct/smoke_tests.py`, 26 checks) that verifies the
  surrounding contract logic (validation, fee math, fail-closed
  behavior, accounting integrity) — it cannot test real model output
  quality or real GenVM consensus timing, which only live Studio
  testing can confirm.
- **Keeper bot is a reference implementation** (`keeper/`) — run it yourself
  or let anyone claim the on-chain bounty; there is no hosted keeper yet.
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
- **Hosted keeper + monitoring/circuit-breaker** (the bot and bounty exist; see `docs/reliability.md`).
- **Senior/junior underwriting tranches** and fitted, backtested risk parameters.
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
keeper/                       # settlement bot (node) + unit tests
tests/direct/                 # fast, offline, mocked unit tests (no Studio needed)
tests/integration/            # gltest-based tests against GenLayer Studio
frontend/                     # Vite + React + Tailwind app — see frontend/README.md
skills/skyverdict-agent/      # agent-discoverable capability manifest
deploy/deploy.py              # scripted deployment entrypoint
gltest.config.yaml            # network + test config for the GenLayer CLI
```

## Further reading

- **Security model (0.2.0)**: [`docs/security.md`](docs/security.md)
- **Live verification log (0.2.0, every tx hash)**: [`docs/live-run-0.2.0.txt`](docs/live-run-0.2.0.txt)
- **Underwriting, pricing & keepers**: [`docs/underwriting.md`](docs/underwriting.md)
- **PRD**: [`docs/PRD.md`](docs/PRD.md)
- **TRD**: [`docs/TRD.md`](docs/TRD.md)
- **SDLC / current project status**: [`docs/SDLC.md`](docs/SDLC.md)
- **Architecture**: [`docs/architecture.md`](docs/architecture.md)
- **Reliability roadmap (50% → 99%)**: [`docs/reliability.md`](docs/reliability.md)
- **Distribution / go-to-market**: [`docs/distribution.md`](docs/distribution.md)
- **Agent integration & Internet Court scope**: [`docs/agent-integration.md`](docs/agent-integration.md)
- **Every GenVM/SDK surprise hit while shipping this** (20 documented
  gotchas — read this before touching the contract, seriously):
  [`docs/genvm-gotchas.md`](docs/genvm-gotchas.md)
