// All calls to the IPEM Lab API go through this file.
// Settings come from ipem-frontend/.env (see .env.example); defaults work for local dev.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const API_KEY = import.meta.env.VITE_API_KEY ?? "dev-key";

async function request(path, { method = "GET", body, signal } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      signal,
      headers: {
        "X-API-Key": API_KEY,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new Error(`Can't reach the API at ${API_URL}. Is it running?`, { cause: err });
  }

  if (!response.ok) {
    // Show the API's own message (e.g. "No data from this device in the last 5 minutes").
    let detail = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      if (typeof data.detail === "string") detail = data.detail;
      else if (Array.isArray(data.detail)) detail = data.detail.map((d) => d.msg).join(", ");
    } catch {
      /* response had no JSON body */
    }
    throw new Error(detail);
  }

  return response.status === 204 ? null : response.json();
}

export const api = {
  health: (signal) => request("/health", { signal }),
  limits: (signal) => request("/limits", { signal }),
  devices: (signal) => request("/devices", { signal }),
  addDevice: (name, mac) => request("/devices", { method: "POST", body: { name, mac } }),
  deleteDevice: (id) => request(`/devices/${encodeURIComponent(id)}`, { method: "DELETE" }),
  latest: (id, signal) => request(`/devices/${encodeURIComponent(id)}/latest`, { signal }),
  history: (id, range, signal) =>
    request(`/devices/${encodeURIComponent(id)}/history?range=${range}`, { signal }),
};
