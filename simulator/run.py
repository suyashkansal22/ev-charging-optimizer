"""Orchestrator — CLI entry point that ties the grid model, the price
forecaster and the vehicle/demand generator together (Person 4 owns this).

Modes
-----
* `--mode grid`        : run the SimPy grid simulator once, write Station +
                         Transformer JSONs to the output dir.
* `--mode forecast`    : train the per-station price forecaster, write
                         Forecast JSONs.
* `--mode vehicles`    : generate a batch of synthetic Vehicle rows.
* `--mode all`         : run all three left-to-right (the default).
* `--mode demo`        : `all` + continuously re-publish Vehicle rows to
                         POST /requests at `--vehicles-per-tick` rate.
                         (--publish must be explicitly enabled.)

Output
------
By default all JSONs land in `simulator/output/`. The `--out` flag overrides
that; `--quiet` suppresses progress lines (useful for piped output).

Integration seam
----------------
When `--publish` is set the orchestrator POSTs every generated vehicle to
`<api-base>/requests` (default `http://localhost:8000`). The endpoint already
exists in `api/app/main.py` (Person 2 added it) and runs the optimizer for
just that vehicle. POSTing `Transformer`/`Station` and `Forecast` to a live
ingest endpoint is **Person 2's future work**; the spec lives in
`simulator/INGEST_SPEC.md` and a no-op console preview keeps the user
informed that those rows are emitted to disk only.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# Allow running as a plain script from the repo root.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from grid_model import simulate, DEFAULT_STATIONS, DEFAULT_TRANSFORMERS
from price_forecaster import (
    ForecastCfg, synth_history, forecast as run_forecaster,
    DEFAULT_STATION_IDS as DEFAULT_FORECAST_STATIONS,
)
from vehicle_generator import VehicleGenCfg, generate_vehicles


DEFAULT_OUTPUT = pathlib.Path(__file__).resolve().parent / "output"
DEFAULT_API_BASE = "http://localhost:8000"


# ---- single-shot runs --------------------------------------------------------

def run_grid(args: argparse.Namespace) -> List[pathlib.Path]:
    stations, transformers, latched = simulate(
        DEFAULT_STATIONS, DEFAULT_TRANSFORMERS,
        hours=args.hours, rng_seed=args.seed,
        plug_rate_per_hour=args.plug_rate,
    )
    files = _write_grid_files(args.out, stations, transformers)
    print(f"  grid: wrote {len(stations)} stations, {len(transformers)} transformers"
          f" (latched: {sorted(latched) or 'none'})")
    return files


def run_forecast(args: argparse.Namespace) -> List[pathlib.Path]:
    cfg = ForecastCfg(
        station_ids=list(DEFAULT_FORECAST_STATIONS),
        horizon_mins=args.horizon_mins,
        slot_minutes=args.slot_minutes,
        days_history=args.days,
        rng_seed=args.seed,
    )
    t, dow, prices = synth_history(cfg)
    forecasts = run_forecaster(cfg.station_ids, cfg,
                                history_prices=prices, history_t=t, history_dow=dow)
    files = _write_forecast_files(args.out, forecasts)
    print(f"  forecast: wrote {len(forecasts)} forecast(s) for "
          f"{cfg.slot_count} slot(s) @ {cfg.horizon_mins} min horizon")
    return files


def run_vehicles(args: argparse.Namespace) -> List[pathlib.Path]:
    cfg = VehicleGenCfg(count=args.count, fleet_fraction=args.fleet_frac,
                         rng_seed=args.seed)
    now = _resolve_now(args.now)
    vehicles = generate_vehicles(cfg, now=now)
    files = _write_vehicles_files(args.out, vehicles)
    fleet = sum(1 for v in vehicles if v.get("vehicle_destination_deadline"))
    print(f"  vehicles: wrote {len(vehicles)} ({fleet} fleet)")
    return files


# ---- demo loop (continuous publish) -----------------------------------------

def run_demo(args: argparse.Namespace) -> int:
    """Like `all` but loop: refresh grid tick + forecaster periodically,
    and (if --publish) POST vehicle rows to /requests at a steady rate."""
    if args.publish:
        print(f"  demo: publishing vehicles to {args.api_base}/requests "
              f"({args.vehicles_per_tick}/tick, every {args.tick_seconds}s)")
    else:
        print("  demo: --publish NOT set. Vehicles are written to disk only "
              "(use --publish to POST them to the API).")
    tick = 0
    while True:
        tick += 1
        ts_now = datetime.now(timezone.utc)
        print(f"\n[tick {tick} @ {ts_now.isoformat(timespec='seconds')}]")
        try:
            _emit_tick(args, ts_now)
            _maybe_publish(args)
        except KeyboardInterrupt:
            print("\n  demo: interrupted, exiting cleanly.")
            return 0
        time.sleep(args.tick_seconds)
    return 0  # unreachable, but keeps mypy happy


def _emit_tick(args: argparse.Namespace, ts_now: datetime) -> None:
    """One grid+forecast snapshot + one batch of vehicles per tick."""
    # Use a fresh seed per tick so the simulation drifts (deterministic within
    # the tick, but the world is moving). Use `is None` not `or` — `0 or 42`
    # would silently replace an explicit --seed 0, which is a real bug.
    base_seed = args.seed if args.seed is not None else 42
    tick_seed = base_seed + ts_now.second
    stations, transformers, latched = simulate(
        DEFAULT_STATIONS, DEFAULT_TRANSFORMERS,
        hours=args.hours, rng_seed=tick_seed,
        plug_rate_per_hour=args.plug_rate,
    )
    _write_grid_files(args.out, stations, transformers)

    cfg = ForecastCfg(
        station_ids=list(DEFAULT_FORECAST_STATIONS),
        horizon_mins=args.horizon_mins,
        slot_minutes=args.slot_minutes,
        days_history=args.days,
        rng_seed=tick_seed,
    )
    t, dow, prices = synth_history(cfg)
    forecasts = run_forecaster(cfg.station_ids, cfg,
                                history_prices=prices, history_t=t, history_dow=dow)
    _write_forecast_files(args.out, forecasts)

    if args.publish:
        # only the vehicles pipeline is published; grid + forecast go to disk
        # until Person 2 adds the matching ingest endpoint.
        vcfg = VehicleGenCfg(count=args.vehicles_per_tick,
                              fleet_fraction=args.fleet_frac,
                              rng_seed=tick_seed)
        vehicles = generate_vehicles(vcfg, now=ts_now)
        _write_vehicles_files(args.out, vehicles)


def _maybe_publish(args: argparse.Namespace) -> None:
    if not args.publish:
        return
    output_dir = pathlib.Path(args.out)
    vehicles_file = output_dir / "vehicles.json"
    if not vehicles_file.exists():
        return
    try:
        vehicles = json.loads(vehicles_file.read_text())
    except Exception as exc:
        print(f"  publish: could not read {vehicles_file} ({exc})")
        return
    for v in vehicles:
        if _post_vehicle(args.api_base, v):
            continue
        print(f"  publish: stopping on first hard failure")
        return


def _post_vehicle(api_base: str, vehicle: Dict[str, Any]) -> bool:
    """POST one Vehicle to `<api>/requests`. Returns True on success."""
    url = f"{api_base.rstrip('/')}/requests"
    try:
        data = json.dumps(vehicle).encode("utf-8")
        req = urllib.request.Request(url, data=data, method="POST",
                                      headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            ok = 200 <= resp.status < 300
            if not ok:
                print(f"  publish: {url} -> HTTP {resp.status}")
            return ok
    except urllib.error.HTTPError as exc:
        print(f"  publish: {url} -> HTTP {exc.code}: {exc.reason}")
        return False
    except urllib.error.URLError as exc:
        print(f"  publish: {url} -> unreachable ({exc.reason}); "
              f"is the API running at {api_base}?")
        return False
    except Exception as exc:
        print(f"  publish: {url} -> {type(exc).__name__}: {exc}")
        return False


# ---- file writers ------------------------------------------------------------

def _write_grid_files(outdir: pathlib.Path,
                       stations: List[Dict[str, Any]],
                       transformers: List[Dict[str, Any]]) -> List[pathlib.Path]:
    outdir.mkdir(parents=True, exist_ok=True)
    p1 = outdir / "stations.json"
    p2 = outdir / "transformers.json"
    p1.write_text(json.dumps(stations, indent=2) + "\n")
    p2.write_text(json.dumps(transformers, indent=2) + "\n")
    return [p1, p2]


def _write_forecast_files(outdir: pathlib.Path,
                            forecasts: List[Dict[str, Any]]) -> List[pathlib.Path]:
    outdir.mkdir(parents=True, exist_ok=True)
    p = outdir / "forecasts.json"
    p.write_text(json.dumps(forecasts, indent=2) + "\n")
    return [p]


def _write_vehicles_files(outdir: pathlib.Path,
                            vehicles: List[Dict[str, Any]]) -> List[pathlib.Path]:
    outdir.mkdir(parents=True, exist_ok=True)
    p = outdir / "vehicles.json"
    p.write_text(json.dumps(vehicles, indent=2) + "\n")
    return [p]


def _resolve_now(now: Optional[str]) -> datetime:
    if not now:
        return datetime.now(timezone.utc)
    parsed = datetime.fromisoformat(now)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


# ---- dispatcher --------------------------------------------------------------

def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(
        description="EV charging simulator orchestrator (grid + price + demand).",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    ap.add_argument("--mode", choices=["grid", "forecast", "vehicles", "all", "demo"],
                    default="all", help="what to run")
    ap.add_argument("--out", default=str(DEFAULT_OUTPUT),
                    help=f"output directory (default {DEFAULT_OUTPUT})")
    ap.add_argument("--hours", type=int, default=24,
                    help="simulated hours to advance the grid (per tick in demo)")
    ap.add_argument("--plug-rate", type=float, default=0.8,
                    help="vehicles per station per hour in the SimPy model")
    ap.add_argument("--days", type=int, default=14,
                    help="days of synthetic history for the forecaster")
    ap.add_argument("--horizon-mins", type=int, default=120,
                    help="forecast horizon in minutes")
    ap.add_argument("--slot-minutes", type=float, default=20.0,
                    help="minutes per forecast slot (slot_count = horizon/slot)")
    ap.add_argument("--count", type=int, default=25,
                    help="number of vehicles to generate (non-demo)")
    ap.add_argument("--fleet-frac", type=float, default=0.15,
                    help="fraction of generated vehicles that are fleet")
    ap.add_argument("--seed", type=int, default=42, help="base RNG seed")
    ap.add_argument("--now", metavar="ISO8601",
                    help="override the base 'now' for vehicle deadlines "
                         "(deterministic runs; default = wall clock)")

    # demo-only
    ap.add_argument("--publish", action="store_true",
                    help="[demo mode] POST vehicles to <api-base>/requests "
                         "as they are generated")
    ap.add_argument("--api-base", default=DEFAULT_API_BASE,
                    help=f"[demo mode] API base URL (default {DEFAULT_API_BASE})")
    ap.add_argument("--tick-seconds", type=int, default=20,
                    help="[demo mode] seconds between ticks")
    ap.add_argument("--vehicles-per-tick", type=int, default=3,
                    help="[demo mode] vehicles generated + POSTed each tick")

    args = ap.parse_args(argv)
    args.out = pathlib.Path(args.out)

    if args.mode == "demo":
        return run_demo(args)

    files: List[pathlib.Path] = []
    if args.mode in ("grid", "all"):
        files += run_grid(args)
    if args.mode in ("forecast", "all"):
        files += run_forecast(args)
    if args.mode in ("vehicles", "all"):
        files += run_vehicles(args)
    print(f"\nwrote {len(files)} file(s) -> {args.out}")
    for f in files:
        print(f"  - {f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
