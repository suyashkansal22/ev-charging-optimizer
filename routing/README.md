# routing/ — RouteInfo generator (Person 3 / integration)

The traffic/geography seam. `RouteInfo` (travel distance + time per vehicle->station pair)
is the one contract object no other component owns: the **engine** consumes it, the **API**
passes it through, the **simulator** owns grid + price (not traffic). So it lives here.

This is a dependency-free stand-in for a real maps/traffic API:

```
distance (km) = haversine(vehicle, station)      # great-circle
time     (min) = distance / 30 km/h * 60          # fixed urban speed
```

That model reproduces the hand-authored `api/seed/routes.json` **exactly**:

```bash
python routing/route_generator.py --check
#   max |distance| error vs seed : 0.000 km
#   max |time|     error vs seed : 0.000 min
#   RESULT: MATCH
```

## Use it

```bash
python routing/route_generator.py            # print RouteInfo JSON to stdout
python routing/route_generator.py --check     # verify it matches the current seed
python routing/route_generator.py --out api/seed/routes.json   # (re)write the seed
python routing/route_generator.py --speed 25  # try a different avg speed
```

Or import it:

```python
from routing.route_generator import generate_routes, haversine_km
routes = generate_routes(vehicles, stations)   # list of RouteInfo-shaped dicts
```

Inputs may be plain dicts (JSON) **or** the API's Pydantic models — both work. Fleet
vehicles that carry `vehicle_destination_lat/lng` also get the onward-leg fields filled in.

## Where this plugs in

- **Now:** whenever someone changes `api/seed/vehicles.json` or `stations.json`, regenerate
  the routes with `--out api/seed/routes.json` instead of editing distances by hand.
- **Later:** when the simulator (Person 4) emits live vehicles/stations, call
  `generate_routes(...)` to produce the `routes` the API feeds the engine — or swap the body
  of `generate_routes` for a Google/OSRM call. The output shape is the contract
  (`contracts/schemas.md` > RouteInfo), so no consumer changes.

Keep output matching the contract. Do not rename fields.
