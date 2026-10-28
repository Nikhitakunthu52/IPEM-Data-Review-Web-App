"""Data sources and settings for the IPEM Lab API.

MockSource   - fake readings so the frontend can be built without server access.
InfluxSource - real data from InfluxDB 1.8 (InfluxQL over HTTP, username/password).

Pick one with DATA_MODE=mock|influx in .env.

All metrics are defined once in METRICS below: where each one lives (database,
measurement, field), the divisor the lab dashboards apply, and its display unit.
Adding a metric is one new entry.
"""
import json
import logging
import math
import os
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

log = logging.getLogger("ipem.data")

HERE = Path(__file__).parent

FEATURES_DB = os.getenv("INFLUX_DB", "SP_Features")
FEATURES_MEASUREMENT = os.getenv("INFLUX_MEASUREMENT", "Features_v2")
WAVEFORM_DB = os.getenv("INFLUX_WAVEFORM_DB", "waveform")

# API name -> where it lives and how to turn the stored number into the displayed one.
#   divisor: the "value"/N in the SmartPP and SmartPlug_Features dashboard queries
#   unit:    "" means the dashboard shows a plain number (Grafana unit "short")
#   agg:     how history windows combine raw points ("last" for cumulative counters)
METRICS = {
    # Features_v2 is stored in real units already.
    "voltage": dict(db=FEATURES_DB, measurement=FEATURES_MEASUREMENT,
                    field=os.getenv("FIELD_VOLTAGE", "VF_RMS"), divisor=1, unit="V", agg="mean"),
    "current": dict(db=FEATURES_DB, measurement=FEATURES_MEASUREMENT,
                    field=os.getenv("FIELD_CURRENT", "IF_RMS"), divisor=1, unit="A", agg="mean"),
    # Everything below comes from the waveform database (field "value").
    "thd": dict(db=WAVEFORM_DB, measurement="Volt_THD", field="value", divisor=1, unit="", agg="mean"),
    "temperature": dict(db=WAVEFORM_DB, measurement="temperature", field="value", divisor=10, unit="\u00b0C", agg="mean"),
    "power": dict(db=WAVEFORM_DB, measurement="Power", field="value", divisor=10, unit="", agg="mean"),
    "apparent_power": dict(db=WAVEFORM_DB, measurement="Apparent_Power", field="value", divisor=10, unit="", agg="mean"),
    "reactive_power": dict(db=WAVEFORM_DB, measurement="Reactive_Power", field="value", divisor=10, unit="", agg="mean"),
    "power_factor": dict(db=WAVEFORM_DB, measurement="Power_Factor", field="value", divisor=1, unit="", agg="mean"),
    "energy": dict(db=WAVEFORM_DB, measurement="Power_Energy_Acc", field="value", divisor=1, unit="", agg="last"),
}
UNITS = {name: m["unit"] for name, m in METRICS.items()}

# Time ranges. The chart can show any span from 1 minute to 30 days: pick one of the
# presets below or send your own number and unit (e.g. "90m", "2h", "10d").
# Units: m = minutes, h = hours, d = days. The keys are valid InfluxQL durations.
RANGE_PRESETS = ["5m", "15m", "30m", "1h", "3h", "6h", "12h", "1d", "3d", "7d", "30d"]
UNIT_SECONDS = {"m": 60, "h": 3600, "d": 86400}
MIN_RANGE_SECONDS = 60
MAX_RANGE_SECONDS = 30 * 86400
RANGE_RE = re.compile(r"^([1-9]\d{0,4})([mhd])$")


def parse_range(text: str) -> int:
    """'90m' -> 5400. Raises ValueError for anything that is not a valid range."""
    m = RANGE_RE.match((text or "").strip().lower())
    if not m:
        raise ValueError("Range must be a whole number plus m, h or d, e.g. 30m, 12h, 7d")
    seconds = int(m.group(1)) * UNIT_SECONDS[m.group(2)]
    if not MIN_RANGE_SECONDS <= seconds <= MAX_RANGE_SECONDS:
        raise ValueError("Range must be between 1m and 30d")
    return seconds


# Averaging windows. Raw data arrives at about 15 samples per second.
WINDOW_SECONDS = {
    "1s": 1, "5s": 5, "10s": 10, "30s": 30, "1m": 60, "2m": 120, "5m": 300,
    "15m": 900, "30m": 1800, "1h": 3600, "2h": 7200, "6h": 21600,
}
TARGET_POINTS = 360   # aim for charts of at most about this many points
MAX_POINTS = 2000


