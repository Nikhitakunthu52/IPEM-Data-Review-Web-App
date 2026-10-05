"""IPEM Lab Data API - Week 2 skeleton.

Run:  uvicorn main:app --reload
Docs: http://localhost:8000/docs
"""
import os
import secrets
from typing import Literal

from dotenv import load_dotenv

load_dotenv()

from fastapi import Depends, FastAPI, Header, HTTPException, Query  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from data import DEFAULT_WINDOW, RANGES, WINDOW_SECONDS, get_source, load_devices  # noqa: E402

API_KEY = os.getenv("API_KEY", "dev-key")

app = FastAPI(title="IPEM Lab Data API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["GET"],
    allow_headers=["*"],
)

devices = load_devices()
source = get_source()


def require_key(x_api_key: str = Header(..., description="Shared API key")):
    if not secrets.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")


def find_device(device_id: str):
    for d in devices:
        if d["id"] == device_id:
            return d
    raise HTTPException(status_code=404, detail=f"Unknown device '{device_id}'")


@app.get("/health")
def health():
    return {"status": "ok", "mode": source.mode}


@app.get("/devices", dependencies=[Depends(require_key)])
def list_devices():
    return devices


@app.get("/devices/{device_id}/latest", dependencies=[Depends(require_key)])
def latest(device_id: str):
    device = find_device(device_id)
    reading = source.latest(device)
    if reading is None:
        raise HTTPException(status_code=404, detail="No data in the last 5 minutes")
    return {"device_id": device["id"], **reading}


@app.get("/devices/{device_id}/history", dependencies=[Depends(require_key)])
def history(
    device_id: str,
    range: Literal["15m", "1h", "6h", "24h", "7d"] = Query("1h"),
    window: Literal["1s", "5s", "10s", "30s", "1m", "5m", "15m", "30m", "1h"] | None = Query(None),
):
    device = find_device(device_id)
    window = window or DEFAULT_WINDOW[range]
    if RANGES[range] // WINDOW_SECONDS[window] > 2000:
        raise HTTPException(status_code=400, detail="Window too small for this range (max 2000 points)")
    return {
        "device_id": device["id"],
        "range": range,
        "window": window,
        "points": source.history(device, range, window),
    }
