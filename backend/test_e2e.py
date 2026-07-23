"""
FlowSight — End-to-end smoke tests against the live deployed backend.
backend/test_e2e.py

These tests run against the live Render URL with no mocking, exercising
the full request path from HTTP call through Tradier, yfinance, Greeks
computation, and UOA scoring to the final JSON response.

Tests that require live market data (contracts, Greeks, UOA scores) are
skipped automatically when the US market is closed, since Tradier sandbox
returns empty chains outside trading hours. This is expected behaviour,
not a bug — the skip message explains the condition and how to re-run.

Run manually:
    pytest backend/test_e2e.py -v -m e2e

Triggered automatically:
    - Daily schedule at 2pm UTC (10am ET, market open) on weekdays
    - Manual workflow_dispatch from GitHub Actions UI
"""

import pytest
import requests

BASE_URL = "https://flowsight-api-r6e9.onrender.com"
TIMEOUT = 90  # Render free tier cold starts can take up to 60s


# ── Helpers ──────────────────────────────────────────────────────────────────


def get_options(ticker: str, **params) -> dict:
    resp = requests.get(
        f"{BASE_URL}/options/{ticker}",
        params=params,
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def skip_if_market_closed(data: dict, reason: str = "") -> None:
    """
    Call at the start of any test that needs live contract data.
    Skips the test gracefully when market is closed and no usable
    data is available, rather than failing on an expected condition.
    """
    market_open = data.get("market_open", False)
    spot = data.get("spot_price", 0)
    contracts = data.get("contracts", [])
    from_snapshot = data.get("from_snapshot", False)

    # Skip if market is closed AND we have no usable data
    if not market_open and (len(contracts) == 0 or spot == 0) and not from_snapshot:
        base = "Market is closed and no snapshot is available."
        detail = f" {reason}" if reason else ""
        hint = " Re-run during US market hours (9:30am–4:00pm ET) to verify."
        pytest.skip(base + detail + hint)


# ── Health ────────────────────────────────────────────────────────────────────


@pytest.mark.e2e
def test_health_endpoint_returns_ok():
    """
    Backend is reachable and reports healthy.
    Uses a long timeout to account for Render free-tier cold starts.
    """
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
    moneyness filter. The response looks valid but the data is unusable.

    Skipped when market is closed — spot price from yfinance is unreliable
    outside trading hours and the snapshot fallback may not exist yet.
    """
    data = get_options("AAPL")
    skip_if_market_closed(
        data,
        reason="spot_price=0 after hours is expected when yfinance is rate-limited.",
    )

    assert data["spot_price"] > 0, (
        f"yfinance returned 0 for AAPL spot price during market hours — "
        f"rate limited or unavailable on Render free tier. "
        f"Full response: {data}"
    )


# ── Contract data ─────────────────────────────────────────────────────────────


@pytest.mark.e2e
def test_contracts_are_returned():
    """
    At least some contracts come back — empty list means the data pipeline broke.
    Skipped after hours when Tradier sandbox returns no chain data.
    """
    data = get_options("AAPL")
    skip_if_market_closed(
        data,
        reason="Empty contracts list is expected outside US market hours.",
    )

    assert len(data["contracts"]) > 0, (
        "No contracts returned for AAPL during market hours. "
        "Check Tradier sandbox, spot price, or moneyness filter."
    )


@pytest.mark.e2e
def test_greeks_are_present_and_nonzero():
    """
    Greeks should be computed for near-ATM contracts during market hours.
    If spot_price was 0, all Greeks will be 0 or missing — this catches
    the downstream effect of the yfinance-zero failure mode.

    Skipped after hours since spot=0 is expected when yfinance rate-limits.
    """
    data = get_options("AAPL")
    skip_if_market_closed(
        data,
        reason="Greeks cannot be computed without a valid spot price.",
    )

    spot = data["spot_price"]
    assert spot > 0, "Spot price is 0 during market hours — yfinance rate limited."

    contracts = data["contracts"]
    assert len(contracts) > 0, "No contracts returned — cannot check Greeks."

    # Find near-ATM contracts (within 5% of spot)
    atm_contracts = [
        c
        for c in contracts
        if c.get("strike") and abs(c["strike"] - spot) / spot < 0.05 and c.get("volume", 0) > 0
    ]

    assert len(atm_contracts) > 0, (
        f"No near-ATM contracts found within 5% of spot ${spot:.2f}. "
        "Check moneyness filter or Tradier data."
    )

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
    """
    All required top-level fields are present in the API response.
    This test runs regardless of market hours — shape should always be correct.
    """
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
        "from_snapshot",
        "contracts",
    ]
    for field in required_fields:
        assert field in data, (
            f"Missing top-level field: '{field}'. " f"Present fields: {list(data.keys())}"
        )


@pytest.mark.e2e
def test_contract_fields():
    """
    Every contract has the expected fields including Greeks and UOA.
    Skipped after hours when spot=0 causes Greeks to be absent.
    """
    data = get_options("AAPL")
    skip_if_market_closed(
        data,
        reason="Greeks fields absent from contracts when spot_price=0 after hours.",
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
            assert field in c, (
                f"Contract missing field '{field}'. "
                f"Contract symbol: {c.get('symbol', 'unknown')}. "
                f"Present fields: {list(c.keys())}"
            )


# ── Multi-expiry ──────────────────────────────────────────────────────────────


@pytest.mark.e2e
def test_expirations_list_is_populated():
    """
    Tradier should return multiple expiry dates for liquid tickers.
    Expirations are returned even after hours so this always runs.
    """
    data = get_options("AAPL")

    # Expirations should always come back regardless of market hours
    assert len(data["expirations"]) >= 3, (
        f"Only {len(data['expirations'])} expiries returned for AAPL. "
        "Tradier sandbox may be returning sparse data."
    )


@pytest.mark.e2e
def test_specific_expiry_returns_contracts():
    """
    Fetching a specific expiry returns contracts scoped to that date.
    Skipped after hours since Tradier sandbox returns empty chains.
    """
    data = get_options("SPY")
    skip_if_market_closed(
        data,
        reason="Expiry switching test requires live chain data from Tradier.",
    )

    expirations = data["expirations"]
    assert len(expirations) >= 2, "Need at least 2 expiries to test switching."

    # Use the second expiry to confirm switching works
    second_expiry = expirations[1]
    data2 = get_options("SPY", expiration=second_expiry)

    skip_if_market_closed(
        data2,
        reason=f"No contracts for SPY expiry {second_expiry} outside market hours.",
    )

    assert data2[
        "contracts"
    ], f"No contracts returned for SPY expiry {second_expiry} during market hours."

    # All returned contracts should be for the requested expiry
    for c in data2["contracts"][:5]:
        assert c.get("expiration_date") == second_expiry, (
            f"Contract expiry mismatch: expected {second_expiry}, "
            f"got {c.get('expiration_date')}"
        )


# ── Error handling ────────────────────────────────────────────────────────────


@pytest.mark.e2e
def test_invalid_ticker_returns_404():
    """
    A nonsense ticker should return 404, not crash the server.
    This always runs regardless of market hours.
    """
    resp = requests.get(
        f"{BASE_URL}/options/XXXXINVALID",
        timeout=TIMEOUT,
    )
    assert resp.status_code in (404, 502), (
        f"Expected 404 or 502 for invalid ticker, got {resp.status_code}. "
        "Server should handle bad tickers gracefully."
    )
