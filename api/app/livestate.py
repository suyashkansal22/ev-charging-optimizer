"""Redis live-state layer — Person 3 (the connecting glue between API and dashboard).

The optimization loop is:

    REQUEST -> CHECK GRID+PRICES -> DECIDE (engine) -> STORE (here) -> SHOW (dashboard)

This module owns the STORE step's *live state*: after the engine decides, the API
turns the raw assignments into a compact, dashboard-ready snapshot (per-station load,
per-transformer utilisation per time slot, per-vehicle assignment) and pushes it to
Redis. The dashboard (Person 5) reads it back; a future WebSocket (Person 2) can stream
it by subscribing to CHANNEL_UPDATES.

Design rules that keep the seams clean:
  * The Redis KEY / CHANNEL names below are the contract — see contracts/livestate.md.
    Nobody hard-codes these strings elsewhere; import them from here.
  * build_live_state() is a PURE function (no Redis, no I/O) so it is trivially testable
    and can run in the standalone smoke test.
  * publish() is BEST-EFFORT: if Redis is down it logs and returns False instead of
    raising, so a Redis outage can never turn a successful /optimize into a 500.
"""
from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("ev.livestate")

# ---- Redis contract (documented in contracts/livestate.md) ---------------------
KEY_LATEST_ASSIGNMENTS = "latest_assignments"  # list[Assignment]; read by GET /assignments
KEY_LIVE_STATE = "live_state"                  # the full snapshot below; read by GET /state/live
CHANNEL_UPDATES = "live_updates"               # pub/sub: a small nudge on every optimize

SCHEMA_VERSION = 1


def _num(x: float, ndigits: int = 2) -> float:
    """Round for display and guarantee a JSON-friendly finite float."""
    try:
        v = round(float(x), ndigits)
    except (TypeError, ValueError):
        return 0.0
    return v if v == v and v not in (float("inf"), float("-inf")) else 0.0


def _get(obj: Any, field: str, default: Any = None) -> Any:
    """Read a field whether obj is a dict (engine output) or an attr-object (Pydantic)."""
    if isinstance(obj, dict):
        return obj.get(field, default)
    return getattr(obj, field, default)


