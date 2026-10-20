import { useEffect, useState } from "react";
import { api } from "../api";
import { RANGE_OPTIONS, REFRESH_OPTIONS } from "../settings";
import MetricCard from "./MetricCard";
import HistoryChart from "./HistoryChart";

const STALE_AFTER_MS = 60_000;

export default function DeviceDetail({ device, limits, onBack }) {
  const [reading, setReading] = useState(null);
  const [history, setHistory] = useState(null);
  const [range, setRange] = useState("1d");
  const [refreshMs, setRefreshMs] = useState(0);
  const [tick, setTick] = useState(0); // bump to reload everything
  const [loadedKey, setLoadedKey] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [error, setError] = useState("");

  const requestKey = `${device.id}|${range}|${tick}`;
  const loading = loadedKey !== requestKey;

  // Auto-refresh: bump `tick` on the chosen interval (Off = 0 = no timer).
  useEffect(() => {
    if (!refreshMs) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  // Load the latest reading and the history. Old values stay on screen while
  // new ones load, so the page doesn't flicker on every refresh.
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      api.latest(device.id, controller.signal),
      api.history(device.id, range, controller.signal),
    ]).then(([latest, hist]) => {
      if (controller.signal.aborted) return;
      if (latest.status === "fulfilled") setReading(latest.value);
      if (hist.status === "fulfilled") setHistory(hist.value);
      const failed = [latest, hist].find((r) => r.status === "rejected");
      setError(failed ? failed.reason.message : "");
      setFetchedAt(Date.now());
      setLoadedKey(`${device.id}|${range}|${tick}`);
    });
    return () => controller.abort();
  }, [device.id, range, tick]);

  // "Stale" = the newest reading was already over a minute old when we fetched it.
  const stale = reading && fetchedAt - new Date(reading.time).getTime() > STALE_AFTER_MS;
  const overheating = reading?.zones?.temperature === "red" && limits?.temperature?.overheat_alert;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>{device.name}</h1>
          <p className="muted">Device ID: {device.id} · MAC: {device.mac}</p>
        </div>
        <div className="controls">
          <button onClick={() => setTick((t) => t + 1)} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <label className="select">
            Auto-refresh
            <select value={refreshMs} onChange={(e) => setRefreshMs(Number(e.target.value))}>
              {REFRESH_OPTIONS.map((o) => (
                <option key={o.ms} value={o.ms}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <button className="back-button" onClick={onBack}>← All devices</button>

      {overheating && (
        <p className="alert-banner" role="alert">
          ⚠ Your device is overheating ({reading.temperature} {limits.temperature.unit}, limit {limits.temperature.red_above} {limits.temperature.unit})
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {reading && (
        <>
          <p className="timestamp">
            Last reading: {new Date(reading.time).toLocaleString()}
            {stale && <span className="stale-badge">No new data for over a minute</span>}
          </p>
          <section className="grid" aria-label="Latest measurements">
            {["voltage", "current", "temperature"].map((key) => (
              <MetricCard key={key} metric={key} value={reading[key]} zone={reading.zones?.[key]} limit={limits?.[key]} />
            ))}
          </section>
        </>
      )}

      <div className="section-head">
        <h2 className="section-title">Measurement history</h2>
        <label className="select">
          Time range
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            {RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      <HistoryChart history={history} limits={limits} range={range} />
    </>
  );
}
