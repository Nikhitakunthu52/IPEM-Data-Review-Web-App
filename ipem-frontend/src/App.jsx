import { useEffect, useState } from "react";
import "./App.css";
import { api } from "./api";
import DeviceList from "./components/DeviceList";
import DeviceDetail from "./components/DeviceDetail";

const MODE_LABEL = { mock: "MOCK DATA", demo: "DEMO DATA", influx: "LIVE DATA" };

// The open device is kept in the URL (?device=dev-01) so reload and the
// browser's back button work.
function deviceFromUrl() {
  return new URLSearchParams(window.location.search).get("device");
}

export default function App() {
  const [devices, setDevices] = useState([]);
  const [limits, setLimits] = useState(null);
  const [mode, setMode] = useState(null);
  const [deviceId, setDeviceId] = useState(deviceFromUrl);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function reloadDevices() {
    api.devices().then(setDevices).catch((err) => setError(err.message));
  }

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([api.health(signal), api.limits(signal), api.devices(signal)])
      .then(([health, lim, list]) => {
        setMode(health.mode);
        setLimits(lim);
        setDevices(list);
      })
      .catch((err) => !signal.aborted && setError(err.message))
      .finally(() => !signal.aborted && setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onPop = () => setDeviceId(deviceFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function openDevice(id) {
    window.history.pushState(null, "", id ? `?device=${encodeURIComponent(id)}` : window.location.pathname);
    setDeviceId(id);
  }

  const device = devices.find((d) => d.id === deviceId);

  return (
    <main className="dashboard">
      <p className="eyebrow">
        IPEM LAB
        {mode && <span className={`mode-badge mode-${mode}`}>{MODE_LABEL[mode] ?? mode.toUpperCase()}</span>}
      </p>

      {mode === "demo" && (
        <p className="demo-note">
          Demo version: readings are simulated in your browser, and devices you add are saved only on this computer.
        </p>
      )}

      {loading && <p role="status">Loading…</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {!loading && !error && !deviceId && (
        <DeviceList devices={devices} onOpen={openDevice} onChanged={reloadDevices} />
      )}

      {!loading && !error && deviceId && !device && (
        <>
          <button className="back-button" onClick={() => openDevice(null)}>← All devices</button>
          <p className="error" role="alert">Device “{deviceId}” not found.</p>
        </>
      )}

      {!loading && !error && device && (
        <DeviceDetail key={device.id} device={device} limits={limits} onBack={() => openDevice(null)} />
      )}
    </main>
  );
}
