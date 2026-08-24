# SkyVerdict — SDLC Phase Plan

| Phase | Goal | Exit criteria | Status |
|---|---|---|---|
| **Phase 0** | Research and project definition | Idea validated, PRD/TRD/SDLC complete | ✅ Done — [`PRD.md`](PRD.md), [`TRD.md`](TRD.md), this file |
| **Phase 1** | Contract MVP | Contract compiles/loads, writes and reads basic state, simple verdict works | ✅ Done — `contracts/SkyVerdict.py` redeployed to GenLayer Studio at `0xDa95D4851E848C7fE030FC848596625Edb2d905c` (previous address `0xd17E7E87...` is stale/orphaned — this redeploy added `get_total_policies`, see Phase 4); `__init__`, storage, and schema load confirmed working after resolving the issues logged in [`genvm-gotchas.md`](genvm-gotchas.md) |
| **Phase 2** | Frontend MVP | User can submit evidence and view result from contract | ✅ Done — full Vite + React + Tailwind app built in `frontend/` (landing page, Buy Coverage wizard, My Policies dashboard, Policy Detail with live evaluate/appeal/refund actions + animated consensus visualization, public Transparency feed, wallet connect + one-click Demo Mode). Ran through a real `npm install && npm run dev` successfully; one runtime bug found and fixed (a `genlayer-js/chains` named-export mismatch that crashed the app on load — see `docs/genvm-gotchas.md`). See `frontend/README.md` for the full feature tour and honesty notes. |
| **Phase 3** | Testing and hardening | Bad inputs, edge cases and failure states handled | 🚧 In progress — `tests/direct/` (25+ offline unit tests) and `tests/integration/` (gltest scaffolding) exist and pass; live Studio testing of `evaluate_claim` against real validators (item 5 below) is **done** — validator consensus completed successfully once `source_urls` was passed as proper JSON; **items 6 (`appeal`/`claim_refund`) still open**
| **Phase 4** | Deployment | Contract deployed, frontend live, README updated | ✅ Done — contract deployed (and redeployed with `get_total_policies`) to hosted Studio; frontend deployed and live on Vercel (Root Directory set to `frontend`, env vars configured); README has quickstart, example flow, and a filled-in "Deployed contract" section. **Remaining:** add the actual live Vercel URL below once confirmed stable. |
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
- **Run `cd frontend && npm install && npm run dev` and fix whatever a
  real build surfaces** — this is untested beyond static syntax-checking
  and should be the very first thing done with this deliverable
- Redeploy the contract to pick up `get_total_policies` (optional, but
  the Transparency feed's auto-enumeration depends on it — it falls back
  to manual ID-range browsing otherwise)
- Run item 6 above (`appeal` / `claim_refund` on a test policy)
- Deploy the frontend somewhere reachable (Vercel is the guide's default)
  and link it from the README's "Deployed contract" section
- Record a demo video and finalize known-limitations/roadmap section
  (Phase 5)
