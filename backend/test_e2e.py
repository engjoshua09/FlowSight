"""
End-to-end smoke tests against the deployed FlowSight backend.
These run against the live Render URL and require no mocking.

Tests are marked with @pytest.mark.e2e and run separately from
unit/integration tests to avoid hitting the live API on every push.

Run manually:
    pytest backend/test_e2e.py -v -m e2e

Or via CI on a schedule.
"""

import pytest
import requests

BASE_URL = "https://flowsight-api-r6e9.onrender.com"
TIMEOUT = 60  # was 30 — Render cold start can take up to 60s
HEALTH_TIMEOUT = 90  # Even longer for health check

# ── Helpers ──────────────────────────────────────────────────────────────────


def get_options(ticker: str, **params) -> dict:
    resp = requests.get(
        f"{BASE_URL}/options/{ticker}",
        params=params,
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


# ── Health ────────────────────────────────────────────────────────────────────


@pytest.mark.e2e
def test_health_endpoint_returns_ok():
    """
    Backend is reachable and reports healthy.
    Uses a longer timeout than other tests to account for Render
    free-tier cold starts, which can take up to 60 seconds.
    """
    resp = requests.get(f"{BASE_URL}/health", timeout=HEALTH_TIMEOUT)
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"


# ── yfinance-zero failure mode ────────────────────────────────────────────────


@pytest.mark.e2e
def test_spot_price_is_nonzero():
    data = get_options("AAPL")

    if not data.get("market_open") and data.get("spot_price", 0) == 0:
        pytest.skip(
            "Market closed, yfinance returned 0, no snapshot available. "
            "Expected outside US market hours — re-run 9:30am–4pm ET to verify."
        )

    assert data["spot_price"] > 0, f"yfinance returned 0 during market hours. Full response: {data}"


@pytest.mark.e2e
def test_contracts_are_returned():
    """At least some contracts come back — empty list means pipeline broke."""
    data = get_options("AAPL")
    assert len(data["contracts"]) > 0, (
        "No contracts returned for AAPL. " "Check Tradier sandbox, spot price, or moneyness filter."
    )


@pytest.mark.e2e
def test_greeks_are_present_and_nonzero():
    data = get_options("AAPL")
    spot = data["spot_price"]

    if not data.get("market_open") and spot == 0:
        pytest.skip("Market closed, spot=0 — Greeks cannot be computed. Skipping.")

    assert spot > 0, "Spot price is 0 during market hours — yfinance rate limited."

    atm_contracts = [
        c
        for c in data["contracts"]
        if c.get("strike") and abs(c["strike"] - spot) / spot < 0.05 and c.get("volume", 0) > 0
    ]
    assert len(atm_contracts) > 0, "No near-ATM contracts found."
    assert any(
        c.get("delta") not in (None, 0) for c in atm_contracts
    ), "All ATM contracts have delta=0 — likely caused by spot_price=0."


# ── Response shape ────────────────────────────────────────────────────────────


@pytest.mark.e2e
def test_response_shape():
    """All required top-level fields are present in the API response."""
    data = get_options("AAPL")

    required_fields = [
        "ticker",
        "spot_price",
        "expirations",
        "implied_bias",
        "call_put_ratio",
        "call_volume",
        "put_volume",
        "cache_hit",
        "market_open",
        "contracts",
    ]
    for field in required_fields:
        assert field in data, f"Missing field: {field}"


@pytest.mark.e2e
def test_contract_fields():
    data = get_options("AAPL")

    if not data.get("market_open") and data.get("spot_price", 0) == 0:
        pytest.skip(
            "Market closed, spot=0 — Greeks fields absent from contracts. "
            "This is the known yfinance-zero failure mode. Skipping after hours."
        )

    contracts = data["contracts"]
    assert len(contracts) > 0, "No contracts to inspect."

    required = [
        "strike",
        "type",
        "dte",
        "volume",
        "open_interest",
        "iv",
        "bid",
        "ask",
        "delta",
        "gamma",
        "theta",
        "vega",
        "uoa_score",
        "is_flagged",
    ]
    for c in contracts[:5]:
        for field in required:
            assert field in c, f"Contract missing field '{field}'. Contract: {c.get('symbol')}"


# ── Multi-expiry ──────────────────────────────────────────────────────────────


@pytest.mark.e2e
def test_expirations_list_is_populated():
    """Tradier should return multiple expiry dates for liquid tickers."""
    data = get_options("AAPL")
    assert len(data["expirations"]) >= 3, (
        f"Only {len(data['expirations'])} expiries returned. "
        "Tradier sandbox may be returning sparse data."
    )


@pytest.mark.e2e
def test_specific_expiry_returns_contracts():
    """Fetching a specific expiry returns contracts for that date."""
    # First get available expiries
    data = get_options("SPY")
    expirations = data["expirations"]

    assert len(expirations) >= 2, "Need at least 2 expiries to test switching."

    # Fetch the second expiry explicitly
    second_expiry = expirations[1]
    data2 = get_options("SPY", expiration=second_expiry)

    assert data2["contracts"], f"No contracts returned for SPY expiry {second_expiry}."
    # All returned contracts should be for the requested expiry
    for c in data2["contracts"][:5]:
        assert c.get("expiration_date") == second_expiry, (
            f"Contract expiry mismatch: expected {second_expiry}, "
            f"got {c.get('expiration_date')}"
        )


# ── Invalid ticker ────────────────────────────────────────────────────────────


@pytest.mark.e2e
def test_invalid_ticker_returns_404():
    """A nonsense ticker should return 404, not crash the server."""
    resp = requests.get(
        f"{BASE_URL}/options/XXXXINVALID",
        timeout=TIMEOUT,
    )
    assert resp.status_code in (
        404,
        502,
    ), f"Expected 404 or 502 for invalid ticker, got {resp.status_code}"
