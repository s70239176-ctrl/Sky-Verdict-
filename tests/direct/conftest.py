"""
Lightweight mock of the `genlayer` SDK for fast, offline unit tests.

These tests exercise SkyVerdict's DETERMINISTIC logic (policy math, fee
accounting, verdict aggregation, state transitions) without spinning up
GenVM / GenLayer Studio. Non-deterministic paths (web fetch + LLM
extraction) are stubbed with a controllable fake so evaluate_claim's
consensus wiring can be exercised too.

For true end-to-end validator-consensus testing against real (or
simulated) LLM + web behavior, see tests/integration/, which runs
against GenLayer Studio via the `gltest` CLI as described in README.md.
"""
import sys
import types
import builtins
import pytest


class FakeAddress:
    def __init__(self, value: str):
        self.value = value

    @property
    def as_hex(self):
        return self.value

    def __eq__(self, other):
        return isinstance(other, FakeAddress) and self.value == other.value

    def __hash__(self):
        return hash(self.value)

    def __repr__(self):
        return f"Address({self.value})"


class FakeTreeMap(dict):
    """dict already satisfies every TreeMap usage pattern in the contract."""
    pass


class FakeDynArray(list):
    pass


def _u256(x):
    return int(x)


class FakeMessage:
    sender_address = FakeAddress("0xUSER")
    value = 0
    timestamp = 1_700_000_000  # fixed "now" for deterministic tests


class _FakeResult:
    """Stand-in for genlayer.vm.Return — carries the leader's raw value."""
    def __init__(self, v):
        self.calldata = v


class FakeVM:
    @staticmethod
    def run_nondet(leader_fn, validator_fn):
        # In real GenVM, leader and validator run in isolated sandboxes on
        # different nodes and their agreement is what finalizes state. In
        # this offline mock we just run leader then validator and assert
        # they agree, mirroring the consensus check.
        leader_result = leader_fn()
        ok = validator_fn(_FakeResult(leader_result))
        if not ok:
            raise Exception("MockConsensus: validator disagreed with leader")
        return leader_result

    @staticmethod
    def unpack_result(res):
        # Mirrors genlayer.vm.unpack_result: extract the value from a
        # Return-like result (mock never models VMError/UserError paths).
        return res.calldata


class FakeContractProxy:
    """Stand-in for gl.ContractAt(address) — only emit_transfer is used."""
    def __init__(self, address, evm_sink):
        self.address = address
        self._evm_sink = evm_sink

    def emit_transfer(self, value):
        self._evm_sink.transfers.append(
            (self.address.as_hex if hasattr(self.address, "as_hex") else self.address, int(value))
        )


class FakeEVM:
    def __init__(self):
        self.transfers = []  # list of (to_hex, amount)


class FakeNondetWeb:
    """Test controls what each URL 'renders' to via `responses` dict."""

    def __init__(self):
        self.responses = {}  # url -> str, or Exception instance to raise

    def render(self, url, mode="text"):
        resp = self.responses.get(url, "")
        if isinstance(resp, Exception):
            raise resp
        return resp


class FakeNondetExecPrompt:
    """Test controls what each call returns via a queue keyed by URL match."""

    def __init__(self):
        # list of dicts, consumed in order that leader_fn/validator_fn call it
        self.queue = []

    def __call__(self, prompt, response_format="text", **kwargs):
        if not self.queue:
            return {"ok": False, "delay_minutes": 0, "cancelled": False, "confidence": 0}
        return self.queue.pop(0)


@pytest.fixture
def fake_gl_env(monkeypatch):
    """
    Installs a fake `genlayer` module into sys.modules with a `gl`
    namespace matching the subset of the real SDK SkyVerdict.py uses, then
    imports the contract fresh so it binds to the fake.
    Returns a dict of handles the test can drive (message, web, prompts, evm).
    """
    mod = types.ModuleType("genlayer")

    fake_message = FakeMessage()
    fake_web = FakeNondetWeb()
    fake_exec_prompt = FakeNondetExecPrompt()
    fake_evm = FakeEVM()
    fake_vm = FakeVM()

    def _contract_at(address):
        return FakeContractProxy(address, fake_evm)

    class GLNamespace:
        message = fake_message
        evm = fake_evm
        vm = fake_vm
        ContractAt = staticmethod(_contract_at)

        class nondet:
            web = fake_web
            exec_prompt = staticmethod(fake_exec_prompt)

        class Contract:
            def __init_subclass__(cls, **kwargs):
                super().__init_subclass__(**kwargs)
                user_init = cls.__dict__.get("__init__")
                annotations = getattr(cls, "__annotations__", {})

                def zero_init_wrapper(self, *args, **kwargs):
                    # Mirrors real GenVM: storage fields start zero-initialized
                    # (empty TreeMap/DynArray) before the user's __init__ runs,
                    # so contracts that never explicitly assign them still work.
                    for name, ann in annotations.items():
                        origin = getattr(ann, "__origin__", ann)
                        if origin is _FakeTreeMapType or ann is _FakeTreeMapType:
                            setattr(self, name, _FakeTreeMapType())
                        elif origin is _FakeDynArrayType or ann is _FakeDynArrayType:
                            setattr(self, name, _FakeDynArrayType())
                    if user_init is not None:
                        user_init(self, *args, **kwargs)

                cls.__init__ = zero_init_wrapper

        class public:
            @staticmethod
            def write(fn=None):
                if fn is None:
                    return lambda f: f
                return fn

            class write_payable_ns:
                def __call__(self, fn):
                    return fn

            @staticmethod
            def view(fn):
                return fn

        # attach .payable to write as GenLayer's real decorator does
        public.write.payable = staticmethod(lambda fn: fn)

    def _address_ctor(v):
        return FakeAddress(v)

    def _u256_ctor(v):
        return int(v)

    def _allow_storage(cls):
        return cls

    import dataclasses as _dataclasses

    # Populate module-level names consumed by `from genlayer import *`
    class _FakeTreeMapType(FakeTreeMap):
        def __class_getitem__(cls, item):
            return cls

    class _FakeDynArrayType(FakeDynArray):
        def __class_getitem__(cls, item):
            return cls

    mod.gl = GLNamespace
    mod.Address = _address_ctor
    mod.u256 = _u256_ctor
    mod.TreeMap = _FakeTreeMapType
    mod.DynArray = _FakeDynArrayType
    mod.allow_storage = _allow_storage
    mod.__all__ = [
        "gl", "Address", "u256", "TreeMap", "DynArray", "allow_storage",
    ]
    # NOTE: real `genlayer` does NOT export `dataclass` via `from genlayer import *`
    # (confirmed by a live deploy NameError) — intentionally omitted here so this
    # mock stays faithful and the contract must import it from stdlib itself.

    monkeypatch.setitem(sys.modules, "genlayer", mod)

    # Force a fresh import of the contract module bound to the fake SDK
    sys.modules.pop("SkyVerdict", None)
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "SkyVerdict", "/home/claude/skyverdict/contracts/SkyVerdict.py"
    )
    contract_mod = importlib.util.module_from_spec(spec)
    sys.modules["SkyVerdict"] = contract_mod
    spec.loader.exec_module(contract_mod)

    return {
        "module": contract_mod,
        "message": fake_message,
        "web": fake_web,
        "exec_prompt": fake_exec_prompt,
        "evm": fake_evm,
        "Address": FakeAddress,
    }
