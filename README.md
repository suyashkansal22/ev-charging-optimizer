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
| engine      | C++ + pybind11    | Person 1  | Scaffold only — not yet wired in (see below) |
| db          | PostgreSQL        | Person 2  | Running (official image)                     |
| redis       | Redis             | Person 3  | Running, caches latest assignments           |
| simulator   | SimPy + ML        | Person 4  | Stub data in api/seed/* for now              |
| dashboard   | static (→ React)  | Person 5  | Minimal Leaflet map placeholder              |

## The one rule

Everything talks through the **data contract** in `contracts/schemas.md`.
Nobody invents their own field names.

## Swapping the mock engine for the real C++ engine

The API calls `engine.solve(vehicles, stations, transformers, routes, forecasts)`.
Today that import points at the Python mock:

```python
from . import engine_stub as engine   # api/app/main.py
```

When Person 1's pybind11 module builds, change that one line to:

```python
import ev_engine as engine            # the compiled C++ module
```

Nothing else in the codebase changes — same function signature, same return shape.
That is the whole point of building against a mock first.

## Folder map

```
contracts/   the shared data contract (single source of truth)
api/         Person 2 — FastAPI server + seed data + mock engine
engine/      Person 1 — C++ optimizer + pybind11 binding (your real work)
simulator/   Person 4 — grid sim + price ML (stub for now)
dashboard/   Person 5 — web map (placeholder for now)
scripts/     helpers
```