def default_window(range_seconds: int) -> str:
    """Smallest window that keeps the chart at or under TARGET_POINTS points."""
    for name, step in sorted(WINDOW_SECONDS.items(), key=lambda kv: kv[1]):
        if range_seconds // step <= TARGET_POINTS:
            return name
    return "6h"


# ---------------------------------------------------------------- devices --
# The lab tags data with lowercase MACs (e.g. 10:20:ba:51:dd:84), so that is
# the format we store; anything else would never match in InfluxDB.
MAC_RE = re.compile(r"^([0-9a-f]{2}:){5}[0-9a-f]{2}$")
_devices_lock = threading.Lock()


def _devices_path() -> Path:
    return HERE / os.getenv("DEVICES_FILE", "devices.json")


def load_devices() -> list:
    path = _devices_path()
    return json.loads(path.read_text()) if path.exists() else []


def save_devices(devices: list) -> None:
    path = _devices_path()
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(devices, indent=2) + "\n")
    tmp.replace(path)  # atomic, so a crash never leaves a half-written file


def normalize_mac(mac: str) -> str:
    """Accept 10:20:BA:51:DD:84, 10-20-ba-51-dd-84 or 1020ba51dd84 -> 10:20:ba:51:dd:84."""
    hex_only = re.sub(r"[^0-9A-Fa-f]", "", mac).lower()
    if len(hex_only) != 12:
        raise ValueError("MAC address must have 12 hex digits, e.g. 10:20:ba:51:dd:84")
    return ":".join(hex_only[i:i + 2] for i in range(0, 12, 2))


def next_device_id(devices: list) -> str:
    nums = [int(m.group(1)) for d in devices if (m := re.fullmatch(r"dev-(\d+)", d["id"]))]
    return f"dev-{(max(nums) + 1) if nums else 1:02d}"


# ----------------------------------------------------------------- limits --
def load_limits() -> dict:
    return json.loads((HERE / os.getenv("LIMITS_FILE", "limits.json")).read_text())


def zone(value, limit: dict):
    """green / yellow / red for one reading, using one entry of limits.json."""
    if value is None:
        return None
    if limit.get("red_above") is not None and value > limit["red_above"]:
        return "red"
    if limit.get("red_below") is not None and value < limit["red_below"]:
        return "red"
    if limit.get("green_max") is not None and value > limit["green_max"]:
        return "yellow"
    if limit.get("green_min") is not None and value < limit["green_min"]:
        return "yellow"
    return "green"


def _iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


# ------------------------------------------------------------------ mock ----
class MockSource:
    mode = "mock"

    def _reading(self, device, t: datetime):
        seed = sum(ord(c) for c in device["mac"]) % 10
        s = t.timestamp()
        # Drifts across green / yellow / red so the zone colours can be tested.
        return {
            "time": _iso(t),
            "voltage": round(110 + 4 * math.sin(s / 3600 + seed) + 1.5 * math.sin(s / 40), 2),
            "current": round(9.5 + 1.8 * math.sin(s / 5400 + seed) + 0.3 * math.sin(s / 17), 3),
            "thd": round(20 + seed + 2 * math.sin(s / 41), 3),
            "temperature": round(50 + 18 * math.sin(s / 7200 + seed) + math.sin(s / 300), 2),
            "power": round(100 + 10 * seed + 5 * math.sin(s / 23), 3),
            "apparent_power": round(120 + 10 * seed + 5 * math.sin(s / 29), 3),
            "reactive_power": round(-60 - 5 * seed + 3 * math.sin(s / 31), 3),
            "power_factor": round(46 + seed + math.sin(s / 37), 3),
            "energy": round(13000 + seed * 100 + (s % 86400) / 10, 3),
        }

    def latest(self, device):
        return self._reading(device, datetime.now(timezone.utc))

    def history(self, device, range_: str, window: str):
        end = datetime.now(timezone.utc)
        step = WINDOW_SECONDS[window]
        n = parse_range(range_) // step
        return [self._reading(device, end - timedelta(seconds=step * i)) for i in range(n, -1, -1)]


