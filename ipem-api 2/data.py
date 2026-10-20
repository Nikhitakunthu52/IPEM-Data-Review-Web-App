"""Data sources and settings for the IPEM Lab API.

MockSource   - fake readings so the frontend can be built without server access.
InfluxSource - real data from InfluxDB 1.8 (InfluxQL over HTTP, username/password).

Pick one with DATA_MODE=mock|influx in .env.
"""
import json
import math
import os
import re
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).parent

FIELDS = {
    # API name  -> field name in InfluxDB (set in .env; empty = not in the main
    # measurement, e.g. temperature, which comes from its own database below)
    "voltage": os.getenv("FIELD_VOLTAGE", "voltage"),
    "current": os.getenv("FIELD_CURRENT", "current"),
    "temperature": os.getenv("FIELD_TEMPERATURE", "temperature"),
}

# Time ranges the user can pick: 1 day, 3 days, 1 week, 1 month.
# The keys are also valid InfluxQL durations (now() - 30d).
RANGES = {"1d": 86400, "3d": 3 * 86400, "7d": 7 * 86400, "30d": 30 * 86400}

# Averaging window per range. Keeps every chart at roughly 290-360 points
# instead of ~15 raw samples per second (1.3 million points per day).
DEFAULT_WINDOW = {"1d": "5m", "3d": "15m", "7d": "30m", "30d": "2h"}
WINDOW_SECONDS = {
    "1m": 60, "5m": 300, "15m": 900, "30m": 1800,
    "1h": 3600, "2h": 7200, "6h": 21600,
}
MAX_POINTS = 2000


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
            "temperature": round(50 + 18 * math.sin(s / 7200 + seed) + math.sin(s / 300), 2),
        }

    def latest(self, device):
        return self._reading(device, datetime.now(timezone.utc))

    def history(self, device, range_: str, window: str):
        end = datetime.now(timezone.utc)
        step = WINDOW_SECONDS[window]
        n = RANGES[range_] // step
        return [self._reading(device, end - timedelta(seconds=step * i)) for i in range(n, -1, -1)]


# ---------------------------------------------------------------- influx ----
class InfluxSource:
    """InfluxDB 1.8 via the HTTP /query endpoint (InfluxQL, username/password).

    Written by Ayush for the lab server; ranges and MAC checking updated.
    """
    mode = "influx"

    def __init__(self):
        import requests
        import urllib3

        self.requests = requests
        self.url = os.environ["INFLUX_URL"].rstrip("/") + "/query"
        self.auth = (os.environ["INFLUX_USER"], os.environ["INFLUX_PASSWORD"])
        self.db = os.environ["INFLUX_DB"]
        self.measurement = os.environ["INFLUX_MEASUREMENT"]
        self.mac_tag = os.getenv("INFLUX_MAC_TAG", "location")
        self.verify = os.getenv("INFLUX_VERIFY_SSL", "true").lower() != "false"
        if not self.verify:
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        # Temperature lives in a different database (waveform), stored x10.
        self.temp_db = os.getenv("INFLUX_TEMP_DB", "")
        self.temp_measurement = os.getenv("INFLUX_TEMP_MEASUREMENT", "temperature")
        self.temp_field = os.getenv("INFLUX_TEMP_FIELD", "value")
        self.temp_divisor = float(os.getenv("INFLUX_TEMP_DIVISOR", "10"))

    def _query(self, q: str, db=None):
        r = self.requests.get(
            self.url, params={"db": db or self.db, "q": q},
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
        # from RANGES, both checked here so nothing odd reaches the query.
        mac = device["mac"]
        if not MAC_RE.match(mac):
            raise ValueError(f"Invalid MAC in registry: {mac!r}")
        if not re.fullmatch(r"\d+[smhd]", start):
            raise ValueError(f"Invalid duration: {start!r}")
        return f"WHERE \"{self.mac_tag}\" = '{mac}' AND time > now() - {start}"

    def _rows(self, series):
        if not series:
            return []
        cols = series["columns"]
        rows = []
        for values in series["values"]:
            d = dict(zip(cols, values))
            row = {"time": d["time"]}
            for api_name in FIELDS:
                val = d.get(api_name)
                row[api_name] = None if val is None else round(float(val), 4)
            rows.append(row)
        return rows

    def _temp_latest(self, device):
        if not self.temp_db:
            return None
        try:
            q = (f'SELECT last("{self.temp_field}") FROM "{self.temp_measurement}" '
                 f'{self._where(device, "5m")}')
            series = self._query(q, self.temp_db)
            val = series["values"][0][1] if series else None
            return None if val is None else round(float(val) / self.temp_divisor, 2)
        except Exception:
            return None

    def _temp_history(self, device, range_: str, window: str):
        if not self.temp_db:
            return {}
        try:
            q = (f'SELECT mean("{self.temp_field}") FROM "{self.temp_measurement}" '
                 f'{self._where(device, range_)} GROUP BY time({window}) fill(none)')
            series = self._query(q, self.temp_db)
            if not series:
                return {}
            return {t: round(float(v) / self.temp_divisor, 2)
                    for t, v in series["values"] if v is not None}
        except Exception:
            return {}

    def latest(self, device):
        cols = ", ".join(f'"{v}" AS "{k}"' for k, v in FIELDS.items() if v)
        q = (f'SELECT {cols} FROM "{self.measurement}" '
             f'{self._where(device, "5m")} ORDER BY time DESC LIMIT 1')
        rows = self._rows(self._query(q))
        if not rows:
            return None
        if self.temp_db:
            rows[0]["temperature"] = self._temp_latest(device)
        return rows[0]

    def history(self, device, range_: str, window: str):
        cols = ", ".join(f'mean("{v}") AS "{k}"' for k, v in FIELDS.items() if v)
        q = (f'SELECT {cols} FROM "{self.measurement}" '
             f'{self._where(device, range_)} GROUP BY time({window}) fill(none)')
        rows = self._rows(self._query(q))
        if self.temp_db:
            temps = self._temp_history(device, range_, window)
            for row in rows:
                row["temperature"] = temps.get(row["time"])
        return rows


def get_source():
    return InfluxSource() if os.getenv("DATA_MODE", "mock") == "influx" else MockSource()
