import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

export default function PnLChart({ strike, spot, premium, optType }) {
  const low = Math.min(spot, strike) * 0.6;
  const high = Math.max(spot, strike) * 1.4;
  const points = 60;
  const step = (high - low) / points;

  const data = [];
  for (let i = 0; i <= points; i++) {
    const price = low + step * i;
    const intrinsic =
      optType === "call" ? Math.max(price - strike, 0) : Math.max(strike - price, 0);
    const pnl = intrinsic - premium;
    data.push({ price: Math.round(price * 100) / 100, pnl: Math.round(pnl * 100) / 100 });
  }

  const breakeven = optType === "call" ? strike + premium : strike - premium;
  const maxLoss = -premium;
  const maxProfit = optType === "put" ? Math.max(strike - premium, 0) : null;

  const allPnl = data.map((d) => d.pnl);
  const yMin = Math.min(...allPnl, 0);
  const yMax = Math.max(...allPnl, 0);

  return (
    <div
      style={{
        marginTop: "1.25rem",
        padding: "1rem",
        background: "#1a1a1a",
        border: "1px solid #2a2a2a",
        borderRadius: "10px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <PnlStat label="Break-even" value={`$${breakeven.toFixed(2)}`} color="#a8a8b8" />
        <PnlStat
          label="Max Profit"
          value={maxProfit === null ? "Unlimited" : `$${maxProfit.toFixed(2)}`}
          color="#00d4aa"
        />
        <PnlStat label="Max Loss" value={`$${maxLoss.toFixed(2)}`} color="#ff6b6b" />
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 30, right: 20, bottom: 10, left: 0 }}>
          <CartesianGrid stroke="#222" />
          <XAxis
            type="number"
            dataKey="price"
            domain={[low, high]}
            stroke="#666"
            tick={{ fill: "#a8a8b8", fontSize: 11 }}
          />
          <YAxis type="number" stroke="#666" tick={{ fill: "#a8a8b8", fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: "#111", border: "1px solid #333", fontSize: "0.8rem" }}
            formatter={(value) => [`$${Number(value).toFixed(2)}`, "P&L"]}
            labelFormatter={(label) => `Price: $${Number(label).toFixed(2)}`}
          />
          <ReferenceArea y1={0} y2={yMax} fill="#00d4aa" fillOpacity={0.06} />
          <ReferenceArea y1={yMin} y2={0} fill="#ff6b6b" fillOpacity={0.06} />
          <ReferenceLine y={0} stroke="#555" />
          <ReferenceLine
            x={strike}
            stroke="#f59e0b"
            strokeDasharray="3 3"
            label={{ value: "Strike", position: "top", fill: "#f59e0b", fontSize: 10 }}
          />
          <ReferenceLine
            x={spot}
            stroke="#fff"
            strokeDasharray="4 4"
            label={{ value: "Spot", position: "top", fill: "#fff", fontSize: 10 }}
          />
          <ReferenceLine
            x={breakeven}
            stroke="#00d4aa"
            strokeDasharray="2 2"
            label={{ value: "Break-even", position: "insideTop", fill: "#00d4aa", fontSize: 10 }}
          />
          <Line type="monotone" dataKey="pnl" stroke="#a78bfa" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>

      <p style={{ color: "#a8a8b8", fontSize: "0.75rem", marginTop: "0.5rem" }}>
        Profit and loss at expiry for a long {optType}, assuming the position is held to expiration.
        Does not account for time decay or IV changes before then.
      </p>
    </div>
  );
}

function PnlStat({ label, value, color }) {
  return (
    <div
      style={{
        background: "#111",
        border: "1px solid #2a2a2a",
        borderRadius: "8px",
        padding: "0.7rem 0.9rem",
      }}
    >
      <div style={{ color: "#a8a8b8", fontSize: "0.72rem", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ color, fontSize: "1.15rem", fontWeight: "bold", marginTop: "0.2rem" }}>
        {value}
      </div>
    </div>
  );
}
