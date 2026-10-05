# IPEM Lab Data API (v0.1)

## Run it locally

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # keep DATA_MODE=mock until we have server access
uvicorn main:app --reload
```

Interactive docs are served at http://localhost:8000/docs.

Every endpoint except `/health` requires the header `X-API-Key: <API_KEY from .env>`.

## Endpoints

| Method | Path | What it returns |
| --- | --- | --- |
| GET | `/health` | `{ "status": "ok", "mode": "mock" \| "influx" }` |
| GET | `/devices` | A list of devices: `[{ "id", "name", "mac" }]` |
| GET | `/devices/{id}/latest` | The most recent reading from the last 5 minutes |
| GET | `/devices/{id}/history?range=1h&window=10s` | Downsampled readings over a time range |

`range` accepts `15m`, `1h`, `6h`, `24h` or `7d`. `window` is optional. When it is omitted, the API picks a window that keeps each chart to roughly 180–360 points: 15m→5s, 1h→10s, 6h→1m, 24h→5m, 7d→30m.

### Example: `/devices/dev-01/latest`

```json
{ "device_id": "dev-01", "time": "2026-10-05T13:00:00Z",
  "voltage": 49.2, "current": 5.4, "temperature": 36.1 }
```

### Example: `/devices/dev-01/history?range=1h`

```json
{ "device_id": "dev-01", "range": "1h", "window": "10s",
  "points": [ { "time": "...", "voltage": 49.1, "current": 5.3, "temperature": 36.0 } ] }
```

Times are in UTC (ISO 8601). Any value can be `null` when a device did not report it.

## Device registry

The file `devices.json` maps each device to its IoT MAC address. The MAC address is the tag the API uses to filter InfluxDB. Ayush will replace the placeholder entries with the real devices.

## Switching to real data

In `.env`, set `DATA_MODE=influx` and fill in the `INFLUX_*` and `FIELD_*` values once we have a read-only token and know the bucket schema.
