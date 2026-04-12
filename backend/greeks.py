import numpy as np
from scipy.stats import norm

def compute_greeks(S, K, T, r, sigma, option_type="call"):
    # Clamp to avoid division by zero
    T = max(T, 0.001)
    sigma = max(sigma, 0.001)

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
    theta = theta_call if option_type == "call" else theta_put
    theta = theta / 365

    vega = S * norm.pdf(d1) * np.sqrt(T) / 100

    return {
        "delta": round(float(delta), 4),
        "gamma": round(float(gamma), 4),
        "theta": round(float(theta), 4),
        "vega":  round(float(vega), 4),
    }