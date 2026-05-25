import pytest
from greeks import compute_greeks

# ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
# Reference values from Hull's "Options, Futures, and Other Derivatives" (standard test case used industry-wide)
# ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

# Standard ATM test case
S = 100.0    # stock price
K = 100.0    # strike price (ATM = at the money)
T = 1.0      # 1 year to expiry
r = 0.05     # 5% risk-free rate
SIGMA = 0.2  # 20% implied volatility

# How close our answer needs to be to Hull's reference
# 0.001 = within 0.1% — tight enough to catch real bugs but allows for floating point rounding
TOLERANCE = 0.001

def test_call_delta_atm():
    """
    ATM call delta should be ~0.6368 per Hull reference.
    0.6368 because:
    d1 = (ln(100/100) + (0.05 + 0.02) * 1) / (0.2 * 1)
       = (0 + 0.07) / 0.2
       = 0.35
    N(0.35) = 0.6368
    """
    result = compute_greeks(
        S=S, K=K, T=T, r=r,
        sigma=SIGMA,
        option_type="call"
    )
    assert abs(result["delta"] - 0.6368) < TOLERANCE, (
        f"Call delta should be ~0.6368, got {result['delta']}"
    )

def test_put_delta_atm():
    """
    ATM put delta should be ~-0.3632 per Hull reference.
    Put delta = Call delta - 1
              = 0.6368 - 1
              = -0.3632
    This is put-call delta parity.
    """
    result = compute_greeks(
        S=S, K=K, T=T, r=r,
        sigma=SIGMA,
        option_type="put"
    )
    assert abs(result["delta"] - (-0.3632)) < TOLERANCE, (
        f"Put delta should be ~-0.3632, got {result['delta']}"
    )

def test_deep_itm_call_delta_near_one():
    """
    Deep ITM call (stock way above strike) → delta approaches 1.0
    The option moves almost dollar-for-dollar with the stock.
    """
    result = compute_greeks(
        S=200.0, K=100.0,   # stock is 2x the strike = deep ITM
        T=T, r=r, sigma=SIGMA,
        option_type="call"
    )
    assert result["delta"] > 0.95, (
        f"Deep ITM call delta should be > 0.95, got {result['delta']}"
    )

def test_deep_otm_call_delta_near_zero():
    """
    Deep OTM call (stock way below strike) → delta approaches 0.0
    The option barely moves when the stock moves.
    """
    result = compute_greeks(
        S=50.0, K=100.0,    # stock is half the strike = deep OTM
        T=T, r=r, sigma=SIGMA,
        option_type="call"
    )
    assert result["delta"] < 0.05, (
        f"Deep OTM call delta should be < 0.05, got {result['delta']}"
    )

def test_gamma_always_positive():
    """
    Gamma is always positive for both calls and puts.
    It measures rate of delta change — always an acceleration, never a deceleration.
    """
    call_result = compute_greeks(
        S=S, K=K, T=T, r=r,
        sigma=SIGMA, option_type="call"
    )
    put_result = compute_greeks(
        S=S, K=K, T=T, r=r,
        sigma=SIGMA, option_type="put"
    )
    assert call_result["gamma"] > 0, (
        f"Call gamma must be positive, got {call_result['gamma']}"
    )
    assert put_result["gamma"] > 0, (
        f"Put gamma must be positive, got {put_result['gamma']}"
    )

def test_call_put_gamma_equal():
    """
    Call and put gamma are always identical for same inputs.
    Gamma doesn't depend on option type — only on S, K, T, sigma.
    """
    call_result = compute_greeks(S=S, K=K, T=T, r=r, sigma=SIGMA, option_type="call")
    put_result  = compute_greeks(S=S, K=K, T=T, r=r, sigma=SIGMA, option_type="put")
    assert abs(call_result["gamma"] - put_result["gamma"]) < TOLERANCE, (
        f"Call and put gamma must be equal."
        f"Got call={call_result['gamma']}, put={put_result['gamma']}"
    )

