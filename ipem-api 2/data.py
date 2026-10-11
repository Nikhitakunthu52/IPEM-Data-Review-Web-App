"""Data sources for the IPEM Lab API.

MockSource  - fake sine-wave data so the frontend can be built before server access.
InfluxSource - real data from InfluxDB 1.8 (InfluxQL over HTTP, username/password).

Pick one with DATA_MODE=mock|influx in .env.
"""
import json
import math
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

FIELDS = {
    # API name  -> field name in InfluxDB (set in .env; empty = not available, returns null)
    "voltage": os.getenv("FIELD_VOLTAGE", "voltage"),
    "current": os.getenv("FIELD_CURRENT", "current"),
    "temperature": os.getenv("FIELD_TEMPERATURE", "temperature"),
}

RANGES = {"15m": 15 * 60, "1h": 3600, "6h": 6 * 3600, "24h": 86400, "7d": 7 * 86400}
# Default aggregation window per range: keeps each chart at roughly 180-360 points
# instead of ~15 raw samples per second.
DEFAULT_WINDOW = {"15m": "5s", "1h": "10s", "6h": "1m", "24h": "5m", "7d": "30m"}
WINDOW_SECONDS = {"1s": 1, "5s": 5, "10s": 10, "30s": 30, "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600}


def load_devices():
    path = Path(__file__).parent / os.getenv("DEVICES_FILE", "devices.json")
    return json.loads(path.read_text())


def _iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class MockSource:
    mode = "mock"

    def _reading(self, device, t: datetime):
        seed = sum(ord(c) for c in device["mac"]) % 10
        s = t.timestamp()
        return {
            "time": _iso(t),
            "voltage": round(48 + seed + 2 * math.sin(s / 30), 3),
            "current": round(5 + 0.5 * seed + math.sin(s / 17), 3),
            "temperature": round(35 + seed + 4 * math.sin(s / 300), 2),
        }

    def latest(self, device):
        return self._reading(device, datetime.now(timezone.utc))

    def history(self, device, range_: str, window: str):
        end = datetime.now(timezone.utc)
        step = WINDOW_SECONDS[window]
        n = RANGES[range_] // step
        return [self._reading(device, end - timedelta(seconds=step * i)) for i in range(n, -1, -1)]


class InfluxSource:
    """InfluxDB 1.8 via the HTTP /query endpoint (InfluxQL, username/password)."""
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

    def _query(self, q: str, db: str | None = None):
        r = self.requests.get(
            self.url, params={"db": db or self.db, "q": q},
            auth=self.auth, verify=self.verify, timeout=10,
        )
        r.raise_for_status()
        result = r.json()["results"][0]
        if "error" in result:
            raise RuntimeError(result["error"])
        series = result.get("series")
        return series[0] if series else None

    def _where(self, device, start: str) -> str:
        mac = device["mac"].replace("'", "")
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
        rows[0]["temperature"] = self._temp_latest(device)
        return rows[0]

    def history(self, device, range_: str, window: str):
        cols = ", ".join(f'mean("{v}") AS "{k}"' for k, v in FIELDS.items() if v)
        q = (f'SELECT {cols} FROM "{self.measurement}" '
             f'{self._where(device, range_)} GROUP BY time({window}) fill(none)')
        rows = self._rows(self._query(q))
        temps = self._temp_history(device, range_, window)
        for row in rows:
            row["temperature"] = temps.get(row["time"])
        return rows

def get_source():
    return InfluxSource() if os.getenv("DATA_MODE", "mock") == "influx" else MockSource()
