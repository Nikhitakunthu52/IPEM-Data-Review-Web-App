import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:8000";

async function fetchData(path, signal) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      "X-API-Key": "dev-key",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}).`);
  }

  return response.json();
}

export default function App() {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [reading, setReading] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(0);

  const deviceId = selectedDevice?.id;
  useEffect(() => {
  if (autoRefresh === 0) {
    return;
  }

  const timer = setInterval(() => {
    setRefreshCount((count) => count + 1);
  }, autoRefresh * 1000);

  return () => clearInterval(timer);
}, [autoRefresh]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadData() {
      setLoading(true);
      setError("");
      setReading(null);

      try {
        if (deviceId) {
          const data = await fetchData(
            `/devices/${encodeURIComponent(deviceId)}/latest`,
            controller.signal,
          );
          setReading(data);
        } else {
          const data = await fetchData("/devices", controller.signal);
          setDevices(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(`${err.message} Check that the API is running on port 8000.`);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => controller.abort();
  }, [deviceId, refreshCount]);

  function openDevice(device) {
    setReading(null);
    setError("");
    setLoading(true);
    setSelectedDevice(device);
  }

  function showDeviceList() {
    setError("");
    setLoading(true);
    setSelectedDevice(null);
  }

  function formatValue(value, unit) {
    return value == null ? "No data" : `${value} ${unit}`;
  }

  return (
    <main className="dashboard">
      <header className="page-header">
        <div>
          <p className="eyebrow">IPEM LAB · MOCK DATA</p>
          <h1>{selectedDevice ? selectedDevice.name : "Devices"}</h1>
          <p>
            {selectedDevice
              ? `Device ID: ${selectedDevice.id} · MAC: ${selectedDevice.mac}`
              : "Select a device to view its latest measurements."}
          </p>
        </div>

        <div className = "refresh-controls">
          <label htmlFor="auto-refresh">Auto-refresh:</label>

          <select
            id="auto-refresh"
            value={autoRefresh}
            onChange={(event) => setAutoRefresh(Number(event.target.value))}
          >
              <option value={0}>Off</option>
              <option value={10}>10 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={60}>1 minute</option>
            </select>

            <button
              onClick={() => setRefreshCount((count) => count + 1)}
              disabled={loading}
            >
              Refresh
            </button>
        </div>
      </header>

      {selectedDevice && (
        <button className="back-button" onClick={showDeviceList}>
          ← All devices
        </button>
      )}

      {loading && <p role="status">Loading…</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {!loading && !error && !selectedDevice && (
        <section className="grid" aria-label="Devices">
          {devices.length === 0 && <p>No devices available.</p>}

          {devices.map((device) => (
            <button
              key={device.id}
              className="device-card"
              onClick={() => openDevice(device)}
            >
              <h2>{device.name}</h2>
              <p>ID: {device.id}</p>
              <p>MAC: {device.mac}</p>
              <span>View readings →</span>
            </button>
          ))}
        </section>
      )}

      {selectedDevice && (
        <>
          {!loading && !error && reading && (
            <>
              <p className="timestamp">
                Last reading: {new Date(reading.time).toLocaleString()}
              </p>

              <section className="grid" aria-label="Latest measurements">
                <article className="metric-card">
                  <h2>Voltage</h2>
                  <p>{formatValue(reading.voltage, "V")}</p>
                </article>

                <article className="metric-card">
                  <h2>Current</h2>
                  <p>{formatValue(reading.current, "A")}</p>
                </article>

                <article className="metric-card">
                  <h2>Temperature</h2>
                  <p>{formatValue(reading.temperature, "°C")}</p>
                </article>
              </section>
            </>
          )}

          <h2 className="section-title">Measurement history</h2>

          <section className="grid" aria-label="Future charts">
            {["Voltage", "Current", "Temperature"].map((name) => (
              <article className="chart-card" key={name}>
                <h3>{name}</h3>
                <div className="chart-placeholder">
                  History chart coming next week
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
