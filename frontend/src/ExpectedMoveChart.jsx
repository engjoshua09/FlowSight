import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

export default function ExpectedMoveChart({ flaggedContracts, expectedMove, spot }) {
  if (!expectedMove) {
    return (
      <p style={{ color: "#666", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
        Expected move range unavailable — no usable ATM implied volatility for this expiry.
      </p>
    );
  }

  const calls = flaggedContracts
    .filter((c) => c.type === "call")
    .map((c) => ({
      strike: c.strike,
      uoa_score: c.uoa_score,
      notional_value: c.notional_value || 1,
    }));

  const puts = flaggedContracts
    .filter((c) => c.type === "put")
    .map((c) => ({
      strike: c.strike,
      uoa_score: c.uoa_score,
      notional_value: c.notional_value || 1,
    }));

  return (
    <div
      style={{
        marginBottom: "1.5rem",
        padding: "1rem",
        background: "#111",
        border: "1px solid #2a2a2a",
        borderRadius: "8px",
      }}
    >
      <div style={{ marginBottom: "0.75rem", color: "#888", fontSize: "0.85rem" }}>
        <strong style={{ color: "#f59e0b" }}>Expected Move Range:</strong> $
        {expectedMove.low.toLocaleString()} – ${expectedMove.high.toLocaleString()} (±$
        {expectedMove.expected_move.toLocaleString()}, 1σ · ATM IV{" "}
        {(expectedMove.atm_iv * 100).toFixed(1)}% · {expectedMove.dte_used}D)
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
          <CartesianGrid stroke="#222" />
          <XAxis
            type="number"
            dataKey="strike"
            name="Strike"
            domain={["dataMin - 10", "dataMax + 10"]}
            stroke="#666"
            tick={{ fill: "#888", fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="uoa_score"
            name="UOA Score"
            stroke="#666"
            tick={{ fill: "#888", fontSize: 11 }}
          />
          <ZAxis type="number" dataKey="notional_value" range={[60, 600]} name="Notional" />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={{ background: "#1a1a1a", border: "1px solid #333", fontSize: "0.8rem" }}
            formatter={(value, name) => {
              if (name === "Notional") return [`$${Number(value).toLocaleString()}`, name];
              return [value, name];
            }}
          />
          <ReferenceArea
            x1={expectedMove.low}
            x2={expectedMove.high}
            fill="#00d4aa"
            fillOpacity={0.08}
            label={{
              value: "Expected Move (1σ)",
              position: "insideTop",
              fill: "#00d4aa",
              fontSize: 11,
            }}
          />
          <ReferenceLine
            x={spot}
            stroke="#fff"
            strokeDasharray="4 4"
            label={{ value: "Spot", position: "top", fill: "#fff", fontSize: 11 }}
          />
          <Scatter name="Calls" data={calls} fill="#00d4aa" />
          <Scatter name="Puts" data={puts} fill="#ff6b6b" />
        </ScatterChart>
      </ResponsiveContainer>

      <p style={{ color: "#555", fontSize: "0.75rem", marginTop: "0.5rem" }}>
        Bubble size reflects notional dollar value. Position shows strike relative to the market's
        own expected move range — this is not a price prediction, and no single contract is weighted
        as more likely to occur than another.
      </p>
    </div>
  );
}
