"""
v3 tests: bonded challenge court, self-calibrating risk, affiliates, sandbox mode.
Offline (mock SDK), like the other direct tests.

mock note: evaluate_claim with 2 sources consumes 4 exec_prompt results
(leader 2 + validator 2); a challenge with 3 sources consumes 6.
"""
import pytest

DEPARTURE = 1_700_100_000
ARRIVAL = 1_700_110_000
BUFFER = 10_800
NOW = ARRIVAL + BUFFER + 1          # first moment a claim can be evaluated
WINDOW = 3_600
ALLOWED = [
    "https://www.flightaware.com/live/flight/DAL202",
    "https://www.flightstats.com/v2/flight-tracker/DL/202",
]
EXTRA = ["https://www.flightradar24.com/data/flights/dl202"]


def make(env, window=WINDOW, buffer=BUFFER, sandbox=False):
    env["message"].sender_address = env["Address"]("0xOWNER")
    return env["module"].SkyVerdict("0xCREATOR", window, buffer, sandbox)


def as_user(env, who, value=0, ts=None):
    env["message"].sender_address = env["Address"](who)
    env["message"].value = value
    if ts is not None:
        env["message"].timestamp = ts


def fund(env, c, amount=100_000):
    as_user(env, "0xLP", amount, DEPARTURE - 50_000)
    c.deposit_liquidity()
    env["message"].value = 0


