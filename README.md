# EV Smart Charging Router & Grid Optimizer

A team monorepo. The goal of this day-1 skeleton: clone it and run **one command** to see
the whole system talking end-to-end — API + Redis + Postgres + a tiny map dashboard —
with a **mock optimizer** standing in until the real C++ engine is ready.

## Run it

```bash
docker compose up --build
```

Then open:
- Dashboard ........ http://localhost:3000   (click "Run Optimizer")
- API docs ......... http://localhost:8000/docs
- Health check ..... http://localhost:8000/health

## What's running (and who owns it)

| Service     | Tech              | Owner     | Day-1 state                                  |
|-------------|-------------------|-----------|----------------------------------------------|
| api         | FastAPI           | Person 2  | Live, uses the **mock engine**               |
| engine      | C++ + pybind11    | Person 1  | Real optimizer — compiled into the api image, used automatically |
| db          | PostgreSQL        | Person 2  | Running (official image)                     |
| redis       | Redis             | Person 3  | Running, caches latest assignments           |
| simulator   | SimPy + ML        | Person 4  | Stub data in api/seed/* for now              |
| dashboard   | static (→ React)  | Person 5  | Minimal Leaflet map placeholder              |

## The one rule

Everything talks through the **data contract** in `contracts/schemas.md`.
Nobody invents their own field names.

## The C++ engine — build & run

The real optimizer lives in `engine/` and is **already wired into the stack**.
`docker compose up --build` compiles it into a Python module (`ev_engine`) inside the
api image and drops it on the import path; the API picks it up automatically:

```python
# api/app/main.py
try:
    import ev_engine as engine          # compiled C++ engine (built into the image)
except ImportError:                     # local dev without the build → naive Python mock
    from . import engine_stub as engine
```

Same `solve(vehicles, stations, transformers, routes, forecasts)` signature and return
shape as the mock, so nothing else in the codebase changes.

To confirm the real engine is in use, hit `POST /optimize`: the C++ optimizer respects
grid limits (e.g. it won't send a 120 kW car to a station whose transformer can't supply
it) — behaviour the round-robin mock doesn't have.

For engine internals and local builds (incl. a standalone test that needs no Python),
see [`engine/README.md`](engine/README.md).

## Folder map

```
contracts/   the shared data contract (single source of truth)
api/         Person 2 — FastAPI server + seed data + mock engine
engine/      Person 1 — C++ optimizer + pybind11 binding (your real work)
simulator/   Person 4 — grid sim + price ML (stub for now)
dashboard/   Person 5 — web map (placeholder for now)
scripts/     helpers
```
