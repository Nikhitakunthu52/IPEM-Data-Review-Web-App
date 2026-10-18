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

  const deviceId = selectedDevice?.id;

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

        <button
