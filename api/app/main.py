import os
import json
import math
import asyncio
import pathlib
import logging

import redis
import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .models import (Vehicle, Station, Transformer, RouteInfo, Forecast,
                     Assignment, OptimizeResponse)
from . import livestate                       # Person 3 — Redis live-state layer
from . import db, db_models                   # Person 2 — PostgreSQL persistence

log = logging.getLogger("ev.api")
try:
    import ev_engine as engine               # compiled C++ engine (baked into the Docker image)
except ImportError:                          # local dev without the build -> naive Python mock
    from . import engine_stub as engine

app = FastAPI(title="EV Charging Optimizer API", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
r = redis.from_url(REDIS_URL, decode_responses=True)
SEED = pathlib.Path(__file__).resolve().parent.parent / "seed"


def _load(name):
    return json.loads((SEED / name).read_text())


@app.on_event("startup")
def _startup():
    """Create the Postgres tables on boot. Best-effort: if the DB is unreachable the
    API still starts (persistence just no-ops) — same resilience rule as Redis."""
    try:
        db.init_db()
        log.info("postgres tables ready")
    except Exception as exc:
        log.warning("db init skipped (Postgres unavailable): %s", exc)


def _af(a, field, default=None):
    """Read a field off an assignment whether it's a dict (engine output) or an object."""
    return a.get(field, default) if isinstance(a, dict) else getattr(a, field, default)


def persist_run(vehicles, assignments, source="batch", bill=False):
    """Write the request -> assignment (-> billing) chain to Postgres.

    Reused by /optimize (source="batch", bill=False) and /requests (source="live",
    bill=True). Billing is intentionally NOT written for batch optimises: /optimize is
    a *re-planning* pass over the same fleet, so billing there would double-charge a
    driver on every run. A bill represents a real charge commitment, which only happens
    when a vehicle actually requests one (POST /requests).

    Best-effort: any DB error rolls back and is logged, never raised — so a Postgres
    outage can't turn a success into a 500.
    """
    target = {v.vehicle_id: v.target_battery_percent for v in vehicles}
    session = db.SessionLocal()
    try:
        for a in assignments:
            vid = _af(a, "vehicle_id")
            req = db_models.ChargeRequest(
                vehicle_id=vid,
                target_battery_percent=float(target.get(vid, 100.0)),
                status="assigned",
                source=source,
            )
            session.add(req)
            session.flush()                      # assigns req.id without a full commit yet

            asg = db_models.AssignmentRecord(
                request_id=req.id,
                vehicle_id=vid,
                station_id=_af(a, "station_id"),
                time_slot=int(_af(a, "time_slot", 0) or 0),
                est_cost=float(_af(a, "est_cost", 0.0) or 0.0),
            )
            session.add(asg)
            session.flush()                      # assigns asg.id

            if bill:                             # only real charge commitments are billed
                session.add(db_models.BillingRecord(
                    assignment_id=asg.id,
                    vehicle_id=vid,
                    amount=float(_af(a, "est_cost", 0.0) or 0.0),
                ))
        session.commit()                         # all rows saved together (one transaction)
    except Exception as exc:
        session.rollback()
        log.warning("persist skipped (Postgres unavailable): %s", exc)
    finally:
        session.close()


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
    # STORE step (Postgres): record this re-planning pass as request + assignment
    # history. No billing here — /optimize re-runs the whole fleet, so billing would
    # double-charge; a bill is written only on a real POST /requests. Best-effort.
    persist_run(vehicles, assignments, source="batch", bill=False)
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


@app.get("/history/assignments")
def history_assignments(limit: int = 50):
    """Permanent assignment history from Postgres (newest first). Proves persistence:
    unlike /assignments (Redis, only the latest run), this survives restarts and grows."""
    session = db.SessionLocal()
    try:
        rows = (session.query(db_models.AssignmentRecord)
                .order_by(db_models.AssignmentRecord.id.desc())
                .limit(limit).all())
        return {"count": len(rows), "assignments": [
            {"id": row.id, "vehicle_id": row.vehicle_id, "station_id": row.station_id,
             "time_slot": row.time_slot, "est_cost": row.est_cost,
             "created_at": row.created_at.isoformat() if row.created_at else None}
            for row in rows]}
    except Exception as exc:
        log.warning("history read failed (Postgres unavailable): %s", exc)
        return {"count": 0, "assignments": []}
    finally:
        session.close()


@app.get("/billing/{vehicle_id}")
def billing_for_vehicle(vehicle_id: str):
    """Total owed by one driver, plus every individual charge — the billing ledger."""
    session = db.SessionLocal()
    try:
        rows = (session.query(db_models.BillingRecord)
                .filter(db_models.BillingRecord.vehicle_id == vehicle_id)
                .order_by(db_models.BillingRecord.id.desc()).all())
        total = round(sum(row.amount for row in rows), 2)
        return {"vehicle_id": vehicle_id, "total_due": total, "charge_count": len(rows),
                "charges": [
                    {"id": row.id, "amount": row.amount, "assignment_id": row.assignment_id,
                     "created_at": row.created_at.isoformat() if row.created_at else None}
                    for row in rows]}
    except Exception as exc:
        log.warning("billing read failed (Postgres unavailable): %s", exc)
        return {"vehicle_id": vehicle_id, "total_due": 0.0, "charge_count": 0, "charges": []}
    finally:
        session.close()


# ---- Live per-vehicle requests (Deliverable #2) --------------------------------

def _haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in km between two lat/lon points."""
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dlmb = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _routes_for(vehicle, stations):
    """RouteInfo from this vehicle's CURRENT position to every station, via a straight-line
    (haversine @ 30 km/h) stand-in for a real maps API. A live request reports where the car
    IS right now, so we always route from the submitted coordinates — never a stale seed
    position. (Canonical routes come from Person 3's routing/ generator when integrated.)
    """
    routes = []
    for s in stations:
        dist = _haversine_km(vehicle.vehicle_latitude, vehicle.vehicle_longitude,
                             s.station_latitude, s.station_longitude)
        routes.append(RouteInfo(
            vehicle_id=vehicle.vehicle_id, station_id=s.station_id,
            travel_distance_to_station=round(dist, 3),
            travel_time_to_station=round(dist / 30.0 * 60.0, 3)))
    return routes


@app.post("/requests", response_model=Assignment)
def submit_request(vehicle: Vehicle):
    """One live vehicle asks to charge. We run the optimizer for just this car against the
    current grid — routed from the car's CURRENT position — persist the request ->
    assignment -> billing chain (source='live', billed), and return the car's own
    assignment: which station, which time slot, estimated cost.
    """
    stations     = [Station(**s)     for s in _load("stations.json")]
    transformers = [Transformer(**t) for t in _load("transformers.json")]
    forecasts    = [Forecast(**f)    for f in _load("forecasts.json")]
    routes = _routes_for(vehicle, stations)

    assignments = engine.solve([vehicle], stations, transformers, routes, forecasts)
    if not assignments:
        raise HTTPException(status_code=422, detail="no assignment could be produced")

    persist_run([vehicle], assignments, source="live", bill=True)
    return assignments[0]


@app.get("/requests")
def list_requests(limit: int = 50):
    """The demand log: every charge request ever made (newest first), batch and live."""
    session = db.SessionLocal()
    try:
        rows = (session.query(db_models.ChargeRequest)
                .order_by(db_models.ChargeRequest.id.desc())
                .limit(limit).all())
        return {"count": len(rows), "requests": [
            {"id": row.id, "vehicle_id": row.vehicle_id, "status": row.status,
             "source": row.source, "target_battery_percent": row.target_battery_percent,
             "requested_at": row.requested_at.isoformat() if row.requested_at else None}
            for row in rows]}
    except Exception as exc:
        log.warning("requests read failed (Postgres unavailable): %s", exc)
        return {"count": 0, "requests": []}
    finally:
        session.close()


# ---- WebSocket live push (Deliverable #3) --------------------------------------

@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    """Open pipe to the dashboard. On connect we send the current snapshot immediately,
    then subscribe to Redis `live_updates` and push the fresh `live_state` on every nudge
    (each /optimize publishes one). We only own the *transport* here — Person 3's
    livestate.py builds the *content*; we just forward what's already in Redis.
    """
    await websocket.accept()
    ar = None
    pubsub = None
    try:
        # Acquire INSIDE the try so a Redis outage at connect time still hits the finally
        # cleanup below (subscribe() is the first call that actually reaches Redis).
        ar = aioredis.from_url(REDIS_URL, decode_responses=True)
        pubsub = ar.pubsub()
        await pubsub.subscribe(livestate.CHANNEL_UPDATES)

        async def push_updates():
            # 1) send whatever is current right now, so a freshly-opened dashboard isn't blank
            current = await ar.get(livestate.KEY_LIVE_STATE)
            if current:
                await websocket.send_text(current)
            # 2) then forward the latest snapshot every time an optimize nudges the channel
            while True:
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=5.0)
                if msg is not None:
                    snapshot = await ar.get(livestate.KEY_LIVE_STATE)
                    if snapshot:
                        await websocket.send_text(snapshot)

        async def watch_disconnect():
            # blocks until the browser closes the pipe, so we can tear down cleanly
            try:
                while True:
                    await websocket.receive_text()
            except WebSocketDisconnect:
                return

        pusher = asyncio.create_task(push_updates())
        watcher = asyncio.create_task(watch_disconnect())
        # run both; whichever finishes first (a send error or the client leaving) ends it
        done, pending = await asyncio.wait({pusher, watcher},
                                           return_when=asyncio.FIRST_COMPLETED)
        # surface a genuine failure (don't let it vanish as "exception never retrieved")
        for task in done:
            exc = task.exception()
            if exc and not isinstance(exc, WebSocketDisconnect):
                log.warning("ws/live task ended with error: %s", exc)
        # cancel the loser and AWAIT it, so it stops using the shared Redis connection
        # before we close that connection below
        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    except Exception as exc:
        # e.g. Redis unreachable at connect — degrade quietly instead of a raw traceback
        log.warning("ws/live closing (setup/stream error): %s", exc)
    finally:
        if pubsub is not None:
            try:
                await pubsub.aclose()
            except Exception:
                pass
        if ar is not None:
            try:
                await ar.aclose()
            except Exception:
                pass
