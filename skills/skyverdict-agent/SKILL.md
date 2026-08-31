---
name: skyverdict-flight-insurance
description: Buy or manage parametric flight-delay insurance on SkyVerdict, a GenLayer Intelligent Contract. Use this whenever a user (or the agent acting for them) wants flight-delay coverage, wants to check a policy's status, wants to trigger claim evaluation, or wants to understand why a verdict was reached. SkyVerdict runs on GenLayer — the same Optimistic Democracy consensus and validator-adjudication engine that also powers Internet Court's dispute-resolution layer — so no separate dispute mechanism is needed: SkyVerdict's own validators adjudicate claims directly.
---

# SkyVerdict — agent-native flight-delay insurance

SkyVerdict is a public GenLayer Intelligent Contract. Any funded wallet —
human-controlled or agent-controlled — can call it directly today. There
is no special onboarding, API key, or custom integration required beyond
having a GenLayer-compatible wallet with a GEN balance.

**Read this whole file before making any write call.** Every method
below is real and taken directly from the deployed contract
(`contracts/SkyVerdict.py`) — nothing here is aspirational.

## Contract address

Set via `SKYVERDICT_CONTRACT_ADDRESS` (or ask the user for it — it
changes on every redeploy, see `docs/genvm-gotchas.md` in this repo for
why). Do not guess or reuse an address from a prior conversation; a
stale address will fail every call.

## Buying coverage — prefer natural language

The easiest entrypoint for an agent is `create_policy_from_text`:

```
create_policy_from_text(
    description: str,             # e.g. "Cover DL202 from JFK, delayed more than 90 minutes, up to 3x premium."
    scheduled_departure_utc: int,  # Unix UTC timestamp — must be in the future
    scheduled_arrival_utc: int,    # Unix UTC timestamp — must be after departure
) -> u256                          # returns the new policy_id
```

Pay the premium as the transaction's native value (GEN). The
description MUST state or clearly imply: airline code, flight number,
departure airport, and a delay threshold in minutes. A payout
multiplier defaults to 2x if not stated; state an explicit cap (e.g.
"max 500") if the multiplier's own ceiling isn't the desired coverage
limit.

**This call can fail closed on purpose.** If GenLayer's validators
can't reach exact agreement on the extracted terms — or the description
is genuinely ambiguous — the transaction reverts, nothing is charged,
and no policy is created. Retry with a more specific description rather
than assuming something is broken.

Alternative structured entrypoints exist if you already have exact
values and don't need natural-language parsing:
- `create_policy(airline_code, flight_number, departure_airport, scheduled_departure_utc, scheduled_arrival_utc, threshold_minutes, payout_multiplier_bps, max_coverage) -> u256`
- `create_trip(airline_codes: list[str], flight_numbers: list[str], departure_airports: list[str], scheduled_departures_utc: list[int], scheduled_arrivals_utc: list[int], threshold_minutes_list: list[int], payout_multiplier_bps_list: list[int], max_coverage_list: list[int]) -> u256` — covers 2+ flights under one purchase, sharing one trip_id; premium splits evenly across legs automatically.

## Checking a policy

```
get_policy(policy_id: int) -> {
  policy_id, holder, airline_code, flight_number, departure_airport,
  scheduled_departure_utc, scheduled_arrival_utc, threshold_minutes,
  premium, payout_multiplier_bps, max_coverage,
  status,             # "ACTIVE" | "PAID" | "EXPIRED_NO_PAYOUT" | "REFUNDED" | "INDETERMINATE"
  last_verdict_json,  # populated once evaluate_claim has run
  appeal_used, trip_id, delay_cause_json,
}
```

`get_total_policies() -> int` and `get_pool() -> {pool_balance,
protocol_fees_accrued, creator_fees_accrued}` give network-wide state.

## Triggering claim evaluation

Only callable once the flight has actually landed — the contract
enforces a real settlement buffer after `scheduled_arrival_utc` (see
`docs/genvm-gotchas.md`) and will reject an early call, it isn't a rate
limit to work around:

```
evaluate_claim(policy_id: int, source_urls: list[str]) -> str  # JSON verdict
```

Requires **at least 2 distinct sources** from the contract's domain
allowlist (check with `is_domain_allowed(domain: str) -> bool` first).
A single valid source is not enough to reach quorum and will resolve as
`NO_QUORUM` — that's the contract correctly refusing to guess, not a
bug to route around. If the first attempt lands on `INDETERMINATE`
(quorum not met), one retry is available:

```
appeal(policy_id: int, extra_source_urls: list[str]) -> str
```

## Understanding *why* a verdict was reached

`last_verdict_json` gives the aggregate outcome (`decision`,
`delay_minutes`, `cancelled`, `sources_used`/`sources_total`) — the
real, deterministic math behind it (median delay, majority-vote
cancellation, quorum threshold) is documented in
`docs/genvm-gotchas.md` and rendered for humans in the frontend's
Reasoning Explorer.

Once a policy is resolved (`PAID` or `EXPIRED_NO_PAYOUT`), an
*informational-only* fault classification is available and never
affects payout:

```
classify_delay_cause(policy_id: int, source_url: str) -> str
# -> {"cause": "airline_fault" | "weather_or_atc" | "unclear", "explanation": "...", "source_url": "..."}
```

## Refunds

```
claim_refund(policy_id: int) -> None
```

Only succeeds once the claim-expiry window has passed with no resolved
verdict — the contract enforces this, not the caller.

## What this skill deliberately does NOT claim

This manifest documents SkyVerdict's own, already-working write path —
it is not an ERC-7710 delegation integration, not an x402 payment
handler, and not a MetaMask Smart Accounts Kit connector. Those are
real, separate pieces of the broader Internet Court stack
(github.com/internet-court/internet-court-skill) that would let a
*human* grant a scoped, limited spending permission to an agent before
the agent ever touches this contract. Building that safely requires
testing against live infrastructure that, as of this writing, is only
weeks old — deliberately left out rather than shipped unverified. An
agent using this skill today is assumed to already hold, or already be
authorized to spend from, the wallet it transacts with.
