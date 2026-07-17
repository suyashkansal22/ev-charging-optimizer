"""SimPy grid simulator — emits `Transformer` and `Station` state
in the exact shapes from `contracts/schemas.md` (Person 4 owns this).

What it models
--------------
* **Transformer thermal envelope** — every transformer's *baseline* (non-EV) load
  follows a synthetic 24-hour curve (low overnight, two commute peaks). EV draws
  from stations it feeds are summed on top of that baseline each tick. Above
  capacity the safety latch trips and a fraction of chargers are reported as
  unavailable — exactly the load-shedding utilities actually do.
* **Station agent** — SimPy process per station. `available_chargers` decrements
  as virtual vehicles plug in and recovers when they finish (or abandon). Queue
  depth drives `queue_length` and `estimated_wait_time`.
* **Determinism** — every random source uses an injected `Random(seed)`
  so tests and CI get the same numbers every run.

Output shape
------------
After `simulate(...)` returns, we walk the SimPy state once more and emit one
`Station` and one `Transformer` per configured asset, with `current_connected_kw`
folded into `current_transformer_load_kw` (the field the engine and the
dashboard's heatmap already consume — see `contracts/schemas.md` and
`api/app/livestate.py`).

CLI
---
    python simulator/grid_model.py --hours 24 --seed 42
    python simulator/grid_model.py --hours 168 --seed 7 --out simulator/output/
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import random
import sys
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

import simpy

# ---- model constants (documented so the numbers are reproducible) -----------
TICK_SECONDS = 60.0           # 1 simulated minute per env tick
OVERLOAD_THRESHOLD = 1.00     # utilisation ratio that trips the safety latch
OVERLOAD_LATCH_FRACTION = 0.5 # shed this fraction of chargers when overloaded
DEFAULT_AVG_SERVICE_MINUTES = 24.0  # how long a "virtual EV" occupies a charger

# Reasonable urban baseline curve: low at night, two commute peaks
def _baseline_curve_kw(capacity_kw: float, hour_of_day: float) -> float:
    """Synthetic non-EV load: 35 % of capacity base + two commute peaks."""
    base = 0.35 * capacity_kw
    morning = 0.30 * capacity_kw * math.exp(-((hour_of_day - 9.0) ** 2) / 1.5)
    evening = 0.45 * capacity_kw * math.exp(-((hour_of_day - 19.0) ** 2) / 2.0)
    return max(0.0, base + morning + evening)


@dataclass
class StationCfg:
    station_id: str
    station_latitude: float
    station_longitude: float
    transformer_id: str
    number_of_chargers: int
    charger_power_kw: float

    @classmethod
    def from_contract(cls, s: Dict[str, Any]) -> "StationCfg":
        return cls(
            station_id=s["station_id"],
            station_latitude=float(s["station_latitude"]),
            station_longitude=float(s["station_longitude"]),
            transformer_id=s["transformer_id"],
            number_of_chargers=int(s["number_of_chargers"]),
            charger_power_kw=float(s["charger_power_kw"]),
        )


@dataclass
class TransformerCfg:
    transformer_id: str
    transformer_capacity_kw: float

    @classmethod
    def from_contract(cls, t: Dict[str, Any]) -> "TransformerCfg":
        return cls(
            transformer_id=t["transformer_id"],
            transformer_capacity_kw=float(t["transformer_capacity_kw"]),
        )


class _Station:
    """SimPy process that manages plug/unplug events, the queue, and the
    `available_chargers` count for one station.

    State machine
    -------------
    * An arriving virtual vehicle is *admitted*: if a charger is free, start
      charging (a (vid, finish_at) row goes into `self.charging`); otherwise
      append to `self.queue`.
    * Each tick `Grid._tick_completions()` drops any charging vehicle whose
      `finish_at` has elapsed AND, if `self.queue` is non-empty, promotes the
      head of the queue into the freed charger. This is what keeps the queue
      draining instead of stalling forever once load rises.
    * The overload latch (set by `Grid._recount_latches()` per tick) reduces
      `_effective_capacity()` so hot transformers shed chargers — the safety
      proxy that lets the engine and dashboard see realistic "can't plug in"
      behaviour even before any vehicle has run out of road.
    """

    def __init__(self, env: simpy.Environment, cfg: StationCfg,
                 rng: random.Random, plug_rate_per_hour: float,
                 avg_service_minutes: float) -> None:
        self.env = env
        self.cfg = cfg
        self.rng = rng
        self.plug_rate_per_hour = plug_rate_per_hour
        self.avg_service_minutes = avg_service_minutes
        # state
        self.charging: List[Tuple[str, float]] = []   # (vehicle_id, finish_at env-time)
        self.queue: List[str] = []                    # vehicle_ids waiting
        # counters
        self.completed = 0
        self.latched = False
        self.action = env.process(self._run())

    def _run(self) -> "simpy.events.ProcessGenerator":
        """Poisson arrivals in sim-seconds (TICK_SECONDS = 60 -> per-env-unit = 1 minute).
        New arrivals either plug in or queue — they never overwrite the queue."""
        while True:
            # expovariate expects rate-per-env-time-unit. env-time = seconds.
            wait_seconds = self.rng.expovariate(self.plug_rate_per_hour / 3600.0)
            yield self.env.timeout(max(1.0, wait_seconds))
            vid = f"sim-{self.rng.randint(1000, 9999)}"
            self._admit(vid)

    def _admit(self, vid: str) -> None:
        if len(self.charging) < self._effective_capacity():
            self._start_charging(vid)
        else:
            self.queue.append(vid)

    def _start_charging(self, vid: str) -> None:
        dwell_min = max(2.0, self.rng.gauss(self.avg_service_minutes, 6.0))
        self.charging.append((vid, self.env.now + dwell_min * 60.0))

    def _effective_capacity(self) -> int:
        """Charger slots available right now (reduced when safety-latched)."""
        if not self.latched:
            return self.cfg.number_of_chargers
        shed = int(math.ceil(self.cfg.number_of_chargers * OVERLOAD_LATCH_FRACTION))
        return max(0, self.cfg.number_of_chargers - shed)

    def _tick_completions(self) -> None:
        """Drop completed charging; promote queued -> charging for any freed slot."""
        still_charging: List[Tuple[str, float]] = []
        for vid, finish_at in self.charging:
            if finish_at <= self.env.now:
                self.completed += 1
                if self.queue:
                    promoted = self.queue.pop(0)
                    self._start_charging(promoted)
            else:
                still_charging.append((vid, finish_at))
        self.charging = still_charging


@dataclass
class Grid:
    """Holds the configured assets, the running SimPy env, and the per-tick
    transformer loads. Built once; `run()` ticks it forward; `emit()` snapshots
    the final state in the contracts/schemas.md shape."""
    stations: List[_Station]
    transformers: List[TransformerCfg]
    station_by_tx: Dict[str, List[_Station]]
    env: simpy.Environment
    rng: random.Random

    @classmethod
    def build(cls, station_cfgs: Sequence[StationCfg], transformer_cfgs: Sequence[TransformerCfg],
              *, rng_seed: int = 42, plug_rate_per_hour: float = 0.8,
              avg_service_minutes: float = DEFAULT_AVG_SERVICE_MINUTES) -> "Grid":
        env = simpy.Environment()
        rng = random.Random(rng_seed)
        stations = [_Station(env, s, rng, plug_rate_per_hour, avg_service_minutes)
                    for s in station_cfgs]
        by_tx: Dict[str, List[_Station]] = {}
        for st in stations:
            by_tx.setdefault(st.cfg.transformer_id, []).append(st)
        return cls(stations=stations, transformers=list(transformer_cfgs),
                   station_by_tx=by_tx, env=env, rng=rng)

    def _recount_latches(self, tx_loads: Dict[str, float]) -> None:
        """Each tick: mark stations on hot transformers as latched (safety shed)."""
        for tx in self.transformers:
            cap = tx.transformer_capacity_kw or 1.0
            hot = (tx_loads.get(tx.transformer_id, 0.0) / cap) > OVERLOAD_THRESHOLD
            for st in self.station_by_tx.get(tx.transformer_id, []):
                st.latched = hot

    def run(self, hours: float) -> Dict[str, float]:
        """Advance the env for `hours` simulated hours and return final tx loads."""
        total_steps = max(1, int(hours * 3600.0 / TICK_SECONDS))
        # Manual discrete-time loop: we let SimPy processes fire whenever their
        # timeout elapses, but we own the tick to compute loads deterministically.
        # Each step advances the env by TICK_SECONDS.
        tx_loads: Dict[str, float] = {}
        for step in range(total_steps):
            self.env.run(until=self.env.now + TICK_SECONDS)
            for st in self.stations:
                st._tick_completions()
            hour_of_day = (step * TICK_SECONDS / 3600.0) % 24.0
            for tx in self.transformers:
                base = _baseline_curve_kw(tx.transformer_capacity_kw, hour_of_day)
                ev = sum(len(st.charging) * st.cfg.charger_power_kw
                         for st in self.station_by_tx.get(tx.transformer_id, []))
                tx_loads[tx.transformer_id] = base + ev
            self._recount_latches(tx_loads)
        return tx_loads

    def emit(self, tx_loads: Dict[str, float]) -> Tuple[List[Dict[str, Any]],
                                                        List[Dict[str, Any]],
                                                        List[str]]:
        """Return `(stations, transformers, latched_station_ids)` where the
        first two match `contracts/schemas.md`. The third item is internal
        so the CLI/orchestrator can report (but never serialise) which
        stations the overload latch has shed."""
        station_rows: List[Dict[str, Any]] = []
        latched: List[str] = []
        for st in self.stations:
            in_use = len(st.charging)
            cap = st._effective_capacity()
            avail = max(0, cap - in_use)
            # estimated_wait_time = (queue / cap) * avg_service_time, clamped
            est_wait = (len(st.queue) / cap * DEFAULT_AVG_SERVICE_MINUTES) if cap else float("inf")
            if st.latched:
                latched.append(st.cfg.station_id)
            station_rows.append({
                "station_id": st.cfg.station_id,
                "station_latitude": st.cfg.station_latitude,
                "station_longitude": st.cfg.station_longitude,
                "transformer_id": st.cfg.transformer_id,
                "number_of_chargers": st.cfg.number_of_chargers,
                "available_chargers": avail,
                "charger_power_kw": st.cfg.charger_power_kw,
                "queue_length": len(st.queue),
                "estimated_wait_time": round(est_wait, 2) if math.isfinite(est_wait) else 0.0,
            })
        transformer_rows: List[Dict[str, Any]] = []
        for tx in self.transformers:
            transformer_rows.append({
                "transformer_id": tx.transformer_id,
                "transformer_capacity_kw": tx.transformer_capacity_kw,
                "current_transformer_load_kw": round(tx_loads.get(tx.transformer_id, 0.0), 2),
            })
        return station_rows, transformer_rows, latched


def simulate(stations_in: Sequence[Dict[str, Any]],
             transformers_in: Sequence[Dict[str, Any]],
             *, hours: float = 24.0, rng_seed: int = 42,
             plug_rate_per_hour: float = 0.8,
             avg_service_minutes: float = DEFAULT_AVG_SERVICE_MINUTES
             ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[str]]:
    """One-call entry point — used by both CLI and the orchestrator.

    Returns `(stations, transformers, latched_station_ids)`. Only the first
    two are serialised into JSON; the third is operational metadata so the
    operator can see which stations the overload latch has shed."""
    station_cfgs = [StationCfg.from_contract(s) for s in stations_in]
    transformer_cfgs = [TransformerCfg.from_contract(t) for t in transformers_in]
    grid = Grid.build(station_cfgs, transformer_cfgs,
                      rng_seed=rng_seed, plug_rate_per_hour=plug_rate_per_hour,
                      avg_service_minutes=avg_service_minutes)
    loads = grid.run(hours)
    return grid.emit(loads)


# ---- CLI ---------------------------------------------------------------------

DEFAULT_STATIONS: List[Dict[str, Any]] = [
    {"station_id": "ST-1", "station_latitude": 30.7333, "station_longitude": 76.7794,
     "transformer_id": "TX-A", "number_of_chargers": 4, "charger_power_kw": 60.0},
    {"station_id": "ST-2", "station_latitude": 30.7411, "station_longitude": 76.7689,
     "transformer_id": "TX-A", "number_of_chargers": 2, "charger_power_kw": 150.0},
    {"station_id": "ST-3", "station_latitude": 30.7194, "station_longitude": 76.8000,
     "transformer_id": "TX-B", "number_of_chargers": 6, "charger_power_kw": 30.0},
]
DEFAULT_TRANSFORMERS: List[Dict[str, Any]] = [
    {"transformer_id": "TX-A", "transformer_capacity_kw": 250.0},
    {"transformer_id": "TX-B", "transformer_capacity_kw": 160.0},
]


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Run the SimPy grid simulator.")
    ap.add_argument("--hours", type=float, default=24.0,
                    help="number of simulated hours (default 24)")
    ap.add_argument("--seed", type=int, default=42, help="RNG seed for determinism")
    ap.add_argument("--plug-rate", type=float, default=0.8,
                    help="vehicles arriving per station per hour (Poisson)")
    ap.add_argument("--out", metavar="DIR",
                    help="if given, write transformers.json and stations.json into DIR")
    args = ap.parse_args(argv)

    stations, transformers, latched = simulate(DEFAULT_STATIONS, DEFAULT_TRANSFORMERS,
                                                hours=args.hours, rng_seed=args.seed,
                                                plug_rate_per_hour=args.plug_rate)
    print(f"hours simulated : {args.hours}")
    print(f"seed            : {args.seed}")
    for t in transformers:
        util = t["current_transformer_load_kw"] / t["transformer_capacity_kw"] * 100.0
        print(f"transformer {t['transformer_id']}: load={t['current_transformer_load_kw']:.1f} kW "
              f"({util:.1f} % of capacity)")
    latched_set = set(latched)
    for s in stations:
        flag = " LATCHED" if s["station_id"] in latched_set else ""
        print(f"station {s['station_id']}: free={s['available_chargers']}/{s['number_of_chargers']}"
              f" queue={s['queue_length']}{flag}")
    if latched_set:
        print(f"safety latch tripped on: {sorted(latched_set)}"
              f" ({len(latched_set)} station(s) have chargers auto-shed)")

    if args.out:
        outdir = pathlib.Path(args.out)
        outdir.mkdir(parents=True, exist_ok=True)
        (outdir / "stations.json").write_text(json.dumps(stations, indent=2) + "\n")
        (outdir / "transformers.json").write_text(json.dumps(transformers, indent=2) + "\n")
        print(f"wrote {len(stations)} stations, {len(transformers)} transformers -> {outdir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
