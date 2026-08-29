# GenVM / GenLayer SDK gotchas hit while shipping SkyVerdict

Documented as we actually hit them against a live hosted GenLayer Studio
instance (`genvm v0.2.16-x86_64-linux-release`), because the SDK moves
faster than its own docs and several of these produced generic/unhelpful
error messages the first time around. Kept here rather than only in chat
history so future contributors (or future us) don't re-debug the same
things from scratch.

## 1. `from genlayer import *` does not export `dataclass`
**Symptom:** `NameError: name 'dataclass' is not defined` at the
`@dataclass` line on a storage-backed class, but only visible once you get
a real traceback — early on this surfaced only as a generic
`{"kind": "VM_ERROR", "message": "invalid_contract"}` with empty
stdout/stderr.
**Fix:** explicitly `from dataclasses import dataclass` — it's a stdlib
name, not something `genlayer`'s star-import re-exports, despite some doc
snippets showing `@dataclass` used right after `from genlayer import *`
with no visible import line.

## 2. `DynArray[str]` is a storage type, not a calldata parameter type
**Symptom:** silent schema-load failure (`invalid_contract`) with no
traceback captured.
**Fix:** incoming write-method parameters that are lists should be typed
as plain `list[str]`, matching the documented calldata composite types
(`list` / `dict` / primitives). `DynArray` is for *persisted storage
fields* — it needs an allocated backing slot and can't even be
constructed bare (`DynArray()` raises `TypeError`) outside that context.

## 3. `gl.evm.send(...)` does not exist
**Symptom:** would only surface as a runtime `AttributeError` the first
time a write path actually tried to pay out — not caught by schema
loading at all, since it's inside a method body.
**Fix:** use `gl.ContractAt(address).emit_transfer(value=...)` to send
native value to an address.

## 4. `validator_fn` receives a `Result`, not a raw value
**Symptom:** would similarly only break at runtime, inside the
leader/validator consensus path.
**Fix:** unwrap with `gl.vm.unpack_result(leader_result)` inside
`validator_fn`, don't call a `.get()` method that doesn't exist on the
result object.

## 5. Storage-typed fields (`TreeMap`, etc.) are zero-initialized already — don't reassign them
**Symptom:**
```
AssertionError: Is right the same storage type? `TreeMap` <- `TreeMap`
```
raised from deep inside `genlayer/py/storage/_internal/desc_record.py`
during `__init__`, on every validator, with `Consensus History` showing
`ACCEPTED` (i.e. validators *agreed* on the error — this is a deterministic
code bug, not a disagreement issue).
**Fix:** don't do `self.some_treemap_field = TreeMap()` in `__init__` at
all. GenVM zero-initializes container-typed storage fields before your
`__init__` runs; a bare `TreeMap()` constructed fresh loses the field's
declared type parameters (`TreeMap[K, V]`) that the storage descriptor
checks against. Just mutate the field in place
(`self.some_treemap_field[key] = value`) if you need to seed it with data.

## 6. `genlayer-js/chains` named imports can crash the whole frontend on load
**Symptom:** blank dark page in the browser, no error in the Vite terminal
(compile succeeds), only visible in the browser console:
`Uncaught SyntaxError: The requested module '.../genlayer-js_chains.js'
does not provide an export named 'studionet'`.
**Fix:** the docs describe `studionet`/`testnetAsimov`/`localnet` as named
exports of `genlayer-js/chains`, but whichever version actually gets
resolved by `npm install` may not have all of them yet. A static
`import { studionet } from "genlayer-js/chains"` throws a hard
`SyntaxError` at module-load time if that name doesn't exist — and
because this file sits at the root of the frontend's import graph, it
takes the entire React app down before anything renders, with no build
error to point at it. Use a namespace import instead
(`import * as glChains from "genlayer-js/chains"`) and check
`glChains.studionet` at runtime with a graceful fallback + console
warning — see `frontend/src/lib/genlayerClient.js`. Same underlying
lesson as #1/#2 above, just on the JS SDK side instead of the Python one.

## 7. Hosted Studio's RPC blocks direct browser calls from other origins (CORS)
**Symptom:** everything works when talking to the contract from inside
Studio itself, but a separately-deployed frontend (e.g. on Vercel) gets a
generic `TypeError: Failed to fetch` on every `gen_call`/read, with no
CORS-specific wording visible in some browsers' console output — easy to
mistake for a wrong network/chain/address when it's neither. Confirmed by
fetching the RPC URL directly outside a browser (`curl`/server-side
`fetch`) and getting a normal response (a 405 on a bare GET, since it's a
POST-only JSON-RPC endpoint) — proving the endpoint is alive and the
problem is browser-enforced, not the network being unreachable.
**Fix:** browsers enforce CORS; there is no client-side workaround for a
server that doesn't send `Access-Control-Allow-Origin`. Add a same-origin
serverless proxy (`frontend/api/rpc.js` on Vercel) that forwards the
JSON-RPC POST server-side — server-to-server requests aren't subject to
CORS at all — and point the frontend at it via
`VITE_GENLAYER_RPC_URL=same-origin` (see `.env.example`).

