import numpy as np
from tradier import get_options_chain
import datetime

# Flagging thresholds — configurable constants
MIN_VOLUME_OI_RATIO = 3.0
MIN_ZSCORE = 2.0
MAX_DTE = 30

def compute_dte(expiration_date: str) -> int:
    """Returns days to expiry from today."""
    try:
        exp = datetime.datetime.strptime(expiration_date, "%Y-%m-%d")
        today = datetime.datetime.today().replace(hour=0, minute=0, second=0, microsecond=0)
        return max((exp - today).days, 0)
    except Exception:
        return 999

def compute_zscore(volume: float, historical_volumes: list) -> float:
    """
    Z-score = (today's volume - 30d mean) / 30d std deviation
    Measures how many standard deviations above normal today's volume is.
    """
    if len(historical_volumes) < 5:
        return 0.0  # not enough data to compute reliable z-score

    mean = np.mean(historical_volumes)
    std = np.std(historical_volumes)

    if std == 0:
        return 0.0  # avoid division by zero if all volumes are identical

    return float((volume - mean) / std)

def compute_volume_oi_ratio(volume: float, open_interest: float) -> float:
    """ Volume/OI ratio — measures how much new activity is happening relative to existing positions. """
    if open_interest <= 0:
        return 0.0  # avoid division by zero
    return float(volume / open_interest)

def compute_uoa_score(volume: float, open_interest: float, historical_volumes: list) -> float:
    """
    UOA_score = (Volume / OI) × Volume_Z-score
    Higher score = more unusual the activity.
    """
    ratio = compute_volume_oi_ratio(volume, open_interest)
    zscore = compute_zscore(volume, historical_volumes)

    # Only positive z-scores matter — we want ABOVE average volume
    zscore = max(zscore, 0.0)

    return round(ratio * zscore, 4)

def compute_call_put_ratio(contracts: list) -> dict:
    """
    Aggregates call vs put volume for the whole ticker.
    Ratio > 1 = more calls = implied bullish bias
    Ratio < 1 = more puts  = implied bearish bias
    """
    call_volume = sum(
        c.get("volume", 0) for c in contracts
        if c.get("option_type") == "call"
    )
    put_volume = sum(
        c.get("volume", 0) for c in contracts
        if c.get("option_type") == "put"
    )

    if put_volume == 0:
        ratio = None  # can't compute
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

def score_contracts(contracts: list) -> list:
    """ Takes raw contracts from Tradier, scores each one, and returns flagged contracts sorted by UOA score. """
    # In production, historical_volumes will come from a real 30-day data store. For now we simulate it so the engine works end-to-end.
    scored = []

    for c in contracts:
        volume = c.get("volume") or 0
        open_interest = c.get("open_interest") or 0
        expiration = c.get("expiration_date", "")
        option_type = c.get("option_type", "")
        strike = c.get("strike")

        dte = compute_dte(expiration)

        # Simulate 30-day historical volumes for now
        # Replace this with real historical data in M1
        simulated_history = simulate_historical_volumes(volume)

        uoa_score = compute_uoa_score(volume, open_interest, simulated_history)
        vol_oi_ratio = compute_volume_oi_ratio(volume, open_interest)
        zscore = compute_zscore(volume, simulated_history)

        is_flagged = (
            uoa_score > MIN_VOLUME_OI_RATIO and
            dte <= MAX_DTE and
            volume > 0
        )

        scored.append({
            "strike": strike,
            "type": option_type,
            "expiration": expiration,
            "dte": dte,
            "volume": volume,
            "open_interest": open_interest,
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

    # Sort by UOA score descending — highest signal first
    scored.sort(key=lambda x: x["uoa_score"], reverse=True)
    return scored

def simulate_historical_volumes(current_volume: float) -> list:
    """
    Temporary placeholder — simulates 30 days of historical volume around the current volume with some random noise.
    Replace with real Tradier historical data in M1.
    """
    if current_volume == 0:
        return [0] * 30

    np.random.seed(42)  # reproducible results
    mean = current_volume * 0.4  # assume today is above average
    std = mean * 0.3
    history = np.random.normal(mean, std, 30)
    history = np.clip(history, 0, None)  # no negative volumes
    return history.tolist()