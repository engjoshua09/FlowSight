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

def get_options_chain(ticker: str):
    # Step 1: get available expiry dates
    exp_resp = requests.get(
        f"{BASE_URL}/markets/options/expirations",
        headers=HEADERS,
        params={"symbol": ticker}
    )
    exp_resp.raise_for_status()
    expirations = exp_resp.json().get("expirations", {}).get("date", [])

    if not expirations:
        return []

    # Step 2: skip expired dates — always fetch a future expiry
    today = datetime.date.today().isoformat()
    future_expiries = [e for e in expirations if e > today]

    if not future_expiries:
        # fallback: use whatever is available even if expired
        nearest_expiry = expirations[0]
    else:
        nearest_expiry = future_expiries[0]

    # Step 3: fetch the options chain for that expiry
    chain_resp = requests.get(
        f"{BASE_URL}/markets/options/chains",
        headers=HEADERS,
        params={"symbol": ticker, "expiration": nearest_expiry, "greeks": "false"}
    )
    chain_resp.raise_for_status()

    options = chain_resp.json().get("options", {}).get("option", [])

    # Tradier returns a single dict instead of a list when only one contract exists — normalise to always be a list
    if isinstance(options, dict):
        options = [options]

    return options