# ---------------------------------------------------------------- influx ----
class InfluxSource:
    """InfluxDB 1.8 via the HTTP /query endpoint (InfluxQL, username/password).

    Every metric in METRICS is fetched; metrics in the same (database,
    measurement) share one query and the queries run in parallel.
    """
    mode = "influx"

    def __init__(self):
        import requests
        import urllib3

        self.requests = requests
        self.url = os.environ["INFLUX_URL"].rstrip("/") + "/query"
        self.auth = (os.environ["INFLUX_USER"], os.environ["INFLUX_PASSWORD"])
        self.mac_tag = os.getenv("INFLUX_MAC_TAG", "location")
        self.verify = os.getenv("INFLUX_VERIFY_SSL", "true").lower() != "false"
        if not self.verify:
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        self.groups = {}
        for name, m in METRICS.items():
            self.groups.setdefault((m["db"], m["measurement"]), []).append(name)

    # ---- low level ---------------------------------------------------------
    def _query(self, db: str, q: str):
        r = self.requests.get(
            self.url, params={"db": db, "q": q},
            auth=self.auth, verify=self.verify, timeout=30,
        )
        r.raise_for_status()
        result = r.json()["results"][0]
        if "error" in result:
            raise RuntimeError(result["error"])
        series = result.get("series")
        return series[0] if series else None

    def _where(self, device, start: str) -> str:
        # Only ever called with a MAC from the device registry and a range key
        # from parse_range(), both checked here so nothing odd reaches the query.
        mac = device["mac"]
        if not MAC_RE.match(mac):
            raise ValueError(f"Invalid MAC in registry: {mac!r}")
        if not re.fullmatch(r"\d+[smhd]", start):
            raise ValueError(f"Invalid duration: {start!r}")
        return f"WHERE \"{self.mac_tag}\" = '{mac}' AND time > now() - {start}"

    def _convert(self, name: str, value):
        if value is None:
            return None
        return round(float(value) / METRICS[name]["divisor"], 4)

    def _fetch_all(self, fn):
        """Run fn(group_key, names) for every group in parallel. A failing group
        leaves its metrics null; if every group fails, raise."""
        results, errors = [], []
        with ThreadPoolExecutor(max_workers=len(self.groups)) as pool:
            futures = [(key, pool.submit(fn, key, names)) for key, names in self.groups.items()]
            for key, fut in futures:
                try:
                    results.append(fut.result())
                except Exception as exc:  # noqa: BLE001
                    log.warning("query failed for %s/%s: %s", key[0], key[1], exc)
                    errors.append(exc)
        if errors and not results:
            raise errors[-1]
        return results

    # ---- latest ------------------------------------------------------------
    def latest(self, device):
        def run(key, names):
            db, measurement = key
            cols = ", ".join(f'"{METRICS[n]["field"]}" AS "{n}"' for n in names)
            q = (f'SELECT {cols} FROM "{measurement}" '
                 f'{self._where(device, "5m")} ORDER BY time DESC LIMIT 1')
            series = self._query(db, q)
            if not series or not series["values"]:
                return None, {}
            row = dict(zip(series["columns"], series["values"][0]))
            return row["time"], {n: self._convert(n, row.get(n)) for n in names}

        reading = {n: None for n in METRICS}
        times = []
        for time_, values in self._fetch_all(run):
            if time_ is not None:
                times.append(time_)
            reading.update(values)
        if not times:
            return None
        return {"time": max(times), **reading}

    # ---- history -----------------------------------------------------------
    def history(self, device, range_: str, window: str):
        def run(key, names):
            db, measurement = key
            cols = ", ".join(
                f'{METRICS[n]["agg"]}("{METRICS[n]["field"]}") AS "{n}"' for n in names)
            q = (f'SELECT {cols} FROM "{measurement}" '
                 f'{self._where(device, range_)} GROUP BY time({window}) fill(none)')
            series = self._query(db, q)
            if not series:
                return []
            out = []
            for values in series["values"]:
                row = dict(zip(series["columns"], values))
                out.append((row["time"], {n: self._convert(n, row.get(n)) for n in names}))
            return out

        merged = {}
        for group_rows in self._fetch_all(run):
            for time_, values in group_rows:
                row = merged.setdefault(time_, {n: None for n in METRICS})
                row.update(values)
        # Window-aligned timestamps are identical across databases.
        return [{"time": t, **merged[t]} for t in sorted(merged)]


def get_source():
    return InfluxSource() if os.getenv("DATA_MODE", "mock") == "influx" else MockSource()