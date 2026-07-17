"""Demand / Vehicle generator — emits a `Vehicle` list in the exact shape
from `contracts/schemas.md` (Person 4 owns this, per AGENTS.md §7).

The simulator doubles as the demo's "car generator" (roadmap Page 3, §4).
It produces a *plausible* urban fleet:

  * positions scattered around each station (clustered, not uniform),
  * battery % skewed low (so urgency is interesting for the optimizer),
  * variety of charger profiles (slow AC at home-like, fast DC at high-power),
  * a configurable fraction of fleet vehicles (with destination + deadline)
    so the lane-of-fleet-deadlines can stay exercised in the demo.

CLI
---
    python simulator/vehicle_generator.py --count 50 --fleet-frac 0.15
    python simulator/vehicle_generator.py --count 25 --out simulator/output
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import random
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

# ---- model constants (documented so the numbers are reproducible) -----------
RNG_SEED = 42
DEFAULT_COUNT = 25
DEFAULT_FLEET_FRAC = 0.15     # ~15 % of generated vehicles are fleet (have dest + deadline)

# Geo cluster radius (km) around each station for vehicle positions.
CLUSTER_RADIUS_KM = 4.0

# Battery % distribution: Geom-like, biased low.
BATTERY_BUCKETS: Tuple[Tuple[float, float], ...] = (
    (5.0, 25.0),   # critical
    (15.0, 45.0),  # low
    (40.0, 70.0),  # healthy
    (65.0, 95.0),  # topped
)
BATTERY_WEIGHTS: Tuple[float, ...] = (0.25, 0.40, 0.25, 0.10)

# Charger profile archetypes (drawn per vehicle).
CHARGER_PROFILES: Tuple[Tuple[float, float, float], ...] = (
    # (max_charge_power_kw,  battery_capacity_kwh, weight)
    (7.0,  40.0, 0.20),    # slow AC (small battery car)
    (11.0, 45.0, 0.30),    # AC home wall-box
    (50.0, 60.0, 0.30),    # mid DC fast
    (120.0, 80.0, 0.15),   # rapid DC
    (150.0, 100.0, 0.05),  # ultra-rapid (Tesla V3)
)

# Fleet destinations clustered a bit farther out from the city centre.
FLEET_DEST_OFFSETS_KM: Tuple[Tuple[float, float], ...] = (
    (8.0, 2.0), (10.0, -3.0), (-6.0, 4.0), (4.0, -8.0), (-10.0, -4.0),
    (12.0, 0.0), (-3.0, 9.0), (0.0, -12.0),
)


@dataclass
class VehicleGenCfg:
    count: int = DEFAULT_COUNT
    fleet_fraction: float = DEFAULT_FLEET_FRAC
    rng_seed: int = RNG_SEED
    # Anchors the generator uses; defaults to the seed fixtures so it produces
    # vehicles that line up geographically with the api/seed/*.json.
    station_anchors: Optional[List[Dict[str, Any]]] = None

    @property
    def fleet_count(self) -> int:
        return max(0, int(round(self.count * self.fleet_fraction)))


# Default station anchors (copied at module import so the generator still
# works without a stack running). These match `api/seed/stations.json`.
DEFAULT_ANCHORS: List[Dict[str, Any]] = [
    {"station_id": "ST-1", "station_latitude": 30.7333, "station_longitude": 76.7794},
    {"station_id": "ST-2", "station_latitude": 30.7411, "station_longitude": 76.7689},
    {"station_id": "ST-3", "station_latitude": 30.7194, "station_longitude": 76.8000},
]


# ---- geography helpers (read-only — never edit routing/) --------------------

EARTH_RADIUS_KM = 6371.0


def _offset_km_to_latlon(anchor_lat: float, anchor_lng: float,
                         km_north: float, km_east: float) -> Tuple[float, float]:
    """Approximate (lat, lng) offset in km around an anchor. Good enough for
    synthetic demand; not navigation-grade."""
    new_lat = anchor_lat + math.degrees(km_north / EARTH_RADIUS_KM)
    new_lng = anchor_lng + math.degrees(
        km_east / (EARTH_RADIUS_KM * math.cos(math.radians(anchor_lat))))
    return new_lat, new_lng


def _weighted_choice(rng: random.Random,
                     items: Sequence[Any], weights: Sequence[float]) -> Any:
    total = sum(weights)
    pick = rng.uniform(0.0, total)
    cum = 0.0
    for item, w in zip(items, weights):
        cum += w
        if pick <= cum:
            return item
    return items[-1]


def _sample_battery(rng: random.Random) -> float:
    lo, hi = _weighted_choice(rng, BATTERY_BUCKETS, BATTERY_WEIGHTS)
    return round(rng.uniform(lo, hi), 1)


def _sample_charger_profile(rng: random.Random) -> Tuple[float, float]:
    max_kw, cap_kwh, weight = _weighted_choice(
        rng, CHARGER_PROFILES,
        [p[2] for p in CHARGER_PROFILES],
    )
    # mild per-call jitter around the archetype so the fleet doesn't look stamped
    jitter_kw = max_kw * rng.uniform(0.85, 1.05)
    jitter_cap = cap_kwh * rng.uniform(0.92, 1.05)
    return round(jitter_kw, 1), round(jitter_cap, 1)


def _sample_target_battery(rng: random.Random, current: float) -> float:
    """Return >= current, in 5 % steps; never over 100."""
    delta = rng.choice([20.0, 30.0, 40.0, 50.0, 60.0])
    target = max(int(current) + int(delta), int(current))
    # round up to the nearest 5 for a tidy target
    target = max(int(math.ceil(target / 5.0) * 5), int(math.ceil(current / 5.0) * 5))
    return float(min(100.0, target))


def _iso_deadline(rng: random.Random, base: datetime) -> str:
    """Pick a deadline in the next 1..6 hours, ISO-8601 UTC."""
    minutes_ahead = rng.randint(60, 6 * 60)
    return (base + timedelta(minutes=minutes_ahead)).isoformat()


# ---- main -------------------------------------------------------------------

def generate_vehicles(cfg: Optional[VehicleGenCfg] = None,
                      *, now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """Return a list of `Vehicle` dicts matching `contracts/schemas.md`."""
    cfg = cfg or VehicleGenCfg()
    anchors = cfg.station_anchors or DEFAULT_ANCHORS
    rng = random.Random(cfg.rng_seed)
    now = now or datetime.now(timezone.utc)
    n_fleet = cfg.fleet_count

    vehicles: List[Dict[str, Any]] = []
    for i in range(cfg.count):
        is_fleet = (i < n_fleet)
        anchor = rng.choice(anchors)
        # sample around the station
        rng_km_n = rng.uniform(-CLUSTER_RADIUS_KM, CLUSTER_RADIUS_KM)
        rng_km_e = rng.uniform(-CLUSTER_RADIUS_KM, CLUSTER_RADIUS_KM)
        lat, lng = _offset_km_to_latlon(anchor["station_latitude"],
                                          anchor["station_longitude"],
                                          rng_km_n, rng_km_e)
        cur_batt = _sample_battery(rng)
        max_kw, cap = _sample_charger_profile(rng)
        row: Dict[str, Any] = {
            "vehicle_id": f"SIM-V{i + 1:03d}",
            "vehicle_latitude": round(lat, 6),
            "vehicle_longitude": round(lng, 6),
            "current_battery_percent": cur_batt,
            "battery_capacity_kwh": cap,
            "vehicle_max_charge_power_kw": max_kw,
            "target_battery_percent": _sample_target_battery(rng, cur_batt),
        }
        if is_fleet:
            km_n, km_e = rng.choice(FLEET_DEST_OFFSETS_KM)
            dlat, dlng = _offset_km_to_latlon(anchor["station_latitude"],
                                                anchor["station_longitude"],
                                                km_n + rng.uniform(-1.5, 1.5),
                                                km_e + rng.uniform(-1.5, 1.5))
            row["vehicle_destination_lat"] = round(dlat, 6)
            row["vehicle_destination_lng"] = round(dlng, 6)
            row["vehicle_destination_deadline"] = _iso_deadline(rng, now)
        vehicles.append(row)
    # sort by urgency (lowest battery first) — cheaper for the engine and
    # matches the urgency ordering documented in AGENTS.md §7.
    vehicles.sort(key=lambda v: v["current_battery_percent"])
    return vehicles


# ---- CLI ---------------------------------------------------------------------

def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Generate synthetic Vehicle dicts.")
    ap.add_argument("--count", type=int, default=DEFAULT_COUNT,
                    help=f"number of vehicles (default {DEFAULT_COUNT})")
    ap.add_argument("--fleet-frac", type=float, default=DEFAULT_FLEET_FRAC,
                    help=f"fraction of fleet vehicles (default {DEFAULT_FLEET_FRAC})")
    ap.add_argument("--seed", type=int, default=RNG_SEED, help="RNG seed")
    ap.add_argument("--out", metavar="DIR",
                    help="if given, write vehicles.json into DIR")
    args = ap.parse_args(argv)

    cfg = VehicleGenCfg(count=args.count, fleet_fraction=args.fleet_frac,
                         rng_seed=args.seed)
    vehicles = generate_vehicles(cfg)
    fleet = sum(1 for v in vehicles if v.get("vehicle_destination_deadline"))
    print(f"generated {len(vehicles)} vehicles ({fleet} fleet)")
    print(f"battery range : {min(v['current_battery_percent'] for v in vehicles):.1f}% .."
          f" {max(v['current_battery_percent'] for v in vehicles):.1f}%")
    if args.out:
        outdir = pathlib.Path(args.out)
        outdir.mkdir(parents=True, exist_ok=True)
        (outdir / "vehicles.json").write_text(json.dumps(vehicles, indent=2) + "\n")
        print(f"wrote {len(vehicles)} vehicles -> {outdir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
