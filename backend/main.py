import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from tradier import get_options_chain
from greeks import compute_greeks
from uoa import score_contracts, compute_call_put_ratio
import yfinance as yf

def get_stock_price(ticker: str) -> float:
    stock = yf.Ticker(ticker)
    hist = stock.history(period="1d")
    return float(hist["Close"].iloc[-1])

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

RISK_FREE_RATE = 0.05

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

    try:
        S = get_stock_price(ticker)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not fetch stock price: {str(e)}")

    results = []
    for c in raw_contracts:
        strike = c.get("strike")
        option_type = c.get("option_type")
        iv = c.get("greeks", {}).get("mid_iv") or c.get("iv") or c.get("ask")

        if not strike or not option_type:
            continue
        if not iv or iv <= 0 or iv > 5:
            continue

        bid = c.get("bid") or 0
        ask = c.get("ask") or 0
        expiration = c.get("expiration_date", "")

        try:
            exp_date = datetime.datetime.strptime(expiration, "%Y-%m-%d")
            T = max((exp_date - datetime.datetime.today()).days / 365, 0.001)
        except Exception:
            T = 0.1

        greeks = compute_greeks(
            S=S, K=strike, T=T,
            r=RISK_FREE_RATE, sigma=iv,
            option_type=option_type
        )

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
            **greeks
        })

    return {"ticker": ticker, "contracts": results}

@app.get("/uoa/{ticker}")
def uoa_signals(ticker: str):
    ticker = ticker.upper().strip()
    if not ticker.isalpha():
        raise HTTPException(status_code=400, detail="Invalid ticker symbol")

    try:
        raw_contracts = get_options_chain(ticker)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Tradier API error: {str(e)}")

    if not raw_contracts:
        raise HTTPException(status_code=404, detail=f"No options data found for {ticker}")

    scored = score_contracts(raw_contracts)
    flagged = [c for c in scored if c["is_flagged"]]
    call_put = compute_call_put_ratio(raw_contracts)

    return {
        "ticker": ticker,
        "total_contracts": len(scored),
        "flagged_count": len(flagged),
        "call_put_ratio": call_put,
        "contracts": scored  # all contracts, sorted by UOA score
    }