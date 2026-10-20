# IPEM Lab Data API (v0.3)

## Run it locally (macOS)

```bash
cd "ipem-api 2"
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3.13 -m venv .venv   # once
.venv/bin/python -m pip install -r requirements.txt                               # once
.venv/bin/python -m uvicorn main:app --reload
```

The API needs Python 3.10 or newer. It runs in mock mode with the key `dev-key` until you create a `.env` file (see `.env.example`).

Interactive docs are at http://localhost:8000/docs. Every endpoint except `/health` requires the header `X-API-Key`.

## Endpoints

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/health` | `{ "status": "ok", "mode": "mock" \| "influx" }` |
| GET | `/limits` | Green / yellow / red limits for each measurement (from `limits.json`) |
| GET | `/devices` | List of devices: `[{ "id", "name", "mac" }]` |
| POST | `/devices` | Add a device. Body: `{ "name": "EMU bench 1", "mac": "10:20:ba:51:dd:84" }` |
| DELETE | `/devices/{id}` | Remove a device |
| GET | `/devices/{id}/latest` | Most recent reading plus its zone colours |
| GET | `/devices/{id}/history?range=1d` | Averaged readings for a chart |

### Time ranges

| `range` | Meaning | Default window | Points |
| --- | --- | --- | --- |
| `1d` | 1 day | 5 min | about 290 |
| `3d` | 3 days | 15 min | about 290 |
| `7d` | 1 week | 30 min | about 340 |
| `30d` | 1 month | 2 h | about 360 |

Raw data arrives at about 15 samples per second, so each point is an average over its window.

### Adding a device

The MAC address can be typed as `10:20:BA:51:DD:84`, `10-20-ba-51-dd-84` or `1020ba51dd84`. The API stores it as `10:20:ba:51:dd:84`, lowercase and with colons, because that is how the lab tags data in InfluxDB (`location` tag). It then gives the device the next free id (e.g. `dev-06`). Devices are saved in `devices.json`. Adding a MAC that already exists returns `409`.

### Example: `/devices/dev-01/latest`

```json
{ "device_id": "dev-01", "time": "2026-10-17T23:50:00Z",
  "voltage": 112.4, "current": 9.8, "temperature": 52.1,
  "zones": { "voltage": "yellow", "current": "yellow", "temperature": "green" } }
```

## Zone limits (`limits.json`)

| Measurement | Green | Yellow | Red |
| --- | --- | --- | --- |
| Voltage (110 V) | up to 110 V | 110–121 V | above 121 V |
| Current (10 A) | below 9 A | 9–11 A | above 11 A |
| Temperature | **placeholder:** up to 60 °C | 60–66 °C | above 66 °C |

Edit `limits.json` to change a limit. There is no need to touch the code. `red_below` and `green_min` are also supported if low values should count as red or yellow.

**Still open:** the real temperature limit, and whether low voltage should be red.

## Switching to real data (InfluxDB 1.8)

Copy `.env.example` to `.env`, set `DATA_MODE=influx`, and fill in `INFLUX_URL`, `INFLUX_USER` and `INFLUX_PASSWORD`. Never commit `.env`.

| Setting | Value | Meaning |
| --- | --- | --- |
| `INFLUX_DB` / `INFLUX_MEASUREMENT` | `SP_Features` / `Features_v2` | Where voltage and current live |
| `FIELD_VOLTAGE` / `FIELD_CURRENT` | `VF_RMS` / `IF_RMS` | RMS voltage and current fields |
| `INFLUX_MAC_TAG` | `location` | Tag that holds the device MAC |
| `INFLUX_TEMP_DB` | `waveform` | Temperature is in its own database |
| `INFLUX_TEMP_DIVISOR` | `10` | Temperature is stored ×10 |

Queries use InfluxQL, for example:
```sql
SELECT mean("VF_RMS") AS "voltage", mean("IF_RMS") AS "current" FROM "Features_v2"
WHERE "location" = '10:20:ba:51:dd:84' AND time > now() - 1d GROUP BY time(5m) fill(none)
```
