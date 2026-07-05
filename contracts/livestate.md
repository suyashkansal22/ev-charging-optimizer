# Live-State Contract — Redis (owned by Person 3)

Companion to `schemas.md`. That file is the contract for the **request/response** objects
(`Vehicle`, `Station`, … `Assignment`). This file is the contract for the **live state** the
API pushes to Redis after every optimize, and that the dashboard reads back.

> Source of truth for the key names and JSON shape is `api/app/livestate.py`. Import the
> key/channel constants from there — never hard-code the strings.

---

## Redis keys & channels

| name                     | constant                          | type   | written by        | read by                     |
|--------------------------|-----------------------------------|--------|-------------------|-----------------------------|
| `latest_assignments`     | `livestate.KEY_LATEST_ASSIGNMENTS`| string | `POST /optimize`  | `GET /assignments`          |
| `live_state`             | `livestate.KEY_LIVE_STATE`        | string | `POST /optimize`  | `GET /state/live`, dashboard|
| `live_updates`           | `livestate.CHANNEL_UPDATES`       | pub/sub| `POST /optimize`  | future WebSocket (Person 2) |

- `latest_assignments` — JSON `list[Assignment]` (the raw engine output). Kept for
  backwards-compatibility; unchanged from day 1.
- `live_state` — JSON of the **snapshot** documented below.
- `live_updates` — a tiny JSON nudge published on every optimize
  (`{"type":"optimize","at":<iso>,"vehicle_count":<int>}`). It carries **no data**; it
  only tells a subscriber "there's a fresh `live_state`, go read it". This is the seam a
  WebSocket push (Person 2's task) subscribes to so the dashboard updates without polling.

Writes are **best-effort**: if Redis is down, `POST /optimize` still returns `200` with the
assignments — it just skips the cache. Reads return an empty envelope, never an error.

---

## `live_state` snapshot shape

Everything the map needs, pre-computed so the dashboard stays a dumb renderer.

```jsonc
{
  "schema_version": 1,
  "generated_at": "2026-07-06T12:00:00+00:00",   // ISO-8601 UTC, or null if never run

  "meta": {
    "slot_count": 6,            // number of time slots (from the forecast horizon)
    "horizon_mins": 120,
    "slot_minutes": 20.0,       // horizon_mins / slot_count
    "vehicle_count": 5,
    "station_count": 3,
    "transformer_count": 2,
    "total_est_cost": 1324.68   // sum of every assignment's est_cost
  },

  "vehicles": [                 // one row per assignment
    {
      "vehicle_id": "EV-101",
      "station_id": "ST-3",     // where the engine sent it
      "time_slot": 0,           // when to plug in
      "est_cost": 241.80,
      "assigned_draw_kw": 30.0, // min(charger_power_kw, vehicle_max_charge_power_kw)
      "current_battery_percent": 18.0,
      "target_battery_percent": 80.0,
      "urgency": 82.0,          // 100 - current_battery_percent (emptier = higher)
      "is_fleet": false,        // has a destination deadline
      "travel_time_to_station": 2.4
    }
  ],

  "stations": [
    {
      "station_id": "ST-2",
      "transformer_id": "TX-A",
      "latitude": 30.7411, "longitude": 76.7689,
      "available_chargers": 2, "number_of_chargers": 2,
      "queue_length": 0, "estimated_wait_time": 0,
      "current_price_per_kwh": 12.0,
      "peak_projected_load_kw": 50.0,   // busiest slot's EV draw
      "peak_chargers_in_use": 1,
      "load_by_slot_kw": [0.0, 7.0, 0.0, 50.0, 11.0, 0.0]   // length == slot_count
    }
  ],

  "transformers": [             // the grid-stress heatmap
    {
      "transformer_id": "TX-A",
      "capacity_kw": 250.0,
      "baseline_load_kw": 180.0,          // non-EV load
      "headroom_kw": 70.0,
      "ev_load_by_slot_kw":    [0.0, 7.0, 0.0, 50.0, 11.0, 0.0],
      "total_load_by_slot_kw": [180.0, 187.0, 180.0, 230.0, 191.0, 180.0], // baseline + EV
      "utilisation_by_slot_pct": [72.0, 74.8, 72.0, 92.0, 76.4, 72.0],     // total / capacity
      "peak_utilisation_pct": 92.0
    }
  ],

  "prices": {                   // per-station forecast series, for a cost chart
    "ST-2": { "current_price_per_kwh": 12.0,
              "future_price_per_kwh": [12.0, 11.5, 10.8, 10.0, 9.6, 9.2],
              "horizon_mins": 120 }
  },

  "assignments": [ /* the raw list[Assignment], unchanged, for convenience */ ]
}
```

### Notes for the dashboard (Person 5)
- Colour stations by `peak_projected_load_kw` (or per-slot with a time scrubber over
  `load_by_slot_kw`). Colour transformers by `utilisation_by_slot_pct` — that's the
  "is the grid getting hot?" signal.
- Every `*_by_slot*` array has length `meta.slot_count`; index them by a vehicle's
  `time_slot`.
- The load numbers are a **projection for visualisation** (each assigned car's rated
  draw summed per slot). The engine is the authority on feasibility; this view just makes
  grid stress legible.

### Notes for the API (Person 2)
- To add the WebSocket push: subscribe to `live_updates`; on each message, read
  `live_state` and forward it to connected clients. The content is already built — you only
  own the transport.
- If you later persist to PostgreSQL, keep writing `live_state` too; the dashboard depends
  on it.

### Changing this shape
Bump `SCHEMA_VERSION` in `livestate.py`, update this file, and tell Person 5. The dashboard
should read `schema_version` and degrade gracefully on mismatch.
