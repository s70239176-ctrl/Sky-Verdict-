# SkyVerdict — Product Requirements Document

## Project name and one-line pitch
**SkyVerdict** — parametric flight-delay and cancellation insurance that
settles itself: no claims desk, no trusted oracle, no manual adjudication.

## Problem statement
Flight-delay insurance today is either (a) manual — travelers file a claim,
attach evidence, and wait days/weeks for a human adjudicator — or (b)
oracle-dependent — a single "trusted" data feed decides payout, which is a
centralization and manipulation risk the insurer and the customer both have
to trust blindly. Both models are slow, opaque, or single-point-of-failure.

## Target users
- Individual air travelers who want cheap, instant-settling delay coverage.
- Online travel agencies (OTAs) who want to white-label delay insurance at
  checkout without building adjudication infrastructure themselves.
- Corporate travel programs wanting default coverage on booked itineraries.

## Why GenLayer is needed
The payout decision — *was this specific flight delayed past the covered
threshold, or cancelled?* — is not cleanly deterministic. It requires
reading live, unstructured web sources (flight trackers), handling
disagreement/staleness between sources, and reaching a fact-finding
judgement that a normal smart contract's deterministic EVM logic cannot
perform without a trusted off-chain oracle. GenLayer's Optimistic-Democracy
validator consensus lets multiple independent validators each fetch and
extract the same facts with an LLM and agree on a verdict on-chain, with
no single trusted party. This is exactly the "web-aware decision" /
"insurance trigger" use case the GenLayer feasibility model describes.

## Core GenLayer decision/verdict
Given a policy's flight details and a set of source URLs, determine:
`decision` (`PAYOUT` / `NO_PAYOUT` / `NO_QUORUM`), `cancelled` (bool),
`delay_minutes` (int), and aggregate `confidence` — derived from
independently-fetched, independently-extracted per-source data that
validators must reach consensus on before any payout is sent.

## User flows
1. **Buy coverage** — traveler submits flight details + premium (as
   transaction value) via `create_policy`; policy becomes `ACTIVE`.
2. **Trigger evaluation** — after the flight's scheduled arrival + a
   settlement buffer, anyone (holder, keeper bot, or UI) calls
   `evaluate_claim` with current tracker source URLs; GenVM validators
   independently fetch, extract, and reach consensus on a verdict;
   payout (if any) is sent in the same transaction.
3. **Appeal** — if the first evaluation reaches `NO_QUORUM` (sources
   disagreed or were unavailable), the holder can appeal once with fresh
   source URLs.
4. **Refund** — if a policy is still unresolved after the claim-expiry
   window, the holder can reclaim their premium.

## MVP features
- `create_policy`, `evaluate_claim`, `appeal`, `claim_refund`
- Multi-source, multi-validator verdict aggregation with a confidence
  floor and majority-vote cancellation logic
- Fee split (protocol fee + creator fee) taken at premium intake
- Admin controls: pause, source-domain allowlist, fee withdrawal
- Read methods for a frontend to display policy/pool/claim state

## Out-of-scope features (for MVP)
- Signed/authenticated airline or GDS API integration (Phase 2 —
  see `docs/reliability.md`)
- Underwriting capital / reinsurance tranche beyond the shared premium
  pool (Phase 2/3)
- Human-in-the-loop arbitration for disputed edge cases (Phase 3)
- KYC, multi-currency premiums, or non-flight parametric products

## Evidence/submission types
Public flight-tracker URLs (e.g. FlightAware, Flightradar24, FlightStats),
restricted to a source-domain allowlist maintained by the contract owner.
No user-submitted screenshots or documents — evidence is fetched live by
validators themselves, not supplied as a trust input by the claimant, which
removes the "fake evidence" risk class the guide flags for evidence-review
apps.

## Verdict/result structure
```json
{
  "decision": "PAYOUT | NO_PAYOUT | NO_QUORUM",
  "cancelled": false,
  "delay_minutes": 205,
  "sources_total": 2,
  "sources_used": 2
}
```
Stored on the policy as `last_verdict_json` for audit history; also
returned directly from `evaluate_claim`/`appeal`.

## Risks and limitations
- **Web source availability/staleness** — mitigated by `MIN_SOURCES_REQUIRED`,
  a confidence floor, and fail-closed (`NO_QUORUM`) rather than guessing.
- **LLM extraction variance across validators** — mitigated by requiring
  strict structured JSON output and a ±15-minute delay-bucket tolerance
  (structural, not byte-exact, equivalence) between leader and validator.
- **Prompt injection from fetched page content** — mitigated by explicit
  fencing (`UNTRUSTED_WEB_DATA` markers) and instructions to ignore
  embedded commands.
- **Payout currently capped by shared pool liquidity**, not an independent
  underwriting capital base — flagged honestly as a pre-mainnet gap (see
  `docs/reliability.md`).
- **Testnet-stage maturity** — not yet security-audited; see
  "Known limitations" in the README before any real-value use.

## Demo and submission requirements
One end-to-end flow: buy a policy → trigger evaluation against real
tracker URLs → observe validator consensus reach a verdict → observe
payout (or `NO_QUORUM`) reflected in `get_policy`/`get_pool`. Contract
address, network, and explorer link documented in the README per the
submission checklist.
