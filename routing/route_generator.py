"""RouteInfo generator — the traffic/geography seam (owned by Person 3 / integration).

`RouteInfo` (travel distance + time for every vehicle->station pair) is the one contract
object nobody else produces: the engine (Person 1) consumes it, the API (Person 2) passes
it through, the simulator (Person 4) owns grid + price — not traffic. So it lands here.

This is a dependency-free stand-in for a real maps/traffic API. It computes the
great-circle (haversine) distance between a vehicle and each station and converts it to a
travel time at a fixed urban speed. That exact model reproduces the hand-authored
`api/seed/routes.json` to the rounding — run `--check` to see it.

    Distance (km) = haversine(vehicle, station)
    Time    (min) = distance / AVG_SPEED_KMH * 60          # 30 km/h -> 2 min per km

When a vehicle carries a fleet destination (`vehicle_destination_lat/lng`), the onward leg
station->destination is filled in too, matching the "fleet only" fields in the contract.

Output matches contracts/schemas.md > RouteInfo exactly. Swap this for a Google/OSRM call
later without touching any consumer — the shape is the contract.

CLI:
    python routing/route_generator.py            # print routes JSON to stdout
    python routing/route_generator.py --check     # diff against api/seed/routes.json
    python routing/route_generator.py --out api/seed/routes.json   # (re)write the seed
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import sys
from typing import Any, Dict, List, Optional

# Model constants (documented so the numbers are reproducible, not magic).
EARTH_RADIUS_KM = 6371.0
AVG_SPEED_KMH = 30.0            # average urban driving speed; time = dist / speed

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEED = ROOT / "api" / "seed"


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/lng points, in kilometres."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def travel_time_min(distance_km: float, speed_kmh: float = AVG_SPEED_KMH) -> float:
    """Convert a distance to a travel time at a fixed average speed."""
    return distance_km / speed_kmh * 60.0


def _get(obj: Any, field: str, default: Any = None) -> Any:
    """Read from a dict or an attr-object, so both JSON and Pydantic models work."""
    if isinstance(obj, dict):
        return obj.get(field, default)
    return getattr(obj, field, default)


def generate_routes(vehicles: List[Any],
                    stations: List[Any],
                    speed_kmh: float = AVG_SPEED_KMH) -> List[Dict[str, Any]]:
    """One RouteInfo per (vehicle, station). Fleet onward leg filled when a destination exists."""
    routes: List[Dict[str, Any]] = []
    for v in vehicles:
        vlat, vlng = _get(v, "vehicle_latitude"), _get(v, "vehicle_longitude")
        dest_lat = _get(v, "vehicle_destination_lat")
        dest_lng = _get(v, "vehicle_destination_lng")
        for s in stations:
            slat, slng = _get(s, "station_latitude"), _get(s, "station_longitude")
            dist = haversine_km(vlat, vlng, slat, slng)
            row: Dict[str, Any] = {
                "vehicle_id": _get(v, "vehicle_id"),
                "station_id": _get(s, "station_id"),
                "travel_distance_to_station": round(dist, 2),
                "travel_time_to_station": round(travel_time_min(dist, speed_kmh), 1),
            }
            # fleet only: onward leg station -> destination
            if dest_lat is not None and dest_lng is not None:
                leg = haversine_km(slat, slng, dest_lat, dest_lng)
                row["travel_distance_from_station_to_destination"] = round(leg, 2)
                row["travel_time_from_station_to_destination"] = round(
                    travel_time_min(leg, speed_kmh), 1)
            routes.append(row)
    return routes


def _load(name: str) -> Any:
    return json.loads((SEED / name).read_text())


def _check_against_seed(generated: List[Dict[str, Any]]) -> int:
    """Compare generated routes to api/seed/routes.json; report the largest deviation."""
    seed = _load("routes.json")
    seed_by = {(r["vehicle_id"], r["station_id"]): r for r in seed}
    max_dist_err = max_time_err = 0.0
    missing = 0
    for r in generated:
        key = (r["vehicle_id"], r["station_id"])
        if key not in seed_by:
            missing += 1
            continue
        s = seed_by[key]
        max_dist_err = max(max_dist_err, abs(r["travel_distance_to_station"] - s["travel_distance_to_station"]))
        max_time_err = max(max_time_err, abs(r["travel_time_to_station"] - s["travel_time_to_station"]))
    print(f"pairs generated : {len(generated)}")
    print(f"pairs in seed   : {len(seed)}  (missing from generated: {missing})")
    print(f"max |distance| error vs seed : {max_dist_err:.3f} km")
    print(f"max |time|     error vs seed : {max_time_err:.3f} min")
    ok = missing == 0 and max_dist_err <= 0.02 and max_time_err <= 0.1
    print("RESULT:", "MATCH (reproduces the seed within rounding)" if ok else "DIVERGENT")
    return 0 if ok else 1


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Generate RouteInfo rows from vehicle+station geography.")
    ap.add_argument("--check", action="store_true", help="diff generated routes against api/seed/routes.json")
    ap.add_argument("--out", metavar="PATH", help="write routes JSON to PATH (e.g. api/seed/routes.json)")
    ap.add_argument("--speed", type=float, default=AVG_SPEED_KMH, help=f"avg speed km/h (default {AVG_SPEED_KMH})")
    args = ap.parse_args(argv)

    vehicles = _load("vehicles.json")
    stations = _load("stations.json")
    routes = generate_routes(vehicles, stations, speed_kmh=args.speed)

    if args.check:
        return _check_against_seed(routes)

    blob = json.dumps(routes, indent=2)
    if args.out:
        pathlib.Path(args.out).write_text(blob + "\n")
        print(f"wrote {len(routes)} routes -> {args.out}")
    else:
        print(blob)
    return 0


if __name__ == "__main__":
    sys.exit(main())