def buy(env, c, premium=1000, threshold=180, mult=30000, holder="0xHOLDER",
        airline="DL", ref=None, ts=DEPARTURE - 10_000):
    as_user(env, holder, premium, ts)
    args = (airline, "DL202", "JFK", DEPARTURE, ARRIVAL, threshold, mult, premium * mult // 10_000)
    pid = c.create_policy_referred(ref, *args) if ref else c.create_policy(*args)
    env["message"].value = 0
    return pid


def reads(env, delay, n, ok=True, conf=90):
    env["exec_prompt"].queue = [
        {"ok": ok, "delay_minutes": delay, "cancelled": False, "confidence": conf}
    ] * n


def evaluate(env, c, pid, who="0xEVAL", delay=200, ts=NOW):
    reads(env, delay, 4)
    as_user(env, who, 0, ts)
    return c.evaluate_claim(pid, ALLOWED)


def challenge(env, c, pid, delay, who="0xCHAL", value=None, ts=NOW + 10, n=6, ok=True, extra=EXTRA):
    reads(env, delay, n, ok=ok)
    bond = c.get_challenge_info(pid)["bond_required_wei"] if value is None else value
    as_user(env, who, bond, ts)
    return c.challenge_claim(pid, extra)


def sent(env, to):
    return [a for t, a in env["evm"].transfers if t == to]


# ---------------------------------------------------------------------
# Court: provisional verdicts and finalization
# ---------------------------------------------------------------------

class TestProvisional:
    def test_verdict_is_provisional_and_moves_no_money(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        evaluate(env, c, pid)
        p = c.get_policy(pid)
        assert p["status"] == "PROVISIONAL" and p["provisional_decision"] == "PAYOUT"
        assert p["challenge_deadline_utc"] == NOW + WINDOW
        assert p["payout_amount_wei"] == 0 and p["reserved_wei"] == 2250
        assert env["evm"].transfers == []

    def test_finalize_only_after_window(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        evaluate(env, c, pid)
        as_user(env, "0xFIN", 0, NOW + WINDOW - 1)
        with pytest.raises(Exception, match="window has not closed"):
            c.finalize_claim(pid)
        as_user(env, "0xFIN", 0, NOW + WINDOW)
        assert c.finalize_claim(pid) == "PAYOUT"
        p = c.get_policy(pid)
        assert p["status"] == "PAID" and p["payout_amount_wei"] == 2250
        assert sent(env, "0xHOLDER") == [2250]

    def test_bounty_splits_between_evaluator_and_finalizer(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        evaluate(env, c, pid, who="0xEVAL")
        as_user(env, "0xFIN", 0, NOW + WINDOW)
        c.finalize_claim(pid)
        total = 750 * 300 // 10_000       # 22
        ev = total * 2 // 3               # 14
        assert sent(env, "0xEVAL") == [ev] and sent(env, "0xFIN") == [total - ev]
        assert c.get_policy(pid)["keeper_bounty_wei"] == total

    def test_same_address_in_both_roles_gets_one_transfer(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        evaluate(env, c, pid, who="0xKEEPER")
        as_user(env, "0xKEEPER", 0, NOW + WINDOW)
        c.finalize_claim(pid)
        assert sent(env, "0xKEEPER") == [22]

    def test_holder_earns_no_bounty_share(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        evaluate(env, c, pid, who="0xHOLDER")
        as_user(env, "0xFIN", 0, NOW + WINDOW)
        c.finalize_claim(pid)
        assert sent(env, "0xHOLDER") == [2250]            # payout only
        assert sent(env, "0xFIN") == [22 - 22 * 2 // 3]   # finalizer share only

    def test_cannot_finalize_twice_or_when_not_provisional(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        as_user(env, "0xFIN", 0, NOW + WINDOW)
        with pytest.raises(Exception, match="not awaiting"):
            c.finalize_claim(pid)
        evaluate(env, c, pid)
        as_user(env, "0xFIN", 0, NOW + WINDOW)
        c.finalize_claim(pid)
        with pytest.raises(Exception, match="not awaiting"):
            c.finalize_claim(pid)

    def test_finalize_queue(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        a, b = buy(env, c), buy(env, c)
        evaluate(env, c, a); evaluate(env, c, b)
        as_user(env, "0xK", 0, NOW + 1)
        assert c.get_finalize_queue(10) == []
        as_user(env, "0xK", 0, NOW + WINDOW)
        assert c.get_finalize_queue(10) == [b, a]

    def test_no_quorum_never_goes_provisional(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        reads(env, 0, 4, ok=False)
        as_user(env, "0xEVAL", 0, NOW)
        c.evaluate_claim(pid, ALLOWED)
        assert c.get_policy(pid)["status"] == "INDETERMINATE"

    def test_window_zero_disables_the_court(self, fake_gl_env):
        env = fake_gl_env
        c = make(env, window=0); fund(env, c)
        pid = buy(env, c)
        evaluate(env, c, pid)
        assert c.get_policy(pid)["status"] == "PAID"


# ---------------------------------------------------------------------
# Court: challenges
# ---------------------------------------------------------------------

class TestChallenge:
    def test_overturn_payout_to_no_payout(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        evaluate(env, c, pid, delay=200)               # provisional PAYOUT
        pool_before = c.get_pool()["pool_balance"]
        fees_before = c.get_pool()["protocol_fees_accrued"]
        bond = c.get_challenge_info(pid)["bond_required_wei"]
        assert bond == 2250 * 1000 // 10_000           # 10% of reserved liability
        challenge(env, c, pid, delay=5)                # re-read: on time -> overturned
        p = c.get_policy(pid)
        assert p["status"] == "EXPIRED_NO_PAYOUT" and p["challenged"] is True
        assert sent(env, "0xHOLDER") == []              # holder was NOT paid
        assert c.get_pool()["pool_balance"] == pool_before   # nothing left the pool
        reward = min(bond, fees_before)
        assert sent(env, "0xCHAL") == [bond + reward]
        assert c.get_pool()["protocol_fees_accrued"] == fees_before - reward
        assert sent(env, "0xEVAL") == []                # evaluator of a reversed verdict earns nothing
        assert c.get_pool()["reserved_exposure"] == 0

    def test_overturn_no_payout_to_payout_pays_the_holder(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        evaluate(env, c, pid, delay=5)                 # provisional NO_PAYOUT
        challenge(env, c, pid, delay=200, who="0xHOLDER")
        p = c.get_policy(pid)
        assert p["status"] == "PAID" and p["payout_amount_wei"] == 2250
        assert 2250 in sent(env, "0xHOLDER")

    def test_upheld_challenge_forfeits_bond_to_underwriters(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        evaluate(env, c, pid, delay=200)
        bond = c.get_challenge_info(pid)["bond_required_wei"]
        pool_before = c.get_pool()["pool_balance"]
        challenge(env, c, pid, delay=200)              # same outcome -> upheld
        p = c.get_policy(pid)
        assert p["status"] == "PAID" and sent(env, "0xHOLDER") == [2250]
        assert sent(env, "0xCHAL") == []
        assert c.get_pool()["pool_balance"] == pool_before + bond - 2250
        assert sent(env, "0xEVAL") != []                # evaluator keeps the bounty

    def test_inconclusive_challenge_returns_the_bond_and_keeps_provisional(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        evaluate(env, c, pid, delay=200)
        bond = c.get_challenge_info(pid)["bond_required_wei"]
        challenge(env, c, pid, delay=0, ok=False)      # reads unusable -> NO_QUORUM
        p = c.get_policy(pid)
        assert p["status"] == "PROVISIONAL" and p["challenged"] is True
        assert sent(env, "0xCHAL") == [bond]
        as_user(env, "0xFIN", 0, NOW + WINDOW)
        assert c.finalize_claim(pid) == "PAYOUT"

    def test_only_one_challenge_per_verdict(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        evaluate(env, c, pid)
        challenge(env, c, pid, delay=0, ok=False)
        with pytest.raises(Exception, match="already challenged"):
            challenge(env, c, pid, delay=5, value=1000)

    def test_third_valid_read_is_required(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        evaluate(env, c, pid, delay=200)
        # 3 sources, but the third read is unusable: only 2 valid < 3 required
        env["exec_prompt"].queue = (
            [{"ok": True, "delay_minutes": 5, "cancelled": False, "confidence": 90}] * 2
            + [{"ok": False, "delay_minutes": 0, "cancelled": False, "confidence": 0}]
        ) * 2
        bond = c.get_challenge_info(pid)["bond_required_wei"]
        as_user(env, "0xCHAL", bond, NOW + 10)
        c.challenge_claim(pid, EXTRA)
        assert c.get_policy(pid)["status"] == "PROVISIONAL"      # stricter quorum not met
        assert sent(env, "0xCHAL") == [bond]

    def test_bond_must_cover_requirement(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        evaluate(env, c, pid)
        with pytest.raises(Exception, match="bond below"):
            challenge(env, c, pid, delay=5, value=1)

    def test_challenge_after_window_is_rejected(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        evaluate(env, c, pid)
        with pytest.raises(Exception, match="window has closed"):
            challenge(env, c, pid, delay=5, ts=NOW + WINDOW)

    def test_challenge_needs_a_new_independent_source(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        evaluate(env, c, pid)
        with pytest.raises(Exception, match="new providers"):
            challenge(env, c, pid, delay=5, extra=["https://flightaware.com/live/flight/DAL202"])
        with pytest.raises(Exception, match="at least one"):
            challenge(env, c, pid, delay=5, extra=[])
        with pytest.raises(Exception, match="allowlisted"):
            challenge(env, c, pid, delay=5, extra=["https://evil.example/flightaware.com"])

    def test_only_provisional_verdicts_can_be_challenged(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        with pytest.raises(Exception, match="only a provisional"):
            as_user(env, "0xCHAL", 500, NOW)
            c.challenge_claim(pid, EXTRA)

    def test_challenge_info_view(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        evaluate(env, c, pid)
        as_user(env, "0xV", 0, NOW + 5)
        i = c.get_challenge_info(pid)
        assert i["challengeable"] is True and i["finalizable"] is False
        as_user(env, "0xV", 0, NOW + WINDOW + 1)
        i = c.get_challenge_info(pid)
        assert i["challengeable"] is False and i["finalizable"] is True


# ---------------------------------------------------------------------
# Self-calibrating risk
# ---------------------------------------------------------------------

def settle_one(env, c, delay, threshold=60, mult=20000):
    pid = buy(env, c, threshold=threshold, mult=mult)
    evaluate(env, c, pid, delay=delay)
    return pid


class TestCalibration:
    def test_prior_until_enough_observations(self, fake_gl_env):
        env = fake_gl_env
        c = make(env, window=0); fund(env, c, 10**9)
        prior = c.get_calibration("DL")["prior_base_bps"]
        for _ in range(4):
            settle_one(env, c, delay=5)
        cal = c.get_calibration("DL")
        assert cal["observations"] == 4 and cal["calibrating"] is False
        assert cal["effective_base_bps"] == prior

    def test_quiet_record_lowers_price_within_bounds(self, fake_gl_env):
        env = fake_gl_env
        c = make(env, window=0); fund(env, c, 10**9)
        before = c.get_quote("DL", "JFK", 60, 10_000)["max_multiplier_bps"]
        for _ in range(5):
            settle_one(env, c, delay=5)
        cal = c.get_calibration("DL")
        # n=5, K=20 -> Z=0.2; observed 0 -> 0.8 * 2000 = 1600
        assert cal["credibility_bps"] == 2000 and cal["effective_base_bps"] == 1600
        after = c.get_quote("DL", "JFK", 60, 10_000)["max_multiplier_bps"]
        assert after > before                           # safer airline -> richer terms allowed

    def test_bad_record_raises_price_but_is_capped(self, fake_gl_env):
        env = fake_gl_env
        c = make(env, window=0); fund(env, c, 10**9)
        before = c.get_quote("DL", "JFK", 60, 10_000)["max_multiplier_bps"]
        for _ in range(12):
            settle_one(env, c, delay=300, mult=10000)
        cal = c.get_calibration("DL")
        prior = cal["prior_base_bps"]
        # n=12, K=20 -> Z=0.375; observed 10000 -> 0.625*2000 + 0.375*10000 = 5000 (inside the clamp)
        assert cal["effective_base_bps"] == 5000
        # long-threshold payouts imply a much larger normalized base; the blend must stop at 3x prior
        for _ in range(12):
            settle_one(env, c, delay=300, threshold=240, mult=10000)
        assert c.get_calibration("DL")["effective_base_bps"] == prior * 3
        assert c.get_quote("DL", "JFK", 60, 10_000)["max_multiplier_bps"] < before

    def test_floor_stops_a_cheap_policy_flood(self, fake_gl_env):
        env = fake_gl_env
        c = make(env, window=0); fund(env, c, 10**9)
        prior = c.get_calibration("DL")["prior_base_bps"]
        for _ in range(40):
            settle_one(env, c, delay=0, mult=10000)
        assert c.get_calibration("DL")["effective_base_bps"] >= prior // 2

    def test_calibration_is_per_airline(self, fake_gl_env):
        env = fake_gl_env
        c = make(env, window=0); fund(env, c, 10**9)
        for _ in range(6):
            pid = buy(env, c, airline="UA", threshold=60, mult=20000)
            evaluate(env, c, pid, delay=5)
        assert c.get_calibration("UA")["observations"] == 6
        assert c.get_calibration("DL")["observations"] == 0

    def test_court_path_records_the_final_outcome_not_the_provisional(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c, 10**9)
        pid = buy(env, c, threshold=60, mult=20000)
        evaluate(env, c, pid, delay=200)               # provisional PAYOUT
        assert c.get_calibration("DL")["observations"] == 0   # nothing learned yet
        challenge(env, c, pid, delay=5)                # overturned -> on time
        cal = c.get_calibration("DL")
        assert cal["observations"] == 1 and cal["observed_base_bps"] == 0

    def test_loss_stats_track_expected_vs_realized(self, fake_gl_env):
        env = fake_gl_env
        c = make(env, window=0); fund(env, c)
        pid = buy(env, c)
        assert c.get_policy(pid)["expected_loss_wei"] > 0
        evaluate(env, c, pid, delay=200)
        s = c.get_loss_stats()
        assert s["realized_loss_wei"] == 2250
        assert s["expected_loss_wei"] == c.get_policy(pid)["expected_loss_wei"]
        assert s["realized_vs_expected_bps"] > 10_000     # a payout is worse than the pricing expected


# ---------------------------------------------------------------------
# Affiliates
# ---------------------------------------------------------------------

class TestAffiliates:
    def test_referrer_earns_share_of_premium_from_creator_fee(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c, premium=1000, ref="0xPARTNER")
        pool = c.get_pool()
        assert c.get_affiliate("0xPARTNER")["balance_wei"] == 50       # 5% of 1000
        assert pool["creator_fees_accrued"] == 200 - 50
        assert pool["protocol_fees_accrued"] == 50                     # protocol fee untouched
        assert c.get_policy(pid)["premium"] == 750                     # LP capital untouched
        assert c.get_policy(pid)["referrer"] == "0xPARTNER"

    def test_self_referral_pays_nothing(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        buy(env, c, ref="0xHOLDER")
        assert c.get_affiliate("0xHOLDER")["balance_wei"] == 0
        assert c.get_pool()["creator_fees_accrued"] == 200

    def test_plain_create_policy_unchanged(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        pid = buy(env, c)
        assert c.get_pool()["creator_fees_accrued"] == 200
        assert c.get_policy(pid)["referrer"] == ""

    def test_withdraw_and_lifetime_totals(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        buy(env, c, ref="0xPARTNER"); buy(env, c, ref="0xPARTNER")
        as_user(env, "0xPARTNER")
        c.affiliate_withdraw(60)
        assert sent(env, "0xPARTNER") == [60]
        a = c.get_affiliate("0xPARTNER")
        assert a["balance_wei"] == 40 and a["lifetime_earned_wei"] == 100

    def test_cannot_overdraw_or_withdraw_for_others(self, fake_gl_env):
        env = fake_gl_env
        c = make(env); fund(env, c)
        buy(env, c, ref="0xPARTNER")
        as_user(env, "0xPARTNER")
        with pytest.raises(Exception, match="exceeds"):
            c.affiliate_withdraw(51)
        as_user(env, "0xSTRANGER")
        with pytest.raises(Exception, match="exceeds"):
            c.affiliate_withdraw(1)

    def test_referred_policy_is_still_collateral_and_price_checked(self, fake_gl_env):
        env = fake_gl_env
        c = make(env)                                   # no capital
        with pytest.raises(Exception, match="underwriting capital"):
            buy(env, c, ref="0xPARTNER")
        fund(env, c)
        with pytest.raises(Exception, match="risk-priced"):
            buy(env, c, mult=900_000, ref="0xPARTNER", threshold=60)


# ---------------------------------------------------------------------
# Deployment parameters / sandbox
# ---------------------------------------------------------------------

class TestDeployParams:
    def test_parameters_exposed(self, fake_gl_env):
        env = fake_gl_env
        c = make(env, window=120, buffer=30, sandbox=True)
        p = c.get_pool()
        assert (p["challenge_window_seconds"], p["settlement_buffer_seconds"], p["sandbox_mode"]) == (120, 30, True)

    def test_production_defaults(self, fake_gl_env):
        env = fake_gl_env
        env["message"].sender_address = env["Address"]("0xOWNER")
        c = env["module"].SkyVerdict("0xCREATOR")
        p = c.get_pool()
        assert (p["challenge_window_seconds"], p["settlement_buffer_seconds"], p["sandbox_mode"]) == (86400, 10800, False)

    def test_past_flights_only_insurable_in_sandbox(self, fake_gl_env):
        env = fake_gl_env
        prod = make(env); fund(env, prod)
        with pytest.raises(Exception, match="already departed"):
            buy(env, prod, ts=DEPARTURE + 5)
        sb = make(env, sandbox=True); fund(env, sb)
        assert buy(env, sb, ts=DEPARTURE + 5) == 1

    def test_custom_buffer_is_enforced(self, fake_gl_env):
        env = fake_gl_env
        c = make(env, window=0, buffer=60); fund(env, c)
        pid = buy(env, c)
        reads(env, 200, 4)
        as_user(env, "0xK", 0, ARRIVAL + 30)
        with pytest.raises(Exception, match="buffer"):
            c.evaluate_claim(pid, ALLOWED)
        as_user(env, "0xK", 0, ARRIVAL + 61)
        reads(env, 200, 4)
        c.evaluate_claim(pid, ALLOWED)
        assert c.get_policy(pid)["status"] == "PAID"
