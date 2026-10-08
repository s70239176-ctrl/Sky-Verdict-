"""
v2 tests: underwriter capital pool, collateral enforcement, risk pricing,
keeper bounty and the keeper queue. Offline (mock SDK), like test_skyverdict.py.

Run with:  pytest tests/direct -v
"""
import pytest

DEPARTURE = 1_700_100_000
ARRIVAL = 1_700_110_000
NOW_AFTER_BUFFER = ARRIVAL + 3 * 60 * 60 + 1
COOLDOWN = 24 * 60 * 60
ALLOWED = [
    "https://www.flightaware.com/live/flight/DAL202",
    "https://www.flightstats.com/v2/flight-tracker/DL/202",
]


def make(env):
    env["message"].sender_address = env["Address"]("0xOWNER")
    c = env["module"].SkyVerdict("0xCREATOR", 0, 10800, False)  # v2 behavior: court off, collateral + pricing ON
    return c


def as_user(env, who, value=0, ts=None):
    env["message"].sender_address = env["Address"](who)
    env["message"].value = value
    if ts is not None:
        env["message"].timestamp = ts


def deposit(env, c, who, amount, ts=DEPARTURE - 50_000):
    as_user(env, who, amount, ts)
    minted = c.deposit_liquidity()
    env["message"].value = 0
    return minted


