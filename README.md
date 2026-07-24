# ⚡ FlowSight

**Options Flow Analytics for Retail Investors.** Surfaces unusual options activity and computes real-time Greeks so retail traders can see the kind of positioning data that usually sits behind a paid subscription.

> ⚠️ FlowSight is a decision-support tool, not a prediction engine. Unusual options activity may reflect hedging, rolling, or spread construction rather than directional conviction. Cross-reference with price action and fundamentals before placing any trade.

---

## 🔴 Live Demo

| Service | URL |
|---|---|
| Frontend | https://flowsight-two.vercel.app |
| Backend API | https://flowsight-api-r6e9.onrender.com |
| API Docs | https://flowsight-api-r6e9.onrender.com/docs |

The backend runs on Render's free tier and can take up to a minute to wake up on a cold start. A scheduled ping keeps it warm during typical usage hours, but the first request of the day may still be slow.

---

## ✨ Features

- **Live options chain.** Fetches the full chain for any US ticker via the Tradier API, with selectable expiries rather than only the nearest one.
- **Real-time Greeks.** Delta, Gamma, Theta, and Vega computed with Black-Scholes for every contract. Verified to within 0.1% of the standard reference values from Hull's *Options, Futures, and Other Derivatives*.
- **UOA signal detection.** Flags contracts using a live cross-sectional Z-score, comparing each contract's volume against every other contract in the same chain today rather than a static or historical threshold.
- **Notional value and skew.** Every flagged contract shows its actual dollar value (volume times the bid-ask midpoint times the contract multiplier), plus a notional-weighted call/put skew summary, so a high score backed by real capital can be told apart from one backed by a thin denominator.
- **Expected Move Range.** A one-standard-deviation price range derived from at-the-money implied volatility, using the full time-scaling formula rather than the IV/16 shortcut most retail tools rely on. Plotted alongside flagged UOA contracts so a user can see where unusual activity sits relative to what the market itself expects.
- **P&L Visualiser.** Click any contract in the Full Chain table to load it into the Greeks Calculator and see a payoff diagram at expiry, with break-even, max profit, and max loss stated directly. Single-leg, long positions only, payoff at expiry only, no time decay modeled ahead of expiration.
- **Market-hours snapshot fallback.** Tradier's sandbox returns an empty chain outside US market hours. If a ticker was searched at least once while the market was open, its last chain is served instead of a blank page. Tickers with no snapshot yet show a plain "market is closed" message instead of an empty table.
- **Redis caching.** A five-minute cache on every chain request, backed by Upstash, to stay within Tradier's sandbox rate limits.
- **Automated end-to-end testing.** A scheduled test suite runs against the live deployed backend every weekday morning, checking the real request path (Tradier, yfinance, Greeks, and UOA scoring together) rather than just mocked unit tests.

---

## 🚀 Local Setup

### Prerequisites

