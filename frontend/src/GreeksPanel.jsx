import { useState, useMemo, useEffect } from "react";
import PnLChart from "./PnLChart";

function erf(x) {
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741;
  const a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normCdf(x) {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function normPdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function computeGreeks(S, K, T_days, r, sigma, optionType) {
  const T = Math.max(T_days / 365, 1e-4);
  const s = Math.max(sigma / 100, 1e-4);

  const d1 = (Math.log(S / K) + (r + 0.5 * s * s) * T) / (s * Math.sqrt(T));
  const d2 = d1 - s * Math.sqrt(T);

  const delta = optionType === "call" ? normCdf(d1) : normCdf(d1) - 1;
  const gamma = normPdf(d1) / (S * s * Math.sqrt(T));

  const thetaCall =
    -(S * normPdf(d1) * s) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * normCdf(d2);
  const thetaPut = thetaCall + r * K * Math.exp(-r * T);
  const theta = (optionType === "call" ? thetaCall : thetaPut) / 365;

  const vega = (S * normPdf(d1) * Math.sqrt(T)) / 100;

  return {
    delta: delta.toFixed(4),
    gamma: gamma.toFixed(4),
    theta: theta.toFixed(4),
    vega: vega.toFixed(4),
  };
}

export default function GreeksPanel({ initialSpot = 100, selectedContract = null, loadKey = 0 }) {
  const [spot, setSpot] = useState(Math.round(initialSpot || 100));
  const [strike, setStrike] = useState(Math.round(initialSpot || 100));
  const [iv, setIv] = useState(30);
  const [dte, setDte] = useState(30);
  const [optType, setOptType] = useState("call");
  const [premium, setPremium] = useState(5);

  const R = 0.053;

  useEffect(() => {
    if (!selectedContract) return;
    setSpot(Math.round(selectedContract.spot || initialSpot || 100));
    setStrike(Math.round(selectedContract.strike || 100));
    setIv(selectedContract.iv || 30);
    setDte(Math.max(selectedContract.dte || 1, 1));
    setOptType(selectedContract.type === "put" ? "put" : "call");
    setPremium(selectedContract.premium || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

  // Slider ceilings derive from whatever's actually loaded, with 1000 as a
  // floor so the default exploratory range is unchanged. Grows automatically
  // for expensive stocks instead of needing a manually bumped constant every
  // time a higher-priced ticker gets tested.
  const sliderMax = useMemo(() => Math.max(1000, spot * 1.5, strike * 1.5), [spot, strike]);
  const premiumMax = useMemo(() => Math.max(500, sliderMax * 0.5), [sliderMax]);

  const greeks = useMemo(
    () => computeGreeks(spot, strike, dte, R, iv, optType),
    [spot, strike, iv, dte, optType]
  );

  const moneyness = spot > strike * 1.02 ? "ITM" : spot < strike * 0.98 ? "OTM" : "ATM";

  const moneynessColor =
    moneyness === "ITM" ? "#00d4aa" : moneyness === "OTM" ? "#ff6b6b" : "#f59e0b";

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: "1.5rem",
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            flex: "1 1 320px",
            minWidth: 280,
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
            borderRadius: "10px",
            padding: "1.25rem",
          }}
        >
          <p
            style={{
              color: "#666",
              fontSize: "0.78rem",
              marginBottom: "0.75rem",
              lineHeight: 1.5,
            }}
          >
            Adjust inputs to see how Greeks and P&L change in real time. Uses the same Black-Scholes
            model as the backend.
          </p>

          {selectedContract && (
            <div
              style={{
                marginBottom: "1.25rem",
                padding: "0.5rem 0.75rem",
                background: "#0a1a18",
                border: "1px solid #00d4aa44",
                borderRadius: "6px",
                fontSize: "0.75rem",
                color: "#a8a8b8",
              }}
            >
              📥 Loaded from Full Chain: {selectedContract.strike}{" "}
              {selectedContract.type?.toUpperCase()}, {selectedContract.dte}D, premium $
              {selectedContract.premium?.toFixed(2)}
            </div>
          )}

          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
            {["call", "put"].map((t) => (
              <button
                key={t}
                onClick={() => setOptType(t)}
                style={{
                  flex: 1,
                  padding: "0.5rem",
                  background: optType === t ? (t === "call" ? "#00d4aa" : "#ff6b6b") : "#111",
                  color: optType === t ? "#000" : "#666",
                  border: `1px solid ${optType === t ? (t === "call" ? "#00d4aa" : "#ff6b6b") : "#333"}`,
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: optType === t ? "bold" : "normal",
                  fontSize: "0.9rem",
                  textTransform: "capitalize",
                }}
              >
                {t === "call" ? "📈 Call" : "📉 Put"}
              </button>
            ))}
          </div>

          <SliderField
            label="Spot Price (S)"
            value={spot}
            setValue={setSpot}
            min={10}
            max={sliderMax}
            step={1}
            display={`$${spot}`}
            color="#fff"
          />
          <SliderField
            label="Strike Price (K)"
            value={strike}
            setValue={setStrike}
            min={10}
            max={sliderMax}
            step={1}
            display={`$${strike}`}
            color="#fff"
            badge={moneyness}
            badgeColor={moneynessColor}
          />
          <SliderField
            label="Implied Volatility (IV)"
            value={iv}
            setValue={setIv}
            min={1}
            max={200}
            step={1}
            display={`${iv}%`}
            color="#a78bfa"
          />
          <SliderField
            label="Days to Expiry (DTE)"
            value={dte}
            setValue={setDte}
            min={1}
            max={365}
            step={1}
            display={`${dte}d`}
            color="#60a5fa"
          />
          <SliderField
            label="Premium Paid"
            value={premium}
            setValue={setPremium}
            min={0}
            max={premiumMax}
            step={0.5}
            display={`$${premium.toFixed(2)}`}
            color="#34d399"
          />
        </div>

        <div style={{ flex: "1 1 280px", minWidth: 260 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.75rem",
              marginBottom: "0.75rem",
            }}
          >
            <GreekCard
              symbol="Δ"
              name="Delta"
              value={greeks.delta}
              color="#a78bfa"
              desc={
                optType === "call"
                  ? "Prob. of expiring ITM / $ move per $1 stock rise"
                  : "$ move per $1 stock rise (negative for puts)"
              }
            />
            <GreekCard
              symbol="Γ"
              name="Gamma"
              value={greeks.gamma}
              color="#60a5fa"
              desc="Rate of delta change per $1 stock move"
            />
            <GreekCard
              symbol="Θ"
              name="Theta"
              value={greeks.theta}
              color="#f87171"
              desc="Value lost per calendar day (time decay)"
            />
            <GreekCard
              symbol="V"
              name="Vega"
              value={greeks.vega}
              color="#34d399"
              desc="Value change per 1% move in implied volatility"
            />
          </div>

          <div
            style={{
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: "8px",
              padding: "0.9rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "0.4rem",
              }}
            >
              <span style={{ color: "#666", fontSize: "0.75rem" }}>DELTA EXPOSURE</span>
              <span
                style={{
                  color: "#a78bfa",
                  fontSize: "0.85rem",
                  fontWeight: "bold",
                }}
              >
                {greeks.delta}
              </span>
            </div>
            <div
              style={{
                background: "#111",
                borderRadius: "4px",
                height: "8px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: "4px",
                  background: "#a78bfa",
                  width: `${Math.abs(parseFloat(greeks.delta)) * 100}%`,
                  transition: "width 0.15s ease",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "0.3rem",
              }}
            >
              <span style={{ color: "#444", fontSize: "0.7rem" }}>0</span>
              <span style={{ color: "#444", fontSize: "0.7rem" }}>1.0</span>
            </div>
          </div>

          <div
            style={{
              marginTop: "0.75rem",
              background: "#1a1a1a",
              border: `1px solid ${moneynessColor}33`,
              borderRadius: "8px",
              padding: "0.75rem 1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ color: "#666", fontSize: "0.8rem" }}>Moneyness</span>
            <span
              style={{
                color: moneynessColor,
                fontWeight: "bold",
                fontSize: "0.9rem",
                background: `${moneynessColor}18`,
                padding: "0.2rem 0.6rem",
                borderRadius: "4px",
              }}
            >
              {moneyness}{" "}
              {optType === "call"
                ? moneyness === "ITM"
                  ? "Stock above strike"
                  : moneyness === "OTM"
                    ? "Stock below strike"
                    : "Stock near strike"
                : moneyness === "ITM"
                  ? "Stock below strike"
                  : moneyness === "OTM"
                    ? "Stock above strike"
                    : "Stock near strike"}
            </span>
          </div>
        </div>
      </div>

      <PnLChart strike={strike} spot={spot} premium={premium} optType={optType} />
    </>
  );
}

function SliderField({
  label,
  value,
  setValue,
  min,
  max,
  step,
  display,
  color,
  badge,
  badgeColor,
}) {
  return (
    <div style={{ marginBottom: "1.1rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.35rem",
        }}
      >
        <label style={{ color: "#888", fontSize: "0.8rem" }}>{label}</label>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          {badge && (
            <span
              style={{
                color: badgeColor,
                background: `${badgeColor}18`,
                border: `1px solid ${badgeColor}44`,
                fontSize: "0.7rem",
                padding: "0.1rem 0.4rem",
                borderRadius: "3px",
                fontWeight: "bold",
              }}
            >
              {badge}
            </span>
          )}
          <span
            style={{
              color,
              fontWeight: "bold",
              fontSize: "0.95rem",
              minWidth: "3.5rem",
              textAlign: "right",
            }}
          >
            {display}
          </span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        style={{
          width: "100%",
          accentColor: color,
          cursor: "pointer",
          height: "4px",
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "0.2rem",
        }}
      >
        <span style={{ color: "#333", fontSize: "0.7rem" }}>{min}</span>
        <span style={{ color: "#333", fontSize: "0.7rem" }}>{Math.round(max)}</span>
      </div>
    </div>
  );
}

function GreekCard({ symbol, name, value, color, desc }) {
  return (
    <div
      style={{
        background: "#1a1a1a",
        border: `1px solid ${color}33`,
        borderRadius: "8px",
        padding: "0.9rem",
      }}
    >
      <span
        style={{
          color: "#555",
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {symbol} {name}
      </span>
      <div
        style={{
          color,
          fontSize: "1.4rem",
          fontWeight: "bold",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          color: "#555",
          fontSize: "0.7rem",
          marginTop: "0.35rem",
          lineHeight: 1.4,
        }}
      >
        {desc}
      </div>
    </div>
  );
}
