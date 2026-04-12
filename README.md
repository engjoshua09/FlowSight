FlowSight
Options Flow Analytics and Strategy Platform
FlowSight surfaces statistically anomalous options activity and computes real-time Greeks using the Black-Scholes model. Built for retail investors who want institutional-grade options flow analysis without a Bloomberg Terminal.

⚠️ Disclaimer: Unusual options activity reflects elevated trading volume, not confirmed directional intent. Signals may represent hedging, spread construction, or position rolling — not directional bets. Always cross-reference with price action and fundamentals before trading.


Features

Real-time options chain data via Tradier API
Black-Scholes Greeks (Delta, Gamma, Theta, Vega) computed for every contract
Sortable table with TanStack Table — click any column header to sort
Live stock prices via yfinance


Quick Start
Prerequisites

Python 3.10+
Node.js 18+
Tradier sandbox API key (get one free)

Backend Setup
bashcd backend

# Create virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your Tradier sandbox token

# Run the server
uvicorn main:app --reload
Backend runs at http://localhost:8000
Frontend Setup
bashcd frontend

# Install dependencies
npm install

# Run dev server
npm run dev
Frontend runs at http://localhost:5173
Usage

Open http://localhost:5173 in your browser
Enter a ticker symbol (e.g., AAPL, TSLA, SPY)
Click Search or press Enter
View the options chain with computed Greeks
Click column headers to sort


Tech Stack
LayerTechnologyPurposeFrontendReact, TanStack Table, ViteUI and sortable data tableBackendFastAPI, PythonAPI and business logicDataTradier API, yfinanceOptions chains and stock pricesMathNumPy, SciPyBlack-Scholes Greeks computation

API Endpoints
MethodEndpointDescriptionGET/Health checkGET/options/{ticker}Returns options chain with computed Greeks
Example Response
json{
  "ticker": "AAPL",
  "contracts": [
    {
      "strike": 180,
      "type": "call",
      "expiration": "2025-05-16",
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

Project Structure
FlowSight/
├── backend/
│   ├── main.py           # FastAPI app and /options endpoint
│   ├── greeks.py         # Black-Scholes implementation
│   ├── tradier.py        # Tradier API client
│   ├── requirements.txt  # Python dependencies
│   └── .env.example      # Environment template
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Main component
│   │   └── OptionsTable.jsx  # Sortable table component
│   ├── package.json
│   └── vite.config.js
└── README.md

Team
Net Positive — NUS Orbital 2026 (Artemis)

Joshua Eng — Frontend, Deployment, UI/UX
Nathaniel Goh — Backend, Greeks Engine, Data Pipeline

