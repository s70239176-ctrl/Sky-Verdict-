"""
Standalone smoke tests for create_trip (multi-flight) and
create_policy_from_text (natural-language policy creation).

Not pytest-based (this sandbox has no network to install pytest) — drives
the exact same mock genlayer SDK pattern as tests/direct/conftest.py
directly via plain Python, stdlib only. Delete or fold into the real
pytest suite once dependencies are installable again.
"""
import sys
import types
import importlib.util
import json


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


def build_contract(fake_exec_prompt=None, fake_web_render=None):
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
            web = types.SimpleNamespace(render=staticmethod(fake_web_render)) if fake_web_render else None
            exec_prompt = staticmethod(fake_exec_prompt) if fake_exec_prompt else None

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

# --- 4. create_policy_from_text: valid extraction, no explicit cap ---------
def fake_exec_prompt_valid(prompt, response_format=None):
    return {
        "ok": True,
        "airline_code": "DL",
        "flight_number": "202",
        "departure_airport": "JFK",
        "threshold_minutes": 90,
        "payout_multiplier_bps": 30000,  # "3x premium"
        "max_coverage": 0,  # not stated -> should default to premium * multiplier
        "reason": "",
    }

c2, msg2 = build_contract(fake_exec_prompt=fake_exec_prompt_valid)
msg2.value = 500
pid = c2.create_policy_from_text(
    description="Cover DL202 from JFK delayed more than 90 minutes for up to 3x premium.",
    scheduled_departure_utc=2_000_000_000,
    scheduled_arrival_utc=2_000_010_000,
)
check("create_policy_from_text creates policy_id 1", int(pid) == 1)
p = c2.get_policy(1)
check("extracted airline/flight/airport landed correctly", (p["airline_code"], p["flight_number"], p["departure_airport"]) == ("DL", "202", "JFK"))
check("extracted threshold_minutes landed correctly", p["threshold_minutes"] == 90)
check("extracted payout_multiplier_bps landed correctly", p["payout_multiplier_bps"] == 30000)
# unstated max_coverage defaults to the theoretical max: net-of-fee premium
# isn't used for this bound (matches _open_policy: bound is on GROSS premium)
expected_max_coverage = 500 * 30000 // 10000
check(f"unstated max_coverage defaulted to premium*multiplier ({expected_max_coverage})", p["max_coverage"] == expected_max_coverage)

# --- 5. create_policy_from_text: explicit max_coverage stated ---------------
def fake_exec_prompt_with_cap(prompt, response_format=None):
    return {
        "ok": True,
        "airline_code": "AA",
        "flight_number": "100",
        "departure_airport": "ORD",
        "threshold_minutes": 60,
        "payout_multiplier_bps": 20000,
        "max_coverage": 400,  # explicitly stated, below the theoretical max
        "reason": "",
    }

c3, msg3 = build_contract(fake_exec_prompt=fake_exec_prompt_with_cap)
msg3.value = 500
pid3 = c3.create_policy_from_text(
    description="Cover AA100 from ORD, threshold 60 min, 2x, max 400.",
    scheduled_departure_utc=2_000_000_000,
    scheduled_arrival_utc=2_000_010_000,
)
p3 = c3.get_policy(int(pid3))
check("explicitly stated max_coverage is honored, not overridden", p3["max_coverage"] == 400)

# --- 6. create_policy_from_text: incomplete extraction fails closed --------
def fake_exec_prompt_incomplete(prompt, response_format=None):
    call_count = fake_exec_prompt_incomplete.calls = getattr(fake_exec_prompt_incomplete, "calls", 0) + 1
    return {
        "ok": True,  # model claims success, but required fields are missing —
        "airline_code": "",  # this tests the contract's OWN re-validation,
        "flight_number": "",  # not just trusting the model's self-report
        "departure_airport": "",
        "threshold_minutes": 0,
        "payout_multiplier_bps": 0,
        "max_coverage": 0,
        # Deliberately DIFFERENT free text on each call (leader vs
        # validator) — simulates two independent LLM calls phrasing the
        # same conclusion differently. This is the regression test for
        # gotcha #17: the fix must tolerate this and still agree on the
        # meaningful fields, rather than failing consensus over wording.
        "reason": f"missing required flight details (call #{call_count})",
    }

c4, msg4 = build_contract(fake_exec_prompt=fake_exec_prompt_incomplete)
msg4.value = 500
try:
    c4.create_policy_from_text(
        description="cover my flight please",
        scheduled_departure_utc=2_000_000_000,
        scheduled_arrival_utc=2_000_010_000,
    )
    check("incomplete extraction rejected despite model's own ok:true", False)
except Exception as e:
    check(f"incomplete extraction rejected, fails closed ({e})", "couldn't understand" in str(e))
check("no policy was created on the failed attempt (next_policy_id unchanged)", int(c4.next_policy_id) == 1)

# --- 7. create_policy_from_text: arrival before departure rejected up front -
c5, msg5 = build_contract(fake_exec_prompt=fake_exec_prompt_valid)
msg5.value = 500
try:
    c5.create_policy_from_text(
        description="Cover DL202 from JFK delayed more than 90 minutes for up to 3x premium.",
        scheduled_departure_utc=2_000_010_000,
        scheduled_arrival_utc=2_000_000_000,  # before departure
    )
    check("arrival-before-departure rejected", False)
except Exception as e:
    check(f"arrival-before-departure rejected before any LLM call ({e})", "arrival must be after departure" in str(e))

print("\nAll create_policy_from_text smoke checks passed.")

