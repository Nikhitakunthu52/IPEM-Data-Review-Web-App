"""IPEM Lab Data API.

Run:  .venv/bin/python -m uvicorn main:app --reload
Docs: http://localhost:8000/docs
"""
import os
import secrets
from typing import Literal, Optional

from dotenv import load_dotenv

load_dotenv()

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

import data  # noqa: E402
from data import MAX_POINTS, WINDOW_SECONDS, default_window, parse_range  # noqa: E402

API_KEY = os.getenv("API_KEY", "dev-key")

app = FastAPI(title="IPEM Lab Data API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

source = data.get_source()

WindowName = Literal["1s", "5s", "10s", "30s", "1m", "2m", "5m", "15m", "30m", "1h", "2h", "6h"]


def require_key(x_api_key: str = Header(..., description="Shared API key")):
    if not secrets.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")


def find_device(device_id: str):
    for d in data.load_devices():
        if d["id"] == device_id:
            return d
    raise HTTPException(status_code=404, detail=f"Unknown device '{device_id}'")


def with_zones(reading: dict) -> dict:
    limits = data.load_limits()
    zones = {k: data.zone(reading.get(k), limits[k]) for k in limits if k in reading}
    return {**reading, "zones": zones}


class NewDevice(BaseModel):
    name: str = Field(..., min_length=1, max_length=60, examples=["Test bench 3"])
    mac: str = Field(..., examples=["AA:BB:CC:DD:EE:03"])


@app.get("/health")
def health():
    return {"status": "ok", "mode": source.mode}


@app.get("/limits", dependencies=[Depends(require_key)])
def limits():
    """Zone limits (green / yellow / red) for each measurement, from limits.json."""
    return data.load_limits()


@app.get("/devices", dependencies=[Depends(require_key)])
def list_devices():
    return data.load_devices()


@app.post("/devices", status_code=201, dependencies=[Depends(require_key)])
def add_device(body: NewDevice):
    """Register a device by its IoT MAC address."""
    try:
        mac = data.normalize_mac(body.mac)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    with data._devices_lock:
        devices = data.load_devices()
        if any(d["mac"] == mac for d in devices):
            raise HTTPException(status_code=409, detail=f"A device with MAC {mac} already exists")
        device = {"id": data.next_device_id(devices), "name": body.name.strip(), "mac": mac}
        devices.append(device)
        data.save_devices(devices)
    return device


@app.delete("/devices/{device_id}", status_code=204, dependencies=[Depends(require_key)])
def delete_device(device_id: str):
    with data._devices_lock:
        devices = data.load_devices()
        kept = [d for d in devices if d["id"] != device_id]
        if len(kept) == len(devices):
            raise HTTPException(status_code=404, detail=f"Unknown device '{device_id}'")
        data.save_devices(kept)
    return Response(status_code=204)


@app.get("/devices/{device_id}/latest", dependencies=[Depends(require_key)])
def latest(device_id: str):
    device = find_device(device_id)
    reading = source.latest(device)
    if reading is None:
        raise HTTPException(status_code=404, detail="No data from this device in the last 5 minutes")
    return {"device_id": device["id"], **with_zones(reading), "units": data.UNITS}


@app.get("/devices/{device_id}/history", dependencies=[Depends(require_key)])
def history(
    device_id: str,
    range: str = Query("1d", description="How far back: a number plus m, h or d, e.g. 5m, 12h, 7d, 90m (1m to 30d)"),
    window: Optional[WindowName] = Query(None, description="Averaging window; picked automatically if empty"),
):
    device = find_device(device_id)
    try:
        seconds = parse_range(range)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    range = range.strip().lower()
    window = window or data.default_window(seconds)
    if seconds // WINDOW_SECONDS[window] > MAX_POINTS:
        raise HTTPException(status_code=400, detail=f"Window too small for this range (max {MAX_POINTS} points)")
    return {
        "device_id": device["id"],
        "range": range,
        "window": window,
        "units": data.UNITS,
        "points": source.history(device, range, window),
    }