import { useEffect, useState } from "react";
import { api } from "../api";
import {
  RANGE_OPTIONS,
  REFRESH_OPTIONS,
  rangeToSeconds,
  rangeLabel,
} from "../settings";
import MetricCard from "./MetricCard";
import HistoryChart from "./HistoryChart";

const STALE_AFTER_MS = 60_000;

export default function DeviceDetail({ device, limits, onBack }) {
  const [reading, setReading] = useState(null);
  const [history, setHistory] = useState(null);

  const [range, setRange] = useState("1d");
  const [rangeChoice, setRangeChoice] = useState("1d");
  const [customNumber, setCustomNumber] = useState("45");
  const [customUnit, setCustomUnit] = useState("m");
  const [rangeError, setRangeError] = useState("");

  const [refreshMs, setRefreshMs] = useState(0);
  const [tick, setTick] = useState(0);
  const [loadedKey, setLoadedKey] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [error, setError] = useState("");

  const requestKey = `${device.id}|${range}|${tick}`;
  const loading = loadedKey !== requestKey;

  // Refresh both the latest reading and history.
  useEffect(() => {
    if (!refreshMs) return undefined;

    const id = setInterval(() => {
      setTick((value) => value + 1);
    }, refreshMs);

    return () => clearInterval(id);
  }, [refreshMs]);

  useEffect(() => {
    const controller = new AbortController();

    Promise.allSettled([
      api.latest(device.id, controller.signal),
      api.history(device.id, range, controller.signal),
    ]).then(([latest, hist]) => {
      if (controller.signal.aborted) return;

      if (latest.status === "fulfilled") {
        setReading(latest.value);
        setFetchedAt(Date.now());
      }

      if (hist.status === "fulfilled") {
        // Keep the requested range alongside the response so older
        // history cannot be displayed under a newly selected range.
        setHistory({
          deviceId: device.id,
          range,
          data: hist.value,
        });
      } else {
        setHistory(null);
      }

      const failed = [latest, hist].find(
        (result) => result.status === "rejected",
      );

      setError(
        failed
          ? failed.reason?.message ?? "Unable to load measurements."
          : "",
      );

      setLoadedKey(`${device.id}|${range}|${tick}`);
    });

    return () => controller.abort();
  }, [device.id, range, tick]);

  function changeRange(event) {
    const value = event.target.value;

    setRangeChoice(value);
    setRangeError("");

    // Opening the custom controls does not apply the unfinished input.
    if (value !== "custom") {
      setRange(value);
    }
  }

  function applyCustomRange(event) {
    event.preventDefault();

    const amount = Number(customNumber);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setRangeError("Enter a positive whole number.");
      return;
    }

    const nextRange = `${amount}${customUnit}`;

    try {
      rangeToSeconds(nextRange);
    } catch (err) {
      setRangeError(err.message);
      return;
    }

    setRange(nextRange);
    setRangeError("");
    setTick((value) => value + 1);
  }

  const stale =
    reading &&
    fetchedAt - new Date(reading.time).getTime() > STALE_AFTER_MS;

  const overheating =
    reading?.zones?.temperature === "red" &&
    limits?.temperature?.overheat_alert;

  const visibleHistory =
    history?.deviceId === device.id && history?.range === range
      ? history.data
      : null;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>{device.name}</h1>
          <p className="muted">
            Device ID: {device.id} · MAC: {device.mac}
          </p>
        </div>

        <div className="controls">
          <button
            onClick={() => setTick((value) => value + 1)}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>

          <label className="select">
            Auto-refresh
            <select
              value={refreshMs}
              onChange={(event) =>
                setRefreshMs(Number(event.target.value))
              }
            >
              {REFRESH_OPTIONS.map((option) => (
                <option key={option.ms} value={option.ms}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <button className="back-button" onClick={onBack}>
        ← All devices
      </button>

      {overheating && (
        <p className="alert-banner" role="alert">
          ⚠ Your device is overheating ({reading.temperature}{" "}
          {limits.temperature.unit}, limit{" "}
          {limits.temperature.red_above} {limits.temperature.unit})
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {reading && (
        <>
          <p className="timestamp">
            Last reading: {new Date(reading.time).toLocaleString()}
            {stale && (
              <span className="stale-badge">
                No new data for over a minute
              </span>
            )}
          </p>

          <section className="grid" aria-label="Latest measurements">
            {["voltage", "current", "temperature"].map((key) => (
              <MetricCard
                key={key}
                metric={key}
                value={reading[key]}
                zone={reading.zones?.[key]}
                limit={limits?.[key]}
              />
            ))}
          </section>
        </>
      )}

      <div className="section-head">
        <h2 className="section-title">Measurement history</h2>

        <label className="select">
          Time range
          <select value={rangeChoice} onChange={changeRange}>
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            <option value="custom">Custom range…</option>
          </select>
        </label>
      </div>

      {rangeChoice === "custom" && (
        <form
          className="custom-range"
          onSubmit={applyCustomRange}
          noValidate
        >
          <label className="select">
            Last
            <input
              type="number"
              min="1"
              step="1"
              value={customNumber}
              onChange={(event) =>
                setCustomNumber(event.target.value)
              }
              aria-invalid={Boolean(rangeError)}
              aria-describedby={
                rangeError
                  ? "range-help range-error"
                  : "range-help"
              }
            />
          </label>

          <label className="select">
            Unit
            <select
              value={customUnit}
              onChange={(event) =>
                setCustomUnit(event.target.value)
              }
            >
              <option value="m">Minutes</option>
              <option value="h">Hours</option>
              <option value="d">Days</option>
            </select>
          </label>

          <button type="submit" className="range-apply">
            Apply
          </button>

          <p id="range-help" className="muted range-help">
            Enter a whole number. Maximum range: 30 days.
          </p>
        </form>
      )}

      {rangeError && (
        <p id="range-error" className="error" role="alert">
          {rangeError}
        </p>
      )}

      <p className="muted small range-status" role="status">
        {loading
          ? `Loading last ${rangeLabel(range)}…`
          : visibleHistory
            ? `Showing last ${rangeLabel(range)} · Local time`
            : `No history loaded for last ${rangeLabel(range)}.`}
      </p>

      <HistoryChart
        history={visibleHistory}
        limits={limits}
        range={range}
      />
    </>
  );
}