def build_live_state(vehicles: List[Any],
                     stations: List[Any],
                     transformers: List[Any],
                     routes: List[Any],
                     forecasts: List[Any],
                     assignments: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Fold the engine's answer + the world it saw into one dashboard-ready snapshot.

    Everything the map needs, pre-computed so the dashboard stays a dumb renderer:
      - stations[]     : projected peak EV draw, chargers used, price now
      - transformers[] : per-slot EV load / total load / utilisation %, peak utilisation
      - vehicles[]     : assigned station+slot, cost, battery %, urgency, travel time
      - prices{}       : per-station future price series (for a cost chart)
      - meta           : slot count, horizon, totals, timestamp, schema version

    Note: the per-slot loads here are a *projection* for visualisation (sum of each
    assigned car's rated draw). The engine is the authority on feasibility; this view
    just makes "which transformer is getting hot" legible on the map.
    """
    veh = {_get(v, "vehicle_id"): v for v in vehicles}
    stn = {_get(s, "station_id"): s for s in stations}
    txf = {_get(t, "transformer_id"): t for t in transformers}
    fc = {_get(f, "station_id"): f for f in forecasts}
    route = {(_get(r, "vehicle_id"), _get(r, "station_id")): r for r in routes}

    # How many time slots is the world quantised into?
    slot_count = 1
    horizon_mins = 0
    for f in forecasts:
        slot_count = max(slot_count, len(_get(f, "future_price_per_kwh", []) or []))
        horizon_mins = max(horizon_mins, int(_get(f, "horizon_mins", 0) or 0))
    if horizon_mins <= 0:
        horizon_mins = slot_count * 30

    def station_tx(sid: str) -> Optional[str]:
        s = stn.get(sid)
        return _get(s, "transformer_id") if s else None

    # ---- accumulate projected EV draw per (station|transformer, slot) -----------
    station_slot_kw: Dict[str, List[float]] = defaultdict(lambda: [0.0] * slot_count)
    station_slot_chargers: Dict[str, List[int]] = defaultdict(lambda: [0] * slot_count)
    tx_slot_kw: Dict[str, List[float]] = defaultdict(lambda: [0.0] * slot_count)

    vehicle_rows: List[Dict[str, Any]] = []
    total_cost = 0.0

    for a in assignments:
        vid = _get(a, "vehicle_id")
        sid = _get(a, "station_id")
        slot = int(_get(a, "time_slot", 0) or 0)
        est = float(_get(a, "est_cost", 0.0) or 0.0)
        total_cost += est

        v = veh.get(vid)
        s = stn.get(sid)
        draw = 0.0
        if v and s:
            draw = min(float(_get(s, "charger_power_kw", 0.0)),
                       float(_get(v, "vehicle_max_charge_power_kw", 0.0)))

        if 0 <= slot < slot_count and s is not None:
            station_slot_kw[sid][slot] += draw
            station_slot_chargers[sid][slot] += 1
            tx = station_tx(sid)
            if tx is not None:
                tx_slot_kw[tx][slot] += draw

        r = route.get((vid, sid))
        cur_batt = float(_get(v, "current_battery_percent", 0.0)) if v else 0.0
        tgt_batt = float(_get(v, "target_battery_percent", 100.0)) if v else 100.0
        vehicle_rows.append({
            "vehicle_id": vid,
            "station_id": sid,
            "time_slot": slot,
            "est_cost": _num(est),
            "assigned_draw_kw": _num(draw, 1),
            "current_battery_percent": _num(cur_batt, 1),
            "target_battery_percent": _num(tgt_batt, 1),
            "urgency": _num(100.0 - cur_batt, 1),           # emptier = more urgent
            "is_fleet": bool(_get(v, "vehicle_destination_deadline")) if v else False,
            "travel_time_to_station": _num(_get(r, "travel_time_to_station", 0.0) or 0.0, 1),
        })

    # ---- station view -----------------------------------------------------------
    station_rows: List[Dict[str, Any]] = []
    for sid, s in stn.items():
        loads = station_slot_kw.get(sid, [0.0] * slot_count)
        used = station_slot_chargers.get(sid, [0] * slot_count)
        f = fc.get(sid)
        station_rows.append({
            "station_id": sid,
            "transformer_id": _get(s, "transformer_id"),
            "latitude": _get(s, "station_latitude"),
            "longitude": _get(s, "station_longitude"),
            "available_chargers": _get(s, "available_chargers"),
            "number_of_chargers": _get(s, "number_of_chargers"),
            "queue_length": _get(s, "queue_length"),
            "estimated_wait_time": _get(s, "estimated_wait_time"),
            "current_price_per_kwh": _get(f, "current_price_per_kwh") if f else None,
            "peak_projected_load_kw": _num(max(loads) if loads else 0.0, 1),
            "peak_chargers_in_use": max(used) if used else 0,
            "load_by_slot_kw": [_num(x, 1) for x in loads],
        })

    # ---- transformer view (the grid-stress heatmap) -----------------------------
    transformer_rows: List[Dict[str, Any]] = []
    for tid, t in txf.items():
        cap = float(_get(t, "transformer_capacity_kw", 0.0))
        base = float(_get(t, "current_transformer_load_kw", 0.0))
        ev = tx_slot_kw.get(tid, [0.0] * slot_count)
        total_by_slot = [base + e for e in ev]
        util_by_slot = [(_num(100.0 * tot / cap, 1) if cap > 0 else 0.0) for tot in total_by_slot]
        transformer_rows.append({
            "transformer_id": tid,
            "capacity_kw": _num(cap, 1),
            "baseline_load_kw": _num(base, 1),
            "headroom_kw": _num(max(0.0, cap - base), 1),
            "ev_load_by_slot_kw": [_num(x, 1) for x in ev],
            "total_load_by_slot_kw": [_num(x, 1) for x in total_by_slot],
            "utilisation_by_slot_pct": util_by_slot,
            "peak_utilisation_pct": max(util_by_slot) if util_by_slot else 0.0,
        })

    prices = {
        _get(f, "station_id"): {
            "current_price_per_kwh": _get(f, "current_price_per_kwh"),
            "future_price_per_kwh": list(_get(f, "future_price_per_kwh", []) or []),
            "horizon_mins": _get(f, "horizon_mins"),
        }
        for f in forecasts
    }

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "meta": {
            "slot_count": slot_count,
            "horizon_mins": horizon_mins,
            "slot_minutes": _num(horizon_mins / slot_count, 1) if slot_count else 0.0,
            "vehicle_count": len(assignments),
            "station_count": len(station_rows),
            "transformer_count": len(transformer_rows),
            "total_est_cost": _num(total_cost),
        },
        "vehicles": vehicle_rows,
        "stations": station_rows,
        "transformers": transformer_rows,
        "prices": prices,
        "assignments": list(assignments),   # raw engine output, unchanged, for convenience
    }


def publish(r: Any,
            assignments: List[Dict[str, Any]],
            snapshot: Dict[str, Any]) -> bool:
    """Best-effort write of the live state to Redis. Never raises.

    Writes three things:
      SET  KEY_LATEST_ASSIGNMENTS  (kept for backwards-compat: GET /assignments reads it)
      SET  KEY_LIVE_STATE          (the full snapshot: GET /state/live reads it)
      PUB  CHANNEL_UPDATES         (a tiny nudge so a WebSocket can push without polling)

    Returns True on success, False if Redis was unavailable.
    """
    try:
        r.set(KEY_LATEST_ASSIGNMENTS, json.dumps(assignments))
        r.set(KEY_LIVE_STATE, json.dumps(snapshot))
        r.publish(CHANNEL_UPDATES, json.dumps({
            "type": "optimize",
            "at": snapshot.get("generated_at"),
            "vehicle_count": snapshot.get("meta", {}).get("vehicle_count"),
        }))
        return True
    except Exception as exc:  # redis down / connection refused / etc.
        log.warning("live-state publish skipped (Redis unavailable): %s", exc)
        return False


def read_live_state(r: Any) -> Optional[Dict[str, Any]]:
    """Read the latest snapshot back. Returns None if absent or Redis is down."""
    try:
        raw = r.get(KEY_LIVE_STATE)
        return json.loads(raw) if raw else None
    except Exception as exc:
        log.warning("live-state read failed (Redis unavailable): %s", exc)
        return None
