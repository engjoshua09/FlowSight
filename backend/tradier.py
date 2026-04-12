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

    # Use the nearest expiry
    nearest_expiry = expirations[0]

    # Step 2: get the options chain for that expiry
    chain_resp = requests.get(
        f"{BASE_URL}/markets/options/chains",
        headers=HEADERS,
        params={"symbol": ticker, "expiration": nearest_expiry, "greeks": "false"}
    )
    chain_resp.raise_for_status()

    options = chain_resp.json().get("options", {}).get("option", [])
    if not options:
        return []

    return options