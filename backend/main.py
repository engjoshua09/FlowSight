from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from tradier import get_options_chain
from greeks import compute_greeks
import requests as req
import yfinance as yf

def get_stock_price(ticker: str) -> float:
    stock = yf.Ticker(ticker)
    hist = stock.history(period="1d")
    return float(hist["Close"].iloc[-1])

app = FastAPI()

# This is critical — without it, your React app can't call this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this later in production
    allow_methods=["*"],
    allow_headers=["*"],
)

RISK_FREE_RATE = 0.05  # 5% — you can fetch this live later

@app.get("/")
def root():
    return {"status": "FlowSight backend is running"}

@app.get("/options/{ticker}")
def options_chain(ticker: str):
    ticker = ticker.upper().strip()
    if not ticker.isalpha():
        raise HTTPException(status_code=400, detail="Invalid ticker symbol")

    try:
        raw_contracts = get_options_chain(ticker)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Tradier API error: {str(e)}")

    if not raw_contracts:
        raise HTTPException(status_code=404, detail=f"No options data found for {ticker}")

    results = []
    S = get_stock_price(ticker)
    for c in raw_contracts:
        strike = c.get("strike")
        option_type = c.get("option_type")  # "call" or "put"
        iv = c.get("greeks", {}).get("mid_iv") or c.get("iv") or c.get("ask")
        if not iv or iv <= 0 or iv > 5:  # IV shouldn't be > 500%
            continue
        last_price = c.get("last") or 0
        expiration = c.get("expiration_date", "")

        # Skip contracts with missing critical data
        if not strike or not option_type or not iv or iv <= 0:
            continue

        # Approximate stock price from mid of bid/ask (good enough for PoC)
        bid = c.get("bid") or 0
        ask = c.get("ask") or 0

        import datetime
        try:
            exp_date = datetime.datetime.strptime(expiration, "%Y-%m-%d")
            T = max((exp_date - datetime.datetime.today()).days / 365, 0.001)
        except:
            T = 0.1  # fallback

        greeks = compute_greeks(S=S, K=strike, T=T, r=RISK_FREE_RATE, sigma=iv, option_type=option_type)

        results.append({
            "ticker": ticker,
            "strike": strike,
            "type": option_type,
            "expiration": expiration,
            "bid": bid,
            "ask": ask,
            "volume": c.get("volume", 0),
            "open_interest": c.get("open_interest", 0),
            "iv": round(iv, 4),
            **greeks  # spreads delta, gamma, theta, vega into this dict
        })

    return {"ticker": ticker, "contracts": results}