# --- 8. classify_delay_cause: rejected on an unresolved (ACTIVE) policy ----
c6, msg6 = build_contract()
msg6.value = 1000
c6.create_policy("AA", "100", "JFK", 2_000_000_000, 2_000_010_000, 60, 20000, 1500)
try:
    c6.classify_delay_cause(1, "https://www.flightaware.com/live/flight/AAL100")
    check("classify_delay_cause rejected on ACTIVE policy", False)
except Exception as e:
    check(f"classify_delay_cause rejected on ACTIVE policy ({e})", "must already have a resolved verdict" in str(e))

# --- 9. classify_delay_cause: rejected for a non-allowlisted domain -------
c6b, msg6b = build_contract()
msg6b.value = 1000
c6b.create_policy("AA", "100", "JFK", 2_000_000_000, 2_000_010_000, 60, 20000, 1500)
p6b = c6b.policies[c6b.next_policy_id.__class__(1)] if False else c6b.get_policy(1)
# manually mark resolved (bypasses evaluate_claim's own untested-here web
# pipeline — that pipeline is verified separately, in Studio)
stored = c6b.policies[1]
stored.status = "PAID"
c6b.policies[1] = stored
try:
    c6b.classify_delay_cause(1, "https://not-allowlisted.example.com/status")
    check("classify_delay_cause rejected for non-allowlisted domain", False)
except Exception as e:
    check(f"classify_delay_cause rejected for non-allowlisted domain ({e})", "not allowlisted" in str(e))

# --- 10. classify_delay_cause: successful consensus on a resolved policy --
def fake_web_render_ok(url, mode=None):
    return "The airline cited a mechanical issue with the aircraft, delaying departure by 2 hours."

def fake_exec_prompt_airline_fault(prompt, response_format=None):
    # Deliberately varying free text on each call — see gotcha #17.
    # This is the actual bug that shipped: an earlier version of this
    # test used identical text on every call (since it's a fixed
    # function), which meant the offline mock could never have caught
    # the exact-dict-comparison bug in the first place. A call counter
    # simulates two genuinely independent LLM calls agreeing on
    # substance but differing in wording — exactly what real leader and
    # validator calls do.
    n = fake_exec_prompt_airline_fault.calls = getattr(fake_exec_prompt_airline_fault, "calls", 0) + 1
    return {"cause": "airline_fault", "explanation": f"mechanical issue cited (phrasing #{n})"}

c7, msg7 = build_contract(fake_exec_prompt=fake_exec_prompt_airline_fault, fake_web_render=fake_web_render_ok)
msg7.value = 1000
c7.create_policy("AA", "100", "JFK", 2_000_000_000, 2_000_010_000, 60, 20000, 1500)
stored7 = c7.policies[1]
stored7.status = "PAID"
c7.policies[1] = stored7

result_json = c7.classify_delay_cause(1, "https://www.flightaware.com/live/flight/AAL100")
result = json.loads(result_json)
check("classify_delay_cause returns airline_fault as classified", result["cause"] == "airline_fault")

p7_after = c7.get_policy(1)
check("delay_cause_json is persisted on the policy", json.loads(p7_after["delay_cause_json"])["cause"] == "airline_fault")
check("policy status/premium untouched by classification (informational only)", p7_after["status"] == "PAID" and p7_after["premium"] == 750)

# --- 11. classify_delay_cause: an invalid model response falls back to "unclear" ---
def fake_exec_prompt_garbage(prompt, response_format=None):
    return {"cause": "definitely the airline's fault, obviously", "explanation": "x" * 500}

c8, msg8 = build_contract(fake_exec_prompt=fake_exec_prompt_garbage, fake_web_render=fake_web_render_ok)
msg8.value = 1000
c8.create_policy("AA", "100", "JFK", 2_000_000_000, 2_000_010_000, 60, 20000, 1500)
stored8 = c8.policies[1]
stored8.status = "EXPIRED_NO_PAYOUT"
c8.policies[1] = stored8

result8 = json.loads(c8.classify_delay_cause(1, "https://www.flightaware.com/live/flight/AAL100"))
check("an out-of-enum cause value falls back to 'unclear' rather than being stored as-is", result8["cause"] == "unclear")
check("an overlong explanation is truncated to 200 chars", len(result8["explanation"]) == 200)

print("\nAll classify_delay_cause smoke checks passed.")

# --- 12. classify_delay_cause: GENUINE disagreement on cause still fails --
def fake_exec_prompt_flip_flop(prompt, response_format=None):
    # Leader and validator genuinely disagree on the substantive
    # classification itself (not just wording) — consensus must still
    # correctly fail in this case. Proves the gotcha #17 fix loosened
    # comparison on free text specifically, without accidentally
    # loosening it on the field that actually matters.
    n = fake_exec_prompt_flip_flop.calls = getattr(fake_exec_prompt_flip_flop, "calls", 0) + 1
    cause = "airline_fault" if n == 1 else "weather_or_atc"
    return {"cause": cause, "explanation": "some explanation"}

c9, msg9 = build_contract(fake_exec_prompt=fake_exec_prompt_flip_flop, fake_web_render=fake_web_render_ok)
msg9.value = 1000
c9.create_policy("AA", "100", "JFK", 2_000_000_000, 2_000_010_000, 60, 20000, 1500)
stored9 = c9.policies[1]
stored9.status = "PAID"
c9.policies[1] = stored9
try:
    c9.classify_delay_cause(1, "https://www.flightaware.com/live/flight/AAL100")
    check("genuine cause disagreement correctly fails consensus", False)
except Exception as e:
    check(f"genuine cause disagreement correctly fails consensus ({e})", "disagreed" in str(e).lower())

print("\nAll consensus-comparison regression checks passed.")
