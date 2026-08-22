# SkyVerdict — SDLC Phase Plan

| Phase | Goal | Exit criteria | Status |
|---|---|---|---|
| **Phase 0** | Research and project definition | Idea validated, PRD/TRD/SDLC complete | ✅ Done — [`PRD.md`](PRD.md), [`TRD.md`](TRD.md), this file |
| **Phase 1** | Contract MVP | Contract compiles/loads, writes and reads basic state, simple verdict works | ✅ Done — `contracts/SkyVerdict.py` deployed to GenLayer Studio at `0xd17E7E87bD7191F556EA3A404269dDe2207d393b`; `__init__`, storage, and schema load confirmed working after resolving the issues logged in [`genvm-gotchas.md`](genvm-gotchas.md) |
| **Phase 2** | Frontend MVP | User can submit evidence and view result from contract | 🚧 In progress — `frontend/` has the client wrapper (`skyverdictClient.js`) and an unstyled `App.jsx` skeleton (buy / status / trigger panels) wired to the real contract methods; not yet visually polished or connected to a live RPC in `.env.local` |
| **Phase 3** | Testing and hardening | Bad inputs, edge cases and failure states handled | 🚧 In progress — `tests/direct/` (25+ offline unit tests) and `tests/integration/` (gltest scaffolding) exist and pass; live Studio testing of `evaluate_claim` against real validators (item 5 below) is **done** — validator consensus completed successfully once `source_urls` was passed as proper JSON; **items 6 (`appeal`/`claim_refund`) still open**
| **Phase 4** | Deployment | Contract deployed, frontend live, README updated | 🚧 Partial — contract deployed to hosted Studio; frontend not yet deployed anywhere (no Vercel link yet); README has quickstart + example flow but still needs the live contract/network details filled in (see README TODO) |
| **Phase 5** | Demo/submission polish | Video, screenshots, contract address, known limitations and roadmap ready | ⬜ Not started |

## Manual Studio smoke-test checklist (current Phase 3 focus)

Run in this order against the live deployment:

1. `get_pool()` → `{pool_balance: 0, protocol_fees_accrued: 0, creator_fees_accrued: 0}`
2. `is_domain_allowed("flightaware.com")` → `true`
3. `is_domain_allowed("some-random-site.com")` → `false`
4. `create_policy(...)` with a small test premium as tx value → confirm
   `get_policy(1)` reflects `ACTIVE` status and correct fee split
5. `evaluate_claim(policy_id=1, source_urls=[...])` against real tracker
   URLs → confirm validator consensus completes (watch the Validator Set
   panel for agreement, not just the final result) and that the verdict
   JSON is sane — **✅ done; consensus completed successfully once
   `source_urls` was passed as a proper JSON array**
6. `appeal(...)` and `claim_refund(...)` on a controlled test policy to
   confirm both code paths, not just the happy path — **⬜ not yet run**

## Immediate next steps
- Run item 6 above (`appeal` / `claim_refund` on a test policy)
- Wire `frontend/.env.local` to the deployed address + hosted Studio RPC
  and confirm the buy/status/trigger UI works end-to-end (closes Phase 2)
- Fill in the README "Deployed contract" section with confirmed network
  name, RPC, and chain ID once verified in the Studio UI (see TRD
  "Deployment targets" caveat about confirming these against the current
  Studio backend)
- Record a demo video and finalize known-limitations/roadmap section
  (Phase 5)
