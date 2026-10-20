# Update: Oct 16 meeting features, merged with Ayush's and Shreya's work

This merges three things into one working version:
- **Ayush's** `ayush/influx-backend` branch: the InfluxDB 1.8 connection, the real device MACs and temperature from the `waveform` database
- **Shreya's** Oct 18 work on `main`: auto-refresh (Off / 10 s / 30 s / 1 min), the Refresh button and the Arial font
- **The Oct 16 meeting features**: add device by MAC address, 1 day to 1 month ranges, color zones, a selectable plot and an overheat warning

> ⚠ `ipem-frontend/src/App.jsx` on `main` is currently **broken**. The commit "Refactor App component and update styles" pasted CSS into it, and "Refactor App component to fetch data from API" left it cut off at `<button`, so `npm run dev` fails. These files replace it.

## How to apply
1. `git checkout main && git pull`
2. `git checkout -b oct16-features`
3. Copy everything in this folder over the repo, replacing files with the same name.
4. Delete the files listed under **Delete**.
5. `cd ipem-frontend && npm install`, which installs `recharts` for the chart.
6. In `ipem-api 2`: `.venv/bin/python -m pip install -r requirements.txt`, because `requests` is new.
7. Commit, push, open a pull request into `main`, then merge `ayush/influx-backend`'s pull request as **closed** (this already contains it).

## Backend (`ipem-api 2/`)
| File | Status | Change |
| --- | --- | --- |
| `data.py` | changed | Ayush's InfluxDB 1.8 code, plus 1d/3d/7d/30d ranges, device saving, MAC checking and zones. MACs are stored **lowercase** (`10:20:ba:51:dd:84`) to match the lab's `location` tag. |
| `main.py` | changed | Adds `POST /devices`, `DELETE /devices/{id}` and `GET /limits`. `/latest` returns `zones`. |
| `limits.json` | **new** | Green / yellow / red limits. Temperature is a placeholder. |
| `devices.json` | from Ayush | The 5 real lab devices |
| `requirements.txt` | changed | `requests` (InfluxDB 1.8). `influxdb-client` removed, since it's no longer used. |
| `.env.example` | from Ayush | InfluxDB 1.8 settings (cleaned up indentation) |
| `.gitignore` | from Ayush | Plus `devices.tmp` and `.DS_Store` |
| `API.md` | changed | New endpoints, ranges and InfluxDB 1.8 settings |

## Frontend (`ipem-frontend/`)
| File | Status | Change |
| --- | --- | --- |
| `src/App.jsx` | **replaced** | Fixes the broken file. Loads devices, limits and mode, and keeps the device in the URL. |
| `src/api.js` | **new** | All API calls, with readable error messages |
| `src/settings.js` | **new** | Refresh options, time ranges, chart colors |
| `src/components/DeviceList.jsx` | **new** | Device list plus the Add device form |
| `src/components/DeviceDetail.jsx` | **new** | Refresh and auto-refresh, time range, overheat banner, stale-data badge |
| `src/components/MetricCard.jsx` | **new** | Reading cards colored by zone |
| `src/components/HistoryChart.jsx` | **new** | Starts as an empty plot. The user ticks what to show, with dashed limit lines. |
| `src/App.css` | **replaced** | Zone colors, form, chart and controls styles, Arial font |
| `index.html` | changed | Title "IPEM Lab Data" |
| `package.json`, `package-lock.json` | changed | Adds `recharts` |
| `.env.example`, `.gitignore` | **new** | |

## Delete
- `ipem-frontend/src/assets/` (hero.png, react.svg, vite.svg are unused)
- `ipem-api.zip` in the repo root

## Still needed from Abolfazl
- The real temperature limit. Set it in `ipem-api 2/limits.json`; it's currently a 60 / 66 °C placeholder.
- Whether low voltage should also be red. If so, set `red_below` for voltage in `limits.json`.
