# SkyVerdict — Technical Requirements Document

## Frontend stack
Vite + React (skeleton in `frontend/`), `genlayer-js` for contract
reads/writes, environment-variable-driven config (`VITE_SKYVERDICT_ADDRESS`,
`VITE_GENLAYER_RPC_URL`) per the guide's "no hardcoded network config" rule.
No backend/database is required for the MVP (see below).

## GenLayer contract architecture
Single Intelligent Contract, `contracts/SkyVerdict.py`, is the sole source
of truth for policy state and verdicts — no shadow backend duplicates or
overrides its decisions. Full actor/sequence-diagram writeup:
[`docs/architecture.md`](architecture.md).

## Data structures and storage maps
| Field | Type | Purpose |
|---|---|---|
| `policies` | `TreeMap[u256, Policy]` | all policies by id |
| `pool_balance` | `u256` | premium pool backing outstanding payouts |
| `protocol_fees_accrued` / `creator_fees_accrued` | `u256` | withdrawable fee balances, tracked separately from `pool_balance` |
| `allowlisted_domains` | `TreeMap[str, bool]` | permitted source domains for evidence fetches |
| `owner` / `creator` | `Address` | admin and fee-recipient roles |
| `paused` | `bool` | emergency stop |
| `next_policy_id` | `u256` | id counter |

`Policy` (`@allow_storage @dataclass`) holds: `policy_id`, `holder`, flight
identifiers, `premium`, `threshold_minutes`, `payout_multiplier_bps`,
`max_coverage`, `status`, `last_verdict_json`, `appeal_used`, timestamps.

Storage fields of container type (`TreeMap`) are zero-initialized by GenVM
automatically — `__init__` must not reassign them with a bare constructor
call (see `docs/genvm-gotchas.md` for why this specifically breaks schema
loading).

## Read methods and write methods
**Write:** `create_policy` (payable), `evaluate_claim`, `appeal`,
`claim_refund`, `admin_set_paused`, `admin_add_domain`,
`admin_remove_domain`, `admin_withdraw_protocol_fees`,
`creator_withdraw_fees`.
**View:** `get_policy`, `get_pool`, `get_claim_status`,
`is_domain_allowed`.

## Prompt design and JSON schema
Per-source extraction prompt is fenced against prompt injection
(`UNTRUSTED_WEB_DATA` markers) and forces a strict JSON-only response —
see the full prompt text in the README. Output schema:
`{ok, delay_minutes, cancelled, confidence, reasoning}` per source, then
aggregated by `_derive_verdict` into the final verdict JSON documented in
`docs/PRD.md`.

## Equivalence/consensus approach
Custom `gl.vm.run_nondet(leader_fn, validator_fn)` rather than the canned
`gl.eq_principle.*` helpers, because this contract needs multi-source
business-rule aggregation (median delay, majority-vote cancellation,
confidence floor, quorum check) richer than strict equality or simple
comparative prompting. `validator_fn` independently re-fetches and
re-derives rather than byte-comparing the leader's output — see
`docs/architecture.md` §6 for the full rationale.

## Backend/database choice, if any
None for the MVP — deliberately, per the guide's "start with contract +
frontend" default. All canonical state (policies, verdicts, pool
accounting) lives on-chain in the contract; nothing is cached or
duplicated off-chain that could diverge from it. A backend may be added
later purely for UX (e.g. indexing historical policies for faster
frontend listing) but must not become a second source of truth.

## Environment variables
| Variable | Used by | Purpose |
|---|---|---|
| `VITE_SKYVERDICT_ADDRESS` | frontend | deployed contract address |
| `VITE_GENLAYER_RPC_URL` | frontend | network RPC endpoint |

No secrets/private keys are used in the frontend; deployment keys are
supplied to `deploy/deploy.py` / the CLI directly, never committed.

## Deployment targets
1. **GenLayer Studio** (hosted, `studio.genlayer.com`) — used for initial
   build/debug; current deployed instance:
   `0xd17E7E87bD7191F556EA3A404269dDe2207d393b` (see README for network
   details — confirm exact RPC/chain ID from the Studio UI, since hosted
   Studio's backing network can be updated by GenLayer independent of this
   repo).
2. **Studionet** (`https://studio.genlayer.com/api`, chain ID `61999`) —
   hosted prototyping/sharing target.
3. **Testnet Bradbury** (`https://rpc-bradbury.genlayer.com`, chain ID
   `4221`) — production-like final testing before any real-value use.

Always reconfirm RPC/chain ID against the official GenLayer network page
before deploying — these are operated by GenLayer Labs and can change
independently of this project.

## Testing approach
- `tests/direct/` — offline, mocked-SDK unit tests (fee math, verdict
  aggregation, access control, boundary conditions) — no network needed.
- `tests/integration/` — `gltest`-based tests against a real local Studio
  instance with locally-hosted mock tracker pages, exercising real GenVM
  sandboxing and consensus deterministically.
- Manual Studio smoke tests — see `docs/SDLC.md` Phase 3 for the checklist
  actually run against the live hosted deployment.

## Security notes
See `docs/architecture.md` §6 in full. Summary: no trusted fetcher (every
validator fetches independently), source-domain allowlist, explicit
prompt-injection fencing, structured-output + confidence-floor + majority
aggregation (not single-source trust), fail-closed timing windows
(`SETTLEMENT_BUFFER_SECONDS`, `CLAIM_EXPIRY_SECONDS`), single-use appeals
to bound retry griefing, and payout capped by `min(theoretical, max_coverage,
pool_balance)` so a single claim can never drain the pool beyond its
backing. Not yet independently audited — see README "Known limitations."
