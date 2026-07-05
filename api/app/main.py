import os
import json
import pathlib

import redis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .models import (Vehicle, Station, Transformer, RouteInfo, Forecast,
                     OptimizeResponse)
from . import livestate                       # Person 3 — Redis live-state layer
try:
    import ev_engine as engine               # compiled C++ engine (baked into the Docker image)
except ImportError:                          # local dev without the build -> naive Python mock
    from . import engine_stub as engine

app = FastAPI(title="EV Charging Optimizer API", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

r = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"),
                   decode_responses=True)
SEED = pathlib.Path(__file__).resolve().parent.parent / "seed"


def _load(name):
    return json.loads((SEED / name).read_text())


@app.get("/health")
def health():
    try:
        r.ping()
        redis_ok = True
    except Exception:
        redis_ok = False
    return {"status": "ok", "redis": redis_ok}


@app.get("/seed")
def seed():
    return {"vehicles": _load("vehicles.json"),
            "stations": _load("stations.json"),
            "transformers": _load("transformers.json")}


@app.post("/optimize", response_model=OptimizeResponse)
def optimize():
    vehicles     = [Vehicle(**v)     for v in _load("vehicles.json")]
    stations     = [Station(**s)     for s in _load("stations.json")]
    transformers = [Transformer(**t) for t in _load("transformers.json")]
    routes       = [RouteInfo(**r_)  for r_ in _load("routes.json")]
    forecasts    = [Forecast(**f)    for f in _load("forecasts.json")]
    assignments = engine.solve(vehicles, stations, transformers, routes, forecasts)
    # STORE step: fold the answer + world into a dashboard-ready snapshot and push it
    # to Redis (best-effort — a Redis outage won't fail the optimize). See livestate.py.
    snapshot = livestate.build_live_state(vehicles, stations, transformers,
                                          routes, forecasts, assignments)
    livestate.publish(r, assignments, snapshot)
    return {"assignments": assignments}


@app.get("/assignments")
def assignments():
    cached = r.get(livestate.KEY_LATEST_ASSIGNMENTS)
    return {"assignments": json.loads(cached) if cached else []}


@app.get("/state/live")
def state_live():
    """Dashboard live state: per-station load, per-transformer utilisation, vehicles.

    Returns the snapshot cached by the last /optimize (see contracts/livestate.md),
    or an empty envelope if none has run yet. Read-only; the dashboard polls this
    (or, later, subscribes to the Redis `live_updates` channel via a WebSocket).
    """
    snapshot = livestate.read_live_state(r)
    return snapshot if snapshot else {"schema_version": livestate.SCHEMA_VERSION,
                                      "generated_at": None, "assignments": []}