## 8. [RETRACTED] "Even read-only `gen_call` requests need a `from` address"
**Original claim:** a `KeyError: 'from'` meant every request, even reads,
needed an account attached, so we fabricated a throwaway `createAccount()`
for anonymous reads.
**Why it was wrong:** that KeyError happened while the client was
misconfigured onto the wrong chain (a leftover `testnetAsimov` fallback
from `studionet` not existing in `genlayer-js@0.9.5` at the time). Once
the app was correctly upgraded to `genlayer-js@1.1.8` (where `studionet`
genuinely is exported — confirmed against GenLayer's own
`genlayer-project-boilerplate` reference app) and `VITE_GENLAYER_CHAIN`
was pointed at `studionet` again, the fabricated read-only account itself
became the problem: it caused a *different*, execution-time backend
failure (`exit_code 1`) that Studio's own UI and the boilerplate's own
reference code — neither of which manufacture an account for anonymous
reads — never hit. Removed entirely; `buildClient()` now omits `account`
whenever nobody's connected, matching the reference app exactly.
**Lesson:** a workaround that makes one symptom go away isn't proof the
underlying diagnosis was correct — especially when the workaround itself
introduces a plausible new failure mode. Worth re-testing old workarounds
after fixing an unrelated root cause nearby, rather than assuming they're
still both necessary and harmless.

## 9. `readContract`/`writeContract` use `functionName`, not `method`
**Symptom:** every read and write failed with a generic `execution
failed` / decoded `exit_code 1` from the contract runtime — persisted
across chain changes, account changes, and even a major `genlayer-js`
version bump, because none of those were the actual problem.
**Root cause:** every call in this file was written with
`method: "get_pool"` (etc.) instead of `functionName: "get_pool"`.
`genlayer-js`'s actual option key is `functionName` — confirmed against
GenLayer's own working `genlayer-project-boilerplate` reference app,
which uses `functionName` throughout. Passing `method` instead means the
SDK builds a call with no function name at all, which the contract's
runtime can't resolve — an unhandled exception server-side, surfacing as
the same generic `execution failed` we spent this entire session chasing
through chain presets, CORS, and account handling.
**Lesson:** when every configuration variable gets fixed one at a time
and the exact same generic error persists throughout, the bug is
probably not in any of the things being varied — worth stepping back to
diff the actual request-building code itself against a known-working
reference, rather than continuing to vary configuration. This is the
single highest-leverage fix of the whole debugging arc; everything else
in gotchas #6–8 was real, but none of it was the main blocker.

## 10. Connected MetaMask stays on whatever network it was already on
**Symptom:** writes worked fine through Demo Mode (a `createAccount()`
session key) but failed with a viem "invalid parameters" rejection the
moment a real MetaMask wallet was connected instead — the one write path
never actually tested until a real user tried it with a real wallet.
**Root cause:** `eth_requestAccounts` only asks for permission to see an
address; it does nothing to switch MetaMask onto GenLayer's network.
MetaMask stays on whatever chain it already had selected (often Ethereum
mainnet by default), and a transaction signed while the wallet believes
it's on the wrong chain doesn't match what the actual GenLayer RPC
expects.
**Fix:** explicitly check `eth_chainId` after connecting, and if it
doesn't match GenLayer's chain ID (Studionet = `61999`, Testnet Bradbury
= `4221`), request `wallet_switchEthereumChain` — falling back to
`wallet_addEthereumChain` first if the wallet doesn't have that network
configured at all (error code `4902`). Matches the exact pattern
GenLayer's own `genlayer-project-boilerplate` reference app uses — see
`ensureWalletOnGenLayerNetwork()` in `frontend/src/lib/genlayerClient.js`.
**Lesson:** Demo Mode successfully passing doesn't prove a real wallet
will — they exercise genuinely different code paths (a local signing key
vs. delegating to an external, independently-stateful browser extension).
Both need testing separately before either is considered proven.

