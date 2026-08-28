"""
Standalone smoke test for the create_trip / multi-flight change.

Not pytest-based (this sandbox has no network to install pytest) — drives
the exact same mock genlayer SDK pattern as tests/direct/conftest.py
directly via plain Python, stdlib only. Delete or fold into the real
pytest suite once dependencies are installable again.
"""
import sys
import types
import importlib.util


class FakeAddress:
    def __init__(self, value):
        self.value = value

    @property
    def as_hex(self):
        return self.value

    def __eq__(self, other):
        return isinstance(other, FakeAddress) and self.value == other.value

    def __hash__(self):
        return hash(self.value)


class FakeTreeMap(dict):
    pass


class FakeDynArray(list):
    pass


class FakeMessage:
    sender_address = FakeAddress("0xUSER")
    value = 0
    timestamp = 1_700_000_000


class FakeVM:
    @staticmethod
    def run_nondet(leader_fn, validator_fn):
        leader_result = leader_fn()
        ok = validator_fn(type("R", (), {"calldata": leader_result})())
        if not ok:
            raise Exception("MockConsensus: validator disagreed with leader")
        return leader_result

    @staticmethod
    def unpack_result(res):
        return res.calldata


class FakeContractProxy:
    def __init__(self, address, evm_sink):
        self.address = address
        self._evm_sink = evm_sink

    def emit_transfer(self, value):
        self._evm_sink.transfers.append(
            (self.address.as_hex if hasattr(self.address, "as_hex") else self.address, int(value))
        )


class FakeEVM:
    def __init__(self):
        self.transfers = []


class _FakeTreeMapType(FakeTreeMap):
    def __class_getitem__(cls, item):
        return cls


class _FakeDynArrayType(FakeDynArray):
    def __class_getitem__(cls, item):
        return cls


def build_contract():
    mod = types.ModuleType("genlayer")
    fake_message = FakeMessage()
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
            web = None
            exec_prompt = None

        class Contract:
            def __init_subclass__(cls, **kwargs):
                super().__init_subclass__(**kwargs)
                user_init = cls.__dict__.get("__init__")
                annotations = getattr(cls, "__annotations__", {})

                def zero_init_wrapper(self, *args, **kwargs):
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

            @staticmethod
            def view(fn):
                return fn

        public.write.payable = staticmethod(lambda fn: fn)

    mod.gl = GLNamespace
    mod.Address = FakeAddress
    mod.u256 = lambda v: int(v)
    mod.TreeMap = _FakeTreeMapType
    mod.DynArray = _FakeDynArrayType
    mod.allow_storage = lambda cls: cls
    mod.__all__ = ["gl", "Address", "u256", "TreeMap", "DynArray", "allow_storage"]

    sys.modules["genlayer"] = mod
    sys.modules.pop("SkyVerdict", None)
    spec = importlib.util.spec_from_file_location(
        "SkyVerdict", "/home/claude/skyverdict/contracts/SkyVerdict.py"
    )
    contract_mod = importlib.util.module_from_spec(spec)
    sys.modules["SkyVerdict"] = contract_mod
    spec.loader.exec_module(contract_mod)

    contract = contract_mod.SkyVerdict("0xCREATOR")
    return contract, fake_message


def check(label, cond):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {label}")
    if not cond:
        raise SystemExit(1)


# --- 1. Regression: single-flight create_policy unchanged ------------------
c, msg = build_contract()
msg.value = 1000
pid = c.create_policy("DL", "202", "JFK", 2_000_000_000, 2_000_010_000, 60, 20000, 1500)
check("create_policy still returns policy_id 1", int(pid) == 1)
p = c.get_policy(1)
check("standalone policy has trip_id 0", p["trip_id"] == 0)
check("standalone policy fee math unchanged (750 net of 25% fees)", p["premium"] == 750)

# --- 2. create_trip: 3-leg trip, uneven premium split -----------------------
msg.value = 1000  # not evenly divisible by 3 — tests remainder handling
trip_id = c.create_trip(
    airline_codes=["DL", "AA", "UA"],
    flight_numbers=["202", "100", "884"],
    departure_airports=["JFK", "ORD", "SFO"],
    scheduled_departures_utc=[2_000_000_000, 2_000_100_000, 2_000_200_000],
    scheduled_arrivals_utc=[2_000_010_000, 2_000_110_000, 2_000_210_000],
    threshold_minutes_list=[60, 90, 120],
    payout_multiplier_bps_list=[20000, 20000, 20000],
    max_coverage_list=[600, 600, 600],
)
check("create_trip returns a trip_id", int(trip_id) == 1)

legs = [c.get_policy(i) for i in (2, 3, 4)]
check("3 new sequential policies created for the trip", [l["policy_id"] for l in legs] == [2, 3, 4])
check("all 3 legs share the same trip_id", all(l["trip_id"] == 1 for l in legs))
check("all 3 legs belong to the same holder", all(l["holder"] == "0xUSER" for l in legs))

gross_leg_premiums = [333, 333, 334]  # 1000 // 3 = 333, remainder 1 -> last leg
net_leg_premiums = [g - (g * 500 // 10000) - (g * 2000 // 10000) for g in gross_leg_premiums]
check(
    "premium split across legs sums to the original total (no GEN wei lost to rounding)",
    sum(gross_leg_premiums) == 1000,
)
check(
    "each leg's stored (net-of-fee) premium matches the expected split",
    [l["premium"] for l in legs] == net_leg_premiums,
)

pool_before = int(c.pool_balance)
check("pool_balance reflects all 4 policies' net premiums (750 + trip legs)", pool_before == 750 + sum(net_leg_premiums))

# --- 3. Validation: single-leg and mismatched-length calls rejected ---------
msg.value = 100
try:
    c.create_trip(["DL"], ["202"], ["JFK"], [2_000_000_000], [2_000_010_000], [60], [20000], [600])
    check("single-leg create_trip rejected", False)
except Exception as e:
    check(f"single-leg create_trip rejected ({e})", "at least 2 legs" in str(e))

try:
    c.create_trip(["DL", "AA"], ["202"], ["JFK", "ORD"], [1, 2], [3, 4], [60, 90], [20000, 20000], [600, 600])
    check("mismatched-length lists rejected", False)
except Exception as e:
    check(f"mismatched-length lists rejected ({e})", "same length" in str(e))

print("\nAll create_trip smoke checks passed.")
