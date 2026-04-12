# ⚡ FlowSight

**Options Flow Analytics Platform** — surfaces unusual options activity and computes real-time Greeks to help retail investors understand institutional positioning.

> ⚠️ FlowSight is a decision-support tool, not a prediction engine. Unusual options activity may reflect hedging, rolling, or spread construction rather than directional conviction. Always cross-reference with price action and fundamentals before placing any trade.

---

## 🔴 Live Demo

| Service | URL |
|---|---|
| Frontend | https://flowsight.vercel.app *(update after deploy)* |
| Backend API | https://flowsight-api.onrender.com *(update after deploy)* |
| API Docs | https://flowsight-api.onrender.com/docs |

---

## ✨ Features

- 🔍 Search any ticker and fetch its live options chain via Tradier API
- 🧮 Real-time Greeks via Black-Scholes — Δ Delta, Γ Gamma, Θ Theta, V Vega
- 📊 Sortable options table built with TanStack Table
- 🟢 Calls and puts colour-coded for quick scanning
- ⚡ FastAPI backend with automatic OpenAPI docs at `/docs`

---

## 🚀 Local Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- Free [Tradier sandbox account](https://developer.tradier.com)

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
# Open .env and add your Tradier sandbox token

uvicorn main:app --reload
# Runs at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### 3. Frontend

```bash
# Open a second terminal
cd frontend
npm install
npm run dev
# Runs at http://localhost:5173
```

> 💡 Both terminals must be running simultaneously.

---

## 📖 Usage

1. Open **http://localhost:5173**
2. Enter a ticker symbol (e.g. `AAPL`, `TSLA`, `SPY`)
3. Click **Search** or press **Enter**
4. View the options chain with computed Greeks
5. Click any column header to sort

---

## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Health check |
| GET | `/options/{ticker}` | Returns options chain with Greeks |

**Example response:**

```json
{
  "ticker": "AAPL",
  "contracts": [
    {
      "strike": 180,
      "type": "call",
      "expiration": "2026-05-16",
      "bid": 5.20,
      "ask": 5.35,
      "volume": 1234,
      "open_interest": 5678,
      "iv": 0.2845,
      "delta": 0.5523,
      "gamma": 0.0312,
      "theta": -0.0521,
      "vega": 0.1847
    }
  ]
}
```

---
## 📁 Project Structure

```
FlowSight/
├── backend/
│   ├── main.py          # FastAPI app and /options endpoint
│   ├── greeks.py        # Black-Scholes Greeks engine
│   ├── tradier.py       # Tradier API client
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   └── src/
│       ├── App.jsx          # Main app component
│       └── OptionsTable.jsx # Sortable Greeks table
└── README.md
```
---

## 🗺️ Roadmap

| Milestone | Date | Features |
|---|---|---|
| ✅ Artemis PoC | May 14 | Live Greeks + sortable table |
| Milestone 1 | Jun 1 | Redis caching, UOA scoring, CI/CD |
| Milestone 2 | Jun 29 | Full dashboard, signal disclaimers, user testing |
| Milestone 3 | Jul 27 | Strategy optimizer, P&L visualiser |
| Splashdown | Aug 26 | Polish, poster, demo video |

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React, Vite, TanStack Table | UI and sortable data table |
| Backend | FastAPI, Python | API and business logic |
| Data | Tradier API, yfinance | Options chains and stock prices |
| Math | NumPy, SciPy | Black-Scholes Greeks computation |
| Deployment | Vercel, Render | Hosting |

---

## 👥 Team

**Net Positive — NUS Orbital 2026 (Artemis)**

| Name | Role |
|---|---|
| Joshua Eng | Frontend, Deployment, UI/UX |
| Nathaniel Goh | Backend, Greeks Engine, Data Pipeline |

---

## ⚠️ Disclaimer

FlowSight is built for educational purposes as part of NUS Orbital 2026. It is not financial advice. Options trading involves significant risk of loss.