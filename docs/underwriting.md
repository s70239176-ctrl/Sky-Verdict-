# Underwriting, risk pricing and keepers

> Part of release **0.2.0** (developed as the first of two milestone stages).


v1 sold policies against a pool made only of other customers' premiums. A
payout larger than the pool was simply shorted (`PAID_PARTIAL`). v2 replaces
that with real, collateralized insurance.

## 1. Underwriter pool

| Call | What it does |
|---|---|
| `deposit_liquidity()` *(payable)* | Mints pool shares at book value (`pool_balance / total_shares`). |
| `request_withdrawal(shares)` | Queues an exit. Unlocks after `WITHDRAW_COOLDOWN_SECONDS` (24h). |
| `execute_withdrawal()` | Burns the shares, pays their value **at the current share price**. Reverts if the value exceeds free capital. |
| `cancel_withdrawal()` | Drops the queued exit. |
| `get_underwriter(addr)` / `get_pool()` | Shares, value, pending exit; capital, reserved, free, utilization, share price. |

The pool is a mutual: every net premium raises the share price, every payout
lowers it. There is no admin custody of LP funds — `execute_withdrawal` is the
only path out and only the share holder can call it.

**Why a cooldown:** claims become evaluable 3h after arrival. If LPs could exit
instantly, anyone watching a tracker could pull capital out *just before* a
known-delayed flight's claim settled and leave the loss to everyone else. 24h
> 3h means a queued exit always executes after the claim it tried to dodge.

## 2. Collateral

Every policy reserves `max(entitled payout, premium refund)` of pool capital
(`Policy.reserved_wei`, summed in `reserved_exposure`). With
`collateral_required` on (the default), `create_policy` / `create_trip` /
`create_policy_from_text` revert unless `pool_balance + net premium >=
reserved_exposure + new liability`. Consequences:

- A holder can no longer be shorted: `PAID_PARTIAL` is unreachable for new
  policies (it stays in the contract for the v1 path / `collateral_required=false`).
- Reserved capital cannot be withdrawn, so exits never strand a claim.
- The reserve is released exactly once, on settlement or refund.

## 3. Risk pricing

`risk_bps = base(airline) × threshold_curve × airport_factor + cancellation`,
capped at 95%. The contract refuses a payout multiplier above
`(10000 − LP_MARGIN_BPS) / risk` — i.e. expected payout may not exceed 85% of
the net premium. This closes a real hole in v1, where nothing but pool size
stopped someone buying a 1000× multiplier. `get_quote` exposes the same
numbers (risk, max multiplier, recommended premium, whether capacity exists),
and the Buy page shows them live before the wallet prompt.

**Honesty note:** the defaults (20% base at a 60-minute threshold, a threshold
curve of 0.25×–1.4×) are conservative *priors*, not fitted statistics. The
owner can tune per airline (`admin_set_airline_risk`) and airport
(`admin_set_airport_risk`). Backtesting them against BTS on-time data is
on the roadmap and is the first thing to do before real value is involved.

## 4. Keeper incentive

`evaluate_claim` was always permissionless but nobody was paid to call it.
Now, when a caller other than the holder settles a claim with a *resolved*
verdict (`PAYOUT` / `NO_PAYOUT`), the contract pays them
`KEEPER_BOUNTY_BPS` (3%) of the policy's net premium **out of accrued protocol
fees** — never out of LP capital — capped by what the fee fund holds.
`NO_QUORUM` pays nothing, so spamming unresolvable claims earns nothing.

`get_keeper_queue(limit)` returns the policy ids settleable right now (past the
buffer, inside the claim window, still `ACTIVE`) so a bot needs no indexer.
[`keeper/`](../keeper) is a reference bot: it reads the queue, builds two
independent https tracker URLs per policy (`sources.js`, unit-tested), calls
`evaluate_claim`, and logs the outcome and bounty. `--dry-run` sends nothing.

## Trust & limits

- Pool shares are priced at book value including premiums on open policies;
  late depositors pay for already-collected premium, so entering is not
  dilutive, and the cooldown stops exit-timing games. A sudden concentrated
  loss still falls on whoever is in the pool — that is the product.
- Cancellation risk is a flat add-on, not modelled per airline.
- Not audited. Studio-stage only.

## Deploy checklist (v2)

1. `python deploy/deploy.py --network studionet --creator 0xYourCreatorAddress`
2. **Seed capital before opening to users** — with collateral on, no policy can be sold into an empty pool: call `deposit_liquidity()` with enough value (Underwrite page, or `genlayer write`).
3. Update `VITE_SKYVERDICT_ADDRESS` and the README contract table.
4. Regression on Studio, in order: `get_pool` → `deposit_liquidity` → `create_policy` (check `reserved_wei`) → `get_quote` → `evaluate_claim` from a *second* account (check `keeper_bounty_wei`) → `request_withdrawal` / `execute_withdrawal`.
5. Run the keeper: `cd keeper && npm i && SKYVERDICT_ADDRESS=0x… npm run dry-run`.