def test_theta_always_negative():
    """
    Theta is always negative for long options (buyers).
    Time passing always hurts the option buyer — the option loses value every day even if stock doesn't move.
    """
    call_result = compute_greeks(S=S, K=K, T=T, r=r, sigma=SIGMA, option_type="call")
    put_result  = compute_greeks(S=S, K=K, T=T, r=r, sigma=SIGMA, option_type="put")
    assert call_result["theta"] < 0, (
        f"Call theta must be negative, got {call_result['theta']}"
    )
    assert put_result["theta"] < 0, (
        f"Put theta must be negative, got {put_result['theta']}"
    )

def test_theta_accelerates_near_expiry():
    """
    Theta decay accelerates as expiry approaches.
    An option with 7 days left loses more per day than one with 180 days left.
    """
    far_expiry  = compute_greeks(S=S, K=K, T=0.5,        r=r, sigma=SIGMA, option_type="call")
    near_expiry = compute_greeks(S=S, K=K, T=7/365,      r=r, sigma=SIGMA, option_type="call")
    assert abs(near_expiry["theta"]) > abs(far_expiry["theta"]), (
        f"Near expiry theta should be larger magnitude. "
        f"Got near={near_expiry['theta']}, far={far_expiry['theta']}"
    )

def test_vega_always_positive():
    """
    Vega is always positive for long options (buyers).
    Higher volatility = higher option value.
    More uncertainty = more chance of a big move in your favour.
    """
    call_result = compute_greeks(S=S, K=K, T=T, r=r, sigma=SIGMA, option_type="call")
    put_result  = compute_greeks(S=S, K=K, T=T, r=r, sigma=SIGMA, option_type="put")
    assert call_result["vega"] > 0, (
        f"Call vega must be positive, got {call_result['vega']}"
    )
    assert put_result["vega"] > 0, (
        f"Put vega must be positive, got {put_result['vega']}"
    )

def test_call_put_vega_equal():
    """
    Call and put vega are always identical for same inputs.
    Same reasoning as gamma — doesn't depend on option type.
    """
    call_result = compute_greeks(S=S, K=K, T=T, r=r, sigma=SIGMA, option_type="call")
    put_result  = compute_greeks(S=S, K=K, T=T, r=r, sigma=SIGMA, option_type="put")
    assert abs(call_result["vega"] - put_result["vega"]) < TOLERANCE, (
        f"Call and put vega must be equal. "
        f"Got call={call_result['vega']}, put={put_result['vega']}"
    )

def test_zero_dte_does_not_crash():
    """
    T = 0 would cause division by zero without MIN_T clamping.
    This test verifies the clamping works — expired contracts should return valid Greeks, not crash the server.
    """
    result = compute_greeks(
        S=S, K=K,
        T=0,        # expired contract
        r=r, sigma=SIGMA,
        option_type="call"
    )
    assert result is not None
    assert "delta" in result
    assert "gamma" in result
    assert "theta" in result
    assert "vega"  in result

def test_zero_sigma_does_not_crash():
    """
    sigma = 0 would cause division by zero without MIN_SIGMA clamping.
    Deep ITM/OTM options can have near-zero IV from Tradier.
    Server must not crash.
    """
    result = compute_greeks(
        S=S, K=K, T=T, r=r,
        sigma=0,    # zero volatility
        option_type="call"
    )
    assert result is not None
    assert "delta" in result

def test_negative_dte_does_not_crash():
    """
    Tradier sandbox sometimes returns expired contracts.
    Negative DTE should be clamped, not crash.
    """
    result = compute_greeks(
        S=S, K=K,
        T=-0.5,     # negative time — already expired
        r=r, sigma=SIGMA,
        option_type="call"
    )
    assert result is not None

def test_put_call_parity():
    """
    Put-Call Parity is a fundamental arbitrage relationship:
    Call - Put = S - K × e^(-rT)
    
    If this doesn't hold, there's a risk-free arbitrage opportunity which means your pricing is wrong. 
    This is the most important mathematical check in all of options pricing.
    """
    import math

    call_result = compute_greeks(S=S, K=K, T=T, r=r, sigma=SIGMA, option_type="call")
    put_result  = compute_greeks(S=S, K=K, T=T, r=r, sigma=SIGMA, option_type="put")

    # Delta put-call parity: call_delta - put_delta = 1 (always)
    delta_diff = call_result["delta"] - put_result["delta"]
    assert abs(delta_diff - 1.0) < TOLERANCE, (
        f"Put-call delta parity failed. "
        f"Call delta - Put delta should = 1.0, got {delta_diff}"
    )