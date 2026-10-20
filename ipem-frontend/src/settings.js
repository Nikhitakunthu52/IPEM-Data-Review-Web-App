// Options shown in the dropdowns. Change them here.

export const REFRESH_OPTIONS = [
  { label: "Off", ms: 0 },
  { label: "10 sec", ms: 10_000 },
  { label: "30 sec", ms: 30_000 },
  { label: "1 min", ms: 60_000 },
];

// `value` must match a range the API accepts (see API.md).
export const RANGE_OPTIONS = [
  { label: "1 day", value: "1d" },
  { label: "3 days", value: "3d" },
  { label: "1 week", value: "7d" },
  { label: "1 month", value: "30d" },
];

// One line colour per measurement on the chart. Deliberately not green/yellow/red,
// which are reserved for the zones.
export const SERIES = [
  { key: "voltage", color: "#c084fc" },
  { key: "current", color: "#38bdf8" },
  { key: "temperature", color: "#f472b6" },
];

export const ZONE_TEXT = { green: "Normal", yellow: "Caution", red: "Out of range" };
