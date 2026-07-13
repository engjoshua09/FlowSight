"""
FlowSight — FastAPI backend
backend/main.py
"""

import asyncio
import datetime
import logging
import math
import os
from contextlib import asynccontextmanager
from typing import Optional
from zoneinfo import ZoneInfo

import yfinance as yf
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from cache import (
    _redis,
    cache_delete,
    cache_get,
    cache_set,
    close_cache,
    init_cache,
    options_chain_key,
    snapshot_key,
    SNAPSHOT_TTL_SECONDS,
)
from greeks import compute_greeks
from tradier import get_options_chain
from uoa import compute_call_put_ratio, compute_dte, score_contracts

logger = logging.getLogger(__name__)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
RISK_FREE_RATE = float(os.getenv("RISK_FREE_RATE", "0.053"))

ET = ZoneInfo("America/New_York")


def is_market_open(now: datetime.datetime | None = None) -> bool:
    """
    Rough US equity market hours check: 9:30am-4:00pm ET, Mon-Fri.
    Does not account for market holidays. Accepts an optional `now`
    so this stays testable without patching the system clock.
    """
    now = now or datetime.datetime.now(ET)
    if now.weekday() >= 5:
        return False
    open_t = datetime.time(9, 30)
    close_t = datetime.time(16, 0)
    return open_t <= now.time() <= close_t


def get_spot_price(ticker: str) -> float:
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
    """
    Add delta/gamma/theta/vega to each raw Tradier contract dict.
    Also tags whether IV had to fall back to the 0.3 default, so downstream
    calculations (like expected move) can exclude fabricated IV values
    rather than silently averaging them in with real market data.
    """
    enriched = []
    for c in contracts:
        strike = c.get("strike", 0)
        option_type = c.get("option_type", "call")
        T = dte_to_years(c.get("expiration_date", ""))

        greeks_data = c.get("greeks") or {}
        raw_sigma = (
            greeks_data.get("mid_iv")
            or c.get("smv_vol")
            or c.get("implied_volatility")
        )

        iv_is_fallback = False
        try:
            sigma = float(raw_sigma)
            if sigma <= 0 or sigma > 5:
                sigma = 0.3
                iv_is_fallback = True
        except (TypeError, ValueError):
            sigma = 0.3
            iv_is_fallback = True

        greeks = {}
        if spot > 0 and strike > 0:
            greeks = compute_greeks(
                spot, strike, T, RISK_FREE_RATE, sigma, option_type
            )

        enriched.append({
            **c,
            "type": c.get("option_type", ""),
            "iv": round(sigma, 4),
            "iv_is_fallback": iv_is_fallback,
            "bid": c.get("bid") or 0,
            "ask": c.get("ask") or 0,
            **greeks
        })
    return enriched


