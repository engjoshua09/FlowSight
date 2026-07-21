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
TIMEOUT = 30  # Render free tier may be cold-starting


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
    """Backend is reachable and reports healthy."""
    resp = requests.get(f"{BASE_URL}/health", timeout=TIMEOUT)
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"


# ── yfinance-zero failure mode ────────────────────────────────────────────────


@pytest.mark.e2e
def test_spot_price_is_nonzero():
    """
    yfinance-zero failure mode: if yfinance is rate-limited on Render's
    free tier, spot_price returns 0.0. This causes enrich_with_greeks to
    skip all Greeks and score_contracts to drop all contracts via the
    moneyness filter (abs(strike - 0) / 0 raises ZeroDivisionError or
    skips everything). The response looks valid but the data is unusable.

    This test catches that silently broken state automatically.
    """
    data = get_options("AAPL")

    # Core failure mode check
    assert data["spot_price"] > 0, (
        f"yfinance returned 0 for AAPL spot price — "
        f"rate limited or unavailable on Render free tier. "
        f"Full response: {data}"
    )


@pytest.mark.e2e
def test_contracts_are_returned():
    """At least some contracts come back — empty list means pipeline broke."""
    data = get_options("AAPL")
    assert len(data["contracts"]) > 0, (
        "No contracts returned for AAPL. " "Check Tradier sandbox, spot price, or moneyness filter."
    )


@pytest.mark.e2e
def test_greeks_are_present_and_nonzero():
    """
    Greeks should be computed for near-ATM contracts.
    If spot_price was 0, all Greeks will be 0 or missing.
    This catches the downstream effect of the yfinance-zero failure.
    """
    data = get_options("AAPL")
    spot = data["spot_price"]
    contracts = data["contracts"]

    assert spot > 0, "Spot price is 0 — Greeks test cannot run meaningfully."

    # Find near-ATM contracts (within 5% of spot)
    atm_contracts = [
        c
        for c in contracts
        if abs(c.get("strike", 0) - spot) / spot < 0.05 and c.get("volume", 0) > 0
    ]

    assert len(atm_contracts) > 0, (
        f"No near-ATM contracts found within 5% of spot ${spot:.2f}. "
        "Check moneyness filter or Tradier data."
    )

    # At least one ATM contract should have real Greeks
    has_delta = any(c.get("delta") not in (None, 0) for c in atm_contracts)
    has_gamma = any(c.get("gamma") not in (None, 0) for c in atm_contracts)

    assert has_delta, (
        "All near-ATM contracts have delta=0 or missing. "
        "Likely caused by yfinance returning spot_price=0."
    )
    assert has_gamma, (
        "All near-ATM contracts have gamma=0 or missing. "
        "Likely caused by yfinance returning spot_price=0."
    )


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
    """Every contract has the expected fields including Greeks and UOA."""
    data = get_options("AAPL")
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
    for c in contracts[:5]:  # check first 5 to keep test fast
        for field in required:
            assert field in c, (
                f"Contract missing field '{field}'. " f"Contract: {c.get('symbol', 'unknown')}"
            )


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
