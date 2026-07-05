# INTEGRATION.md — how the pieces connect (and who owns each seam)

> Written by the person completing **Person 1 (engine)** and **Person 3 (integration / the
> connecting glue)**. Persons 2, 4, 5 haven't started yet. This file exists so that when you
> do, you know exactly where your work plugs in and what you must not rename. It complements
> `AGENTS.md` (how to work) and `contracts/schemas.md` (the data shapes).

---

## 0. A note on "Person 3"

`AGENTS.md`'s ownership table lists Persons 1, 2, 4, 5 but **not 3**. The root `README.md`
fills the gap: **Person 3 owns Redis** — the live-state cache, i.e. the *connecting tissue*
between the API (which writes state) and the dashboard (which reads it). Under that reading,
Person 3 owns the things that sit *between* components and that nobody else claims:

- the **Redis live-state layer** (`api/app/livestate.py`, `contracts/livestate.md`),
- **RouteInfo generation** (`routing/`) — the one contract object no component produced,
- **cross-component verification** (`scripts/smoke_test.py`).

None of this changes the `solve()` signature or any field name in `contracts/schemas.md`.

---

## 1. What was completed

### Person 1 — the C++ engine (`engine/`)  ✅ done & verified
- `src/optimizer.cpp` is a real greedy, urgency-ordered, **grid-constrained** optimizer
  (priority queue by urgency; per-`transformer_id` load tracked **per time slot**, never
  exceeding `transformer_capacity_kw`; charge power capped at
  `min(charger_power_kw, vehicle_max_charge_power_kw)`; unreachable stations skipped;
  cheapest `future_price_per_kwh` slot chosen). Deterministic, `O(N log N + N·M·S)`.
- `bindings/bindings.cpp` exposes `solve(...)` as the `ev_engine` Python module — a **drop-in
  for `engine_stub`** (reads the API's objects by attribute, returns `list[dict]`).
- `tests/smoke.cpp` is a standalone verifier (no Python). It **passes**:
  `g++ -std=c++14 -Iinclude src/optimizer.cpp tests/smoke.cpp -o smoke && ./smoke` → `PASS`.

The signature is frozen. The API already prefers the compiled module and falls back to the
mock automatically — **no line changes** when the `.so` is present:

```python
try:    import ev_engine as engine       # compiled C++ (baked into the api image)
except ImportError:
    from . import engine_stub as engine  # naive mock, for host dev without a build
```

### Person 3 — the connecting glue  ✅ done
| piece | file(s) | what it does |
|-------|---------|--------------|
| Redis live-state layer | `api/app/livestate.py` | after each optimize, folds assignments + world into a dashboard-ready snapshot and pushes it to Redis (best-effort) |
| live-state contract | `contracts/livestate.md` | the Redis keys/channel + snapshot JSON shape |
| new API endpoint | `api/app/main.py` → `GET /state/live` | serves the snapshot to the dashboard |
| RouteInfo generator | `routing/route_generator.py` | haversine + 30 km/h; reproduces the seed exactly (`--check`) |
| e2e smoke test | `scripts/smoke_test.py` | portable (stdlib) check of the whole loop |

---

## 2. The seams — where your work overlaps ours

### Person 2 (API) — you own the switchboard; we added a live-state STORE step
- `POST /optimize` now, after `engine.solve(...)`, calls
  `livestate.build_live_state(...)` + `livestate.publish(...)`. Those writes are
  **best-effort**: if Redis is down, optimize still returns `200`. Keep that behaviour.
- Redis key/channel names live in `livestate.py` as constants
  (`KEY_LATEST_ASSIGNMENTS`, `KEY_LIVE_STATE`, `CHANNEL_UPDATES`). Import them; don't
  hard-code the strings.
- **WebSocket push (your task in `AGENTS.md §7`):** subscribe to the `live_updates` channel;
  on each nudge, read `live_state` and forward it. The *content* is already built — you only
  own the *transport*. See `contracts/livestate.md` → "Notes for the API".
- **PostgreSQL persistence (your task):** fine to add. Just keep writing `live_state` too —
  the dashboard depends on it. `DATABASE_URL` is already injected by `docker-compose.yml`.

### Person 4 (simulator) — you own grid + price, **not traffic**
- Replace the static `api/seed/*.json` by POSTing live `Transformer`/`Station` state and
  `Forecast` to the API (as your README says). Keep the exact `contracts/schemas.md` shapes.
- **Do not** hand-author `RouteInfo` — that's `routing/`. When your sim moves vehicles/
  stations, call `routing.route_generator.generate_routes(vehicles, stations)` to produce the
  matching routes (or coordinate if you want a real traffic model). This keeps traffic in one
  place instead of scattered across seed files.

### Person 5 (dashboard) — you own the map; read the live state, don't compute it
- Stop using `src/mockData.ts`; fetch **`GET /state/live`** and render it. The snapshot is
  pre-computed for you: `stations[].peak_projected_load_kw`, `transformers[].utilisation_by_slot_pct`
  (the grid-stress heatmap), `vehicles[]` with battery/urgency. Full shape:
  `contracts/livestate.md`.
- Never run optimization client-side (`AGENTS.md §7`). Poll `/state/live`, or later consume
  the WebSocket Person 2 adds.
- Read `schema_version`; degrade gracefully if it doesn't match what you built against.

### Person 1 (engine) — frozen interface
- `solve(vehicles, stations, transformers, routes, forecasts) -> list[Assignment]`. If you
  ever must change it, update **all five** mirrors together: the C++ header, the binding, the
  mock (`engine_stub.py`), `contracts/schemas.md`, and `api/app/models.py`.

---

## 3. Run & verify

```bash
docker compose up --build          # api:8000, dashboard:3000, redis:6379, postgres:5432
python scripts/smoke_test.py       # portable end-to-end check (or: bash scripts/smoke_test.sh)
```

Component-level checks that need no stack:

```bash
# engine (needs only g++):
cd engine && g++ -std=c++14 -Iinclude src/optimizer.cpp tests/smoke.cpp -o smoke && ./smoke

# route generator reproduces the seed:
python routing/route_generator.py --check
```

**Definition of done for any change (from `AGENTS.md §6`):** the stack still boots,
`POST /optimize` still returns `Assignment`-shaped rows, and you added/updated a check.

---

## 4. Files added or touched by this work

```
engine/                         Person 1 — real optimizer, binding, standalone test (complete)
api/app/livestate.py            NEW  Person 3 — Redis live-state layer
api/app/main.py                 EDIT publishes live_state on /optimize; adds GET /state/live
contracts/livestate.md          NEW  the Redis live-state contract (companion to schemas.md)
routing/route_generator.py      NEW  RouteInfo generator (haversine + 30 km/h)
routing/README.md               NEW  how/why
scripts/smoke_test.py           NEW  portable end-to-end smoke test
INTEGRATION.md                  NEW  this file
```

Nothing in `contracts/schemas.md`, the `solve()` signature, or existing field names changed.
