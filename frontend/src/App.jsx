import { useState, useRef, useEffect } from "react";
import OptionsTable from "./OptionsTable";
import UOATable from "./UOATable";
import GreeksPanel from "./GreeksPanel";
import ExpectedMoveChart from "./ExpectedMoveChart";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const VOLUME_FILTERS = [
  { label: "All", value: 0 },
  { label: "Vol > 100", value: 100 },
  { label: "Vol > 500", value: 500 },
  { label: "Vol > 1000", value: 1000 },
];

const POPULAR_TICKERS = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "META", name: "Meta" },
  { symbol: "SPY", name: "S&P 500 ETF" },
  { symbol: "QQQ", name: "Nasdaq ETF" },
  { symbol: "AMD", name: "AMD" },
  { symbol: "NFLX", name: "Netflix" },
  { symbol: "MU", name: "Micron" },
];

const FEATURE_CARDS = [
  {
    icon: "📊",
    title: "Full Options Chain",
    color: "#00d4aa",
    points: [
      "Live data via Tradier API",
      "Delta, Gamma, Theta, Vega per contract",
      "Sortable by any column",
      "Centred around spot price",
    ],
  },
  {
    icon: "🚨",
    title: "UOA Signal Detection",
    color: "#f59e0b",
    points: [
      "Scores every contract by unusual activity",
      "Volume / OI × Z-Score algorithm",
      "Filters noise with minimum thresholds",
      "Flags near-term institutional flow",
    ],
  },
  {
    icon: "⚙",
    title: "Greeks Calculator",
    color: "#a78bfa",
    points: [
      "Full Black-Scholes in the browser",
      "Adjust spot, strike, IV, DTE",
      "Delta exposure bar + moneyness badge",
      "Matches backend to 4 decimal places",
    ],
  },
];

