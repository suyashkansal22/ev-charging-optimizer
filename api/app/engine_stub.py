"""Day-1 MOCK of the C++ engine.

Exposes the exact signature the real pybind11 module will expose:

    solve(vehicles, stations, transformers, routes, forecasts) -> list[dict]

Naive placeholder logic so the team can build immediately. Person 1 replaces
this with the real optimizer; the API import swaps to the compiled module and
nothing else changes.
"""
from typing import List
from .models import Vehicle, Station, Transformer, RouteInfo, Forecast


def solve(vehicles: List[Vehicle],
          stations: List[Station],
          transformers: List[Transformer],
          routes: List[RouteInfo],
          forecasts: List[Forecast]) -> List[dict]:
    price = {f.station_id: f.current_price_per_kwh for f in forecasts}
    route = {(r.vehicle_id, r.station_id): r for r in routes}
    assignments = []
    for i, v in enumerate(vehicles):
        # placeholder: nearest station by travel time (falls back to round-robin)
        reachable = [s for s in stations if (v.vehicle_id, s.station_id) in route]
        if reachable:
            s = min(reachable,
                    key=lambda s: route[(v.vehicle_id, s.station_id)].travel_time_to_station)
        else:
            s = stations[i % len(stations)]
        kwh_needed = max(0.0,
            (v.target_battery_percent - v.current_battery_percent) / 100.0
            * v.battery_capacity_kwh)
        assignments.append({
            "vehicle_id": v.vehicle_id,
            "station_id": s.station_id,
            "time_slot": i % 6,
            "est_cost": round(kwh_needed * price.get(s.station_id, 0.0), 2),
        })
    return assignments
