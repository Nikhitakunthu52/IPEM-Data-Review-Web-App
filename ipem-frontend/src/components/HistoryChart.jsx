import { useState } from "react";
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { SERIES } from "../settings";

// The plot starts empty; the user ticks which measurements to draw on it.
// Each measurement gets its own y-axis because the units differ (V, A, °C).
export default function HistoryChart({ history, limits, range }) {
  const [selected, setSelected] = useState([]);

  function toggle(key) {
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  }

  const points = (history?.points ?? []).map((p) => ({ ...p, t: new Date(p.time).getTime() }));
  const shown = SERIES.filter((s) => selected.includes(s.key));
  const short = range === "1d";
  const formatTime = (t) =>
    new Date(t).toLocaleString([], short ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" });

  return (
    <article className="chart-card">
      <fieldset className="series-picker">
        <legend>Show on plot</legend>
        {SERIES.map((s) => (
          <label key={s.key} style={{ "--series": s.color }}>
            <input type="checkbox" checked={selected.includes(s.key)} onChange={() => toggle(s.key)} />
            {limits?.[s.key]?.label ?? s.key} ({limits?.[s.key]?.unit})
          </label>
        ))}
      </fieldset>

      <div className="chart-area">
        {shown.length === 0 && <div className="chart-empty">Select data above to plot it</div>}
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={points} margin={{ top: 16, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="#2e303a" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatTime}
              stroke="#9ca3af"
              tick={{ fontSize: 12 }}
              minTickGap={40}
            />
            {shown.length === 0 && <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} domain={[0, 1]} tickCount={2} />}
            {shown.map((s, i) => (
              <YAxis
                key={s.key}
                yAxisId={s.key}
                orientation={i === 0 ? "left" : "right"}
                stroke={s.color}
                tick={{ fontSize: 12 }}
                width={48}
                domain={["auto", "auto"]}
                unit={` ${limits?.[s.key]?.unit ?? ""}`}
              />
            ))}
            {shown.length > 0 && (
              <Tooltip
                labelFormatter={(t) => new Date(t).toLocaleString()}
                formatter={(v, name, item) => [`${Number(v).toFixed(2)} ${limits?.[item.dataKey]?.unit ?? ""}`, name]}
                contentStyle={{ background: "#1f2028", border: "1px solid #2e303a", borderRadius: 8 }}
              />
            )}
            {shown.length > 0 && <Legend />}
            {shown.map((s) => (
              <Line
                key={s.key}
                yAxisId={s.key}
                dataKey={s.key}
                name={limits?.[s.key]?.label ?? s.key}
                stroke={s.color}
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
                connectNulls
              />
            ))}
            {/* Dashed line at each shown measurement's red limit */}
            {shown.map((s) =>
              limits?.[s.key]?.red_above != null ? (
                <ReferenceLine
                  key={`limit-${s.key}`}
                  yAxisId={s.key}
                  y={limits[s.key].red_above}
                  stroke="#f87171"
                  strokeDasharray="6 4"
                  ifOverflow="extendDomain"
                  label={{ value: `${limits[s.key].label} limit`, fill: "#f87171", fontSize: 11, position: "insideTopLeft" }}
                />
              ) : null,
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {history && (
        <p className="muted small">
          {points.length} points · each is a {history.window} average
        </p>
      )}
    </article>
  );
}
