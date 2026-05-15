import numpy as np
from scipy.stats import norm

def compute_greeks(S, K, T, r, sigma, option_type="call"): # option_type automatically becomes "call" if no input
    MIN_T = 1e-4      # prevents division by zero at expiry
    MIN_SIGMA = 1e-4  # prevents division by zero at near-zero volatility
    T = max(T, MIN_T)
    sigma = max(sigma, MIN_SIGMA)

    d1 = (np.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)

    if option_type == "call":
        delta = norm.cdf(d1)
    else:
        delta = norm.cdf(d1) - 1

    gamma = norm.pdf(d1) / (S * sigma * np.sqrt(T))

    theta_call = (
        -(S * norm.pdf(d1) * sigma) / (2 * np.sqrt(T))
        - r * K * np.exp(-r * T) * norm.cdf(d2)
    )
    theta_put = theta_call + r * K * np.exp(-r * T)
    theta_year = theta_call if option_type == "call" else theta_put
    theta = theta_year / 365

    vega = S * norm.pdf(d1) * np.sqrt(T) / 100

    return {
        "delta": round(float(delta), 4),
        "gamma": round(float(gamma), 4),
        "theta": round(float(theta), 4),
        "vega":  round(float(vega), 4),
    }