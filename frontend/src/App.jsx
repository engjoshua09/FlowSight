import { useState, useRef, useEffect } from "react";
import OptionsTable from "./OptionsTable";
import UOATable from "./UOATable";
import GreeksPanel from "./GreeksPanel";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const VOLUME_FILTERS = [
  { label: "All", value: 0 },
  { label: "Vol > 100", value: 100 },
  { label: "Vol > 500", value: 500 },
  { label: "Vol > 1000", value: 1000 },
];

const POPULAR_TICKERS = [
  { symbol: "AAPL",  name: "Apple" },
  { symbol: "MSFT",  name: "Microsoft" },
  { symbol: "NVDA",  name: "NVIDIA" },
  { symbol: "TSLA",  name: "Tesla" },
  { symbol: "AMZN",  name: "Amazon" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "META",  name: "Meta" },
  { symbol: "SPY",   name: "S&P 500 ETF" },
  { symbol: "QQQ",   name: "Nasdaq ETF" },
  { symbol: "AMD",   name: "AMD" },
  { symbol: "NFLX",  name: "Netflix" },
  { symbol: "MU",    name: "Micron" },
];

export default function App() {
  const [ticker, setTicker]               = useState("");
  const [data, setData]                   = useState(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const [activeTab, setActiveTab]         = useState("chain");
  const [typeFilter, setTypeFilter]       = useState("all");
  const [minVolume, setMinVolume]         = useState(0);
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [maxMoneyness, setMaxMoneyness]   = useState(0.30);
  const [showDropdown, setShowDropdown]   = useState(false);
  const inputRef    = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current   && !inputRef.current.contains(e.target)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredTickers = ticker.length === 0
    ? POPULAR_TICKERS
    : POPULAR_TICKERS.filter(t =>
        t.symbol.startsWith(ticker) || t.name.toUpperCase().startsWith(ticker)
      );

  function buildUrl(base, expiry, moneyness) {
    const params = new URLSearchParams();
    if (expiry) params.set("expiration", expiry);
    params.set("max_moneyness", moneyness);
    return `${base}?${params.toString()}`;
  }

  async function fetchOptions(overrideUrl) {
    if (!ticker) return;
    setShowDropdown(false);
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const url = overrideUrl || buildUrl(`${API_URL}/options/${ticker}`, selectedExpiry, maxMoneyness);
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
      const url = buildUrl(`${API_URL}/options/${sym}`, null, maxMoneyness);
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
      const url = buildUrl(`${API_URL}/options/${ticker}`, expiry, maxMoneyness);
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
    const url = buildUrl(`${API_URL}/options/${ticker}/refresh`, selectedExpiry, maxMoneyness);
    fetchOptions(url);
  }

  const spot         = data?.spot_price ?? 0;
  const allContracts = data?.contracts  ?? [];
  const expirations  = data?.expirations ?? [];

  function sortAroundSpot(contracts) {
    const above = contracts.filter(c => c.strike >= spot).sort((a, b) => a.strike - b.strike);
    const below = contracts.filter(c => c.strike < spot).sort((a, b) => b.strike - a.strike);
    return [...below, ...above];
  }

  const filtered = allContracts.filter(c => {
    const typeMatch = typeFilter === "all" ? true : c.type === typeFilter;
    const volMatch  = (c.volume || 0) >= minVolume;
    return typeMatch && volMatch;
  });

  const sortedChain = sortAroundSpot(filtered);
  const flagged     = allContracts.filter(c => c.is_flagged);
  const biasColor   = data?.implied_bias === "bullish" ? "#00d4aa"
    : data?.implied_bias === "bearish" ? "#ff6b6b" : "#888";

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif", background: "#0f0f0f", minHeight: "100vh", color: "#fff" }}>
      <h1 style={{ color: "#00d4aa", marginBottom: "0.25rem" }}>⚡ FlowSight</h1>
      <p style={{ color: "#888", marginTop: 0, marginBottom: "1.5rem" }}>Options Flow Analytics Platform</p>

      <div style={{ marginBottom: "1.5rem", display: "flex", gap: "0.5rem", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <input
            ref={inputRef}
            value={ticker}
            onChange={(e) => { setTicker(e.target.value.toUpperCase()); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={(e) => { if (e.key === "Enter") fetchOptions(); if (e.key === "Escape") setShowDropdown(false); }}
            placeholder="Enter ticker (e.g. AAPL)"
            style={{ padding: "0.6rem 1rem", fontSize: "1rem", background: "#1a1a1a", border: "1px solid #333", color: "#fff", borderRadius: "6px", width: "220px" }}
          />
          {showDropdown && filteredTickers.length > 0 && (
            <div ref={dropdownRef} style={{ position: "absolute", top: "100%", left: 0, width: "220px", background: "#1a1a1a", border: "1px solid #333", borderRadius: "6px", marginTop: "4px", zIndex: 100, maxHeight: "260px", overflowY: "auto" }}>
              <div style={{ padding: "0.4rem 0.8rem", color: "#555", fontSize: "0.72rem", borderBottom: "1px solid #2a2a2a" }}>Popular tickers</div>
              {filteredTickers.map(t => (
                <div key={t.symbol} onMouseDown={() => selectTicker(t.symbol)}
                  style={{ padding: "0.5rem 0.8rem", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#252525"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ color: "#00d4aa", fontWeight: "bold", fontSize: "0.9rem" }}>{t.symbol}</span>
                  <span style={{ color: "#666", fontSize: "0.8rem" }}>{t.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => fetchOptions()} style={{ padding: "0.6rem 1.2rem", fontSize: "1rem", background: "#00d4aa", color: "#000", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>Search</button>
        {data && (
          <button onClick={refreshOptions} style={{ padding: "0.6rem 1rem", fontSize: "0.9rem", background: "#1a1a1a", color: "#888", border: "1px solid #333", borderRadius: "6px", cursor: loading ? "not-allowed" : "pointer" }}>
            {loading ? "..." : "🔄 Refresh"}
          </button>
        )}
        {expirations.length > 0 && (
          <select value={selectedExpiry || ""} onChange={(e) => fetchByExpiry(e.target.value)}
            style={{ padding: "0.6rem 1rem", fontSize: "0.9rem", background: "#1a1a1a", border: "1px solid #333", color: "#fff", borderRadius: "6px", cursor: "pointer" }}>
            {expirations.map(exp => <option key={exp} value={exp}>{exp}</option>)}
          </select>
        )}
      </div>

      {loading && <p style={{ color: "#888" }}>Loading options chain...</p>}
      {error && <p style={{ color: "#ff4444" }}>⚠ {error} — is the backend running?</p>}

      {data && (
        <>
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "1.5rem", padding: "1rem", background: "#1a1a1a", borderRadius: "8px", border: "1px solid #2a2a2a" }}>
            <Stat label="Ticker"         value={data.ticker} />
            <Stat label="Spot Price"     value={`$${spot.toFixed(2)}`}              color="#fff" />
            <Stat label="Implied Bias"   value={data.implied_bias?.toUpperCase()}   color={biasColor} />
            <Stat label="Call/Put Ratio" value={data.call_put_ratio?.toFixed(2)} />
            <Stat label="Call Volume"    value={data.call_volume?.toLocaleString()} color="#00d4aa" />
            <Stat label="Put Volume"     value={data.put_volume?.toLocaleString()}  color="#ff6b6b" />
            <Stat label="🚨 Flagged"     value={flagged.length}                     color="#f59e0b" />
          </div>

          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            <Tab label={`📊 Full Chain (${allContracts.length})`} id="chain"  active={activeTab} onClick={setActiveTab} />
            <Tab label={`🚨 UOA Signals (${flagged.length})`}     id="uoa"    active={activeTab} onClick={setActiveTab} />
            <Tab label="⚙ Greeks Calc"                            id="greeks" active={activeTab} onClick={setActiveTab} />
          </div>

          {activeTab === "chain" && (
            <>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#888", fontSize: "0.85rem" }}>Type:</span>
                {["all", "call", "put"].map(f => (
                  <button key={f} onClick={() => setTypeFilter(f)} style={{ padding: "0.3rem 0.8rem", fontSize: "0.85rem", background: typeFilter === f ? (f === "call" ? "#00d4aa" : f === "put" ? "#ff6b6b" : "#555") : "#1a1a1a", color: typeFilter === f ? "#000" : "#888", border: "1px solid #333", borderRadius: "4px", cursor: "pointer", fontWeight: typeFilter === f ? "bold" : "normal", textTransform: "capitalize" }}>
                    {f === "all" ? "All" : f === "call" ? "📈 Calls" : "📉 Puts"}
                  </button>
                ))}
                <span style={{ color: "#888", fontSize: "0.85rem", marginLeft: "0.5rem" }}>Volume:</span>
                {VOLUME_FILTERS.map(f => (
                  <button key={f.value} onClick={() => setMinVolume(f.value)} style={{ padding: "0.3rem 0.8rem", fontSize: "0.85rem", background: minVolume === f.value ? "#a78bfa" : "#1a1a1a", color: minVolume === f.value ? "#000" : "#888", border: "1px solid #333", borderRadius: "4px", cursor: "pointer", fontWeight: minVolume === f.value ? "bold" : "normal" }}>
                    {f.label}
                  </button>
                ))}
                <span style={{ color: "#555", fontSize: "0.8rem", marginLeft: "0.5rem" }}>{sortedChain.length} contracts — centred around spot ${spot.toFixed(2)}</span>
              </div>
              <OptionsTable contracts={sortedChain} spotPrice={spot} />
            </>
          )}

          {activeTab === "uoa" && (
            <>
              <div style={{ padding: "0.75rem 1rem", marginBottom: "1rem", background: "#1a1a0a", border: "1px solid #f59e0b", borderRadius: "6px", color: "#f59e0b", fontSize: "0.85rem" }}>
                ⚠ Elevated activity may reflect directional positioning, hedging, or spread construction. These are signals for further research — not trading recommendations.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem", padding: "0.75rem 1rem", background: "#1a1a1a", borderRadius: "6px", border: "1px solid #2a2a2a" }}>
                <span style={{ color: "#888", fontSize: "0.85rem", whiteSpace: "nowrap" }}>OTM Range:</span>
                <input type="range" min={5} max={100} step={5} value={Math.round(maxMoneyness * 100)} onChange={(e) => setMaxMoneyness(Number(e.target.value) / 100)} style={{ flex: 1, accentColor: "#f59e0b", cursor: "pointer" }} />
                <span style={{ color: "#f59e0b", fontWeight: "bold", fontSize: "0.9rem", minWidth: "3rem" }}>±{Math.round(maxMoneyness * 100)}%</span>
                <button onClick={() => fetchOptions()} style={{ padding: "0.3rem 0.8rem", fontSize: "0.8rem", background: "#f59e0b", color: "#000", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", whiteSpace: "nowrap" }}>Apply</button>
              </div>

              {/* Moneyness slider */}
              <div style={{
                display: "flex", alignItems: "center", gap: "1rem",
                marginBottom: "1rem", padding: "0.75rem 1rem",
                background: "#1a1a1a", borderRadius: "6px", border: "1px solid #2a2a2a"
              }}>
                <span style={{ color: "#888", fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                  OTM Range:
                </span>
                <input
                  type="range"
                  min={5} max={100} step={5}
                  value={Math.round(maxMoneyness * 100)}
                  onChange={(e) => setMaxMoneyness(Number(e.target.value) / 100)}
                  style={{ flex: 1, accentColor: "#f59e0b", cursor: "pointer" }}
                />
                <span style={{ color: "#f59e0b", fontWeight: "bold", fontSize: "0.9rem", minWidth: "3rem" }}>
                  ±{Math.round(maxMoneyness * 100)}%
                </span>
                <button
                  onClick={() => fetchOptions()}
                  style={{
                    padding: "0.3rem 0.8rem", fontSize: "0.8rem",
                    background: "#f59e0b", color: "#000",
                    border: "none", borderRadius: "4px",
                    cursor: "pointer", fontWeight: "bold", whiteSpace: "nowrap"
                  }}
                >
                  Apply
                </button>
              </div>

              {flagged.length === 0
                ? <p style={{ color: "#888" }}>No flagged contracts for {data.ticker} within ±{Math.round(maxMoneyness * 100)}% of spot.</p>
                : <UOATable contracts={flagged} />
              }
            </>
          )}

          {activeTab === "greeks" && <GreeksPanel initialSpot={spot} />}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color = "#fff" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
      <span style={{ color: "#666", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span style={{ color, fontSize: "1rem", fontWeight: "bold" }}>{value}</span>
    </div>
  );
}

function Tab({ label, id, active, onClick }) {
  const isActive = active === id;
  return (
    <button onClick={() => onClick(id)} style={{ padding: "0.5rem 1rem", fontSize: "0.9rem", background: isActive ? "#00d4aa" : "#1a1a1a", color: isActive ? "#000" : "#888", border: `1px solid ${isActive ? "#00d4aa" : "#333"}`, borderRadius: "6px", cursor: "pointer", fontWeight: isActive ? "bold" : "normal" }}>
      {label}
    </button>
  );
}
