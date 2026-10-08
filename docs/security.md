# Security model — release 0.2.0

Scope: `contracts/SkyVerdict.py` as deployed at the production address in the
README. For the original (0.1) web-evidence model see
[`architecture.md` §6](architecture.md#6-security-model--trust-assumptions);
this document covers what 0.2.0 added or changed. **Not independently
audited — do not point real-value funds at this contract.**

## Assets and actors

| Asset | Who holds a claim on it |
|---|---|
| Pool capital (`pool_balance`) | Underwriters, pro rata by shares; reserved against open policies |
| Premium net of fees | The pool (underwriters); holders get payouts from it |
| Protocol / creator / affiliate fees | Owner / creator / referrers |
| Challenge bonds | Returned, forfeited to the pool, or refunded + rewarded (see below) |

Actors: policyholders, underwriters (LPs), challengers, keepers, referrers, the
owner (deployer), and the validators (GenLayer consensus).

## Threats and mitigations

| Threat | Mitigation | Where |
|---|---|---|
| **A single bad evaluation pays or denies wrongly** | Verdicts are *provisional* for a fixed window; one bonded challenge re-reads with an extra independent source and a stricter quorum (one more valid read). | `evaluate_claim`, `challenge_claim`, `finalize_claim` |
| **Frivolous challenges / griefing** | Bond = 10% of the policy's reserved liability; one challenge per verdict; upheld → bond forfeited to underwriters. An *inconclusive* challenge is never punished (bond returned) so honest challengers aren't taxed for flaky sources. | `challenge_claim` |
| **Challenge used to delay payout indefinitely** | The deadline is set once at evaluation and never extended; a challenge settles the policy in the same transaction (or returns the bond and leaves the original deadline). | `challenge_claim` |
| **Reward farming** | Reward is paid only when the verdict is *overturned*, equals the bond, and is capped by the protocol-fee fund — never LP capital. | `challenge_claim` |
| **Underfunded payouts** | Collateral: a policy is sold only if `pool + net premium >= reserved + worst-case liability`; reserve is released exactly once. | `_open_policy`, `_settle` |
| **LP front-running a known loss** | Exits are two-step with a 24h cooldown (> the 3h buffer), priced at the exit-time share price, and cannot touch reserved capital. | `request_withdrawal`, `execute_withdrawal` |
| **Absurd payout multipliers** | Enforced maximum from the risk model (expected loss ≤ 85% of net premium). | `_max_multiplier_bps` |
| **Poisoning the self-calibrating risk model** | Observations only from *finalized* verdicts (a challenged-and-overturned verdict records the final outcome); needs ≥ 5 settled policies; credibility `n/(n+20)`; clamped to 0.5×–3× of the prior; every policy costs 25% in fees. | `_calibrated_base`, `_record_observation` |
| **Spoofed or duplicated evidence sources** | HTTPS only; parsed-hostname allowlist (not substring); sources must come from distinct providers; challenger's extra source must be a *new* provider. | `_canonical_host`, `_require_domain_allowed` |
| **Prompt injection via web pages / free text** | Untrusted text is fenced and the model is instructed to treat it as data; structured JSON output; confidence floor; median/majority aggregation; financial terms use exact-match consensus. | `_fence`, `_derive_verdict` |
| **Clock tricks / missing clock** | Time comes from the transaction (`gl.message_raw["datetime"]`); money-timing rules **fail closed** if no clock is available. (A live run showed the previous `gl.message.timestamp` never existed on GenVM.) | `_now_opt`, `_now` |
| **Keeper bounty abuse** | Paid only on *resolved* verdicts, from protocol fees (not LP capital), capped by the fee fund; the holder never earns a share of their own claim; a reversed evaluator earns nothing. | `_bounty_transfers` |
| **Affiliate abuse** | The share is carved out of the creator fee only and capped by it; self-referral pays nothing. | `_open_policy` |
| **Reserve leaks / double settlement** | One money-moving function (`_settle`) serves every path; status checks prevent re-settlement; reserve released once. | `_settle` |

## What the owner can and cannot do

The deployer is the **owner**. Disclosed plainly, because some of this weakens
guarantees above:

**Can:**
- `admin_set_paused` — blocks new policies, deposits, evaluation, challenges and finalization. It does **not** block LP exits, refunds or affiliate withdrawals. While paused, provisional verdicts cannot be finalized.
- `admin_add_domain` / `admin_remove_domain` — change which evidence providers are accepted.
- `admin_set_airline_risk` / `admin_set_airport_risk` — tune the priors (bounded ranges).
- `admin_withdraw_protocol_fees` — protocol-fee share only.
- **`admin_set_collateral_required(false)` and `admin_set_pricing_enforced(false)` — switch off collateralization and the multiplier cap.** This is a real trust assumption: with collateral off, the 0.1 behavior returns (shortfalls recorded as `PAID_PARTIAL`, never silent). Recommended hardening before real value: remove these setters or put them behind a timelock / make them one-way.

**Cannot:**
- Touch LP shares, pool capital, reserved liability or open policies.
- Change the challenge window, settlement buffer or sandbox flag (fixed in the constructor).
- Redirect a payout, forge a verdict, or settle a policy.

`sandbox_mode` lets a deployment accept already-departed flights. It is
reported by `get_pool` and shown as a banner in the UI; the **production
deployment has it off** and it cannot be changed after deploy.

## Known limitations and residual risks

- **Not audited.** Studio-stage only.
- **Evidence is scraped tracker pages**, interpreted by LLMs. Pages can fail to render (a third source often does not), so the stricter challenge quorum is frequently unreachable and challenges end *inconclusive*. That fails safe (the provisional verdict stands) but limits how often a challenge can overturn anything. An overturned challenge has only been exercised offline.
- **A reverted transaction keeps its attached value** (GenLayer behavior). A `challenge_claim` that reverts (window just closed, low bond) leaves its bond in the contract. The UI disables the button until every checkable condition passes; `get_challenge_info` shows the required bond.
- **Studio consensus can be cancelled** (`max_recovery_cycles_exceeded`) with no state change; callers must retry. Observed once in live testing.
- **Payouts wait for the challenge window** (24h in production) — the price of a contestable verdict.
- **Calibration is airline-level**; airport factors remain owner-tuned. Cancellation risk is a flat add-on.
- **Share pricing includes premiums on open policies**, so a concentrated loss falls on whoever is in the pool at the time. That is the product, not a bug, but LPs should know.
- **LP `execute_withdrawal`, an overturned challenge and a settlement on the production address** have not been exercised live yet (24h cooldown / needs a disagreeing web / first claim not yet due). See [`live-run-0.2.0.txt`](live-run-0.2.0.txt) for what has.

## Bugs found by live testing (fixed)

Both were invisible to the offline suite because the test mock was more
generous than the real SDK. Full write-ups: [`genvm-gotchas.md`](genvm-gotchas.md) #21 and #22.

- `gl.message.timestamp` does not exist → time rules never applied. Now `message_raw["datetime"]`, fail closed.
- `gl.ContractAt` does not exist → no transfer (payout, refund, withdrawal, bounty, fee) could execute on a real chain. Now `gl.get_contract_at`; the mock only exposes the real name.
