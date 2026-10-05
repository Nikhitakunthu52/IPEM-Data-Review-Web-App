"""Data sources for the IPEM Lab API.

MockSource  - fake sine-wave data so the frontend can be built before server access.
InfluxSource - real data from InfluxDB 2.x (the Telegraf -> InfluxDB pipeline).

Pick one with DATA_MODE=mock|influx in .env.
"""
import json
import math
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

FIELDS = {
    # API name  -> field name in InfluxDB (confirm once we can read the buckets)
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
    mode = "influx"

    def __init__(self):
        from influxdb_client import InfluxDBClient  # imported here so mock mode needs no Influx install

        self.client = InfluxDBClient(
            url=os.environ["INFLUX_URL"],
            token=os.environ["INFLUX_TOKEN"],
            org=os.environ["INFLUX_ORG"],
            timeout=10_000,
        )
        self.query_api = self.client.query_api()
        self.bucket = os.environ["INFLUX_BUCKET"]
        self.measurement = os.getenv("INFLUX_MEASUREMENT", "")
        self.mac_tag = os.getenv("INFLUX_MAC_TAG", "mac")

    def _base(self, device, start: str) -> str:
        # All values below come from config or the device registry, never from request input.
        field_filter = " or ".join(f'r._field == "{f}"' for f in FIELDS.values())
        measurement = f' and r._measurement == "{self.measurement}"' if self.measurement else ""
        return (
            f'from(bucket: "{self.bucket}")\n'
            f"  |> range(start: {start})\n"
            f'  |> filter(fn: (r) => r["{self.mac_tag}"] == "{device["mac"]}"{measurement})\n'
            f"  |> filter(fn: (r) => {field_filter})\n"
        )

    def _rows(self, flux: str):
        reverse = {v: k for k, v in FIELDS.items()}
        rows = []
        for table in self.query_api.query(flux):
            for rec in table.records:
                row = {"time": _iso(rec.get_time())}
                for influx_name, api_name in reverse.items():
                    val = rec.values.get(influx_name)
                    row[api_name] = None if val is None else round(float(val), 4)
                rows.append(row)
        rows.sort(key=lambda r: r["time"])
        return rows

    def latest(self, device):
        flux = self._base(device, "-5m") + (
            "  |> last()\n"
            '  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")\n'
        )
        rows = self._rows(flux)
        return rows[-1] if rows else None

    def history(self, device, range_: str, window: str):
        flux = self._base(device, f"-{range_}") + (
            f"  |> aggregateWindow(every: {window}, fn: mean, createEmpty: false)\n"
            '  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")\n'
        )
        return self._rows(flux)


def get_source():
    return InfluxSource() if os.getenv("DATA_MODE", "mock") == "influx" else MockSource()
