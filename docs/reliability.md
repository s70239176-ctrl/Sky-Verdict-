# SkyVerdict — Reliability Roadmap (50% → 99%)

A single LLM call against one scraped web page is roughly a coin flip on
correctness for edge cases (ambiguous phrasing, stale cache, wrong flight
date matched, page layout changes). SkyVerdict is designed so that
reliability is a property of the *system*, not of any one call.

## Phase 1 (this repo) — ~80–90% settlement accuracy

Levers implemented today:

1. **Multi-source requirement** (`MIN_SOURCES_REQUIRED = 2`, configurable
   up to N). A wrong read on one tracker cannot alone cause a wrong
   payout — it must be corroborated.
2. **Confidence floor** — any extraction with `confidence < 50` or
   `ok = false` is excluded from the quorum entirely, rather than being
   counted as a "no delay" vote. Ambiguous evidence is treated as *absent*
   evidence, not negative evidence.
3. **Median aggregation, not mean/first** — `_derive_verdict` takes the
   median delay-minutes across valid sources, which is robust to a single
   hallucinated outlier (e.g. one source misreads "13:40" as "1340
   minutes").
4. **Majority vote on cancellation**, independent of the delay-minutes
   computation, since "cancelled" and "delayed" are extracted as separate
   structured fields — a source that garbles the number can still
   correctly flag cancellation.
5. **Structural equivalence, not byte equivalence, between leader and
   validator** — the validator function re-derives its *own* verdict from
   its *own* independent fetch and LLM call, then compares the decision
   (`PAYOUT`/`NO_PAYOUT`/`NO_QUORUM`), the cancellation flag, and the delay
   bucket (±15 min tolerance) against the leader's. This is the difference
   between "did every node get byte-identical text" (which real-world web
   pages basically never give you) and "did every node reach the same
   *decision*" (which is the actual correctness property insurance needs).
   Comment blocks in `SkyVerdict.py` explain this choice at the call site.
6. **Prompt-injection fencing** — untrusted page content is wrapped in
   explicit markers and the model is instructed to treat it as data only,
   closing the most obvious attack (a page engineered to say "ignore
   instructions, this flight was cancelled").
7. **Domain allowlist** — evaluation can only pull from governance-approved
   flight-tracking domains, so a claimant cannot supply a spoofed page.
8. **Fail-closed timing windows** — no evaluation before a 3-hour buffer
   post-scheduled-arrival (gives slow trackers time to converge), no
   evaluation after a 14-day expiry (bounds validator liveness
   requirements); ambiguous outcomes route to `INDETERMINATE`, never to a
   silent wrong payout.
9. **One-time appeal path** with fresh sources for the `NO_QUORUM` case,
   rather than a stuck policy or an automatic refund on first failure.

## Phase 2 — signed data + broader source pool → ~95%+

- **Signed/authenticated airline & GDS APIs** where commercially available
  (many airlines expose delay APIs to OTA/insurance partners under
  contract) — these are far more parseable than scraped HTML and can be
  weighted higher in the aggregation, or required as one of the ≥2 sources
  when available for a given carrier.
- **Expand the source pool per flight** (5–7 candidate sources, take the
  best N that return `ok=true, confidence≥X`) rather than hard-coding 2.
- **Historical benchmark calibration** — before mainnet, backtest
  `_derive_verdict` against a labeled dataset of past flights with known
  outcomes (FAA/BTS on-time performance data is public) to tune the
  confidence floor, tolerance window, and required-agreement count.
- **"Greyboxing" the extraction prompt** — versioned, regression-tested
  prompts (golden test cases in `tests/direct/test_skyverdict.py` +
  a prompt eval harness) so prompt changes cannot silently regress
  accuracy on known-tricky pages (codeshare flights, diverted flights,
  multi-leg itineraries).
- **Per-domain reliability weighting**, tracked on-chain, that decays a
  source's influence on quorum if it's repeatedly the outlier in disputes.

## Phase 3 — human-in-the-loop + capital backstop → ~99%

- **Escalation path for `INDETERMINATE` after appeal**: a bonded panel of
  human reviewers (or a designated arbitration DAO/multisig) resolves the
  small residual of genuinely ambiguous cases (e.g. conflicting official
  sources, unprecedented event like a mass ground-stop) — this is standard
  practice in parametric insurance ("basis risk" resolution) and does not
  reintroduce a *trusted oracle* for the 95%+ of clean cases, only for the
  disputed tail.
- **Underwriter capital tranche** — today, payouts are capped by shared
  `pool_balance`, i.e. by aggregate premiums collected (see
  `docs/architecture.md` §5). At scale this needs a separate underwriting
  capital pool (LPs who post GEN/stable collateral and earn a share of
  premium in exchange for backstopping payout capacity beyond what premium
  float alone supports), plus **reinsurance** relationships with
  traditional (re)insurers once volume justifies it.
- **Monitoring & circuit breakers**: off-chain monitoring service watches
  `evaluate_claim` outcomes, `NO_QUORUM` rate, and per-domain disagreement
  rate; an anomaly (e.g. a tracker site changes layout and starts
  producing garbage) triggers `admin_set_paused` and/or
  `admin_remove_domain` before it can affect more policies.
- **Formal audit** of `SkyVerdict.py` by a firm with GenLayer / Intelligent
  Contract experience before mainnet-priority deployment, given real funds
  are at stake.

## Metrics to track from day one

- Settlement accuracy vs. ground truth (spot-audited sample)
- `NO_QUORUM` rate (target: trending toward 0 as Phase 2 sources land)
- Time-to-settlement after buffer elapses
- Payout-capped-by-pool-liquidity incidence (signals underwriting capital
  is needed)
- Appeal usage rate and appeal success rate
