import { useState } from "react";
import OptionsTable from "./OptionsTable";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function App() {
  const [ticker, setTicker] = useState("");
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function fetchOptions() {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/options/${ticker}`);
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      const data = await res.json();
      setContracts(data.contracts);
    } catch (err) {
      setError(err.message);
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif", background: "#0f0f0f", minHeight: "100vh", color: "#fff" }}>
      <h1 style={{ color: "#00d4aa" }}>⚡ FlowSight</h1>
      <p style={{ color: "#888", marginTop: "-0.5rem" }}>Options Flow Analytics Platform</p>

      <div style={{ marginBottom: "1.5rem", marginTop: "1.5rem" }}>
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && fetchOptions()}
          placeholder="Enter ticker (e.g. AAPL)"
          style={{
            padding: "0.6rem 1rem",
            fontSize: "1rem",
            marginRight: "0.5rem",
            background: "#1a1a1a",
            border: "1px solid #333",
            color: "#fff",
            borderRadius: "6px",
            width: "220px"
          }}
        />
        <button
          onClick={fetchOptions}
          style={{
            padding: "0.6rem 1.2rem",
            fontSize: "1rem",
            background: "#00d4aa",
            color: "#000",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "bold"
          }}
        >
          Search
        </button>
      </div>

      {loading && <p style={{ color: "#888" }}>Loading options chain...</p>}
      {error && <p style={{ color: "#ff4444" }}>⚠ {error}</p>}
      {!loading && !error && contracts.length > 0 && (
        <>
          <p style={{ color: "#888", marginBottom: "0.5rem" }}>
            {contracts.length} contracts found — click column headers to sort
          </p>
          <OptionsTable contracts={contracts} />
        </>
      )}
    </div>
  );
}