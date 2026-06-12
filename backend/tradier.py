import datetime
import requests
import os
from dotenv import load_dotenv

load_dotenv()

TRADIER_TOKEN = os.getenv("TRADIER_TOKEN")
BASE_URL = "https://sandbox.tradier.com/v1"

HEADERS = {
    "Authorization": f"Bearer {TRADIER_TOKEN}",
    "Accept": "application/json",
}

def get_options_chain(ticker: str, expiration: str = None):
    """
    Returns (contracts, expirations) tuple.
    If expiration is provided, fetches that specific expiry.
    Otherwise fetches the nearest future expiry.
    """
    # Step 1: get all available expiry dates
    exp_resp = requests.get(
        f"{BASE_URL}/markets/options/expirations",
        headers=HEADERS,
        params={"symbol": ticker}
    )
    exp_resp.raise_for_status()
    expirations = exp_resp.json().get("expirations", {}).get("date", [])

    if not expirations:
        return [], []

    # Step 2: pick expiry — use provided one or nearest future
    if expiration and expiration in expirations:
        selected_expiry = expiration
    else:
        today = datetime.date.today().isoformat()
        future_expiries = [e for e in expirations if e > today]
        selected_expiry = future_expiries[0] if future_expiries else expirations[0]

    # Step 3: fetch the options chain
    chain_resp = requests.get(
        f"{BASE_URL}/markets/options/chains",
        headers=HEADERS,
        params={"symbol": ticker, "expiration": selected_expiry, "greeks": "false"}
    )
    chain_resp.raise_for_status()

    options = chain_resp.json().get("options", {}).get("option", [])

    # Tradier returns a dict instead of list when only one contract exists
    if isinstance(options, dict):
        options = [options]

    return options, expirations