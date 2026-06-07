# Engine (Person 1) — C++ optimizer + pybind11 binding

This is YOUR real work. Today the API runs on `api/app/engine_stub.py`.
Build this module, then in `api/app/main.py` change one line:

    from . import engine_stub as engine   ->   import ev_engine as engine

## Build locally
```bash
pip install pybind11 cmake
cmake -S . -B build && cmake --build build
# produces ev_engine*.so -> put it on the API's import path
```

Keep `solve(vehicles, stations, forecasts) -> list[Assignment-shaped dicts]`
identical to the stub so the swap is seamless.