## 11. Write-call promises can hang even after the transaction actually finishes
**Symptom:** clicking "Evaluate claim" sometimes left the button stuck on
"Awaiting consensus…" indefinitely, with no error and no result — only a
manual page refresh (which re-fetches state fresh) revealed the verdict
had actually already landed on-chain minutes earlier.
**Root cause:** `genlayer-js`'s write-call promise (and whatever internal
transaction-status polling it does while waiting for confirmation) isn't
fully reliable — we'd already found real backend crashes in the adjacent
`gen_getTransactionStatus` RPC method earlier in this project's history.
A frontend that only does `await fn(); load();` has no way to recover if
that `await` simply never resolves.
**Fix:** run an independent polling loop (`frontend/src/pages/
PolicyDetail.jsx`) that re-fetches the real policy state every few
seconds regardless of whether the write-call promise itself has settled,
finishes the pending UI state on whichever happens first (the promise
resolving, or the poll detecting a real status/verdict change), and gives
up cleanly after a fixed timeout with a clear "still working in the
background, check again" message instead of blocking forever.
**Lesson:** for any write path built on an SDK whose completion signal
has already proven unreliable once, don't trust that signal as the *only*
way to know an action finished — cross-check against the actual resource
state directly, and always give the UI a way out of "stuck" rather than
assuming the happy path.

## General lesson
The two failure modes look identical from Studio's toast notification
("Could not load contract schema" / generic `invalid_contract`) but come
from very different places — **module-import-time errors** (missing
names, bad type annotations on storage/parameters) vs. **runtime errors
during `__init__`/method execution** (bad API calls, wrong assumptions
about zero-initialization). The `stdout`/`stderr`/traceback fields in the
full error detail (not just the toast) are what actually distinguish
them — always get the expanded error, not just the banner text, before
guessing at a fix.

