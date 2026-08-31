# Agent-native purchasing & Internet Court

## What's real today

Every SkyVerdict contract method is a public write function — any
funded GenLayer wallet can call it, whether it's controlled by a human
clicking through the frontend or an autonomous agent acting on someone's
behalf. Nothing about the contract changes based on who's calling it.

`create_policy_from_text` (see `docs/genvm-gotchas.md` gotcha #15) is
deliberately the most agent-friendly entrypoint: it takes a plain-English
description rather than a rigid parameter encoding, which is exactly the
interface an LLM-based agent wants — no need to pre-know exact field
names or units, just describe the coverage.

`skills/skyverdict-agent/SKILL.md` documents this real interface in the
Claude Skills format, so an agent framework can discover and correctly
call SkyVerdict without hand-written, per-framework custom integration
code. That's the actual, buildable, verified piece of "agent-native
purchasing" — an AI travel-booking agent could call
`create_policy_from_text` on a client's behalf today, using the exact
same contract every human user does.

## What this is *not* — and why that's deliberate, not an oversight

[Internet Court](https://genlayer.com) (launched July 10, 2026, led by
the GenLayer Foundation, backed by a 27-company consortium including
MetaMask and OKX) is a broader standard for disputes *between two
autonomous AI agents* transacting with each other — its flagship
production case is OKX's AI agent marketplace. It links identity
(ERC-7857/8004), negotiation (A2A), payment/escrow (x402/MPP/APP), and
dispute resolution, where GenLayer is one of several pluggable jury
providers alongside Kleros and UMA.

SkyVerdict's actual problem shape is different: a human (or their agent)
buys parametric insurance, and the "dispute" is really an empirical
question — did this real flight actually get delayed — not a
disagreement between two transacting agents. That's much closer to
GenLayer's own **Intelligent Oracle** pattern (explicitly named for
"prediction markets & insurance" in GenLayer's own materials) than to
Internet Court's agent-dispute framing.

The genuinely true, worth-stating-in-a-pitch fact: **SkyVerdict's
`evaluate_claim`/`appeal` already run on the identical underlying
engine** — GenVM, Intelligent Contracts, Optimistic Democracy consensus
— that powers Internet Court's dispute layer. SkyVerdict doesn't need to
"integrate with" that adjudication engine because it's already built
directly on top of it.

## What a *real* deeper integration would require

If genuine ERC-7710 delegated-authority purchasing is wanted later (a
human granting an agent a scoped, limited spending permission before the
agent ever calls SkyVerdict, rather than the agent holding unrestricted
wallet access), that requires:

- Verifying an EVM-native ERC-7710 delegation signature from inside a
  GenLayer Intelligent Contract — genuinely unclear whether/how GenVM's
  execution environment supports this today; not something confirmable
  without live testing against infrastructure that's only weeks old.
- Real integration with MetaMask's Smart Accounts Kit and/or an x402
  payment handler — see
  [github.com/internet-court/internet-court-skill](https://github.com/internet-court/internet-court-skill)
  for the actual connector components other teams have published.

Deliberately not attempted here — writing confident-looking code against
unverified, brand-new multi-protocol infrastructure is exactly the
mistake this project has spent significant effort avoiding elsewhere
(see the whole of `docs/genvm-gotchas.md`). Worth pursuing with real
testing time, not as a same-session addition.
