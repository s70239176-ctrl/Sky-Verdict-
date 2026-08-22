# SkyVerdict — Distribution & Real-User Strategy

Building a reliable contract is necessary but not sufficient — parametric
insurance is a distribution game as much as a product one. This doc lays
out how SkyVerdict gets to real, paying usage.

## Target customers, in acquisition order

1. **Individual crypto-native travelers** (fastest to reach, smallest
   tickets) — via a simple web app and Telegram/Discord bot. Low CAC
   channel to prove the contract works with real money before pitching
   larger partners.
2. **Travel Discord/Telegram communities & crypto travel influencers** —
   direct integration/affiliate: "insure your next flight in 30 seconds
   with GEN or a card on-ramp."
3. **OTAs (online travel agencies) — white-label API** — SkyVerdict as an
   add-on at checkout ("Add flight delay protection — $X"), OTA keeps a
   distribution margin, SkyVerdict keeps the underwriting/protocol fee.
   This is the highest-leverage channel: one OTA integration can produce
   thousands of policies/month.
2. **Corporate travel management platforms** — bulk policy issuance via API
   for a company's travel bookings; pitch is predictable expense-line
   delay compensation instead of ad-hoc reimbursement policies.
5. **Credit-card issuers / neobanks** — flight-delay benefits are already a
   card perk category (many premium cards manually reimburse delays);
   SkyVerdict can be the automated settlement engine behind that benefit,
   white-labeled, with the card issuer as the "policyholder of record" on
   behalf of cardholders.
6. **Airlines directly** — longest sales cycle, biggest prize (an airline
   could offer SkyVerdict-backed delay protection at booking as ancillary
   revenue) — pursued after the above channels prove volume and payout
   reliability.

## Go-to-market motions

- **Embeddable widget** (`frontend/` ships a policy-purchase widget
  component) that OTAs / booking sites can drop in with a few lines of
  JS, quoting a premium from flight number + date via a pricing endpoint.
- **GenLayer ecosystem channels**: GenLayer portal / builder showcase,
  apply to the GenLayer accelerator / Denarii-style grant program (see
  "Why this qualifies" below) for both funding and default distribution
  to the GenLayer user base.
- **Flight-tracker cross-promotion**: reach out to independent flight
  tracker sites/apps (not the majors, which are potential *source*
  partners, not necessarily channel partners) to offer "insure this
  flight" as an in-app action.
- **Content/SEO**: "how much do airlines owe you for a delay" style
  content targeting the existing search demand around EU261/DOT delay
  compensation rules — SkyVerdict is a faster, no-paperwork alternative.
- **Referral loop**: a claimant who receives an automatic payout is the
  single best acquisition asset (screenshot of an instant on-chain payout
  is inherently shareable) — build a lightweight referral/share flow into
  the claim-paid UI state.

## Pricing

- `premium = base_risk_premium + protocol_fee`
- Base risk premium is priced off route/airline historical delay-rate
  (public BTS/DOT/EU on-time-performance data) — a pricing service (not
  part of the on-chain contract) quotes this off-chain and the user signs
  a `create_policy` transaction with that premium as `message.value`.
- Protocol fee: 5% (`PROTOCOL_FEE_BPS`), Creator fee: up to 20%
  (`CREATOR_FEE_BPS`) — both taken at intake, per GenLayer's builder
  fee-share program (see "Why this qualifies").
- OTA/white-label partners get a negotiated revenue share out of the
  protocol fee, not out of the underwriting premium — keeps the pool's
  loss ratio clean and auditable.

## Success metrics

| Metric | Why it matters |
|---|---|
| Policies sold / week | top-of-funnel, channel-attributable |
| Gross premium volume | revenue proxy, underwriting capital sizing |
| Claims settled automatically (no appeal, no `NO_QUORUM`) | product reliability in the wild |
| Payout turnaround time | core UX promise vs. traditional insurance (weeks) |
| Retention (repeat policyholders) | trust signal, LTV driver |
| OTA/partner integrations live | distribution leverage, not just direct traffic |

## Why this qualifies for GenLayer builder support / accelerator / fee share

- Uses GenLayer's differentiated primitives non-trivially: native web
  fetch replacing an oracle, LLM-based structured extraction under
  Equivalence Principle, and a hand-rolled `run_nondet` consensus function
  — not a toy wrapper around `strict_eq`.
- Real-world financial utility with an existing, well-understood market
  (parametric flight insurance is a proven model — see Etherisc/Fizzy,
  AXA's earlier flight-delay product) that GenLayer uniquely de-oracles.
- Clear, staged path from testnet demo to real premium volume through
  named, reachable channels (OTAs, card issuers) rather than "airdrop
  farming" usage.
- Creator fee share (up to 20%, implemented in `SkyVerdict.py` via
  `CREATOR_FEE_BPS` / `creator_withdraw_fees`) means protocol usage
  directly funds continued development, aligning with GenLayer's
  builder-incentive design.