## 10. Frontend redesign pass (2026 design brief) — no backend/data changes
A full visual redesign was applied against `SkyVerdict — 2026 Frontend
Redesign Master Prompt` (aviation-control/editorial direction, no purple,
orange/green/blue/amber signal palette, Inter + IBM Plex Mono). This
touched **only** presentation: `tailwind.config.js`, `index.css`,
`index.html` fonts, and every component/page in `frontend/src/`.
`genlayerClient.js`, `localPolicies.js`, `WalletContext.jsx`, and the
polling/timeout reliability logic in `PolicyDetail.jsx` (see gotcha #9)
were left untouched — the redesign consumes the same real reads/writes,
just renders them differently.

Two places where the brief's own "never fabricate data" rule was taken
literally rather than illustratively:
- The contract stores no destination airport (`departure_airport` only —
  see `docs/TRD.md`). The two-airport route visual is used only for the
  clearly-labeled illustrative hero example; real policies get a
  single-origin "monitoring" treatment instead of an invented arrival
  airport.
- The contract never exposes a validator count. The consensus visual
  (`ValidatorConsensus.jsx`) shows only real data: the live GenLayer
  stage name during a pending write, and the contract's own
  `sources_used`/`sources_total` once a verdict resolves — never a
  fabricated "8/8 validators agreed" figure.

**Not yet verified:** this sandbox has no network access, so
`npm install && npm run build` could not be run here (confirmed via a
403 from the npm registry). Everything was checked statically instead —
`tsc --noEmit` in JSX mode across every file (clean), every relative
import manually confirmed to resolve to a real file, and a grep pass to
confirm no leftover references to the old navy/cyan palette. Budget time
for `cd frontend && npm install && npm run dev` as the first real step
before treating this as demo-ready, the same caveat as every prior
frontend build in this project.

## 11. "My Flights" wasn't actually wallet-personalized
`MyPolicies.jsx` originally derived its list purely from `localStorage` —
whatever policy IDs happened to be tracked in that specific browser, with
no relationship to which wallet was connected. Two different people (or
the same person on two devices) would see completely different, or
overlapping, lists with no connection to actual ownership.

Fix: the contract already returns a real `holder` field (the buyer's
address) on every `get_policy` call — nothing needed to change on the
contract side. "My Flights" now scans recent policy IDs (via
`get_total_policies`, capped at the last `SCAN_LIMIT` for performance) and
filters to `policy.holder === connectedAddress`, so the list is now
genuinely derived from on-chain truth and follows the connected wallet
across browsers/devices. Manually-tracked IDs are kept as a separate,
clearly-labeled section ("not necessarily held by your wallet") rather
than folded into "yours."

Explicitly NOT fixed, because it isn't a bug: policy data itself is
public on-chain, readable by anyone with the ID (or via the Verdict
History page), regardless of which wallet is asking. The UI now says
this plainly rather than implying a privacy guarantee the architecture
doesn't have. A real "my policies" index (rather than a linear scan) is
worth building before this holds meaningful volume — noted as a known
limitation.

## 12. Transparent Reasoning Explorer — scoped to what the contract actually stores
Added `ReasoningPanel.jsx` (in the Verdict Room) and a short consensus
explainer on the Verdict History page — the "not a black box" story that's
GenLayer's actual differentiator, made visible in the product.

Deliberately narrower than the original pitch for this feature: the
contract's `_derive_verdict` only ever returns the aggregate outcome
(`decision`, `cancelled`, `delay_minutes`, `sources_used`,
`sources_total`) — it does not store which URL each individual validator
fetched, nor any raw LLM reasoning text. So this shows the real,
deterministic aggregation rule (median delay, majority-vote cancellation,
quorum threshold) applied to a policy's real numbers — not invented
per-validator transcripts. If genuine per-validator/per-source
attribution is wanted later, that requires a contract change to persist
more data in the verdict, not just a frontend addition.

## 13. Multi-flight ("trip") coverage — minimal-risk contract redeploy
Added real portfolio coverage: `create_trip(...)` buys coverage for
several flight legs in one transaction, sharing one `trip_id`. This is a
genuine contract change requiring redeploy (new storage field on
`Policy`), so it was deliberately designed to touch as little of the
proven, hard-won code as possible:

- `evaluate_claim`/`appeal`/`claim_refund`/the nondet consensus block are
  **completely untouched**. Each trip leg is just an ordinary `Policy`
  row tagged with a nonzero `trip_id` — its claim lifecycle is identical
  to any single-flight policy.
- Only new contract surface: one scalar `trip_id: u256` field on `Policy`
  (same pattern as every other scalar field already working), one
  `next_trip_id: u256` counter (same pattern as `next_policy_id`), and
  `create_trip`'s parameters are plain `list[str]`/`list[int]` — the
  exact calldata pattern already proven safe in `evaluate_claim`'s
  `source_urls: list[str]` (see gotcha #4 — DynArray is a storage-only
  container, never a parameter type). No new nested storage containers.
- `create_policy`'s original body was extracted into a shared internal
  helper (`_open_policy`) with zero behavioral change — `create_policy`
  itself now just calls it with `trip_id=0`. Verified via
  `tests/direct/smoke_create_trip.py`, a standalone stdlib-only script
  (pytest isn't installable in this sandbox — no network) that drives
  the same offline mock SDK pattern as `tests/direct/conftest.py`
  directly. All 11 checks pass, including a fee-math regression check
  against the original single-flight numbers and remainder-handling on
  an unevenly-divisible premium split.

**This still needs a real redeploy and re-verification in Studio** —
the offline mock cannot catch GenVM-runtime-specific issues (the same
category of surprise as gotchas #1–#6: `dataclass` import, storage
zero-init, etc.). Deploy, then sanity-check in this order before trusting
it: `create_policy` still works exactly as before (regression), then
`create_trip` with 2 legs, then confirm both legs show up under
`get_policy` with the same `trip_id` and sequential `policy_id`s.

Frontend: new `create_trip` wrapper in `genlayerClient.js` (mirrors
`create_policy`'s pattern exactly), a new `BuyTrip.jsx` page, and
`MyPolicies.jsx` now groups owned policies by `trip_id` into a bundled
card per trip instead of showing legs as unrelated individual policies.

## 14. formatGen precision loss above Number.MAX_SAFE_INTEGER
`formatGen` used `Number(wei).toLocaleString()`, and `NetworkStatus.jsx`
called `.toLocaleString()` directly on the raw value from `get_pool()` —
both unsafe once a wei-scale value exceeds
`Number.MAX_SAFE_INTEGER` (~9 quadrillion; wei-scale 18-decimal values
cross that easily). Fixed by parsing through `BigInt` instead (handles
string, number, or bigint input) in `formatGen`, and routed
`NetworkStatus.jsx`'s pool/fee stats through it instead of formatting
raw numbers directly.

Not yet audited: `PolicyDetail.jsx`'s settlement-amount calculation
(`Number(policy.premium) * Number(policy.payout_multiplier_bps) / 10000`)
and the theoretical-max-payout previews in `BuyCoverage.jsx`/`BuyTrip.jsx`
still use plain `Number()` math. Low practical risk today (those inputs
are either user-typed small numbers, or the display-only settlement
figure), but worth a BigInt pass if premiums ever operate at real
GEN-with-18-decimals scale rather than the small test values used
throughout this project.

Separately: a manual Studio test of `create_trip` showed `pool_balance`
at a 10^18-larger scale than every previous test in this project. Given
the live frontend has already verified small-scale, unscaled values work
correctly end-to-end (buy → evaluate → appeal → refund, multiple
rounds), this is believed to be Studio's own manual "transaction value"
input auto-converting a typed amount to wei — a Studio UI convention,
not a frontend bug — but this is not yet confirmed by actually buying a
policy through the live frontend and re-checking `get_pool()`. Do that
before assuming either way.

## 15. Natural-language policy creation — new nondet code, contained deliberately
Added `create_policy_from_text(description, scheduled_departure_utc,
scheduled_arrival_utc)`. This is genuinely new nondet (LLM) territory,
unlike gotcha #13's `create_trip` — so it was scoped narrowly on purpose:

- **New, isolated method only.** `create_policy`, `create_trip`, and
  `evaluate_claim` are completely untouched.
- **Reuses evaluate_claim's exact proven consensus pattern**
  (`gl.vm.run_nondet` with a hand-written leader/validator pair) rather
  than `gl.eq_principle`'s canned helpers — those were only ever quoted
  from a generic doc example early in this project, never actually
  exercised against this deployment, so they're an unknown, not a
  proven pattern. Also reuses `_fence` verbatim for the same
  prompt-injection defense already proven for web content, applied here
  to the customer's own free-text description.
- **The LLM only extracts, never decides.** Every extracted field still
  passes through `_open_policy`'s existing validation (arrival after
  departure, threshold > 0, coverage <= premium × multiplier) — a bad or
  manipulated extraction gets rejected by validation that already
  exists, not silently accepted.
- **Exact-match consensus, not tolerant.** `evaluate_claim` allows ±15
  minutes of disagreement on a delay estimate; this requires byte-for-
  byte structural agreement across every extracted field, since these
  are financial terms (a policy's threshold and payout multiplier), not
  a delay estimate — "close enough" isn't good enough here. Disagreement
  fails the transaction closed: no policy, no charge.
- **Departure/arrival times are explicit numeric arguments, not
  LLM-parsed.** Resolving relative dates ("tomorrow", "next Friday")
  reliably enough for independent validators to agree is a much harder,
  flakier problem than the structured entity extraction this method
  actually needs — so the UI collects those two timestamps the normal
  way, same as `create_policy`, and only the qualitative coverage terms
  (airline, flight number, airport, threshold, multiplier, optional cap)
  go through the LLM.
- **Belt-and-suspenders re-validation.** The contract does not trust the
  model's own `"ok": true` self-assessment — it independently checks
  that the required fields are actually non-empty/positive before
  proceeding, since a confidently-wrong `"ok": true` with blank fields is
  exactly the kind of thing an LLM can produce.

**Known residual risk, accepted deliberately rather than ignored**: the
customer's own description text is user-controlled and could contain a
self-serving prompt-injection attempt (e.g. text trying to talk the
model into an inflated multiplier or coverage cap for that same user's
own policy). This is fenced the same way web content is, but fencing
reduces rather than eliminates the risk. The blast radius is bounded by
what already existed before this change: `_open_policy` still caps
`max_coverage` at `premium * payout_multiplier_bps / BPS_DENOMINATOR`
regardless of what was extracted, so a successful injection can only
secure unusually generous terms *for that user's own, self-funded
policy* — it cannot extract value beyond what that user personally paid
for, and payout is still bounded by the pool's actual liquidity (an
already-documented, pre-existing limitation — see docs/reliability.md).

Verified via `tests/direct/smoke_tests.py` (renamed from
`smoke_create_trip.py` — now covers both features), which mocks
`gl.nondet.exec_prompt` to test the surrounding contract logic (not LLM
quality, which can't be tested offline): a valid extraction creating a
correct policy, an explicit `max_coverage` being honored rather than
overridden, an unstated one correctly defaulting to the multiplier's
ceiling, an incomplete extraction failing closed with zero side effects
despite the model claiming `"ok": true`, and arrival-before-departure
rejected before any LLM call happens at all. 18/18 checks pass across
both features.

**This still needs real deployment verification** — the offline mock
can't test actual LLM extraction quality or real GenVM consensus
behavior on this new code path. Deploy, then test with a genuinely clear
description first (matching the UI's own example), and separately test
a deliberately incomplete one to confirm it fails closed as designed
rather than silently guessing.

Frontend: new `createPolicyFromText` wrapper in `genlayerClient.js`
(mirrors `create_policy`'s pattern) and a new `BuyByDescription.jsx`
page, linked from the plain "Protect a flight" form.
