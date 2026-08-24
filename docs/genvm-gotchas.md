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

## 8. Even read-only `gen_call` requests need a `from` address
**Symptom:** `viem` wraps it as a generic `An unknown RPC error occurred.
Details: 'from'` — easy to misread as some obscure viem/transport problem.
The `'from'` in quotes with nothing else around it is actually the string
form of a raw Python `KeyError: 'from'` leaking through from the RPC
backend, which strongly suggests server-side code doing an unguarded
`params['from']` lookup.
**Fix:** unlike a typical Ethereum `eth_call`, which is happy to run
anonymously with no `from`, this GenLayer RPC backend appears to require
one on every request — including pure view-method reads. A
`createClient({ chain })` with no `account` at all (e.g. for reads before
a user has connected any wallet) omits `from` entirely and trips this.
Give even the anonymous read path a throwaway `createAccount()` so every
request always has *some* address to send as `from` — see
`getReadOnlyAccount()` in `frontend/src/lib/genlayerClient.js`. It never
signs anything and is unrelated to (and never shown as) a connected
wallet.

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
