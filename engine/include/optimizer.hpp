#pragma once
#include <string>
#include <vector>

struct Vehicle {
    std::string vehicle_id;
    double vehicle_latitude, vehicle_longitude;
    double current_battery_percent;
    double battery_capacity_kwh;
    double vehicle_max_charge_power_kw;
    double target_battery_percent;        // recommended explicit input
};

struct Station {
    std::string station_id;
    std::string transformer_id;           // links to Transformer
    double charger_power_kw;
    int available_chargers;
    int queue_length;
    double estimated_wait_time;
};

struct Transformer {
    std::string transformer_id;
    double transformer_capacity_kw;
    double current_transformer_load_kw;
};

struct RouteInfo {                        // traffic, per (vehicle, station)
    std::string vehicle_id, station_id;
    double travel_distance_to_station;
    double travel_time_to_station;
};

struct Forecast {
    std::string station_id;
    double current_price_per_kwh;
};

struct Assignment {
    std::string vehicle_id;
    std::string station_id;
    int time_slot;
    double est_cost;
};

// The one function the whole project depends on.
std::vector<Assignment> solve(const std::vector<Vehicle>& vehicles,
                              const std::vector<Station>& stations,
                              const std::vector<Transformer>& transformers,
                              const std::vector<RouteInfo>& routes,
                              const std::vector<Forecast>& forecasts);
