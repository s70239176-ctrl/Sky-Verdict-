"""
Fast, offline unit tests for SkyVerdict.

Run with:  pytest tests/direct -v

These do not require GenLayer Studio. They validate:
  - premium/fee accounting math
  - policy lifecycle state transitions
  - the deterministic verdict-aggregation rule (_derive_verdict)
  - evaluate_claim's consensus wiring against controllable fake sources
  - refund / appeal / admin / access-control edge cases
"""
import pytest


DEPARTURE = 1_700_100_000
ARRIVAL = 1_700_110_000  # +10,000s ~ 2h47m flight
NOW_AFTER_BUFFER = ARRIVAL + 3 * 60 * 60 + 1
NOW_AFTER_EXPIRY = ARRIVAL + 14 * 24 * 60 * 60 + 1


def make_contract(env, creator="0xCREATOR"):
    SkyVerdict = env["module"].SkyVerdict
    env["message"].sender_address = env["Address"]("0xOWNER")
    return SkyVerdict(creator)


def buy_policy(env, contract, premium=1000, threshold=180, mult_bps=30000, max_cov=None,
               dep=DEPARTURE, arr=ARRIVAL, holder="0xHOLDER"):
    env["message"].sender_address = env["Address"](holder)
    env["message"].value = premium
    env["message"].timestamp = dep - 10_000  # buy well before departure
    if max_cov is None:
        max_cov = premium * mult_bps // 10_000
    pid = contract.create_policy(
        airline_code="DL", flight_number="DL202", departure_airport="JFK",
        scheduled_departure_utc=dep, scheduled_arrival_utc=arr,
        threshold_minutes=threshold, payout_multiplier_bps=mult_bps,
        max_coverage=max_cov,
    )
    env["message"].value = 0
    return pid


# ---------------------------------------------------------------------
# create_policy
# ---------------------------------------------------------------------

