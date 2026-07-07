import numpy as np
from tradier import get_options_chain
import datetime
import logging

logger = logging.getLogger(__name__)

# Flagging thresholds
MIN_VOLUME_OI_RATIO = 10.0
MIN_UOA_SCORE = 3.0
MIN_ZSCORE = 2.0
MAX_DTE = 30
MIN_ABSOLUTE_VOLUME = 100
MIN_OI = 10
# MAX_MONEYNESS removed — now passed in as a parameter from the frontend slider

def compute_dte(expiration_date: str) -> int:
    try:
        exp = datetime.datetime.strptime(expiration_date, "%Y-%m-%d")
        today = datetime.datetime.today().replace(hour=0, minute=0, second=0, microsecond=0)
        return max((exp - today).days, 0)
    except Exception:
        return 999

def compute_zscore(volume: float, historical_volumes: list) -> float:
    if len(historical_volumes) < 5:
        return 0.0

    mean = np.mean(historical_volumes)
    std = np.std(historical_volumes)

    if std == 0:
        return 0.0

    return float((volume - mean) / std)

def compute_volume_oi_ratio(volume: float, open_interest: float) -> float:
    if open_interest <= 0:
        return 0.0
    return float(volume / open_interest)

def compute_uoa_score(volume: float, open_interest: float, historical_volumes: list) -> float:
    ratio = compute_volume_oi_ratio(volume, open_interest)
    zscore = compute_zscore(volume, historical_volumes)
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
    historical_volumes: list = None,      
) -> list:
    scored = []

    for c in contracts:
        volume = c.get("volume") or 0
        open_interest = c.get("open_interest") or 0
        expiration = c.get("expiration_date", "")
        option_type = c.get("option_type", "")
        strike = c.get("strike") or 0

        # skip low absolute volume 
        if volume < MIN_ABSOLUTE_VOLUME:
            continue

        # skip illiquid contracts
        if open_interest < MIN_OI:
            continue

        # skip strikes outside user-selected moneyness range
        if spot > 0 and strike > 0:
            moneyness = abs(strike - spot) / spot
            if moneyness > max_moneyness:
                continue

        dte = compute_dte(expiration)

        # Use real 30-day history if provided, else fall back to simulation
        if historical_volumes and len(historical_volumes) >= 5:
            hist = historical_volumes
        else:
            logger.warning(
                "score_contracts: no real historical_volumes provided "
                "— falling back to simulation. Z-scores will be unreliable."
            )
            hist = simulate_historical_volumes(volume)

        uoa_score = compute_uoa_score(volume, open_interest, hist)
        vol_oi_ratio = compute_volume_oi_ratio(volume, open_interest)
        zscore = compute_zscore(volume, hist)

        is_flagged = (
            uoa_score > MIN_VOLUME_OI_RATIO and
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
            "is_flagged": is_flagged,
            "disclaimer": (
                "⚠ Elevated activity detected. May reflect directional "
                "positioning, hedging, or spread construction. "
                "Not a directional prediction."
                if is_flagged else None
            )
        })

    scored.sort(key=lambda x: x["uoa_score"], reverse=True)
    return scored

def simulate_historical_volumes(current_volume: float) -> list:
    if current_volume == 0:
        return [0] * 30

    np.random.seed(42)
    mean = current_volume * 0.4
    std = mean * 0.3
    history = np.random.normal(mean, std, 30)
    history = np.clip(history, 0, None)
    return history.tolist()
