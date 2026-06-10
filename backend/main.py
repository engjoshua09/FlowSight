"""
FlowSight — FastAPI backend
backend/main.py
"""

import asyncio
import datetime
import logging
import os
from contextlib import asynccontextmanager

import yfinance as yf
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from cache import (
    _redis,
    cache_delete,
    cache_get,
    cache_set,
    close_cache,
    init_cache,
    options_chain_key,
)
from greeks import compute_greeks
from tradier import get_options_chain
from uoa import compute_call_put_ratio, score_contracts

logger = logging.getLogger(__name__)

RISK_FREE_RATE = float(os.getenv("RISK_FREE_RATE", "0.053"))  # ~5.3% — update as needed


# ─── Helpers ─────────────────────────────────────────────────────────────────

def get_spot_price(ticker: str) -> float:
    """Fetch latest price via yfinance (sync — called via asyncio.to_thread)."""
    try:
        return float(yf.Ticker(ticker).fast_info["last_price"])
    except Exception as exc:
        logger.warning("yfinance failed for %s: %s", ticker, exc)
        return 0.0


def dte_to_years(expiration_date: str) -> float:
    """Convert expiration date string to years-to-expiry for Black-Scholes."""
    try:
        exp = datetime.datetime.strptime(expiration_date, "%Y-%m-%d")
        today = datetime.datetime.today().replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        days = max((exp - today).days, 0)
        return max(days / 365, 1e-4)
    except Exception:
        return 1e-4


def enrich_with_greeks(contracts: list, spot: float) -> list:
    """Add delta/gamma/theta/vega to each raw Tradier contract dict."""
    enriched = []
    for c in contracts:
        strike = c.get("strike", 0)
        sigma = c.get("implied_volatility") or 0.3  # fallback IV if Tradier returns null
        option_type = c.get("option_type", "call")
        T = dte_to_years(c.get("expiration_date", ""))

        greeks = {}
        if spot > 0 and strike > 0:
            greeks = compute_greeks(spot, strike, T, RISK_FREE_RATE, sigma, option_type)

        enriched.append({**c, **greeks})
    return enriched


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_cache()   # connect Redis on startup
    yield
    await close_cache()  # clean disconnect on shutdown


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="FlowSight API", version="0.3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # allows Vercel frontend to call this API
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    """
    Health check endpoint.
    Accepts both GET and HEAD so UptimeRobot's HEAD requests return 200.
    """
    redis_ok = False
    if _redis:
        try:
            await _redis.ping()
            redis_ok = True
        except Exception:
            pass
    return JSONResponse({"status": "ok", "redis": redis_ok})


@app.get("/options/{ticker}")
async def get_options(ticker: str):
    """
    Returns Greeks + UOA scores for all contracts on the nearest expiry.

    Cache flow:
      1. Check Redis for raw Tradier response + spot price.
      2. Miss → fetch from Tradier + yfinance, cache the raw data (5 min TTL).
      3. Always compute Greeks + UOA fresh (fast, no API cost).
    """
    ticker = ticker.upper()
    raw_key = options_chain_key(ticker)

    # 1. Cache check
    cached = await cache_get(raw_key)
    cache_hit = cached is not None

    if cache_hit:
        contracts_raw = cached["contracts"]
        spot = cached["spot_price"]
    else:
        # 2. Fetch — tradier.get_options_chain is sync, run in thread pool
        try:
            contracts_raw = await asyncio.to_thread(get_options_chain, ticker)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Tradier error: {exc}")

        spot = await asyncio.to_thread(get_spot_price, ticker)

        if not contracts_raw:
            raise HTTPException(
                status_code=404, detail=f"No options found for {ticker}"
            )

        await cache_set(raw_key, {"contracts": contracts_raw, "spot_price": spot})

    # 3. Compute always fresh
    enriched = enrich_with_greeks(contracts_raw, spot)
    scored = score_contracts(enriched)
    bias = compute_call_put_ratio(enriched)

    return {
        "ticker": ticker,
        "spot_price": spot,
        "implied_bias": bias["implied_bias"],
        "call_put_ratio": bias["call_put_ratio"],
        "call_volume": bias["call_volume"],
        "put_volume": bias["put_volume"],
        "cache_hit": cache_hit,
        "contracts": scored,
    }


@app.get("/options/{ticker}/refresh")
async def refresh_options(ticker: str):
    """Bust the cache and return a fresh fetch."""
    ticker = ticker.upper()
    await cache_delete(options_chain_key(ticker))
    return await get_options(ticker)