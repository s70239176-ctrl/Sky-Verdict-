# Challenge court, self-calibrating risk, affiliates

> Part of release **0.2.0** (developed as the second of two milestone stages; earlier notes and tests call it "v3").


v2 made every policy fully collateralized. v3 makes the *outcome* contestable,
makes pricing learn from real outcomes, and gives the product a distribution
channel.

## 1. Challenge court (bonded verdict disputes)

A resolved verdict used to move money immediately, so one bad evaluation was
final. Now it is **provisional**:

```
ACTIVE ──evaluate_claim──▶ PROVISIONAL ──(window closes)──finalize_claim──▶ PAID / EXPIRED_NO_PAYOUT
                               │
                               └──challenge_claim (bond + extra source)──▶ re-read, stricter quorum
                                        overturned ▶ decision flips, challenger refunded + rewarded
                                        upheld     ▶ bond forfeited to underwriters, verdict stands
                                        inconclusive ▶ bond returned, provisional verdict stands
```

- **Window.** `challenge_window_seconds` is fixed at deploy (default 24h). `0`
  disables the court and restores v2's immediate settlement. There is no admin
  setter, so the owner cannot shorten the window after the fact.
- **Challenge.** Anyone can dispute during the window, once per verdict, by
  posting a bond of 10% of the policy's reserved liability
  (`get_challenge_info().bond_required_wei`) and naming at least one additional
  source from a provider not already used (same allowlist and independence
  rules as `evaluate_claim`).
- **Stricter than the first read.** The original sources plus the new one are
  re-read by validators and **one more valid read than the first time** is
  required (3 instead of 2). If that quorum isn't reached the challenge is
  *inconclusive* — never punished — and the provisional verdict stands.
- **Economics.** Overturned: the challenger gets the bond back plus an equal
  reward paid from protocol fees (capped by what the fee fund holds), and the
  original evaluator earns no bounty. Upheld: the bond goes into the pool, i.e.
  to underwriters. This makes frivolous challenges cost money while honest
  ones are paid.
- **One money path.** `evaluate_claim` (court off), `finalize_claim` and
  `challenge_claim` all settle through a single `_settle()` so payout math,
  reserve release, calibration and bounties cannot diverge between paths.
- **Keeper bounty** is now split: 2/3 to whoever evaluated, 1/3 to whoever
  finalized; the holder never earns a share of their own claim.

**Trade-off, stated plainly:** payouts now wait for the challenge window. That
is the price of a contestable verdict. The window is a deployment parameter.

**GenLayer caveat:** a transaction that reverts keeps its attached value in the
contract. `challenge_claim` therefore does all cheap validation first, and the
UI disables the button until every check it can run passes. Check
`get_challenge_info` before sending a bond.

## 2. Self-calibrating risk

v2's risk numbers were priors. v3 lets settled verdicts correct them.

Each settled policy adds one observation for its airline: whether it paid,
normalized by the threshold curve so a 240-minute policy and a 60-minute
policy are comparable. The effective base risk is a credibility-weighted
blend:

```
Z         = n / (n + 20)                       (more data → more weight)
effective = (1 − Z) · prior + Z · observed
clamped to [0.5 × prior, 3 × prior]            (and needs ≥ 5 settled policies)
```

`get_quote`, the enforced maximum multiplier and `get_calibration(airline)`
all use the effective value. `get_loss_stats()` exposes **expected vs realized
payouts** so anyone can check whether the pricing is honest.

Why it is hard to game: observations come only from *finalized* verdicts (a
challenged-and-overturned verdict records the final outcome, not the first
read), moving the estimate requires real policies (25% of every premium goes to
fees), credibility grows slowly, and the clamp bounds how far any sequence of
outcomes can move prices. Airport factors remain owner-tunable; calibration is
airline-level.

## 3. Distribution: referrals, widget, partner console

- `create_policy_referred(referrer, …)` — the referrer earns **5% of the
  premium**, carved out of the creator fee. It never touches underwriter capital
  or the protocol fee. Self-referral is accepted but pays nothing.
- `affiliate_withdraw(amount)`, `get_affiliate(address)` — earnings and lifetime
  totals are on-chain.
- **Widget** (`frontend/public/widget.js`): one `<div>` and one `<script>`;
  renders a "Protect this flight" button that deep-links to the buy flow with
  the flight pre-filled and the partner as referrer. No cookies, no tracking, no
  third-party requests.
- **Partners page** builds the link and widget snippet, shows earnings and
  withdraws.

## Sandbox deployments

`SkyVerdict(creator, challenge_window_seconds, settlement_buffer_seconds,
sandbox_mode)`. With `sandbox_mode` the contract accepts policies on flights that
have already departed, so a full lifecycle (buy → evaluate → challenge →
finalize → payout) can be shown in minutes against real, recently landed
flights. The UI shows a banner on sandbox deployments and `get_pool` reports
`sandbox_mode`. **Production deployments must use the defaults.**

Deploy: `keeper/deploy.mjs` (see its header). Verified live; the Python
`deploy/deploy.py` mirrors it.

## What was verified live (Studio)

On a sandbox deployment, with real validator consensus on a real flight (AA100):
policy bought through a referrer (affiliate credited 500 wei = 5% of 10,000);
`evaluate_claim` → provisional PAYOUT, no money moved; `challenge_claim` with a
third source → real re-read, quorum not reached (the third tracker would not
render), so inconclusive and the bond returned; `affiliate_withdraw` paid out;
after the window `finalize_claim` → **PAID 15,000 wei**, reserve released,
keeper bounty paid, loss stats and calibration updated. The first live run of
`finalize_claim` also exposed that `gl.ContractAt` does not exist on the real
SDK (gotcha #22) — fixed.

Not verified live: an *overturned* challenge (needs the real web to disagree
with itself; covered by offline tests), and LP `execute_withdrawal` (24h
cooldown).