class TestCreatePolicy:
    def test_happy_path_locks_premium_net_of_fees(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000)
        pool = c.get_pool()
        # 5% protocol + 20% creator = 25% fee -> 750 net premium pooled
        assert pool["pool_balance"] == 750
        assert pool["protocol_fees_accrued"] == 50
        assert pool["creator_fees_accrued"] == 200

    def test_rejects_zero_premium(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        env["message"].sender_address = env["Address"]("0xHOLDER")
        env["message"].value = 0
        env["message"].timestamp = DEPARTURE - 1000
        with pytest.raises(Exception):
            c.create_policy("DL", "DL202", "JFK", DEPARTURE, ARRIVAL, 180, 30000, 300)

    def test_rejects_arrival_before_departure(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        env["message"].sender_address = env["Address"]("0xHOLDER")
        env["message"].value = 1000
        env["message"].timestamp = DEPARTURE - 1000
        with pytest.raises(Exception):
            c.create_policy("DL", "DL202", "JFK", ARRIVAL, DEPARTURE, 180, 30000, 300)

    def test_rejects_already_departed_flight(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        env["message"].sender_address = env["Address"]("0xHOLDER")
        env["message"].value = 1000
        env["message"].timestamp = DEPARTURE + 1  # already departed
        with pytest.raises(Exception):
            c.create_policy("DL", "DL202", "JFK", DEPARTURE, ARRIVAL, 180, 30000, 300)

    def test_rejects_zero_threshold(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        env["message"].sender_address = env["Address"]("0xHOLDER")
        env["message"].value = 1000
        env["message"].timestamp = DEPARTURE - 1000
        with pytest.raises(Exception):
            c.create_policy("DL", "DL202", "JFK", DEPARTURE, ARRIVAL, 0, 30000, 300)

    def test_rejects_max_coverage_above_theoretical_max(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        env["message"].sender_address = env["Address"]("0xHOLDER")
        env["message"].value = 1000
        env["message"].timestamp = DEPARTURE - 1000
        with pytest.raises(Exception):
            # premium(1000) * 30000bps/10000 = 3000 max theoretical; asking 5000
            c.create_policy("DL", "DL202", "JFK", DEPARTURE, ARRIVAL, 180, 30000, 5000)

    def test_policy_ids_increment(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid1 = buy_policy(env, c)
        pid2 = buy_policy(env, c)
        assert pid2 == pid1 + 1


# ---------------------------------------------------------------------
# _derive_verdict — pure aggregation logic
# ---------------------------------------------------------------------

class TestDeriveVerdict:
    def _c(self, fake_gl_env):
        return make_contract(fake_gl_env)

    def test_two_sources_agree_payout(self, fake_gl_env):
        c = self._c(fake_gl_env)
        extractions = [
            {"source_url": "a", "ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90},
            {"source_url": "b", "ok": True, "delay_minutes": 210, "cancelled": False, "confidence": 85},
        ]
        v = c._derive_verdict(extractions, threshold_minutes=180)
        assert v["decision"] == "PAYOUT"
        assert v["delay_minutes"] == 205  # median of 200/210

    def test_two_sources_agree_no_payout(self, fake_gl_env):
        c = self._c(fake_gl_env)
        extractions = [
            {"source_url": "a", "ok": True, "delay_minutes": 20, "cancelled": False, "confidence": 90},
            {"source_url": "b", "ok": True, "delay_minutes": 15, "cancelled": False, "confidence": 85},
        ]
        v = c._derive_verdict(extractions, threshold_minutes=180)
        assert v["decision"] == "NO_PAYOUT"

    def test_below_min_sources_is_no_quorum(self, fake_gl_env):
        c = self._c(fake_gl_env)
        extractions = [
            {"source_url": "a", "ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90},
        ]
        v = c._derive_verdict(extractions, threshold_minutes=180)
        assert v["decision"] == "NO_QUORUM"

    def test_low_confidence_source_excluded(self, fake_gl_env):
        c = self._c(fake_gl_env)
        extractions = [
            {"source_url": "a", "ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90},
            {"source_url": "b", "ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 10},  # excluded
        ]
        v = c._derive_verdict(extractions, threshold_minutes=180)
        assert v["decision"] == "NO_QUORUM"  # only 1 valid source left

    def test_failed_fetch_excluded(self, fake_gl_env):
        c = self._c(fake_gl_env)
        extractions = [
            {"source_url": "a", "ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90},
            {"source_url": "b", "ok": False, "delay_minutes": 0, "cancelled": False, "confidence": 0},
        ]
        v = c._derive_verdict(extractions, threshold_minutes=180)
        assert v["decision"] == "NO_QUORUM"

    def test_majority_cancelled_wins(self, fake_gl_env):
        c = self._c(fake_gl_env)
        extractions = [
            {"source_url": "a", "ok": True, "delay_minutes": 0, "cancelled": True, "confidence": 90},
            {"source_url": "b", "ok": True, "delay_minutes": 0, "cancelled": True, "confidence": 90},
            {"source_url": "c", "ok": True, "delay_minutes": 30, "cancelled": False, "confidence": 90},
        ]
        v = c._derive_verdict(extractions, threshold_minutes=180)
        assert v["decision"] == "PAYOUT"
        assert v["cancelled"] is True

    def test_minority_cancelled_does_not_win(self, fake_gl_env):
        c = self._c(fake_gl_env)
        extractions = [
            {"source_url": "a", "ok": True, "delay_minutes": 0, "cancelled": True, "confidence": 90},
            {"source_url": "b", "ok": True, "delay_minutes": 10, "cancelled": False, "confidence": 90},
            {"source_url": "c", "ok": True, "delay_minutes": 10, "cancelled": False, "confidence": 90},
        ]
        v = c._derive_verdict(extractions, threshold_minutes=180)
        assert v["cancelled"] is False
        assert v["decision"] == "NO_PAYOUT"

    def test_outlier_source_does_not_skew_median(self, fake_gl_env):
        c = self._c(fake_gl_env)
        extractions = [
            {"source_url": "a", "ok": True, "delay_minutes": 20, "cancelled": False, "confidence": 90},
            {"source_url": "b", "ok": True, "delay_minutes": 25, "cancelled": False, "confidence": 90},
            {"source_url": "c", "ok": True, "delay_minutes": 9999, "cancelled": False, "confidence": 90},  # hallucination
        ]
        v = c._derive_verdict(extractions, threshold_minutes=180)
        assert v["decision"] == "NO_PAYOUT"
        assert v["delay_minutes"] == 25  # median, not skewed by outlier

    def test_exact_threshold_boundary_triggers_payout(self, fake_gl_env):
        c = self._c(fake_gl_env)
        extractions = [
            {"source_url": "a", "ok": True, "delay_minutes": 180, "cancelled": False, "confidence": 90},
            {"source_url": "b", "ok": True, "delay_minutes": 180, "cancelled": False, "confidence": 90},
        ]
        v = c._derive_verdict(extractions, threshold_minutes=180)
        assert v["decision"] == "PAYOUT"

    def test_one_minute_under_threshold_no_payout(self, fake_gl_env):
        c = self._c(fake_gl_env)
        extractions = [
            {"source_url": "a", "ok": True, "delay_minutes": 179, "cancelled": False, "confidence": 90},
            {"source_url": "b", "ok": True, "delay_minutes": 179, "cancelled": False, "confidence": 90},
        ]
        v = c._derive_verdict(extractions, threshold_minutes=180)
        assert v["decision"] == "NO_PAYOUT"


# ---------------------------------------------------------------------
# evaluate_claim — end-to-end consensus wiring against fake sources
# ---------------------------------------------------------------------

class TestEvaluateClaim:
    ALLOWED = ["https://flightaware.com/live/DL202", "https://flightradar24.com/DL202"]

    def test_payout_path_transfers_funds_and_marks_paid(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180, mult_bps=30000, max_cov=3000)

        env["web"].responses = {u: "some flight status html" for u in self.ALLOWED}
        env["exec_prompt"].queue = [
            {"ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90},
            {"ok": True, "delay_minutes": 210, "cancelled": False, "confidence": 90},
            # validator's independent second pass
            {"ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90},
            {"ok": True, "delay_minutes": 210, "cancelled": False, "confidence": 90},
        ]
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER

        result_json = c.evaluate_claim(pid, self.ALLOWED)
        assert '"decision": "PAYOUT"' in result_json.replace(" ", "") or "PAYOUT" in result_json
        # theoretical (entitled) payout = net_premium(750) * 3x = 2250, capped
        # by max_coverage (3000, no effect here) but NOT fully coverable by
        # available pool liquidity (only 750 pooled so far, since this is the
        # only policy funding the shared pool). Entitled (2250) != actual
        # (750), so this is a genuine liquidity shortfall: the policy must be
        # marked PAID_PARTIAL, not PAID — PAID must mean the holder was made
        # fully whole. A prior version of this test asserted "PAID" here,
        # which was itself the accounting bug: it read a partial payout as a
        # full one with no trace of the shortfall.
        assert c.get_claim_status(pid) == "PAID_PARTIAL"
        assert c.get_policy(pid)["payout_amount_wei"] == 750
        assert len(env["evm"].transfers) == 1
        to, amount = env["evm"].transfers[0]
        assert to == "0xHOLDER"
        assert amount == 750

    def test_no_payout_path_leaves_pool_untouched(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180)
        pool_before = c.get_pool()["pool_balance"]

        env["web"].responses = {u: "on time" for u in self.ALLOWED}
        env["exec_prompt"].queue = [
            {"ok": True, "delay_minutes": 5, "cancelled": False, "confidence": 90},
            {"ok": True, "delay_minutes": 5, "cancelled": False, "confidence": 90},
            {"ok": True, "delay_minutes": 5, "cancelled": False, "confidence": 90},
            {"ok": True, "delay_minutes": 5, "cancelled": False, "confidence": 90},
        ]
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER

        c.evaluate_claim(pid, self.ALLOWED)
        assert c.get_claim_status(pid) == "EXPIRED_NO_PAYOUT"
        assert c.get_pool()["pool_balance"] == pool_before
        assert len(env["evm"].transfers) == 0

    def test_no_quorum_marks_indeterminate_not_paid(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180)

        env["web"].responses = {self.ALLOWED[0]: "junk", self.ALLOWED[1]: "junk"}
        env["exec_prompt"].queue = [
            {"ok": False, "delay_minutes": 0, "cancelled": False, "confidence": 0},
            {"ok": False, "delay_minutes": 0, "cancelled": False, "confidence": 0},
            {"ok": False, "delay_minutes": 0, "cancelled": False, "confidence": 0},
            {"ok": False, "delay_minutes": 0, "cancelled": False, "confidence": 0},
        ]
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER

        c.evaluate_claim(pid, self.ALLOWED)
        assert c.get_claim_status(pid) == "INDETERMINATE"
        assert len(env["evm"].transfers) == 0

    def test_network_failure_on_one_source_still_no_quorum_with_one_left(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180)

        env["web"].responses = {
            self.ALLOWED[0]: Exception("network timeout"),
            self.ALLOWED[1]: "flight delayed 4 hours",
        }
        env["exec_prompt"].queue = [
            {"ok": True, "delay_minutes": 240, "cancelled": False, "confidence": 90},
            {"ok": True, "delay_minutes": 240, "cancelled": False, "confidence": 90},
        ]
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER

        c.evaluate_claim(pid, self.ALLOWED)
        # Only 1 valid source (the other failed) -> below MIN_SOURCES_REQUIRED
        assert c.get_claim_status(pid) == "INDETERMINATE"

    def test_rejects_non_allowlisted_domain(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180)
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER
        with pytest.raises(Exception):
            c.evaluate_claim(pid, ["https://evil-spoofed-tracker.example/DL202", self.ALLOWED[0]])

    def test_rejects_too_few_sources(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180)
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER
        with pytest.raises(Exception):
            c.evaluate_claim(pid, [self.ALLOWED[0]])

    def test_rejects_evaluation_before_buffer_elapsed(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180)
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = ARRIVAL + 60  # only 1 min after arrival
        with pytest.raises(Exception):
            c.evaluate_claim(pid, self.ALLOWED)

    def test_rejects_evaluation_after_expiry(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180)
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_EXPIRY
        with pytest.raises(Exception):
            c.evaluate_claim(pid, self.ALLOWED)

    def test_rejects_double_evaluation_of_paid_policy(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180, max_cov=3000)
        env["web"].responses = {u: "delayed" for u in self.ALLOWED}
        env["exec_prompt"].queue = [
            {"ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90},
            {"ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90},
            {"ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90},
            {"ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90},
        ]
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER
        c.evaluate_claim(pid, self.ALLOWED)
        with pytest.raises(Exception):
            c.evaluate_claim(pid, self.ALLOWED)

    def test_unknown_policy_id_raises(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER
        with pytest.raises(Exception):
            c.evaluate_claim(999, self.ALLOWED)

    def test_payout_capped_by_max_coverage(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        # premium 1000 -> net 750; multiplier 3x -> 2250 theoretical, cap at 500
        pid = buy_policy(env, c, premium=1000, threshold=180, mult_bps=30000, max_cov=500)
        env["web"].responses = {u: "delayed" for u in self.ALLOWED}
        env["exec_prompt"].queue = [
            {"ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90},
            {"ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90},
            {"ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90},
            {"ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90},
        ]
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER
        c.evaluate_claim(pid, self.ALLOWED)
        _, amount = env["evm"].transfers[0]
        assert amount == 500
        # entitled (500, the max_coverage cap) == actual (500, pool had
        # 750 available) -> fully covered, so this stays plain PAID.
        assert c.get_claim_status(pid) == "PAID"
        assert c.get_policy(pid)["payout_amount_wei"] == 500

    def test_validator_disagreement_reverts_no_state_change(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180)
        env["web"].responses = {u: "x" for u in self.ALLOWED}
        # Leader sees a big delay, validator (2nd pass) sees on-time -> disagreement
        env["exec_prompt"].queue = [
            {"ok": True, "delay_minutes": 300, "cancelled": False, "confidence": 90},
            {"ok": True, "delay_minutes": 300, "cancelled": False, "confidence": 90},
            {"ok": True, "delay_minutes": 0, "cancelled": False, "confidence": 90},
            {"ok": True, "delay_minutes": 0, "cancelled": False, "confidence": 90},
        ]
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER
        with pytest.raises(Exception):
            c.evaluate_claim(pid, self.ALLOWED)
        assert c.get_claim_status(pid) == "ACTIVE"  # unchanged, no partial state


# ---------------------------------------------------------------------
# Hostname validation — was a naive `if domain in url` substring check,
# defeatable by lookalike hosts. Now parses the actual hostname via
# urlparse and matches exact-or-subdomain against the allowlist.
# ---------------------------------------------------------------------

class TestHostnameValidation:
    ALLOWED_ONE = ["https://flightaware.com/live/DL202", "https://flightradar24.com/DL202"]

    @pytest.mark.parametrize("bypass_url", [
        # allowlisted domain smuggled into a query string on an attacker host
        "https://evil.com/?x=flightaware.com",
        # allowlisted domain as a prefix of an attacker-controlled hostname
        "https://flightaware.com.evil.com/status",
        # allowlisted domain as a path segment on an attacker host
        "https://evil.com/flightaware.com/status",
        # a hostname that merely contains an allowlisted one as a substring
        "https://notflightaware.com/status",
        # userinfo trick: naive host-ish parsing could read this as flightaware.com
        "https://flightaware.com@evil.com/status",
        # disallowed scheme entirely
        "file:///etc/passwd",
    ])
    def test_lookalike_and_bad_scheme_urls_rejected(self, fake_gl_env, bypass_url):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180)
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER
        with pytest.raises(Exception):
            c.evaluate_claim(pid, [bypass_url, self.ALLOWED_ONE[0]])

    def test_www_prefixed_allowlisted_host_still_accepted(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180)
        urls = ["https://www.flightaware.com/live/DL202", "https://flightradar24.com/DL202"]
        env["web"].responses = {u: "on time" for u in urls}
        env["exec_prompt"].queue = [
            {"ok": True, "delay_minutes": 5, "cancelled": False, "confidence": 90},
        ] * 4
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER
        # a legitimate www.-prefixed allowlisted host must still work —
        # the fix normalizes www. for comparison, it doesn't reject it
        c.evaluate_claim(pid, urls)
        assert c.get_claim_status(pid) == "EXPIRED_NO_PAYOUT"

    def test_true_subdomain_of_allowlisted_host_accepted(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180)
        urls = ["https://status.flightaware.com/live/DL202", "https://flightradar24.com/DL202"]
        env["web"].responses = {u: "on time" for u in urls}
        env["exec_prompt"].queue = [
            {"ok": True, "delay_minutes": 5, "cancelled": False, "confidence": 90},
        ] * 4
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER
        c.evaluate_claim(pid, urls)
        assert c.get_claim_status(pid) == "EXPIRED_NO_PAYOUT"


# ---------------------------------------------------------------------
# Source independence — evaluate_claim must reject source_urls that
# resolve to the same underlying provider, which would otherwise let
# one source count as two votes toward MIN_SOURCES_REQUIRED quorum.
# ---------------------------------------------------------------------

class TestSourceIndependence:
    def test_exact_duplicate_url_rejected(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180)
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER
        url = "https://flightaware.com/live/DL202"
        with pytest.raises(Exception):
            c.evaluate_claim(pid, [url, url])

    def test_www_variant_of_same_host_rejected_as_duplicate(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180)
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER
        with pytest.raises(Exception):
            c.evaluate_claim(pid, [
                "https://flightaware.com/live/DL202",
                "https://www.flightaware.com/live/DL202",
            ])

    def test_different_paths_same_host_still_rejected_as_duplicate(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180)
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER
        with pytest.raises(Exception):
            c.evaluate_claim(pid, [
                "https://flightaware.com/live/DL202",
                "https://flightaware.com/other/page",
            ])

    def test_two_genuinely_distinct_hosts_accepted(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180)
        urls = ["https://flightaware.com/live/DL202", "https://flightradar24.com/DL202"]
        env["web"].responses = {u: "on time" for u in urls}
        env["exec_prompt"].queue = [
            {"ok": True, "delay_minutes": 5, "cancelled": False, "confidence": 90},
        ] * 4
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER
        c.evaluate_claim(pid, urls)  # must not raise
        assert c.get_claim_status(pid) == "EXPIRED_NO_PAYOUT"


# ---------------------------------------------------------------------
# Settlement accounting integrity — a policy must never be recorded as
# fully PAID/REFUNDED unless the amount actually transferred met the
# entitled amount. Liquidity shortfalls must show up as *_PARTIAL with
# the real transferred amount recorded on payout_amount_wei.
# ---------------------------------------------------------------------

class TestSettlementAccounting:
    ALLOWED = ["https://flightaware.com/live/DL202", "https://flightradar24.com/DL202"]

    def test_payout_shortfall_marks_paid_partial_with_real_amount(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        # net premium 750 pooled; entitled payout 3x = 2250, no max_coverage
        # cap in the way (max_cov well above entitled) -> pool can only
        # actually cover 750 of the 2250 owed.
        pid = buy_policy(env, c, premium=1000, threshold=180, mult_bps=30000, max_cov=3000)
        env["web"].responses = {u: "delayed" for u in self.ALLOWED}
        env["exec_prompt"].queue = [
            {"ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90},
        ] * 4
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER

        c.evaluate_claim(pid, self.ALLOWED)
        policy = c.get_policy(pid)
        assert policy["status"] == "PAID_PARTIAL"
        assert policy["payout_amount_wei"] == 750  # what actually moved
        assert c.get_pool()["pool_balance"] == 0   # pool fully drained, not negative
        assert env["evm"].transfers == [("0xHOLDER", 750)]

    def test_fully_covered_payout_marks_plain_paid(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        # Two policies fund the pool so there's enough liquidity to fully
        # cover the second policy's claim.
        buy_policy(env, c, premium=5000, threshold=180, holder="0xOTHER")
        pid = buy_policy(env, c, premium=1000, threshold=180, mult_bps=20000, max_cov=1500, holder="0xHOLDER")
        env["web"].responses = {u: "delayed" for u in self.ALLOWED}
        env["exec_prompt"].queue = [
            {"ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90},
        ] * 4
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER

        c.evaluate_claim(pid, self.ALLOWED)
        policy = c.get_policy(pid)
        # entitled = net_premium(750) * 2x = 1500, capped at max_coverage 1500
        assert policy["status"] == "PAID"
        assert policy["payout_amount_wei"] == 1500

    def test_zero_liquidity_payout_marks_partial_with_zero_and_no_transfer(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180, mult_bps=30000, max_cov=3000)
        # Drain the pool entirely before the claim resolves, e.g. via an
        # earlier payout on another policy — simulate directly for clarity.
        c.pool_balance = type(c.pool_balance)(0)
        env["web"].responses = {u: "delayed" for u in self.ALLOWED}
        env["exec_prompt"].queue = [
            {"ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90},
        ] * 4
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER

        c.evaluate_claim(pid, self.ALLOWED)
        policy = c.get_policy(pid)
        assert policy["status"] == "PAID_PARTIAL"
        assert policy["payout_amount_wei"] == 0
        assert env["evm"].transfers == []  # no zero-value transfer emitted

    def test_refund_shortfall_marks_refunded_partial_with_real_amount(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, holder="0xHOLDER")
        # Drain the pool below the entitled refund (750) to force a
        # shortfall on the refund path specifically.
        c.pool_balance = type(c.pool_balance)(300)
        env["message"].sender_address = env["Address"]("0xHOLDER")
        env["message"].timestamp = NOW_AFTER_EXPIRY
        c.claim_refund(pid)
        policy = c.get_policy(pid)
        assert policy["status"] == "REFUNDED_PARTIAL"
        assert policy["payout_amount_wei"] == 300
        assert env["evm"].transfers[-1] == ("0xHOLDER", 300)

    def test_full_refund_marks_plain_refunded(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, holder="0xHOLDER")
        env["message"].sender_address = env["Address"]("0xHOLDER")
        env["message"].timestamp = NOW_AFTER_EXPIRY
        c.claim_refund(pid)
        policy = c.get_policy(pid)
        assert policy["status"] == "REFUNDED"
        assert policy["payout_amount_wei"] == 750

    def test_partial_payout_policy_still_allows_classify_delay_cause(self, fake_gl_env):
        """
        classify_delay_cause's eligibility check must accept PAID_PARTIAL
        alongside PAID/EXPIRED_NO_PAYOUT — a partial payout is still a
        fully resolved verdict, just an underfunded one.
        """
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180, mult_bps=30000, max_cov=3000)
        env["web"].responses = {u: "delayed" for u in self.ALLOWED}
        env["exec_prompt"].queue = [
            {"ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90},
        ] * 4
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER
        c.evaluate_claim(pid, self.ALLOWED)
        assert c.get_claim_status(pid) == "PAID_PARTIAL"

        env["web"].responses = {self.ALLOWED[0]: "mechanical issue cited"}
        env["exec_prompt"].queue = [
            {"cause": "airline_fault", "explanation": "phrasing A"},
            {"cause": "airline_fault", "explanation": "phrasing B"},
        ]
        c.classify_delay_cause(pid, self.ALLOWED[0])  # must not raise
        assert c.get_policy(pid)["status"] == "PAID_PARTIAL"  # untouched by classification


# ---------------------------------------------------------------------
# Refunds
# ---------------------------------------------------------------------

class TestRefund:
    def test_refund_after_expiry_returns_premium(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, holder="0xHOLDER")
        env["message"].sender_address = env["Address"]("0xHOLDER")
        env["message"].timestamp = NOW_AFTER_EXPIRY
        c.claim_refund(pid)
        assert c.get_claim_status(pid) == "REFUNDED"
        assert env["evm"].transfers[-1] == ("0xHOLDER", 750)

    def test_refund_before_expiry_rejected(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, holder="0xHOLDER")
        env["message"].sender_address = env["Address"]("0xHOLDER")
        env["message"].timestamp = NOW_AFTER_BUFFER
        with pytest.raises(Exception):
            c.claim_refund(pid)

    def test_refund_by_non_holder_rejected(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, holder="0xHOLDER")
        env["message"].sender_address = env["Address"]("0xSTRANGER")
        env["message"].timestamp = NOW_AFTER_EXPIRY
        with pytest.raises(Exception):
            c.claim_refund(pid)

    def test_refund_of_paid_policy_rejected(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180, max_cov=3000, holder="0xHOLDER")
        env["web"].responses = {
            "https://flightaware.com/x": "d", "https://flightradar24.com/x": "d",
        }
        env["exec_prompt"].queue = [{"ok": True, "delay_minutes": 200, "cancelled": False, "confidence": 90}] * 4
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER
        c.evaluate_claim(pid, ["https://flightaware.com/x", "https://flightradar24.com/x"])

        env["message"].sender_address = env["Address"]("0xHOLDER")
        env["message"].timestamp = NOW_AFTER_EXPIRY
        with pytest.raises(Exception):
            c.claim_refund(pid)


# ---------------------------------------------------------------------
# Appeals
# ---------------------------------------------------------------------

class TestAppeal:
    def test_appeal_from_indeterminate_can_resolve(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180, max_cov=3000)
        urls = ["https://flightaware.com/x", "https://flightradar24.com/x"]
        env["web"].responses = {u: "junk" for u in urls}
        env["exec_prompt"].queue = [{"ok": False, "delay_minutes": 0, "cancelled": False, "confidence": 0}] * 4
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER
        c.evaluate_claim(pid, urls)
        assert c.get_claim_status(pid) == "INDETERMINATE"

        new_urls = ["https://flightstats.com/x", "https://flightradar24.com/x"]
        env["web"].responses = {u: "delayed 4h" for u in new_urls}
        env["exec_prompt"].queue = [{"ok": True, "delay_minutes": 240, "cancelled": False, "confidence": 90}] * 4
        c.appeal(pid, new_urls)
        # entitled = net_premium(750) * 3x = 2250, capped at max_coverage
        # (3000, no effect) but only 750 is pooled -> liquidity shortfall,
        # so this resolves PAID_PARTIAL, not PAID (see TestSettlementAccounting).
        assert c.get_claim_status(pid) == "PAID_PARTIAL"
        assert c.get_policy(pid)["payout_amount_wei"] == 750

    def test_appeal_cannot_be_used_twice(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180)
        urls = ["https://flightaware.com/x", "https://flightradar24.com/x"]
        env["web"].responses = {u: "junk" for u in urls}
        env["exec_prompt"].queue = [{"ok": False, "delay_minutes": 0, "cancelled": False, "confidence": 0}] * 4
        env["message"].sender_address = env["Address"]("0xKEEPER")
        env["message"].timestamp = NOW_AFTER_BUFFER
        c.evaluate_claim(pid, urls)

        env["exec_prompt"].queue = [{"ok": False, "delay_minutes": 0, "cancelled": False, "confidence": 0}] * 4
        c.appeal(pid, urls)  # first appeal, still indeterminate, but appeal_used flips True

        with pytest.raises(Exception):
            c.appeal(pid, urls)  # second appeal rejected

    def test_appeal_on_active_policy_rejected(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        pid = buy_policy(env, c, premium=1000, threshold=180)
        with pytest.raises(Exception):
            c.appeal(pid, ["https://flightaware.com/x", "https://flightradar24.com/x"])


# ---------------------------------------------------------------------
# Admin / access control
# ---------------------------------------------------------------------

class TestAdmin:
    def test_non_owner_cannot_pause(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        env["message"].sender_address = env["Address"]("0xSTRANGER")
        with pytest.raises(Exception):
            c.admin_set_paused(True)

    def test_owner_can_pause_and_blocks_new_policies(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        env["message"].sender_address = env["Address"]("0xOWNER")
        c.admin_set_paused(True)
        env["message"].sender_address = env["Address"]("0xHOLDER")
        env["message"].value = 1000
        env["message"].timestamp = DEPARTURE - 1000
        with pytest.raises(Exception):
            c.create_policy("DL", "DL202", "JFK", DEPARTURE, ARRIVAL, 180, 30000, 300)

    def test_owner_can_add_and_remove_domain(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env)
        env["message"].sender_address = env["Address"]("0xOWNER")
        c.admin_add_domain("newtracker.example")
        assert c.is_domain_allowed("newtracker.example") is True
        c.admin_remove_domain("newtracker.example")
        assert c.is_domain_allowed("newtracker.example") is False

    def test_creator_can_withdraw_own_fees_only(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env, creator="0xCREATOR")
        buy_policy(env, c, premium=1000)  # accrues 200 creator fee
        env["message"].sender_address = env["Address"]("0xCREATOR")
        c.creator_withdraw_fees(200)
        assert env["evm"].transfers[-1] == ("0xCREATOR", 200)

        with pytest.raises(Exception):
            c.creator_withdraw_fees(1)  # nothing left accrued

    def test_non_creator_cannot_withdraw_creator_fees(self, fake_gl_env):
        env = fake_gl_env
        c = make_contract(env, creator="0xCREATOR")
        buy_policy(env, c, premium=1000)
        env["message"].sender_address = env["Address"]("0xSTRANGER")
        with pytest.raises(Exception):
            c.creator_withdraw_fees(1)
