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
