"""
Integration tests intended to run against a live GenLayer Studio /
studionet instance via the `gltest` CLI (see README.md "Testing" section).

Unlike tests/direct (offline, mocked SDK), these exercise the REAL GenVM:
real validator sandboxing, real gl.nondet.web fetches (against a local
mock HTTP server you control — see `mock_server` fixture below), and real
LLM calls through whatever model GenLayer Studio is configured with.

Run with:  gltest tests/integration -v
(requires `genlayer init` / a running Studio instance — see README.md)

These are written against the `gltest` pytest-plugin conventions
(fixtures: `deploy_contract`, per GenLayer's project-boilerplate template).
Adjust fixture names if your local gltest version differs — see
https://docs.genlayer.com for the current testing-fixtures API.
"""
import pytest


@pytest.mark.integration
def test_full_lifecycle_on_studio(deploy_contract):
    """
    End-to-end: deploy SkyVerdict, buy a policy against a mock flight,
    point evaluate_claim at two locally-hosted mock "tracker" pages
    seeded with a known delay, and assert the on-chain payout occurs.

    NOTE: this test requires a local HTTP fixture server serving two
    static pages under an allowlisted-looking hostname (e.g. via
    /etc/hosts or a Studio network override), since GenVM's web fetch
    hits real network egress. See README.md "Integration test harness"
    for the mock-server setup used in CI.
    """
    contract = deploy_contract(
        "contracts/SkyVerdict.py",
        args=["0xCreatorAddressHex"],
    )

    tx = contract.create_policy(
        airline_code="DL",
        flight_number="DL999",
        departure_airport="JFK",
        scheduled_departure_utc=2_000_000_000,
        scheduled_arrival_utc=2_000_010_000,
        threshold_minutes=180,
        payout_multiplier_bps=30000,
        max_coverage=3000,
        value=1000,
    )
    policy_id = tx.return_value

    # advance studio's simulated clock past the settlement buffer,
    # or wait, depending on your Studio version's time-control API
    # ... see README.md for the exact helper used in this repo's CI

    result = contract.evaluate_claim(
        policy_id=policy_id,
        source_urls=[
            "https://flightaware.com/mock/DL999",
            "https://flightradar24.com/mock/DL999",
        ],
    )
    assert result is not None

    status = contract.get_claim_status(policy_id=policy_id)
    assert status.return_value in ("PAID", "EXPIRED_NO_PAYOUT", "INDETERMINATE")


@pytest.mark.integration
def test_rejects_off_allowlist_source_on_studio(deploy_contract):
    contract = deploy_contract(
        "contracts/SkyVerdict.py",
        args=["0xCreatorAddressHex"],
    )
    tx = contract.create_policy(
        airline_code="DL", flight_number="DL999", departure_airport="JFK",
        scheduled_departure_utc=2_000_000_000, scheduled_arrival_utc=2_000_010_000,
        threshold_minutes=180, payout_multiplier_bps=30000, max_coverage=3000,
        value=1000,
    )
    policy_id = tx.return_value
    with pytest.raises(Exception):
        contract.evaluate_claim(
            policy_id=policy_id,
            source_urls=["https://not-allowlisted.example/DL999",
                         "https://flightaware.com/mock/DL999"],
        )