def compute_expected_move(contracts: list, spot: float, dte: int) -> dict | None:
    """
    Estimates a 1-standard-deviation expected move range using ATM implied
    volatility (the contract closest to spot), not a chain-wide average.

    Averaging IV across every strike would blend in volatility skew and
    distort the estimate. Contracts where IV fell back to the 0.3 default
    (see enrich_with_greeks) are excluded entirely, so a fabricated guess
    never quietly contaminates a figure meant to represent what the market
    is actually pricing.

    Uses the full formula (spot * IV * sqrt(dte / 252)) rather than the
    common "IV / 16" shortcut, since that shortcut only holds at DTE=1 and
    silently produces the wrong answer for any other expiry.

    Returns None if there's no usable ATM IV or DTE to work from.
    """
    if spot <= 0 or dte <= 0:
        return None

    usable = [
        c for c in contracts
        if not c.get("iv_is_fallback") and c.get("strike")
    ]
    if not usable:
        return None

    min_distance = min(abs(c["strike"] - spot) for c in usable)
    atm_contracts = [c for c in usable if abs(c["strike"] - spot) == min_distance]
    atm_iv = sum(c["iv"] for c in atm_contracts) / len(atm_contracts)

    move = spot * atm_iv * math.sqrt(dte / 252)

    return {
        "atm_iv": round(atm_iv, 4),
        "atm_strike": atm_contracts[0]["strike"],
        "dte_used": dte,
        "expected_move": round(move, 2),
        "low": round(spot - move, 2),
        "high": round(spot + move, 2),
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_cache()
    yield
    await close_cache()


app = FastAPI(title="FlowSight API", version="0.4.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    redis_ok = False
    if _redis:
        try:
            await _redis.ping()
            redis_ok = True
        except Exception:
            pass
    return {"status": "ok", "redis": redis_ok}


@app.get("/options/{ticker}")
async def get_options(
    ticker: str,
    expiration: Optional[str] = Query(default=None),
    max_moneyness: float = Query(default=0.30, ge=0.05, le=1.0),
):
    """
    Returns Greeks + UOA scores for all contracts on the selected expiry,
    plus an ATM-IV-derived expected move range for the underlying.

    A Tradier request that raises an exception is a 502 (upstream failure).
    A Tradier request that succeeds but returns zero contracts is a 404,
    unless a market-hours snapshot exists to fall back to — in which case
    the snapshot is served instead of a hard error.
    """
    ticker = ticker.upper()
    market_open = is_market_open()
    raw_key = options_chain_key(ticker) + (f":{expiration}" if expiration else "")
    snap_key = snapshot_key(ticker)

    cached = await cache_get(raw_key)
    cache_hit = cached is not None
    from_snapshot = False

    if cache_hit:
        contracts_raw = cached["contracts"]
        spot = cached["spot_price"]
        expirations = cached.get("expirations", [])
    else:
        try:
            contracts_raw, expirations = await asyncio.to_thread(
                get_options_chain, ticker, expiration
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Tradier error: {exc}")

        spot = await asyncio.to_thread(get_spot_price, ticker)

        if not contracts_raw:
            snapshot = await cache_get(snap_key)
            if snapshot is not None and not market_open:
                contracts_raw = snapshot["contracts"]
                spot = snapshot["spot_price"]
                expirations = snapshot.get("expirations", [])
                from_snapshot = True
            else:
                raise HTTPException(
                    status_code=404, detail=f"No options found for {ticker}"
                )

        if not from_snapshot:
            await cache_set(raw_key, {
                "contracts": contracts_raw,
                "spot_price": spot,
                "expirations": expirations,
            })
            if market_open and len(contracts_raw) > 10:
                await cache_set(snap_key, {
                    "contracts": contracts_raw,
                    "spot_price": spot,
                    "expirations": expirations,
                }, ttl=SNAPSHOT_TTL_SECONDS)

    enriched = enrich_with_greeks(contracts_raw, spot)
    scored = score_contracts(enriched, spot, max_moneyness)
    bias = compute_call_put_ratio(enriched)

    dte_for_move = compute_dte(contracts_raw[0]["expiration_date"]) if contracts_raw else 0
    expected_move = compute_expected_move(enriched, spot, dte_for_move)

    return {
        "ticker": ticker,
        "spot_price": spot,
        "expirations": expirations,
        "implied_bias": bias["implied_bias"],
        "call_put_ratio": bias["call_put_ratio"],
        "call_volume": bias["call_volume"],
        "put_volume": bias["put_volume"],
        "cache_hit": cache_hit,
        "market_open": market_open,
        "from_snapshot": from_snapshot,
        "expected_move": expected_move,
        "contracts": scored,
    }


@app.get("/options/{ticker}/refresh")
async def refresh_options(
    ticker: str,
    expiration: Optional[str] = Query(default=None),
    max_moneyness: float = Query(default=0.30, ge=0.05, le=1.0),
):
    ticker = ticker.upper()
    raw_key = options_chain_key(ticker) + (f":{expiration}" if expiration else "")
    await cache_delete(raw_key)
    return await get_options(ticker, expiration, max_moneyness)