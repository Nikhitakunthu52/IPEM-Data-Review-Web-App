import { useState } from "react";
import { api } from "../api";

export default function DeviceList({ devices, onOpen, onChanged }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Devices</h1>
          <p className="muted">Select a device to view its measurements.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} aria-expanded={showForm}>
          {showForm ? "Cancel" : "+ Add device"}
        </button>
      </header>

      {showForm && (
        <AddDeviceForm
          onAdded={() => {
            setShowForm(false);
            onChanged();
          }}
        />
      )}

      <section className="grid" aria-label="Devices">
        {devices.length === 0 && <p className="muted">No devices yet. Add one with its MAC address.</p>}
        {devices.map((device) => (
          <button key={device.id} className="device-card" onClick={() => onOpen(device.id)}>
            <h2>{device.name}</h2>
            <p>ID: {device.id}</p>
            <p>MAC: {device.mac}</p>
            <span>View readings →</span>
          </button>
        ))}
      </section>
    </>
  );
}

function AddDeviceForm({ onAdded }) {
  const [name, setName] = useState("");
  const [mac, setMac] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.addDevice(name.trim(), mac.trim());
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="add-device" onSubmit={submit}>
      <h2>Add a device</h2>
      <label>
        Device name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="EMU bench 1" required maxLength={60} />
      </label>
      <label>
        MAC address
        <input
          value={mac}
          onChange={(e) => setMac(e.target.value)}
          placeholder="10:20:ba:51:dd:84"
          required
          spellCheck={false}
          autoCapitalize="none"
        />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save device"}</button>
    </form>
  );
}
