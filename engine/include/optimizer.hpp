#pragma once
#include <string>
#include <vector>
#include <cmath>   // NAN sentinel for absent fleet-only numeric fields

// These structs mirror contracts/schemas.md field-for-field. "Fleet only" optional
// fields are kept as plain members (not std::optional) so the engine builds on
// C++14 toolchains too; ABSENT is encoded as NAN (numbers) or "" (deadline).
// Test presence with std::isnan(x) / s.empty(). Do NOT rename a field without
// updating the contract + Pydantic models + binding together.

struct Vehicle {
    std::string vehicle_id;
    double vehicle_latitude = 0, vehicle_longitude = 0;
    double current_battery_percent = 0;            // 0-100
    double battery_capacity_kwh = 0;
    double vehicle_max_charge_power_kw = 0;         // caps real charge speed
    double target_battery_percent = 100;           // job size (defaults to a full charge)
    double vehicle_destination_lat = NAN;          // fleet only (absent = NAN)
    double vehicle_destination_lng = NAN;          // fleet only
    std::string vehicle_destination_deadline;      // ISO time, fleet only (absent = "")
};

struct Station {
    std::string station_id;
    double station_latitude = 0, station_longitude = 0;
    std::string transformer_id;                    // FK -> Transformer.transformer_id
    int number_of_chargers = 0;
    int available_chargers = 0;
    double charger_power_kw = 0;
    int queue_length = 0;
    double estimated_wait_time = 0;                // minutes
};

struct Transformer {
    std::string transformer_id;
    double transformer_capacity_kw = 0;
    double current_transformer_load_kw = 0;        // baseline (non-EV) load
};

struct RouteInfo {                                 // traffic, one row per (vehicle, station)
    std::string vehicle_id, station_id;
    double travel_distance_to_station = 0;         // km
    double travel_time_to_station = 0;             // minutes
    double travel_distance_from_station_to_destination = NAN;  // fleet only (absent = NAN)
    double travel_time_from_station_to_destination = NAN;      // fleet only
};

struct Forecast {
    std::string station_id;
    double current_price_per_kwh = 0;
    std::vector<double> future_price_per_kwh;      // one entry per upcoming slot
    int horizon_mins = 0;                          // span covered by future_price_per_kwh
};

struct Assignment {
    std::string vehicle_id;
    std::string station_id;
    int time_slot = 0;
    double est_cost = 0;
};

// The one function the whole project depends on. Signature is frozen by the contract.
std::vector<Assignment> solve(const std::vector<Vehicle>& vehicles,
                              const std::vector<Station>& stations,
                              const std::vector<Transformer>& transformers,
                              const std::vector<RouteInfo>& routes,
                              const std::vector<Forecast>& forecasts);
