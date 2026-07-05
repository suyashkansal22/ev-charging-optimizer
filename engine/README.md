# Engine (Person 1) — C++ optimizer + pybind11 binding

The optimization brain. It exposes ONE function, with the exact signature of the Python
mock (`api/app/engine_stub.py`) so the two are interchangeable:

```
solve(vehicles, stations, transformers, routes, forecasts) -> list[Assignment-shaped dicts]
```

`src/optimizer.cpp` is a greedy, urgency-ordered, grid-constrained optimizer: serve the
most urgent cars first (lowest battery / nearest deadline) via a priority queue, keep a
running per-transformer load **per time slot** and never exceed `transformer_capacity_kw`,
cap charge power at `min(charger_power_kw, vehicle_max_charge_power_kw)`, skip stations a
car can't reach, and rank feasible `(station, time_slot)` options by **time > convenience
> cost** (time = a feasibility gate; cost = cheapest forecast slot). O(N log N + N·M·S),
deterministic.

## Layout
```
include/optimizer.hpp    structs (mirror contracts/schemas.md) + solve() declaration
src/optimizer.cpp        the algorithm
bindings/bindings.cpp    pybind11 module — drop-in for engine_stub (reads the API's
                         objects by attribute, returns list[dict])
tests/smoke.cpp          standalone seed-scenario verification (no Python needed)
CMakeLists.txt           builds the ev_engine Python module
```

## How it's used — no manual step
`docker compose up --build` compiles this into `ev_engine*.so` inside the api image and
puts it on the import path. `api/app/main.py` then selects it automatically, falling back
to the mock when the compiled module isn't present (e.g. running the API on the host):

```python
try:    import ev_engine as engine     # compiled C++ module (in the image)
except ImportError:
    from . import engine_stub as engine
```

Same signature, same return shape — nothing else in the codebase changes.

## Quick local check (no Python toolchain)
The code is C++14-clean, so any g++ builds the standalone test. From `engine/`:

```bash
g++ -std=c++14 -Iinclude src/optimizer.cpp tests/smoke.cpp -o smoke && ./smoke
```

It rebuilds the `api/seed/*` scenario and asserts every vehicle is placed, no transformer
is overloaded in any slot, and no station exceeds its available chargers.

## Build the Python module locally (optional — Docker already does this)
```bash
pip install pybind11 cmake
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -Dpybind11_DIR="$(python -m pybind11 --cmakedir)"
cmake --build build
# -> build/ev_engine*.so ; place it on the API's import path (its site-packages)
```
The `-Dpybind11_DIR=...` hint is needed so CMake finds a pip-installed pybind11. On
Windows, building a CPython extension requires MSVC — the Docker build is the easy path.
```
