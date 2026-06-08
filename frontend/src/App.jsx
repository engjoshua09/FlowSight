import { useState } from "react";
import OptionsTable from "./OptionsTable";
import UOATable from "./UOATable";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function App() {
  const [ticker, setTicker] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("uoa");

  async function fetchOptions() {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`${API_URL}/options/${ticker}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const flagged = data?.contracts?.filter(c => c.is_flagged) ?? [];
  const all = data?.contracts ?? [];

  const biasColor = data?.implied_bias === "bullish"
    ? "#00d4aa"
    : data?.implied_bias === "bearish"
    ? "#ff6b6b"
    : "#888";

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif", background: "#0f0f0f", minHeight: "100vh", color: "#fff" }}>

      {/* Header */}
      <h1 style={{ color: "#00d4aa", marginBottom: "0.25rem" }}>⚡ FlowSight</h1>
      <p style={{ color: "#888", marginTop: 0, marginBottom: "1.5rem" }}>Options Flow Analytics Platform</p>

      {/* Search */}
      <div style={{ marginBottom: "1.5rem", display: "flex", gap: "0.5rem" }}>
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && fetchOptions()}
          placeholder="Enter ticker (e.g. AAPL)"
          style={{
            padding: "0.6rem 1rem", fontSize: "1rem",
            background: "#1a1a1a", border: "1px solid #333",
            color: "#fff", borderRadius: "6px", width: "220px"
          }}
        />
        <button
          onClick={fetchOptions}
          style={{
            padding: "0.6rem 1.2rem", fontSize: "1rem",
            background: "#00d4aa", color: "#000",
            border: "none", borderRadius: "6px",
            cursor: "pointer", fontWeight: "bold"
          }}
        >
          Search
        </button>
      </div>

      {/* States */}
      {loading && <p style={{ color: "#888" }}>Loading options chain...</p>}
      {error && <p style={{ color: "#ff4444" }}>⚠ {error} — is the backend running?</p>}

      {/* Results */}
      {data && (
        <>
          {/* Summary Bar */}
          <div style={{
            display: "flex", gap: "1.5rem", flexWrap: "wrap",
            marginBottom: "1.5rem", padding: "1rem",
            background: "#1a1a1a", borderRadius: "8px",
            border: "1px solid #2a2a2a"
          }}>
            <Stat label="Ticker" value={data.ticker} />
            <Stat label="Spot Price" value={`$${data.spot_price?.toFixed(2)}`} />
            <Stat label="Implied Bias" value={data.implied_bias?.toUpperCase()} color={biasColor} />
            <Stat label="Call/Put Ratio" value={data.call_put_ratio?.toFixed(2)} />
            <Stat label="Call Volume" value={data.call_volume?.toLocaleString()} color="#00d4aa" />
            <Stat label="Put Volume" value={data.put_volume?.toLocaleString()} color="#ff6b6b" />
            <Stat label="Flagged Contracts" value={flagged.length} color="#f59e0b" />
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            <Tab label={`🚨 UOA Signals (${flagged.length})`} id="uoa" active={activeTab} onClick={setActiveTab} />
            <Tab label={`📊 Full Chain (${all.length})`} id="chain" active={activeTab} onClick={setActiveTab} />
          </div>

          {/* Tab Content */}
          {activeTab === "uoa" && (
            <>
              <div style={{
                padding: "0.75rem 1rem", marginBottom: "1rem",
                background: "#1a1a0a", border: "1px solid #f59e0b",
                borderRadius: "6px", color: "#f59e0b", fontSize: "0.85rem"
              }}>
                ⚠ Elevated activity may reflect directional positioning, hedging, or spread construction.
                These are signals for further research — not trading recommendations.
              </div>
              {flagged.length === 0
                ? <p style={{ color: "#888" }}>No flagged contracts found for {data.ticker}.</p>
                : <UOATable contracts={flagged} />
              }
            </>
          )}

          {activeTab === "chain" && (
            <>
              <p style={{ color: "#888", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
                {all.length} contracts — sorted by UOA score. Click headers to re-sort.
              </p>
              <OptionsTable contracts={all} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color = "#fff" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
      <span style={{ color: "#666", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
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
        padding: "0.5rem 1rem", fontSize: "0.9rem",
        background: isActive ? "#00d4aa" : "#1a1a1a",
        color: isActive ? "#000" : "#888",
        border: `1px solid ${isActive ? "#00d4aa" : "#333"}`,
        borderRadius: "6px", cursor: "pointer", fontWeight: isActive ? "bold" : "normal"
      }}
    >
      {label}
    </button>
  );
}