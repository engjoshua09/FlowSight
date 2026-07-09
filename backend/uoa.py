import numpy as np
import datetime
import logging

logger = logging.getLogger(__name__)

# Flagging thresholds
MIN_VOLUME_OI_RATIO_DISPLAY = 10.0  # not used in scoring, only for display
MIN_UOA_SCORE = 3.0
MIN_ZSCORE = 2.0
MAX_DTE = 30
MIN_ABSOLUTE_VOLUME = 100
MIN_OI = 50


def compute_dte(expiration_date: str) -> int:
    try:
        exp = datetime.datetime.strptime(expiration_date, "%Y-%m-%d")
        today = datetime.datetime.today().replace(hour=0, minute=0, second=0, microsecond=0)
        return max((exp - today).days, 0)
    except Exception:
        return 999


def compute_zscore(volume: float, population_volumes: list) -> float:
    """
    Cross-sectional Z-score: how unusual is this contract's volume compared
    to every other contract in the same chain, today?

    This intentionally does NOT compare against historical time-series data.
    Stock share volume and option contract volume are different populations
    with no fixed ratio between them — dividing stock volume by any constant
    to approximate an options baseline produces a mean that's wrong for most
    tickers most of the time. Scoring against same-day peers avoids that
    unit-mismatch entirely, since every value being compared is already an
    option contract's volume, not a proxy for one.

    Requires at least 5 contracts in the chain to be statistically meaningful.
    """
    if len(population_volumes) < 5:
        return 0.0

    mean = float(np.mean(population_volumes))
    std = float(np.std(population_volumes))

    if std == 0:
        return 0.0

    return float((volume - mean) / std)


def compute_volume_oi_ratio(volume: float, open_interest: float) -> float:
    if open_interest <= 0:
        return 0.0
    return float(volume / open_interest)


def compute_uoa_score(volume: float, open_interest: float, population_volumes: list) -> float:
    ratio = compute_volume_oi_ratio(volume, open_interest)
    zscore = compute_zscore(volume, population_volumes)
    zscore = max(zscore, 0.0)
    return round(ratio * zscore, 4)


def compute_call_put_ratio(contracts: list) -> dict:
    call_volume = sum(
        c.get("volume", 0) for c in contracts
        if c.get("option_type") == "call"
    )
    put_volume = sum(
        c.get("volume", 0) for c in contracts
        if c.get("option_type") == "put"
    )

    if put_volume == 0:
        ratio = None
    else:
        ratio = round(call_volume / put_volume, 4)

    return {
        "call_volume": call_volume,
        "put_volume": put_volume,
        "call_put_ratio": ratio,
        "implied_bias": (
            "bullish" if ratio and ratio > 1.2
            else "bearish" if ratio and ratio < 0.8
            else "neutral"
        )
    }


def score_contracts(
    contracts: list,
    spot: float = 0,
    max_moneyness: float = 0.30,
) -> list:
    scored = []

    # Cross-sectional baseline: every contract's volume in today's chain.
    # See compute_zscore docstring for why this replaces the historical
    # stock-volume approach.
    population_volumes = [c.get("volume") or 0 for c in contracts]

    for c in contracts:
        volume = c.get("volume") or 0
        open_interest = c.get("open_interest") or 0
        expiration = c.get("expiration_date", "")
        option_type = c.get("option_type", "")
        strike = c.get("strike") or 0

        if volume < MIN_ABSOLUTE_VOLUME:
            continue
        if open_interest < MIN_OI:
            continue
        if spot > 0 and strike > 0:
            moneyness = abs(strike - spot) / spot
            if moneyness > max_moneyness:
                continue

            dte = compute_dte(expiration)

        uoa_score = compute_uoa_score(volume, open_interest, population_volumes)
        vol_oi_ratio = compute_volume_oi_ratio(volume, open_interest)
        zscore = compute_zscore(volume, population_volumes)

        bid = c.get("bid") or 0
        ask = c.get("ask") or 0
        mid_price = (bid + ask) / 2 if bid > 0 and ask > 0 else 0
        notional_value = round(volume * mid_price * 100, 2)  # 100 = contract multiplier

        is_flagged = (
            uoa_score >= MIN_UOA_SCORE and
            dte <= MAX_DTE and
            volume > 0
        )

        scored.append({
            **c,
            "dte": dte,
            "volume_oi_ratio": round(vol_oi_ratio, 4),
            "volume_zscore": round(zscore, 4),
            "uoa_score": uoa_score,
            "notional_value": notional_value,
            "is_flagged": is_flagged,
            "disclaimer": (
                "⚠ Elevated activity relative to other contracts in this "
                "chain today. May reflect directional positioning, hedging, "
                "or spread construction. Not a directional prediction."
                if is_flagged else None
            )
        })

       

    scored.sort(key=lambda x: x["uoa_score"], reverse=True)
    return scored