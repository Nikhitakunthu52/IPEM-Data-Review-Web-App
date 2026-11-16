import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SERIES, rangeToSeconds } from "../settings";

// Each measurement gets its own y-axis because the units differ.
export default function HistoryChart({ history, limits, range }) {
  const [selected, setSelected] = useState([]);

  function toggle(key) {
    setSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  const points = (history?.points ?? [])
    .map((point) => ({
      ...point,
      t: new Date(point.time).getTime(),
    }))
    .filter((point) => Number.isFinite(point.t));

  const shown = SERIES.filter((series) =>
    selected.includes(series.key),
  );

  // Up to 24 hours: 10:35. Longer ranges: Oct 21.
  const short = rangeToSeconds(range) <= 86400;

  function formatTime(time) {
    const date = new Date(time);

    if (short) {
      return date.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  return (
    <article className="chart-card">
      <fieldset className="series-picker">
        <legend>Show on plot</legend>

        {SERIES.map((series) => (
          <label
            key={series.key}
            style={{ "--series": series.color }}
          >
            <input
              type="checkbox"
              checked={selected.includes(series.key)}
              onChange={() => toggle(series.key)}
            />
            {limits?.[series.key]?.label ?? series.key}
            {limits?.[series.key]?.unit
              ? ` (${limits[series.key].unit})`
              : ""}
          </label>
        ))}
      </fieldset>

      <div className="chart-area">
        {shown.length === 0 ? (
          <div className="chart-empty">
            Select data above to plot it
          </div>
        ) : points.length === 0 ? (
          <div className="chart-empty">
            No history data to display
          </div>
        ) : null}

        <ResponsiveContainer width="100%" height={360}>
          <LineChart
            data={points}
            margin={{ top: 16, right: 8, bottom: 8, left: 8 }}
          >
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

            {shown.length === 0 && (
              <YAxis
                stroke="#9ca3af"
                tick={{ fontSize: 12 }}
                domain={[0, 1]}
                tickCount={2}
              />
            )}

            {shown.map((series, index) => (
              <YAxis
                key={series.key}
                yAxisId={series.key}
                orientation={index === 0 ? "left" : "right"}
                stroke={series.color}
                tick={{ fontSize: 12 }}
                width={48}
                domain={["auto", "auto"]}
                unit={` ${limits?.[series.key]?.unit ?? ""}`}
              />
            ))}

            {shown.length > 0 && (
              <Tooltip
                labelFormatter={(time) =>
                  new Date(time).toLocaleString()
                }
                formatter={(value, name, item) => [
                  `${Number(value).toFixed(2)} ${
                    limits?.[item.dataKey]?.unit ?? ""
                  }`,
                  name,
                ]}
                contentStyle={{
                  background: "#1f2028",
                  border: "1px solid #2e303a",
                  borderRadius: 8,
                }}
              />
            )}

            {shown.length > 0 && <Legend />}

            {shown.map((series) => (
              <Line
                key={series.key}
                yAxisId={series.key}
                dataKey={series.key}
                name={limits?.[series.key]?.label ?? series.key}
                stroke={series.color}
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
                connectNulls
              />
            ))}

            {shown.map((series) =>
              limits?.[series.key]?.red_above != null ? (
                <ReferenceLine
                  key={`limit-${series.key}`}
                  yAxisId={series.key}
                  y={limits[series.key].red_above}
                  stroke="#f87171"
                  strokeDasharray="6 4"
                  ifOverflow="extendDomain"
                  label={{
                    value: `${limits[series.key].label} limit`,
                    fill: "#f87171",
                    fontSize: 11,
                    position: "insideTopLeft",
                  }}
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
