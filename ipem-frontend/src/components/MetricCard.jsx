import { ZONE_TEXT } from "../settings";

export default function MetricCard({ metric, value, zone, limit }) {
  const label = limit?.label ?? metric[0].toUpperCase() + metric.slice(1);
  const unit = limit?.unit ?? "";

  return (
    <article className={`metric-card ${zone ? `zone-${zone}` : ""}`}>
      <div className="metric-head">
        <h2>{label}</h2>
        {zone && <span className={`zone-pill zone-${zone}`}>{ZONE_TEXT[zone]}</span>}
      </div>
      <p className="metric-value">{value == null ? "No data" : `${value.toFixed(2)} ${unit}`}</p>
      {limit && (
        <p className="metric-limit">
          Normal {limit.nominal} {unit} · red above {limit.red_above} {unit}
          {limit.red_below != null && ` or below ${limit.red_below} ${unit}`}
        </p>
      )}
    </article>
  );
}
