# Simulator (Person 4) — virtual grid + AI forecaster + demand generator

> Production-ready grid + price + demand simulator for the EV Smart Charging
> Optimizer. Emits artefacts in the exact shapes from `contracts/schemas.md`,
> validated against the API's Pydantic models in `api/app/models.py`.

This is **the World + The Fortune Teller** person on the 5-person team
(roadmap Page 3). It is the *only* component that synthesises a city to drive
the demo, and it provides three independent models wrapped by one CLI.

---

## What it does

| Component | File | Library | Emits |
|-----------|------|---------|-------|
| Grid simulator | `grid_model.py` | SimPy | `Station`, `Transformer` |
| Price forecaster | `price_forecaster.py` | scikit-learn `GradientBoostingRegressor` | `Forecast` |
| Demand / Vehicle generator | `vehicle_generator.py` | stdlib | `Vehicle` |
| Orchestrator (CLI) | `run.py` | — | wires the three together |
| Contract validator | `contract_check.py` | stdlib + API models | — |

All outputs match the data contract verbatim — no field renames, no
synthetic extensions. The validator (`contract_check.py`) loads every
emitted JSON into the API's Pydantic models and fails noisily on any drift.

---

## How to run

### One shot — generate everything

```bash
pip install -r simulator/requirements.txt
python simulator/run.py --mode all --out simulator/output
```

Output:
```
simulator/output/stations.json
simulator/output/transformers.json
simulator/output/forecasts.json
simulator/output/vehicles.json
```

### Live demo — POSTs every tick

```bash
python simulator/run.py --mode demo --publish \
    --api-base http://localhost:8000 \
    --tick-seconds 30 --vehicles-per-tick 3
```

While running:

* every tick refreshes `simulator/output/{stations,transformers,forecasts}.json`,
* every tick writes `simulator/output/vehicles.json` and POSTs each vehicle to
  `<api>/requests` (the live per-vehicle endpoint Person 2 already ships).

`--publish` is **off** by default — opting in triggers external side effects.

### Validate output against the contract

```bash
python simulator/contract_check.py --all simulator/output
```

Loads every JSON into the API's real Pydantic models. Exit `0` = clean.

### Standalone tests

```bash
python -m pytest simulator/tests/ -v
```
or the cross-platform end-to-end smoke:
```bash
bash simulator/tests/smoke.sh              # unix / mac / WSL
powershell simulator/tests/smoke.ps1       # native Windows
```

---

## Architecture

```
┌──────────────────────┐  ┌──────────────────┐  ┌────────────────────┐
│ grid_model.py        │  │ price_forecaster │  │ vehicle_generator  │
│ (SimPy)              │  │ (sklearn GBRT)   │  │ (stdlib)           │
└──────────┬───────────┘  └────────┬─────────┘  └─────────┬──────────┘
           │ stations.json          │ forecasts.json       │ vehicles.json
           │ transformers.json      │                      │
           ▼                        ▼                      ▼
       ┌───────────────────────────────────────────────────────────┐
       │  run.py  — orchestrator (--mode {grid|forecast|...|demo}) │
       └──────────────────────────┬────────────────────────────────┘
                                  │ writes to simulator/output/
                                  │ optionally POSTs vehicles to /requests
                                  ▼
                       ┌────────────────────────┐
                       │ contract_check.py      │ — validates against
                       │ (loads API models)     │   api/app/models.py
                       └────────────────────────┘
```

---

## Design decisions (locked)

| Decision | Choice | Why |
|----------|--------|-----|
| Grid model | **SimPy** (per roadmap Page 3) | Discrete-event sim, deterministic with seeded RNG, models transformer thermal envelope + a per-station plug/unplug queue |
| Grid depth | **Load-projection + thermal envelope** (Depth-2) | Realistic `current_transformer_load_kw` and a safety latch that triggers when the parent's load > capacity — gives the dashboard's heatmap non-trivial data |
| Overload safety latch | Shed 50 % of chargers, mark `available_chargers` reduced | Mirrors utility-side load shedding; pushes visible stress onto the dashboard's `safeness_proxy` view |
| Price model | **GradientBoostingRegressor** (per-station, multi-output) | Interview-grade: deterministic-ish, explainable vs. accuracy, well-understood |
| Synthetic history | 14 days × 24 h, daily cycle + weekday + noise | Reproducible; swappable for a real CSV/DB feed without changing the module's surface |
| Vehicle generator | Geographically clustered around stations, urgency-sorted | The demo never needs real cars — this fires arbitrary numbers of "demand" objects |
| Output location | `simulator/output/` only (never `api/seed/`) | **Hard ownership rule.** Person 4 never edits Person 2's fixtures. |
| Contract validator | Imports `api.app.models` directly (read-only) | Avoids duplicating the contract; any field rename in `models.py` fails this test |
| Demo loop tick | 20 s default, configurable | Keeps the dashboard's pulses slow enough to watch |
| `--publish` default | **OFF** | Forces an explicit opt-in; off by default to prevent surprise POSTs |

---

## Ownership & how this slots into the stack

```
api/        Person 2 — FastAPI, DB persistence, WebSocket
engine/     Person 1 — C++ optimizer (data contract is frozen)
routing/    Person 3 — RouteInfo generator (Person 4 calls it from the CLI if needed)
simulator/  Person 4 — THIS FOLDER. Grid + price + demand.
dashboard/  Person 5 — reads GET /state/live (or /ws/live)
contracts/  shared — frozen data shapes (Person 4 reads, never edits)
```

Person 4's outputs go to **`simulator/output/` only**. To plug them into the
running stack today (without changes to Person 2's code), copy:

```bash
cp simulator/output/stations.json     api/seed/stations.json
cp simulator/output/transformers.json api/seed/transformers.json
# forecasts.json and routes.json need a regen step; see routing/README.md
```

This is a **manual development convenience** — the eventual API ingest path
is specified in `simulator/INGEST_SPEC.md` and waiting for Person 2 to wire it.

---

## Verifying a change

```
bash simulator/tests/smoke.sh         # unix / mac / WSL
powershell simulator/tests/smoke.ps1  # native Windows
```

Both scripts print `PASS — ...` and exit `0` on success. They run **without**
the API stack and **without** Docker (great for CI). The smoke test also
exercises the live loop if `http://localhost:8000` is up — gracefully skips
that path if the API is not running.

For when the API IS running (full e2e):

```
docker compose up --build             # boots api(8000) + redis + postgres + dashboard
python simulator/run.py --mode demo --publish
# open http://localhost:3000 (the dashboard)
```

---

## What this is *not*

* **Not** a real grid sim (no substation harmonics, no phase imbalance, no
  three-phase power flow).
* **Not** a real ML model (the synthetic market history is a stand-in for a
  future CSV/DB feed; the model itself is small and fast intentionally).
* **Not** the source of truth for `RouteInfo` — that lives in `routing/`,
  owned by Person 3. This folder calls it via CLI when needed.
* **Not** allowed to edit `api/`, `engine/`, `dashboard/`, `routing/` or
  `contracts/`. Touching any of those is an ownership violation.
