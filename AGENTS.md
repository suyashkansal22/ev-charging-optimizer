# AGENTS.md — Project Context for AI Agents

> Read this fully before writing any code. Copy to `CLAUDE.md` if using Claude Code.
> This file is the source of truth for *how* to work in this repo. The data shapes
> are in `contracts/schemas.md` — that is the source of truth for *what* the data is.

---

## 1. What we are building

An **EV Smart Charging Router & Grid Optimizer**. When many electric vehicles want to
charge at once, plugging them all in together would overload the local power transformer
and crash the grid. This system takes each "I need a charge" request, checks how stressed
the grid is, predicts electricity prices, and tells each vehicle **which station to go to**
and **which time slot to plug in** — minimizing cost without exceeding any transformer's
capacity.

It is a 5-person student project intended to be **interview-grade**: a real constrained
optimization problem, not a toy.

---

## 2. Architecture — one loop

```
REQUEST  ->  CHECK GRID + PRICES  ->  DECIDE (optimize)  ->  STORE  ->  SHOW
(vehicle)    (sim + ML)              (C++ engine)           (DB/Redis)  (map)
```

**Golden rule:** vehicles never call the optimization engine directly. Every message flows
through the **FastAPI service** (`api/`). All cross-component communication uses the shapes
in `contracts/schemas.md`.

Data flow for one request: a vehicle posts a charge request to the API → the API gathers
station state + transformer load (simulator) and price forecasts (ML) → bundles everything
and calls the engine → engine returns assignments → API saves them and pushes live state to
Redis → dashboard reads live state and renders the map.

---

## 3. Repo layout & ownership

| Folder        | Owner    | Stack                    | What it does                                  |
|---------------|----------|--------------------------|-----------------------------------------------|
| `api/`        | Person 2 | FastAPI + PostgreSQL     | Central server; the switchboard everyone uses |
| `engine/`     | Person 1 | C++17 + pybind11 + CMake | The optimization brain (the hard algorithm)   |
| `simulator/`  | Person 4 | SimPy + scikit-learn     | Grid simulation + price/queue ML forecasts    |
| `dashboard/`  | Person 5 | React + Leaflet/Mapbox   | Live city map (currently a static placeholder)|
| `contracts/`  | shared   | markdown                 | The data contract — read-only consensus       |
| `scripts/`    | shared   | bash                     | Helpers (smoke test)                          |

**An agent works inside exactly ONE folder unless explicitly told otherwise.** Do not edit
another component's folder. If you need a different data field, change `contracts/schemas.md`
first and flag it — never silently rename a field in your own code.

---

## 4. The data contract (critical)

Full field tables are in `contracts/schemas.md`. The objects are:
`Vehicle`, `Station`, `Transformer`, `RouteInfo` (traffic), `Forecast` (pricing),
and `Assignment` (the engine's output).

Rules every agent must obey:
- Use the **exact field names** from the contract. Never invent or rename.
- The contract is mirrored in `api/app/models.py` (Pydantic). If you change one, change both.
- `transformer_id` appears on both `Station` (foreign key) and `Transformer` — this is intentional.
- `target_battery_percent` defaults to 100 but should be treated as a real input.

---

## 5. The engine contract — DO NOT BREAK THIS

The optimization engine exposes ONE function. Its signature is identical in the C++ engine
and the Python mock, so they are interchangeable:

```
solve(vehicles, stations, transformers, routes, forecasts) -> list[Assignment]
```

- Today the API imports the **Python mock**: `from . import engine_stub as engine`
  (see `api/app/main.py`). The mock returns valid-but-naive assignments so the whole team
  is unblocked.
- When the real C++ module builds, the swap is a **single line**:
  `import ev_engine as engine`. Nothing else changes.
- **Any agent touching the engine MUST keep this signature and return shape stable.**
  Changing it breaks every other component. If a change is truly needed, update the mock,
  the C++ header (`engine/include/optimizer.hpp`), the binding, and the contract together.

---

## 6. How to run & verify

```bash
docker compose up --build      # boots api(8000) + postgres(5432) + redis(6379) + dashboard(3000)
```
- Dashboard: http://localhost:3000  (click "Run Optimizer")
- API docs:  http://localhost:8000/docs
- Smoke test: `bash scripts/smoke_test.sh`

API endpoints: `GET /health`, `GET /seed`, `POST /optimize`, `GET /assignments`.

**Definition of done for any change:** the stack still boots, `POST /optimize` still returns
assignments matching the `Assignment` shape, and you have added/updated a test or a manual
verification step describing what you checked.

---

## 7. Component task context (what each agent should focus on) // only touch and edit the files asked in the command and nothing else, everything listed below is for context only.
 
**`engine/` (Person 1 — the real work).** `optimizer.cpp` currently has a placeholder.
Replace it with a real algorithm that: orders vehicles by urgency (lowest battery / nearest
deadline) using a priority queue; tracks a running load per `transformer_id` and never exceeds
`transformer_capacity_kw`; caps charge speed at `min(charger_power_kw, vehicle_max_charge_power_kw)`;
skips stations a vehicle cannot reach (range vs `travel_distance_to_station`); and picks the
`time_slot` with the cheapest `future_price_per_kwh`. Keep it fast and deterministic.

**`api/` (Person 2).** Add real PostgreSQL persistence (cars, stations, requests, assignments,
billing), proper request endpoints for live vehicles, and WebSocket push for the dashboard.
Keep the engine call behind the stable `solve()` interface.

**`simulator/` (Person 4).** Build the SimPy grid model (transformer heating, voltage limits)
emitting `Transformer` + `Station` state, and an ML model emitting `Forecast`. Output must match
the contract and be POSTed to the API (replace the static `api/seed/*.json` fixtures).

**`dashboard/` (Person 5).** Replace the static `index.html` with a React + Leaflet/Mapbox app:
moving vehicle icons, battery-based colors, stations lighting up by load. Read-only consumer of
the API; never run optimization client-side.

---

## 8. Conventions

- **Languages/versions:** Python 3.11, C++17, Node for the dashboard.
- **Dependencies:** pin versions; add to the component's `requirements.txt` / `CMakeLists.txt`.
- **Don't commit:** secrets, `.env`, build artifacts (`*.so`, `build/`, `node_modules`,
  `__pycache__`) — already in `.gitignore`.
- **Commits:** small and scoped to one component, present-tense messages
  (e.g. `engine: add transformer capacity constraint`).
- **No breaking changes** to the data contract or the `solve()` signature without updating
  every mirror (contract + models + C++ header + binding + mock) in the same change.

---

## 9. Quick "do / don't" for agents

DO: stay in your assigned folder · follow `contracts/schemas.md` exactly · keep the stack
runnable · keep `solve()` stable · add a verification step.

DON'T: rename contract fields · edit other components' folders · change the engine signature
casually · commit secrets or build junk · replace the mock import unless the real C++ module
actually builds.
