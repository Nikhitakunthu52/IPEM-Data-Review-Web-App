// Demo mode: the same functions as api.js, but everything runs in the browser.
// Used on GitHub Pages until the real API is hosted on the lab server.
// The fake readings match MockSource in ipem-api 2/data.py.
import limits from "../../ipem-api 2/limits.json";
import startingDevices from "../../ipem-api 2/devices.json";

const STORAGE_KEY = "ipem-demo-devices";
const RANGES = { "1d": 86400, "3d": 3 * 86400, "7d": 7 * 86400, "30d": 30 * 86400 };
const WINDOWS = { "1d": ["5m", 300], "3d": ["15m", 900], "7d": ["30m", 1800], "30d": ["2h", 7200] };

// Devices added in the demo are remembered in this browser only.
function readDevices() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return saved;
  } catch {
    /* storage blocked or empty */
  }
  return startingDevices;
}

function writeDevices(devices) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
  } catch {
    /* storage blocked: changes last until the page reloads */
  }
  memory = devices;
}

let memory = null;
const devices = () => memory ?? (memory = readDevices());

function normalizeMac(mac) {
  const hex = mac.replace(/[^0-9a-f]/gi, "").toLowerCase();
  if (hex.length !== 12) throw new Error("MAC address must have 12 hex digits, e.g. 10:20:ba:51:dd:84");
  return hex.match(/../g).join(":");
}

function zone(value, limit) {
  if (value == null) return null;
  if (limit.red_above != null && value > limit.red_above) return "red";
  if (limit.red_below != null && value < limit.red_below) return "red";
  if (limit.green_max != null && value > limit.green_max) return "yellow";
  if (limit.green_min != null && value < limit.green_min) return "yellow";
  return "green";
}

function reading(device, ms) {
  const seed = [...device.mac].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 10;
  const s = ms / 1000;
  const round = (v, d) => Number(v.toFixed(d));
  return {
    time: new Date(ms).toISOString(),
    voltage: round(110 + 4 * Math.sin(s / 3600 + seed) + 1.5 * Math.sin(s / 40), 2),
    current: round(9.5 + 1.8 * Math.sin(s / 5400 + seed) + 0.3 * Math.sin(s / 17), 3),
    temperature: round(50 + 18 * Math.sin(s / 7200 + seed) + Math.sin(s / 300), 2),
  };
}

function find(id) {
  const device = devices().find((d) => d.id === id);
  if (!device) throw new Error(`Unknown device '${id}'`);
  return device;
}

const later = (value) => new Promise((resolve) => setTimeout(() => resolve(value), 150));

export const demoApi = {
  health: () => later({ status: "ok", mode: "demo" }),
  limits: () => later(limits),
  devices: () => later(devices()),

  addDevice: async (name, mac) => {
    const clean = normalizeMac(mac);
    const list = devices();
    if (list.some((d) => d.mac === clean)) throw new Error(`A device with MAC ${clean} already exists`);
    const nums = list.map((d) => Number(/^dev-(\d+)$/.exec(d.id)?.[1] ?? 0));
    const device = { id: `dev-${String(Math.max(0, ...nums) + 1).padStart(2, "0")}`, name: name.trim(), mac: clean };
    writeDevices([...list, device]);
    return later(device);
  },

  deleteDevice: async (id) => {
    find(id);
    writeDevices(devices().filter((d) => d.id !== id));
    return later(null);
  },

  latest: async (id) => {
    const device = find(id);
    const r = reading(device, Date.now());
    const zones = Object.fromEntries(Object.keys(limits).map((k) => [k, zone(r[k], limits[k])]));
    return later({ device_id: id, ...r, zones });
  },

  history: async (id, range) => {
    const device = find(id);
    const [window, step] = WINDOWS[range];
    const end = Date.now();
    const n = Math.floor(RANGES[range] / step);
    const points = Array.from({ length: n + 1 }, (_, i) => reading(device, end - (n - i) * step * 1000));
    return later({ device_id: id, range, window, points });
  },
};
