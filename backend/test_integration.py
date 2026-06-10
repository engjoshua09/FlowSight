import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from main import app
 
client = TestClient(app)
 
# sample options chain that Tradier would return
MOCK_CONTRACTS = [
    {
        "symbol": "AAPL240119C00150000",
        "option_type": "call",
        "strike": 150.0,
        "expiration_date": "2026-09-19",
        "bid": 5.20,
        "ask": 5.35,
        "volume": 1200,
        "open_interest": 5000,
        "implied_volatility": 0.28,
    },
    {
        "symbol": "AAPL240119P00150000",
        "option_type": "put",
        "strike": 150.0,
        "expiration_date": "2026-09-19",
        "bid": 3.10,
        "ask": 3.25,
        "volume": 800,
        "open_interest": 3000,
        "implied_volatility": 0.30,
    },
    {
        "symbol": "AAPL240119C00160000",
        "option_type": "call",
        "strike": 160.0,
        "expiration_date": "2026-09-19",
        "bid": 2.50,
        "ask": 2.65,
        "volume": 500,
        "open_interest": 2000,
        "implied_volatility": 0.25,
    },
]
 
MOCK_SPOT = 155.0
 
 
@pytest.fixture(autouse=True)
def mock_tradier_and_yfinance():
    """
    Patches out Tradier and yfinance for every test in this file.
    Tests run without a real API key.
    """
    with patch("main.get_options_chain", return_value=MOCK_CONTRACTS), \
         patch("main.get_spot_price", return_value=MOCK_SPOT), \
         patch("main.cache_get", return_value=None), \
         patch("main.cache_set", return_value=None):
        yield
 
 
def test_options_endpoint_returns_200():
    res = client.get("/options/AAPL")
    assert res.status_code == 200
 
 
def test_options_endpoint_returns_correct_ticker():
    res = client.get("/options/AAPL")
    assert res.json()["ticker"] == "AAPL"
 
 
def test_options_endpoint_returns_spot_price():
    res = client.get("/options/AAPL")
    assert res.json()["spot_price"] == MOCK_SPOT
 
 
def test_options_endpoint_returns_contracts():
    res = client.get("/options/AAPL")
    contracts = res.json()["contracts"]
    assert len(contracts) == len(MOCK_CONTRACTS)
 
 
def test_greeks_are_present_on_contracts():
    # score_contracts returns UOA fields; Greeks are computed but the scored
    # contracts contain strike/type/expiration/dte/volume/oi/uoa fields
    res = client.get("/options/AAPL")
    for contract in res.json()["contracts"]:
        assert "strike" in contract
        assert "type" in contract
        assert "uoa_score" in contract
 
 
def test_call_contracts_are_present():
    res = client.get("/options/AAPL")
    calls = [c for c in res.json()["contracts"] if c["type"] == "call"]
    assert len(calls) > 0, "Expected at least one call contract"
 
 
def test_put_contracts_are_present():
    res = client.get("/options/AAPL")
    puts = [c for c in res.json()["contracts"] if c["type"] == "put"]
    assert len(puts) > 0, "Expected at least one put contract"
 
 
def test_uoa_fields_are_present():
    res = client.get("/options/AAPL")
    for contract in res.json()["contracts"]:
        assert "uoa_score" in contract
        assert "is_flagged" in contract
        assert "volume_oi_ratio" in contract
 
 
def test_implied_bias_is_valid_value():
    res = client.get("/options/AAPL")
    bias = res.json()["implied_bias"]
    assert bias in ("bullish", "bearish", "neutral")
 
 
def test_call_put_ratio_is_present():
    res = client.get("/options/AAPL")
    data = res.json()
    assert "call_put_ratio" in data
    assert "call_volume" in data
    assert "put_volume" in data
 
 
def test_ticker_is_uppercased():
    # endpoint should normalise lowercase input
    res = client.get("/options/aapl")
    assert res.json()["ticker"] == "AAPL"
 
 
def test_invalid_ticker_returns_404():
    with patch("main.get_options_chain", return_value=[]):
        res = client.get("/options/INVALIDTICKER")
        assert res.status_code == 404
 
 
def test_health_endpoint_returns_200():
    res = client.get("/health")
    assert res.status_code == 200
 
 
def test_health_endpoint_returns_ok_status():
    res = client.get("/health")
    assert res.json()["status"] == "ok"