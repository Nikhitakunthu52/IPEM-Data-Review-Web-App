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
| GET | `/devices/{id}/latest` | Most recent reading (nine metrics), its zone colours and units |
| GET | `/devices/{id}/history?range=1d` | Averaged readings (nine metrics) for a chart, plus units |

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

### Metrics

Every reading and history point has the same nine numbers, already scaled to display values, so the frontend never applies divisors. Any value can be `null` when a device did not report it. Responses also carry a `units` object with the same keys. An empty string means the lab dashboards show a plain number for that value.

| Field | Unit | Notes |
| --- | --- | --- |
| `voltage` | V | RMS voltage |
| `current` | A | RMS current |
| `thd` | none | Voltage THD (`Volt_THD`), the plain number the dashboard shows |
| `temperature` | °C | |
| `power` | none | Plain number, as on the SmartPP dashboard |
| `apparent_power` | none | Plain number, as on the SmartPP dashboard |
| `reactive_power` | none | Plain number, can be negative |
| `power_factor` | none | Plain number, as on the SmartPP dashboard |
| `energy` | none | Cumulative counter. Consumption between two times = later value minus earlier value. History returns the last value in each window |

Zones (`zones`) are only returned for measurements that have an entry in `limits.json` (voltage, current, temperature).

### Example: `/devices/dev-01/latest`

```json
{ "device_id": "dev-01", "time": "2026-10-17T23:50:00Z",
  "voltage": 120.9, "current": 0.17, "thd": 22.0, "temperature": 47.7,
  "power": 0.0, "apparent_power": 116.0, "reactive_power": -116.0,
  "power_factor": 46.0, "energy": 13755.0,
  "zones": { "voltage": "yellow", "current": "green", "temperature": "green" },
  "units": { "voltage": "V", "current": "A", "thd": "", "temperature": "\u00b0C",
             "power": "", "apparent_power": "", "reactive_power": "",
             "power_factor": "", "energy": "" } }
```

### Example: `/devices/dev-01/history?range=1d`

```json
{ "device_id": "dev-01", "range": "1d", "window": "5m",
  "units": { "voltage": "V", "...": "..." },
  "points": [ { "time": "...", "voltage": 120.9, "current": 0.17, "thd": 22.0,
                "temperature": 47.7, "power": 0.0, "apparent_power": 116.0,
                "reactive_power": -116.0, "power_factor": 46.0, "energy": 13755.0 } ] }
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
| `INFLUX_WAVEFORM_DB` | `waveform` | Everything else lives here, in field `value` |
| `INFLUX_MAC_TAG` | `location` | Tag that holds the device MAC |

The waveform measurements and their divisors come from the lab's SmartPP Measurement and SmartPlug_Features dashboard queries. They are defined in the `METRICS` table at the top of `data.py`:

| Metric | Measurement | Divisor |
| --- | --- | --- |
| `thd` | `Volt_THD` | none |
| `temperature` | `temperature` | ÷10 |
| `power` | `Power` | ÷10 |
| `apparent_power` | `Apparent_Power` | ÷10 |
| `reactive_power` | `Reactive_Power` | ÷10 |
| `power_factor` | `Power_Factor` | none |
| `energy` | `Power_Energy_Acc` | none |

Each request runs one query per measurement (eight in total), in parallel. If one fails, only that metric comes back `null`.

Queries use InfluxQL, for example:
```sql
SELECT mean("VF_RMS") AS "voltage", mean("IF_RMS") AS "current" FROM "Features_v2"
WHERE "location" = '10:20:ba:51:dd:84' AND time > now() - 1d GROUP BY time(5m) fill(none)
```
