// Options shown in the dropdowns.

export const REFRESH_OPTIONS = [
  { label: "Off", ms: 0 },
  { label: "10 sec", ms: 10_000 },
  { label: "30 sec", ms: 30_000 },
  { label: "1 min", ms: 60_000 },
];

// The live API must support these ranges before using them outside demo mode.
export const RANGE_OPTIONS = [
  { label: "5 minutes", value: "5m" },
  { label: "15 minutes", value: "15m" },
  { label: "30 minutes", value: "30m" },
  { label: "1 hour", value: "1h" },
  { label: "3 hours", value: "3h" },
  { label: "6 hours", value: "6h" },
  { label: "12 hours", value: "12h" },
  { label: "1 day", value: "1d" },
  { label: "3 days", value: "3d" },
  { label: "1 week", value: "7d" },
  { label: "30 days", value: "30d" },
];

// Green/yellow/red are reserved for measurement zones.
export const SERIES = [
  { key: "voltage", color: "#c084fc" },
  { key: "current", color: "#38bdf8" },
  { key: "temperature", color: "#f472b6" },
];

export const ZONE_TEXT = {
  green: "Normal",
  yellow: "Caution",
  red: "Out of range",
};

// Whole-number minutes, hours, or days, up to 30 days.
export function rangeToSeconds(range) {
  const match = /^(\d+)(m|h|d)$/.exec(range);

  if (!match) {
    throw new Error("Use a range such as 45m, 3h, or 2d.");
  }

  const amount = Number(match[1]);
  const multipliers = { m: 60, h: 3600, d: 86400 };
  const seconds = amount * multipliers[match[2]];

  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    seconds > 30 * 86400
  ) {
    throw new Error("Choose a range between 1 minute and 30 days.");
  }

  return seconds;
}

export function rangeLabel(range) {
  const preset = RANGE_OPTIONS.find((option) => option.value === range);

  if (preset) return preset.label;

  const match = /^(\d+)(m|h|d)$/.exec(range);

  if (!match) return range;

  const amount = Number(match[1]);
  const units = { m: "minute", h: "hour", d: "day" };

  return `${amount} ${units[match[2]]}${amount === 1 ? "" : "s"}`;
}