- Python 3.12+
- Node.js 20+
- Free [Tradier sandbox account](https://developer.tradier.com)
- Free [Upstash Redis instance](https://console.upstash.com)

### 1. Clone the repo

```bash
git clone https://github.com/engjoshua09/FlowSight.git
cd FlowSight
```

### 2. Backend

```bash
cd backend
python -m venv venv

# Mac/Linux
source venv/bin/activate
# Windows
venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env
# Open .env and fill in:
# TRADIER_TOKEN     — from https://developer.tradier.com
# REDIS_URL         — from https://console.upstash.com
# CACHE_TTL_SECONDS — defaults to 300 (5 minutes)
# RISK_FREE_RATE    — defaults to 0.053

uvicorn main:app --reload
# Runs at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### 3. Frontend

```bash
# In a second terminal
cd frontend
npm install
npm run dev
# Runs at http://localhost:5173
```

Both servers need to be running at the same time.

---

## 📖 Usage

1. Open **http://localhost:5173** (or the live demo link above).
2. Enter a ticker symbol, or pick one from the popular-ticker list.
3. Press **Search**.
4. Browse the Full Chain, UOA Signals, and Greeks Calculator tabs.
5. Click any row in the Full Chain table to load that contract into the Greeks Calculator and see its payoff diagram.

---

## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/options/{ticker}` | Returns the options chain with Greeks, UOA scores, and expected move range |
| GET | `/options/{ticker}/refresh` | Same as above, but bypasses the cache |

**Example response:**

```json
{
  "ticker": "AAPL",
  "spot_price": 227.41,
  "expirations": ["2026-08-15", "2026-08-22", "2026-09-19"],
  "implied_bias": "bearish",
  "call_put_ratio": 0.62,
  "call_volume": 147002,
  "put_volume": 237436,
  "cache_hit": false,
  "market_open": true,
  "from_snapshot": false,
  "expected_move": {
    "low": 221.30,
    "high": 233.50,
    "expected_move": 6.10,
    "atm_iv": 0.284,
    "dte_used": 5
  },
  "contracts": [
    {
      "strike": 230,
      "type": "call",
      "dte": 5,
      "bid": 5.20,
      "ask": 5.35,
      "volume": 1234,
      "open_interest": 5678,
      "iv": 0.2845,
      "delta": 0.5523,
      "gamma": 0.0312,
      "theta": -0.0521,
      "vega": 0.1847,
      "uoa_score": 12.4,
      "is_flagged": true
    }
  ]
}
```

---

## 🧪 Running Tests

```bash
cd backend

# Unit tests: Greeks engine against Hull reference values
python -m pytest test_greeks.py -v --tb=short

# Integration tests: mocked Tradier and yfinance, runs offline
python -m pytest test_integration.py -v --tb=short

# End-to-end tests: hits the live deployed backend, needs network access
python -m pytest test_e2e.py -v -m e2e --tb=short
```

Unit and integration tests run in CI on every push and pull request. The end-to-end suite runs separately on a scheduled weekday job and can also be triggered manually from the Actions tab, since it calls the live backend and shouldn't run on every commit. A few end-to-end tests are skipped automatically outside US market hours, when Tradier's sandbox has no live chain data to check against.

---

## 📁 Project Structure

```
FlowSight/
├── .github/workflows/ci.yml   CI: lint, unit tests, integration tests, scheduled e2e tests
├── render.yaml                 Render deployment config
├── pyproject.toml              Black/Ruff config, pytest markers
│
├── backend/
│   ├── main.py                 FastAPI app, endpoints, expected move calculation
│   ├── greeks.py                Black-Scholes Greeks engine
│   ├── tradier.py               Tradier API client
│   ├── uoa.py                    UOA scoring engine (cross-sectional Z-score, notional value)
│   ├── cache.py                  Redis caching layer (cache-aside pattern)
│   ├── test_greeks.py            Unit tests for the Greeks engine
│   ├── test_integration.py       Integration tests with mocked Tradier and yfinance
│   ├── test_e2e.py               End-to-end tests against the live deployed backend
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx                React entry point
        ├── App.jsx                 Search, filters, tab state, data fetching
        ├── OptionsTable.jsx        Full options chain table
        ├── UOATable.jsx            Flagged UOA signals table
        ├── GreeksPanel.jsx         Standalone Greeks calculator
        ├── PnLChart.jsx            P&L visualiser
        └── ExpectedMoveChart.jsx   Expected move range with UOA overlay
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React, Vite, TanStack Table, Recharts | UI, sortable tables, charts |
| Backend | FastAPI, Python 3.12 | API and business logic |
| Data | Tradier API, yfinance | Options chains and spot prices |
| Math | NumPy, SciPy | Black-Scholes Greeks and scoring |
| Cache | Redis (Upstash) | Cache-aside layer for chain requests |
| Deployment | Vercel, Render | Frontend and backend hosting |
| CI | GitHub Actions | Lint, unit, integration, and scheduled e2e tests |

---

## Code Style

### Backend (Python)
Formatted with [Black](https://black.readthedocs.io/) and linted with [Ruff](https://docs.astral.sh/ruff/). Both run in CI on every push and pull request.

```bash
cd backend
black .
ruff check .
```

### Frontend (JavaScript/React)
Formatted with [Prettier](https://prettier.io/) and linted with [ESLint](https://eslint.org/). Both run in CI.

```bash
cd frontend
npm run format
npm run lint
```

---

## Known Limitations

- UOA scoring compares each contract against others in the same chain today, not against real 30-day historical volume. Real per-contract historical option volume isn't reliably available from Tradier's sandbox.
- The P&L Visualiser is single-leg only. No multi-leg spreads, straddles, or combinations.
- UOA signals only reflect the single expiry currently selected, not a view across expiries.
- Data comes from Tradier's sandbox environment, not live production data.

---

## 🗺️ Roadmap

| Milestone | Date | Features |
|---|---|---|
| ✅ Artemis PoC | May 14 | Live Greeks and sortable table |
| ✅ Milestone 1 | Jun 1 | Redis caching, UOA scoring, CI/CD |
| ✅ Milestone 2 | Jun 29 | Full dashboard, signal disclaimers, user testing |
| ✅ Milestone 3 | Jul 27 | Cross-sectional UOA rework, notional value and skew, P&L visualiser, expected move range, end-to-end testing |
| Planned | Post-Orbital | Term-structure comparison across expiries, live production data |
| Splashdown | Aug 26 | Polish, poster, demo video |

---

## 👥 Team

**Net Positive, NUS Orbital 2026 (Apollo 11)**

| Name | Role |
|---|---|
| Nathaniel Goh | Frontend, documentation |
| Joshua Eng | Backend, code review, deployment |

Advisor: Maahir Garg

---

## ⚠️ Disclaimer

FlowSight is built for educational purposes as part of NUS Orbital 2026. It is not financial advice. Options trading involves significant risk of loss.
