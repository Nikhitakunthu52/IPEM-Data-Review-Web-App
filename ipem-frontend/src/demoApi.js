// Demo mode runs entirely in the browser.
// Existing devices and limits come from the shared backend JSON files.
import limits from "../../ipem-api 2/limits.json";
import startingDevices from "../../ipem-api 2/devices.json";
import { rangeToSeconds } from "./settings";

const STORAGE_KEY = "ipem-demo-devices";

// Choose a sampling window that keeps demo charts reasonably sized.
function windowForRange(seconds) {
  if (seconds <= 15 * 60) return ["5s", 5];
  if (seconds <= 60 * 60) return ["15s", 15];
  if (seconds <= 3 * 3600) return ["30s", 30];
  if (seconds <= 6 * 3600) return ["1m", 60];
  if (seconds <= 12 * 3600) return ["2m", 120];
  if (seconds <= 86400) return ["5m", 300];
  if (seconds <= 3 * 86400) return ["15m", 900];
  if (seconds <= 7 * 86400) return ["30m", 1800];
  return ["2h", 7200];
}

// Devices added in demo mode are remembered in this browser only.
function readDevices() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return saved;
  } catch {
    // Storage blocked or empty.
  }

  return startingDevices;
}

function writeDevices(nextDevices) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDevices));
  } catch {
    // If storage is blocked, changes last until the page reloads.
  }

  memory = nextDevices;
}

let memory = null;

const devices = () => memory ?? (memory = readDevices());

function normalizeMac(mac) {
  const hex = mac.replace(/[^0-9a-f]/gi, "").toLowerCase();

  if (hex.length !== 12) {
    throw new Error(
      "MAC address must have 12 hex digits, e.g. 10:20:ba:51:dd:84",
    );
  }

  return hex.match(/../g).join(":");
}

function zone(value, limit) {
  if (value == null) return null;

  if (limit.red_above != null && value > limit.red_above) {
    return "red";
  }

  if (limit.red_below != null && value < limit.red_below) {
    return "red";
  }

  if (limit.green_max != null && value > limit.green_max) {
    return "yellow";
  }

  if (limit.green_min != null && value < limit.green_min) {
    return "yellow";
  }

  return "green";
}

function reading(device, ms) {
  const seed =
    [...device.mac].reduce(
      (sum, character) => sum + character.charCodeAt(0),
      0,
    ) % 10;

  const seconds = ms / 1000;
  const round = (value, digits) => Number(value.toFixed(digits));

  return {
    time: new Date(ms).toISOString(),
    voltage: round(
      110 +
        4 * Math.sin(seconds / 3600 + seed) +
        1.5 * Math.sin(seconds / 40),
      2,
    ),
    current: round(
      9.5 +
        1.8 * Math.sin(seconds / 5400 + seed) +
        0.3 * Math.sin(seconds / 17),
      3,
    ),
    temperature: round(
      50 +
        18 * Math.sin(seconds / 7200 + seed) +
        Math.sin(seconds / 300),
      2,
    ),
  };
}

function find(id) {
  const device = devices().find((item) => item.id === id);

  if (!device) {
    throw new Error(`Unknown device '${id}'`);
  }

  return device;
}

const later = (value) =>
  new Promise((resolve) => {
    setTimeout(() => resolve(value), 150);
  });

export const demoApi = {
  health: () => later({ status: "ok", mode: "demo" }),

  limits: () => later(limits),

  devices: () => later(devices()),

  addDevice: async (name, mac) => {
    const clean = normalizeMac(mac);
    const list = devices();

    if (list.some((device) => device.mac === clean)) {
      throw new Error(`A device with MAC ${clean} already exists`);
    }

    const numbers = list.map((device) =>
      Number(/^dev-(\d+)$/.exec(device.id)?.[1] ?? 0),
    );

    const device = {
      id: `dev-${String(Math.max(0, ...numbers) + 1).padStart(2, "0")}`,
      name: name.trim(),
      mac: clean,
    };

    writeDevices([...list, device]);
    return later(device);
  },

  deleteDevice: async (id) => {
    find(id);
    writeDevices(devices().filter((device) => device.id !== id));
    return later(null);
  },

  latest: async (id) => {
    const device = find(id);
    const currentReading = reading(device, Date.now());

    const zones = Object.fromEntries(
      Object.keys(limits).map((key) => [
        key,
        zone(currentReading[key], limits[key]),
      ]),
    );

    return later({
      device_id: id,
      ...currentReading,
      zones,
    });
  },

  history: async (id, range) => {
    const device = find(id);
    const seconds = rangeToSeconds(range);
    const [window, step] = windowForRange(seconds);

    const end = Date.now();
    const start = end - seconds * 1000;
    const count = Math.ceil(seconds / step);

    // Average five synthetic samples per bucket.
    // The last bucket may be shorter for a custom range.
    const points = Array.from({ length: count }, (_, index) => {
      const bucketStart = start + index * step * 1000;
      const bucketEnd = Math.min(
        bucketStart + step * 1000,
        end,
      );

      const samples = Array.from(
        { length: 5 },
        (_, sampleIndex) => {
          const time =
            bucketStart +
            ((sampleIndex + 0.5) / 5) *
              (bucketEnd - bucketStart);

          return reading(device, time);
        },
      );

      const average = (key, digits) =>
        Number(
          (
            samples.reduce(
              (sum, sample) => sum + sample[key],
              0,
            ) / samples.length
          ).toFixed(digits),
        );

      return {
        time: new Date(bucketStart).toISOString(),
        voltage: average("voltage", 2),
        current: average("current", 3),
        temperature: average("temperature", 2),
      };
    });

    return later({
      device_id: id,
      range,
      window,
      points,
    });
  },
};