def buy(env, c, premium=1000, threshold=180, mult=30000, who="0xHOLDER", airline="DL"):
    as_user(env, who, premium, DEPARTURE - 10_000)
    pid = c.create_policy(airline, "DL202", "JFK", DEPARTURE, ARRIVAL,
                          threshold, mult, premium * mult // 10_000)
    env["message"].value = 0
    return pid


def settle(env, c, pid, caller, delay):
    env["exec_prompt"].queue = [
        {"ok": True, "delay_minutes": delay, "cancelled": False, "confidence": 90}
    ] * 4
    as_user(env, caller, 0, NOW_AFTER_BUFFER)
    return c.evaluate_claim(pid, ALLOWED)


# ---------------------------------------------------------------------
# Underwriter shares
# ---------------------------------------------------------------------

class TestLiquidity:
    def test_first_deposit_mints_one_to_one(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        assert deposit(env, c, "0xLP1", 10_000) == 10_000
        pool = c.get_pool()
        assert pool["pool_balance"] == 10_000 and pool["total_shares"] == 10_000
        assert pool["share_price_e6"] == 1_000_000
        assert c.get_underwriter("0xLP1")["value_wei"] == 10_000

    def test_second_deposit_priced_at_book_value(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 10_000)
        buy(env, c)  # +750 net premium raises NAV to 10_750
        minted = deposit(env, c, "0xLP2", 10_750)
        assert minted == 10_000  # same share count as LP1 per unit of NAV paid

    def test_rejects_zero_deposit(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        as_user(env, "0xLP1", 0)
        with pytest.raises(Exception):
            c.deposit_liquidity()

    def test_withdrawal_requires_cooldown(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 10_000)
        as_user(env, "0xLP1", 0, 1_000_000)
        c.request_withdrawal(4_000)
        as_user(env, "0xLP1", 0, 1_000_000 + COOLDOWN - 1)
        with pytest.raises(Exception, match="cooldown"):
            c.execute_withdrawal()
        as_user(env, "0xLP1", 0, 1_000_000 + COOLDOWN)
        assert c.execute_withdrawal() == 4_000
        assert ("0xLP1", 4_000) in env["evm"].transfers
        assert c.get_pool()["pool_balance"] == 6_000
        assert c.get_underwriter("0xLP1")["shares"] == 6_000

    def test_cannot_request_more_than_held(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 1_000)
        as_user(env, "0xLP1")
        with pytest.raises(Exception):
            c.request_withdrawal(1_001)
        as_user(env, "0xSTRANGER")
        with pytest.raises(Exception):
            c.request_withdrawal(1)

    def test_cancel_withdrawal(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 1_000)
        as_user(env, "0xLP1", 0, 5)
        c.request_withdrawal(500)
        c.cancel_withdrawal()
        as_user(env, "0xLP1", 0, 5 + COOLDOWN)
        with pytest.raises(Exception, match="no withdrawal"):
            c.execute_withdrawal()

    def test_reserved_capital_cannot_leave(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 2_000)
        buy(env, c, premium=1000, mult=30000)  # pool 2750, reserved 2250, free 500
        assert c.get_pool()["free_capital"] == 500
        as_user(env, "0xLP1", 0, DEPARTURE)
        c.request_withdrawal(2_000)  # worth 2000 > 500 free
        as_user(env, "0xLP1", 0, DEPARTURE + COOLDOWN)
        with pytest.raises(Exception, match="reserved"):
            c.execute_withdrawal()
        # a smaller exit within free capital is fine
        c.cancel_withdrawal()
        c.request_withdrawal(300)  # 300 shares ~ 412 wei < 500 free
        as_user(env, "0xLP1", 0, DEPARTURE + 2 * COOLDOWN)
        assert c.execute_withdrawal() > 0

    def test_exit_after_loss_realizes_the_loss(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 5_000)
        pid = buy(env, c, premium=1000, mult=30000)  # pool 5750
        settle(env, c, pid, "0xHOLDER", delay=200)   # pays 2250 -> pool 3500
        assert c.get_policy(pid)["status"] == "PAID"
        assert c.get_pool()["pool_balance"] == 3_500
        assert c.get_underwriter("0xLP1")["value_wei"] == 3_500  # < 5000 deposited


# ---------------------------------------------------------------------
# Collateral
# ---------------------------------------------------------------------

class TestCollateral:
    def test_rejected_without_capital(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        with pytest.raises(Exception, match="underwriting capital"):
            buy(env, c, premium=1000, mult=30000)

    def test_accepted_with_capital_and_reserves_liability(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 5_000)
        pid = buy(env, c, premium=1000, mult=30000)
        assert c.get_policy(pid)["reserved_wei"] == 2250
        pool = c.get_pool()
        assert pool["reserved_exposure"] == 2250
        assert pool["utilization_bps"] == 2250 * 10_000 // 5750

    def test_capacity_exhausts_then_new_deposit_reopens_it(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 1_600)
        buy(env, c, premium=1000, mult=30000)  # pool 2350, reserved 2250
        with pytest.raises(Exception, match="underwriting capital"):
            buy(env, c, premium=1000, mult=30000)
        deposit(env, c, "0xLP2", 5_000)
        assert buy(env, c, premium=1000, mult=30000) == 2

    def test_settlement_releases_reserve_so_payout_is_always_full(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 5_000)
        pid = buy(env, c)
        settle(env, c, pid, "0xHOLDER", delay=200)
        p = c.get_policy(pid)
        assert p["status"] == "PAID" and p["payout_amount_wei"] == 2250
        assert c.get_pool()["reserved_exposure"] == 0 and p["reserved_wei"] == 0

    def test_no_payout_releases_reserve_and_premium_stays_with_lps(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 5_000)
        pid = buy(env, c)
        settle(env, c, pid, "0xHOLDER", delay=5)
        assert c.get_pool()["reserved_exposure"] == 0
        assert c.get_underwriter("0xLP1")["value_wei"] == 5_750  # earned the premium

    def test_refund_releases_reserve(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 5_000)
        pid = buy(env, c)
        as_user(env, "0xHOLDER", 0, ARRIVAL + 14 * 24 * 3600 + 1)
        c.claim_refund(pid)
        assert c.get_policy(pid)["status"] == "REFUNDED"
        assert c.get_pool()["reserved_exposure"] == 0

    def test_admin_can_disable_collateral(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        as_user(env, "0xOWNER")
        c.admin_set_collateral_required(False)
        assert buy(env, c) == 1

    def test_admin_toggles_owner_only(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        as_user(env, "0xATTACKER")
        for fn, arg in [(c.admin_set_collateral_required, False),
                        (c.admin_set_pricing_enforced, False)]:
            with pytest.raises(Exception, match="owner"):
                fn(arg)


# ---------------------------------------------------------------------
# Risk pricing
# ---------------------------------------------------------------------

class TestPricing:
    def test_quote_matches_enforced_maximum(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        q = c.get_quote("DL", "JFK", 60, 10_000)
        # base 2000 * 1.0 + 300 cancellation = 2300 bps
        assert q["risk_bps"] == 2300
        assert q["max_multiplier_bps"] == 8500 * 10_000 // 2300
        assert q["recommended_premium_wei"] > 0

    def test_longer_threshold_is_cheaper_risk(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        r = [c.get_quote("DL", "JFK", t, 1_000)["risk_bps"] for t in (30, 60, 120, 180, 240)]
        assert r == sorted(r, reverse=True) and len(set(r)) == 5

    def test_absurd_multiplier_rejected(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 10**9)
        with pytest.raises(Exception, match="risk-priced maximum"):
            buy(env, c, premium=1000, threshold=60, mult=1_000_000)  # 100x

    def test_multiplier_at_quoted_maximum_accepted(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 10**9)
        m = c.get_quote("DL", "JFK", 60, 1_000)["max_multiplier_bps"]
        assert buy(env, c, premium=1000, threshold=60, mult=m) == 1

    def test_owner_tuning_changes_price_both_ways(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        as_user(env, "0xOWNER")
        base = c.get_quote("XX", "AAA", 60, 1_000)["max_multiplier_bps"]
        c.admin_set_airline_risk("xx", 4000)
        worse = c.get_quote("XX", "AAA", 60, 1_000)["max_multiplier_bps"]
        c.admin_set_airport_risk("aaa", 5000)  # calmer airport
        better = c.get_quote("XX", "AAA", 60, 1_000)["max_multiplier_bps"]
        assert worse < better and worse < base

    def test_admin_risk_bounds(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        as_user(env, "0xOWNER")
        with pytest.raises(Exception):
            c.admin_set_airline_risk("DL", 0)
        with pytest.raises(Exception):
            c.admin_set_airport_risk("JFK", 50_000)

    def test_quote_reports_capacity(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        assert c.get_quote("DL", "JFK", 60, 10_000)["capacity_ok"] is False
        deposit(env, c, "0xLP1", 1_000_000)
        assert c.get_quote("DL", "JFK", 60, 10_000)["capacity_ok"] is True


# ---------------------------------------------------------------------
# Keeper bounty + queue
# ---------------------------------------------------------------------

class TestKeeper:
    def test_keeper_paid_from_protocol_fees(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 5_000)
        pid = buy(env, c)
        fees_before = c.get_pool()["protocol_fees_accrued"]  # 50
        settle(env, c, pid, "0xKEEPER", delay=200)
        bounty = 750 * 300 // 10_000  # 3% of net premium = 22
        assert ("0xKEEPER", bounty) in env["evm"].transfers
        assert c.get_policy(pid)["keeper_bounty_wei"] == bounty
        assert c.get_pool()["protocol_fees_accrued"] == fees_before - bounty
        # LP capital untouched by the bounty: pool only paid the holder
        assert c.get_pool()["pool_balance"] == 5_750 - 2_250

    def test_holder_settling_own_claim_earns_no_bounty(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 5_000)
        pid = buy(env, c)
        settle(env, c, pid, "0xHOLDER", delay=200)
        assert c.get_policy(pid)["keeper_bounty_wei"] == 0
        assert all(to != "0xHOLDER" or amt == 2250 for to, amt in env["evm"].transfers)

    def test_no_quorum_pays_no_bounty(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 5_000)
        pid = buy(env, c)
        env["exec_prompt"].queue = [
            {"ok": False, "delay_minutes": 0, "cancelled": False, "confidence": 0}
        ] * 4
        as_user(env, "0xKEEPER", 0, NOW_AFTER_BUFFER)
        c.evaluate_claim(pid, ALLOWED)
        assert c.get_claim_status(pid) == "INDETERMINATE"
        assert not any(to == "0xKEEPER" for to, _ in env["evm"].transfers)
        assert c.get_pool()["reserved_exposure"] > 0  # still reserved

    def test_bounty_capped_by_available_fees(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 5_000)
        pid = buy(env, c)
        as_user(env, "0xOWNER")
        c.admin_withdraw_protocol_fees("0xOWNER", 50)  # drain the fee fund
        settle(env, c, pid, "0xKEEPER", delay=200)
        assert c.get_policy(pid)["keeper_bounty_wei"] == 0
        assert c.get_policy(pid)["status"] == "PAID"

    def test_keeper_queue_lists_only_settleable(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 50_000)
        a = buy(env, c)
        b = buy(env, c)
        as_user(env, "0xK", 0, DEPARTURE)  # before the buffer
        assert c.get_keeper_queue(10) == []
        as_user(env, "0xK", 0, NOW_AFTER_BUFFER)
        assert c.get_keeper_queue(10) == [b, a]
        assert c.get_keeper_queue(1) == [b]
        settle(env, c, a, "0xK", delay=5)
        assert c.get_keeper_queue(10) == [b]
        as_user(env, "0xK", 0, ARRIVAL + 15 * 24 * 3600)  # expired
        assert c.get_keeper_queue(10) == []


# ---------------------------------------------------------------------
# Real-GenVM clock: no gl.message.timestamp, only gl.message_raw["datetime"]
# (a live run showed the cooldown stuck at 1970 before this was handled)
# ---------------------------------------------------------------------

class TestRealRuntimeClock:
    ISO = "2023-11-14T22:13:20Z"      # == 1_700_000_000
    EPOCH = 1_700_000_000

    def _runtime_clock(self, env, iso):
        env["message"].timestamp = 0   # falsy -> contract must use message_raw
        gl = env["module"].gl
        if iso is None:
            gl.message_raw = {}
        else:
            gl.message_raw = {"datetime": iso}

    def test_cooldown_uses_message_raw_datetime(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 1_000)
        self._runtime_clock(env, self.ISO)
        as_user(env, "0xLP1")
        c.request_withdrawal(100)
        assert c.get_underwriter("0xLP1")["withdraw_unlock_utc"] == self.EPOCH + COOLDOWN
        with pytest.raises(Exception, match="cooldown"):
            c.execute_withdrawal()
        self._runtime_clock(env, "2023-11-15T22:13:20Z")   # +24h
        as_user(env, "0xLP1")
        assert c.execute_withdrawal() == 100

    def test_fails_closed_without_any_clock(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 1_000)
        self._runtime_clock(env, None)
        as_user(env, "0xLP1")
        with pytest.raises(Exception, match="time unavailable"):
            c.request_withdrawal(100)

    def test_time_rules_now_apply_on_real_runtime(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)
        deposit(env, c, "0xLP1", 5_000)
        pid = buy(env, c)
        # arrival + 1h: still inside the 3h settlement buffer
        arr_iso = __import__("datetime").datetime.fromtimestamp(
            ARRIVAL + 3600, tz=__import__("datetime").timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        self._runtime_clock(env, arr_iso)
        as_user(env, "0xKEEPER")
        env["exec_prompt"].queue = [{"ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90}] * 4
        with pytest.raises(Exception, match="buffer"):
            c.evaluate_claim(pid, ALLOWED)
