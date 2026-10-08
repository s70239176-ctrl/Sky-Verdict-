# Changelog

SkyVerdict follows semantic versioning while pre-1.0: a minor bump (0.x) marks a
milestone; contracts are redeployed per release.

## 0.2.0 — milestone release

Everything added since the accepted MVP. Developed in two stages that earlier
notes, tests and some doc headings call "v2" and "v3".

### Added — contract
- **Underwriter capital pool**: `deposit_liquidity`, `request_withdrawal`,
  `execute_withdrawal`, `cancel_withdrawal`; shares priced at book value; 24h
  exit cooldown so nobody can leave after spotting a delayed flight.
- **Collateralized policies**: every policy reserves its worst-case liability;
  `create_policy` / `create_trip` / `create_policy_from_text` revert unless free
  capital covers it, so holders cannot be shorted.
- **On-chain risk pricing**: owner-tunable risk model, `get_quote`, and an
  enforced maximum payout multiplier (expected loss <= 85% of net premium).
- **Self-calibrating risk**: settled verdicts update each airline's risk
  estimate (credibility-weighted, needs 5 observations, clamped 0.5x-3x);
  `get_calibration`, `get_loss_stats` expose expected vs realized payouts.
- **Challenge court**: `evaluate_claim` yields a provisional verdict;
  `challenge_claim` (bond + extra independent source, stricter quorum) and
  `finalize_claim`; overturned / upheld / inconclusive economics;
  `get_challenge_info`, `get_finalize_queue`.
- **Keeper incentive**: bounty from protocol fees, split 2/3 evaluator, 1/3
  finalizer; `get_keeper_queue`.
- **Affiliates**: `create_policy_referred` (5% of premium from the creator fee),
  `affiliate_withdraw`, `get_affiliate`.
- **Deployment parameters** (fixed at deploy): `challenge_window_seconds`,
  `settlement_buffer_seconds`, `sandbox_mode`.

### Added — app and tooling
- Underwrite page (pool health, positions, exits, protocol health), Partners page
  (referral link, widget builder, earnings), challenge/finalize panel in the
  Verdict Room, live on-chain quote and capacity warnings in the Buy flow,
  sandbox banner.
- `frontend/public/widget.js` embeddable widget (no cookies / tracking / third
  parties).
- `keeper/`: settlement + finalization bot, `deploy.mjs` (verified deploy path),
  `live-check.mjs` / `live-v3.mjs` live verification scripts.
- Docs: `docs/underwriting.md`, `docs/court-calibration-affiliates.md`,
  `docs/security.md` (threat model, owner powers, limits), `docs/live-run-0.2.0.txt`
  (every live transaction hash, verified on-chain), gotchas #21-#24.

### Fixed
- **`gl.ContractAt` does not exist on GenVM** — every payout, refund, withdrawal,
  bounty and fee withdrawal path was broken on a real chain since 0.1; now uses
  `gl.get_contract_at` and is verified live (first real payout: 15,000 wei).
- **`gl.message.timestamp` does not exist on GenVM** — the settlement buffer,
  claim expiry and "no departed flights" rules never applied on-chain; time now
  comes from `gl.message_raw["datetime"]` and fails closed.
- Purchase flows opened the previous policy and reported success for rejected
  purchases (`awaitNewPolicyIds`).
- Evaluate / Refund buttons now explain when the contract's windows open instead
  of spinning on a call that reverts.

### Changed
- Verdicts are provisional by default (24h window): payouts wait for the
  challenge window. A window of `0` restores immediate settlement.
- Test mocks only expose APIs the real SDK has (they previously hid both fixed
  bugs).

### Deployments
- Production: `0xC21B201F6a4200788f5FE35620daE5f2072A3DF4` (24h window, 3h buffer).
- Sandbox demo: `0x9B646F38cf2A51B4bde67C01F52409F22e78290E` (10 min window, no
  buffer, past flights insurable).
- Deprecated: `0x4A3cEB1d00F479b8F91A7CF478371D518F7f47E4` (cannot pay out),
  `0x2FB45FC2CA611B6E992C589b458eF6f432aC3Afe` (0.1).

### Verified
- 127 offline contract tests, 6 keeper tests, frontend build.
- Live on Studio with real validator consensus: referral credited and withdrawn,
  provisional verdicts (PAYOUT and NO_PAYOUT), an inconclusive challenge with
  bond returned, finalize to PAID (15,000 wei) and to EXPIRED_NO_PAYOUT, reserve
  release, keeper bounty, loss stats and calibration updates.
- Not verified live: an overturned challenge (needs the real web to disagree
  with itself; covered offline) and LP `execute_withdrawal` (24h cooldown).

## 0.1.0 — accepted MVP

`create_policy`, `evaluate_claim` (multi-source LLM extraction with leader /
validator consensus), `appeal`, `claim_refund`; trips (`create_trip`);
natural-language policies; informational delay-cause classification; agent
skill manifest; hostname-allowlist / source-independence / HTTPS hardening and
honest partial-payout accounting; fee model; Vite + React frontend with Demo
Mode; Vercel RPC proxy.
