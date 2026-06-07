# Data Contract — the only language the five pieces use to talk

Agree on these EXACT field names. Do not rename them in your own code.

## Vehicle
| field                        | type   | notes                                   |
|------------------------------|--------|-----------------------------------------|
| vehicle_id                   | str    |                                         |
| vehicle_latitude             | float  |                                         |
| vehicle_longitude            | float  |                                         |
| current_battery_percent      | float  | 0-100                                   |
| battery_capacity_kwh         | float  |                                         |
| vehicle_max_charge_power_kw  | float  | caps real charge speed                  |
| target_battery_percent       | float  | RECOMMENDED (default 100) — job size     |
| vehicle_destination_lat      | float? | fleet only                              |
| vehicle_destination_lng      | float? | fleet only                              |
| vehicle_destination_deadline | str?   | ISO time, fleet only                    |

## Station
| field               | type  | notes                              |
|---------------------|-------|------------------------------------|
| station_id          | str   |                                    |
| station_latitude    | float |                                    |
| station_longitude   | float |                                    |
| transformer_id      | str   | FK -> Transformer.transformer_id   |
| number_of_chargers  | int   |                                    |
| available_chargers  | int   |                                    |
| charger_power_kw    | float |                                    |
| queue_length        | int   |                                    |
| estimated_wait_time | float | minutes                            |

## Transformer (grid)
| field                       | type  | notes |
|-----------------------------|-------|-------|
| transformer_id              | str   |       |
| transformer_capacity_kw     | float |       |
| current_transformer_load_kw | float |       |

## RouteInfo (traffic, via maps API) — one row per (vehicle, station) pair
| field                                       | type   | notes      |
|---------------------------------------------|--------|------------|
| vehicle_id                                  | str    |            |
| station_id                                  | str    |            |
| travel_distance_to_station                  | float  | km         |
| travel_time_to_station                      | float  | minutes    |
| travel_distance_from_station_to_destination | float? | fleet only |
| travel_time_from_station_to_destination     | float? | fleet only |

## Forecast (pricing, via ML)
| field                 | type        | notes                       |
|-----------------------|-------------|-----------------------------|
| station_id            | str         |                             |
| current_price_per_kwh | float       |                             |
| future_price_per_kwh  | list[float] | one entry per upcoming slot |
| horizon_mins          | int         |                             |

## Assignment (the engine's answer)
| field      | type  | notes                 |
|------------|-------|-----------------------|
| vehicle_id | str   |                       |
| station_id | str   |                       |
| time_slot  | int   | which slot to plug in |
| est_cost   | float |                       |

---
### Two modelling notes
1. **transformer_id lives on BOTH Station (as a foreign key) and Transformer.**
   Your list puts it under grid params, but the engine also needs to know which
   station draws from which transformer — that link is the Station.transformer_id.
2. **target_battery_percent is not in the base list but is needed**: without a
   target the engine cannot know how much energy each car wants, so it cannot
   compute cost, charge time, or feasibility. It defaults to 100 here.