function formatNotionalShort(value) {
  if (!value) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export default function App() {
  const [ticker, setTicker] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("chain");
  const [typeFilter, setTypeFilter] = useState("all");
  const [minVolume, setMinVolume] = useState(0);
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        inputRef.current &&
        !inputRef.current.contains(e.target)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredTickers =
    ticker.length === 0
      ? POPULAR_TICKERS
      : POPULAR_TICKERS.filter(
          (t) => t.symbol.startsWith(ticker) || t.name.toUpperCase().startsWith(ticker)
        );

  function buildUrl(base, expiry) {
    const params = new URLSearchParams();
    if (expiry) params.set("expiration", expiry);
    params.set("max_moneyness", 0.5);
    return `${base}?${params.toString()}`;
  }

  async function fetchOptions(overrideUrl) {
    if (!ticker) return;
    setShowDropdown(false);
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const url = overrideUrl || buildUrl(`${API_URL}/options/${ticker}`, selectedExpiry);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setData(json);
      if (!selectedExpiry) setSelectedExpiry(json.expirations?.[0] || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchOptionsForTicker(sym) {
    if (!sym) return;
    setShowDropdown(false);
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const url = buildUrl(`${API_URL}/options/${sym}`, null);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setData(json);
      setSelectedExpiry(json.expirations?.[0] || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function selectTicker(symbol) {
    setTicker(symbol);
    setShowDropdown(false);
    setTimeout(() => fetchOptionsForTicker(symbol), 0);
  }

  async function fetchByExpiry(expiry) {
    if (!ticker) return;
    setSelectedExpiry(expiry);
    setLoading(true);
    setError(null);
    try {
      const url = buildUrl(`${API_URL}/options/${ticker}`, expiry);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshOptions() {
    if (!ticker) return;
    const url = buildUrl(`${API_URL}/options/${ticker}/refresh`, selectedExpiry);
    fetchOptions(url);
  }

  const spot = data?.spot_price ?? 0;
  const allContracts = data?.contracts ?? [];
  const expirations = data?.expirations ?? [];

  function sortAroundSpot(contracts) {
    const strikes = [...new Set(contracts.map((c) => c.strike))].sort(
      (a, b) => Math.abs(a - spot) - Math.abs(b - spot)
    );
    const result = [];
    for (const strike of strikes) {
      const atStrike = contracts.filter((c) => c.strike === strike);
      result.push(...atStrike);
    }
    return result;
  }

  const filtered = allContracts.filter((c) => {
    const typeMatch = typeFilter === "all" ? true : c.type === typeFilter;
    const volMatch = (c.volume || 0) >= minVolume;
    return typeMatch && volMatch;
  });

  const sortedChain = sortAroundSpot(filtered);
  const flagged = allContracts.filter((c) => c.is_flagged);

  // Nat's notional-weighted skew logic — preserved exactly
  const flaggedCalls = flagged.filter((c) => c.type === "call").length;
  const flaggedPuts = flagged.filter((c) => c.type === "put").length;
  const flaggedCallNotional = flagged
    .filter((c) => c.type === "call")
    .reduce((sum, c) => sum + (c.notional_value || 0), 0);
  const flaggedPutNotional = flagged
    .filter((c) => c.type === "put")
    .reduce((sum, c) => sum + (c.notional_value || 0), 0);
  const totalFlaggedNotional = flaggedCallNotional + flaggedPutNotional;
  const notionalDiffRatio =
    totalFlaggedNotional > 0
      ? Math.abs(flaggedCallNotional - flaggedPutNotional) / totalFlaggedNotional
      : 0;
  const notionalSkew =
    notionalDiffRatio < 0.15
      ? "balanced"
      : flaggedCallNotional > flaggedPutNotional
        ? "call-heavy"
        : "put-heavy";
  let skewNote = "";
  if (data?.implied_bias) {
    if (notionalSkew === "balanced") {
      skewNote = `roughly balanced by dollar value, despite today's ${data.implied_bias} chain-wide bias.`;
    } else {
      const agrees =
        (notionalSkew === "call-heavy" && data.implied_bias === "bullish") ||
        (notionalSkew === "put-heavy" && data.implied_bias === "bearish");
      skewNote = `${notionalSkew} by dollar value, ${agrees ? "consistent with" : "diverging from"} today's ${data.implied_bias} chain-wide bias.`;
    }
  }

  const biasColor =
    data?.implied_bias === "bullish"
      ? "#00d4aa"
      : data?.implied_bias === "bearish"
        ? "#ff6b6b"
        : "#888";

  return (
    <div
      style={{
        padding: "2rem",
        fontFamily: "sans-serif",
        background: "#0f0f0f",
        minHeight: "100vh",
        color: "#fff",
      }}
    >
      {/* ── Hero — shrinks after search ───────────────────────────────── */}
      <div
        style={{
          textAlign: "center",
          padding: data ? "1rem 0 1.5rem" : "3rem 0 2.5rem",
          transition: "padding 0.3s ease",
        }}
      >
        <h1
          style={{
            color: "#00d4aa",
            fontSize: data ? "1.8rem" : "2.6rem",
            marginBottom: "0.25rem",
            letterSpacing: "-0.5px",
            transition: "font-size 0.3s ease",
          }}
        >
          ⚡ FlowSight
        </h1>
        {!data && (
          <p
            style={{
              color: "#555",
              fontSize: "1rem",
              marginBottom: "2rem",
              letterSpacing: "0.02em",
            }}
          >
            Options flow analytics for retail investors
          </p>
        )}

        {/* ── Search bar ───────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "0.5rem",
            alignItems: "flex-start",
            flexWrap: "wrap",
            marginBottom: "1rem",
          }}
        >
          <div style={{ position: "relative" }}>
            <input
              ref={inputRef}
              value={ticker}
              onChange={(e) => {
                setTicker(e.target.value.toUpperCase());
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") fetchOptions();
                if (e.key === "Escape") setShowDropdown(false);
              }}
              placeholder="Enter ticker (e.g. AAPL)"
              style={{
                padding: "0.65rem 1.1rem",
                fontSize: "1rem",
                background: "#1a1a1a",
                border: "1px solid #333",
                color: "#fff",
                borderRadius: "8px",
                width: "240px",
                outline: "none",
              }}
            />
            {/* Dropdown */}
            {showDropdown && filteredTickers.length > 0 && (
              <div
                ref={dropdownRef}
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  width: "240px",
                  background: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: "8px",
                  marginTop: "4px",
                  zIndex: 100,
                  maxHeight: "260px",
                  overflowY: "auto",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    padding: "0.4rem 0.8rem",
                    color: "#555",
                    fontSize: "0.72rem",
                    borderBottom: "1px solid #2a2a2a",
                  }}
                >
                  Popular tickers
                </div>
                {filteredTickers.map((t) => (
                  <div
                    key={t.symbol}
                    onMouseDown={() => selectTicker(t.symbol)}
                    style={{
                      padding: "0.5rem 0.8rem",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#252525")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span
                      style={{
                        color: "#00d4aa",
                        fontWeight: "bold",
                        fontSize: "0.9rem",
                      }}
                    >
                      {t.symbol}
                    </span>
                    <span style={{ color: "#666", fontSize: "0.8rem" }}>{t.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => fetchOptions()}
            style={{
              padding: "0.65rem 1.4rem",
              fontSize: "1rem",
              background: "#00d4aa",
              color: "#000",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Search
          </button>

          {data && (
            <button
              onClick={refreshOptions}
              style={{
                padding: "0.65rem 1rem",
                fontSize: "0.9rem",
                background: "#1a1a1a",
                color: "#888",
                border: "1px solid #333",
                borderRadius: "8px",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "..." : "🔄 Refresh"}
            </button>
          )}

          {expirations.length > 0 && (
            <select
              value={selectedExpiry || ""}
              onChange={(e) => fetchByExpiry(e.target.value)}
              style={{
                padding: "0.65rem 1rem",
                fontSize: "0.9rem",
                background: "#1a1a1a",
                border: "1px solid #333",
                color: "#fff",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              {expirations.map((exp) => (
                <option key={exp} value={exp}>
                  {exp}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* ── Ticker chips — landing only ───────────────────────────── */}
        {!data && !loading && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: "0.5rem",
              marginBottom: "0.5rem",
            }}
          >
            <span
              style={{
                color: "#444",
                fontSize: "0.8rem",
                alignSelf: "center",
                marginRight: "0.25rem",
              }}
            >
              Try:
            </span>
            {POPULAR_TICKERS.map((t) => (
              <button
                key={t.symbol}
                onClick={() => selectTicker(t.symbol)}
                style={{
                  padding: "0.3rem 0.75rem",
                  fontSize: "0.82rem",
                  background: "#1a1a1a",
                  color: "#00d4aa",
                  border: "1px solid #2a2a2a",
                  borderRadius: "20px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  transition: "border-color 0.15s, background 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#00d4aa";
                  e.currentTarget.style.background = "#0a1a18";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#2a2a2a";
                  e.currentTarget.style.background = "#1a1a1a";
                }}
              >
                {t.symbol}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Loading / Error ───────────────────────────────────────────── */}
      {loading && <p style={{ color: "#888", textAlign: "center" }}>Loading options chain…</p>}
      {error && (
        <p style={{ color: "#ff4444", textAlign: "center" }}>⚠ {error} — is the backend running?</p>
      )}

      {/* ── Feature cards — landing only ─────────────────────────────── */}
      {!data && !loading && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "1rem",
              maxWidth: "900px",
              margin: "2.5rem auto 0",
            }}
          >
            {FEATURE_CARDS.map((card) => (
              <div
                key={card.title}
                style={{
                  background: "#111",
                  border: `1px solid ${card.color}22`,
                  borderRadius: "12px",
                  padding: "1.5rem",
                  textAlign: "left",
                }}
              >
                <div style={{ fontSize: "1.6rem", marginBottom: "0.6rem" }}>{card.icon}</div>
                <div
                  style={{
                    color: card.color,
                    fontWeight: "bold",
                    fontSize: "1rem",
                    marginBottom: "0.75rem",
                    letterSpacing: "0.01em",
                  }}
                >
                  {card.title}
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {card.points.map((pt) => (
                    <li
                      key={pt}
                      style={{
                        color: "#666",
                        fontSize: "0.82rem",
                        lineHeight: 1.7,
                        paddingLeft: "0.9rem",
                        position: "relative",
                      }}
                    >
                      <span style={{ position: "absolute", left: 0, color: card.color }}>›</span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Landing disclaimer */}
          <p
            style={{
              textAlign: "center",
              color: "#333",
              fontSize: "0.75rem",
              maxWidth: "680px",
              margin: "2rem auto 0",
              lineHeight: 1.7,
            }}
          >
            FlowSight is a decision-support tool, not a trading recommendation engine. UOA signals
            reflect elevated activity — not confirmed directional intent. Always cross-reference
            with price action and fundamentals before placing any trade.
          </p>
        </>
      )}

      {/* ── Data view ────────────────────────────────────────────────── */}
      {data && (
        <>
          {/* Summary bar */}
          <div
            style={{
              display: "flex",
              gap: "1.5rem",
              flexWrap: "wrap",
              marginBottom: "1.5rem",
              padding: "1rem",
              background: "#1a1a1a",
              borderRadius: "8px",
              border: "1px solid #2a2a2a",
            }}
          >
            <Stat label="Ticker" value={data.ticker} />
            <Stat label="Spot Price" value={`$${spot.toFixed(2)}`} color="#fff" />
            <Stat label="Implied Bias" value={data.implied_bias?.toUpperCase()} color={biasColor} />
            <Stat label="Call/Put Ratio" value={data.call_put_ratio?.toFixed(2)} />
            <Stat label="Call Volume" value={data.call_volume?.toLocaleString()} color="#00d4aa" />
            <Stat label="Put Volume" value={data.put_volume?.toLocaleString()} color="#ff6b6b" />
            <Stat label="🚨 Flagged" value={flagged.length} color="#f59e0b" />
          </div>

          {/* After-hours / empty state banner */}
          {allContracts.length === 0 && (
            <div
              style={{
                padding: "1.5rem",
                marginBottom: "1rem",
                background: "#1a1a1a",
                border: "1px solid #333",
                borderRadius: "8px",
                textAlign: "center",
              }}
            >
              {data.market_open === false ? (
                <>
                  <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🌙</div>
                  <div style={{ color: "#888", fontSize: "1rem", marginBottom: "0.25rem" }}>
                    Market is currently closed
                  </div>
                  <div style={{ color: "#555", fontSize: "0.85rem" }}>
                    US markets open Monday–Friday, 9:30am–4:00pm ET (9:30pm–4:00am SGT). No Options
                    Data available yet for {data.ticker} — Please search during market hours
                    instead.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⚠️</div>
                  <div style={{ color: "#888", fontSize: "1rem" }}>
                    No contracts found for {data.ticker}. Try refreshing or check the ticker.
                  </div>
                </>
              )}
            </div>
          )}

          {/* Snapshot banner */}
          {data.from_snapshot && allContracts.length > 0 && (
            <div
              style={{
                padding: "0.6rem 1rem",
                marginBottom: "1rem",
                background: "#1a1a2a",
                border: "1px solid #a78bfa",
                borderRadius: "6px",
                color: "#a78bfa",
                fontSize: "0.82rem",
              }}
            >
              📸 Showing last market-hours snapshot — market is currently closed. Data was captured
              during today&apos;s trading session.
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            <Tab
              label={`📊 Full Chain (${allContracts.length})`}
              id="chain"
              active={activeTab}
              onClick={setActiveTab}
            />
            <Tab
              label={`🚨 UOA Signals (${flagged.length})${selectedExpiry ? ` — ${selectedExpiry}` : ""}`}
              id="uoa"
              active={activeTab}
              onClick={setActiveTab}
            />
            <Tab label="⚙ Greeks Calc" id="greeks" active={activeTab} onClick={setActiveTab} />
          </div>

          {/* Full Chain tab */}
          {activeTab === "chain" && (
            <>
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  marginBottom: "1rem",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ color: "#888", fontSize: "0.85rem" }}>Type:</span>
                {["all", "call", "put"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setTypeFilter(f)}
                    style={{
                      padding: "0.3rem 0.8rem",
                      fontSize: "0.85rem",
                      background:
                        typeFilter === f
                          ? f === "call"
                            ? "#00d4aa"
                            : f === "put"
                              ? "#ff6b6b"
                              : "#555"
                          : "#1a1a1a",
                      color: typeFilter === f ? "#000" : "#888",
                      border: "1px solid #333",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontWeight: typeFilter === f ? "bold" : "normal",
                      textTransform: "capitalize",
                    }}
                  >
                    {f === "all" ? "All" : f === "call" ? "📈 Calls" : "📉 Puts"}
                  </button>
                ))}
                <span style={{ color: "#888", fontSize: "0.85rem", marginLeft: "0.5rem" }}>
                  Volume:
                </span>
                {VOLUME_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setMinVolume(f.value)}
                    style={{
                      padding: "0.3rem 0.8rem",
                      fontSize: "0.85rem",
                      background: minVolume === f.value ? "#a78bfa" : "#1a1a1a",
                      color: minVolume === f.value ? "#000" : "#888",
                      border: "1px solid #333",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontWeight: minVolume === f.value ? "bold" : "normal",
                    }}
                  >
                    {f.label}
                  </button>
                ))}
                <span style={{ color: "#555", fontSize: "0.8rem", marginLeft: "0.5rem" }}>
                  {sortedChain.length} contracts — centred around spot ${spot.toFixed(2)}
                </span>
              </div>
              <OptionsTable contracts={sortedChain} spotPrice={spot} />
            </>
          )}

          {/* UOA tab */}
          {activeTab === "uoa" && (
            <>
              {/* UOA Explanation */}
              <details
                style={{
                  marginBottom: "1rem",
                  padding: "0.75rem 1rem",
                  background: "#111",
                  border: "1px solid #2a2a2a",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                <summary
                  style={{
                    color: "#888",
                    fontSize: "0.85rem",
                    fontWeight: "bold",
                    listStyle: "none",
                  }}
                >
                  ℹ️ How does UOA detection work? (click to expand)
                </summary>
                <div
                  style={{
                    marginTop: "0.75rem",
                    color: "#666",
                    fontSize: "0.82rem",
                    lineHeight: 1.7,
                  }}
                >
                  <p style={{ marginBottom: "0.5rem" }}>
                    <strong style={{ color: "#f59e0b" }}>
                      UOA Score = (Volume / Open Interest) × Z-Score
                    </strong>
                  </p>
                  <p style={{ marginBottom: "0.5rem" }}>
                    <strong style={{ color: "#aaa" }}>Volume/OI Ratio</strong> — measures how much
                    new activity is happening relative to existing positions. A ratio above 1.0
                    means more contracts traded today than currently exist as open positions.
                  </p>
                  <p style={{ marginBottom: "0.5rem" }}>
                    <strong style={{ color: "#aaa" }}>Z-Score</strong> — measures how many standard
                    deviations above the 30-day average today&apos;s volume is. A Z-score above 2.0
                    means today&apos;s volume is statistically unusual.
                  </p>
                  <p style={{ marginBottom: "0.5rem" }}>
                    <strong style={{ color: "#f59e0b" }}>Flagged</strong> when UOA Score &gt; 3,
                    volume &gt; 100, open interest &gt; 50, and DTE ≤ 30 days.
                  </p>
                  <p style={{ color: "#555" }}>
                    ⚠ High UOA does not confirm directional intent. Activity may reflect hedging,
                    spread construction, or position rolling.
                  </p>
                  <p style={{ color: "#555", marginTop: "0.5rem" }}>
                    ℹ These signals reflect only the {selectedExpiry || "selected"} expiry currently
                    chosen above. Switch expiries to see how unusual activity differs across
                    timeframes — signals concentrated in a single near-dated expiry often reflect
                    hedging rather than sustained positioning.
                  </p>
                </div>
              </details>

              {/* Disclaimer */}
              <div
                style={{
                  padding: "0.75rem 1rem",
                  marginBottom: "1rem",
                  background: "#1a1a0a",
                  border: "1px solid #f59e0b",
                  borderRadius: "6px",
                  color: "#f59e0b",
                  fontSize: "0.85rem",
                }}
              >
                ⚠ Elevated activity may reflect directional positioning, hedging, or spread
                construction. These are signals for further research — not trading recommendations.
              </div>

              {/* Notional-weighted skew summary — Nat's logic */}
              {flagged.length > 0 && (
                <div
                  style={{
                    padding: "0.6rem 1rem",
                    marginBottom: "1rem",
                    background: "#111",
                    border: "1px solid #2a2a2a",
                    borderRadius: "6px",
                    fontSize: "0.85rem",
                  }}
                >
                  <strong style={{ color: "#f59e0b" }}>{flagged.length} flagged:</strong>{" "}
                  <span style={{ color: "#00d4aa" }}>
                    {flaggedCalls} calls ({formatNotionalShort(flaggedCallNotional)})
                  </span>
                  {" / "}
                  <span style={{ color: "#ff6b6b" }}>
                    {flaggedPuts} puts ({formatNotionalShort(flaggedPutNotional)})
                  </span>
                  {skewNote && <span style={{ color: "#666" }}> — {skewNote}</span>}
                </div>
              )}

              {/* Expected move chart — Nat's feature */}
              <ExpectedMoveChart
                flaggedContracts={flagged}
                expectedMove={data.expected_move}
                spot={spot}
              />

              {flagged.length === 0 ? (
                <p style={{ color: "#888" }}>No flagged contracts for {data.ticker}.</p>
              ) : (
                <UOATable contracts={flagged} />
              )}
            </>
          )}

          {/* Greeks tab */}
          {activeTab === "greeks" && <GreeksPanel initialSpot={spot} />}

          {/* Footer disclaimer — subtle, always visible after search */}
          <p
            style={{
              textAlign: "center",
              color: "#2a2a2a",
              fontSize: "0.72rem",
              marginTop: "3rem",
              lineHeight: 1.7,
            }}
          >
            FlowSight is a decision-support tool, not a trading recommendation engine. UOA signals
            reflect elevated activity — not confirmed directional intent. Always cross-reference
            with price action and fundamentals before placing any trade.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color = "#fff" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
      <span
        style={{
          color: "#666",
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </span>
      <span style={{ color, fontSize: "1rem", fontWeight: "bold" }}>{value}</span>
    </div>
  );
}

function Tab({ label, id, active, onClick }) {
  const isActive = active === id;
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        padding: "0.5rem 1rem",
        fontSize: "0.9rem",
        background: isActive ? "#00d4aa" : "#1a1a1a",
        color: isActive ? "#000" : "#888",
        border: `1px solid ${isActive ? "#00d4aa" : "#333"}`,
        borderRadius: "6px",
        cursor: "pointer",
        fontWeight: isActive ? "bold" : "normal",
      }}
    >
      {label}
    </button>
  );
}
