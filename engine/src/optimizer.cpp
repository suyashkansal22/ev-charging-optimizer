#include "optimizer.hpp"
#include <unordered_map>
#include <algorithm>

// TODO (Person 1): real optimization goes here. With the full parameter set you can:
//   * order vehicles by urgency (lowest battery / nearest deadline) via priority_queue
//   * keep a running load per transformer_id; never exceed transformer_capacity_kw
//   * cap charge speed at min(charger_power_kw, vehicle_max_charge_power_kw)
//   * skip stations a vehicle cannot reach (range vs travel_distance_to_station)
//   * pick the time_slot with the cheapest future_price_per_kwh
std::vector<Assignment> solve(const std::vector<Vehicle>& vehicles,
                              const std::vector<Station>& stations,
                              const std::vector<Transformer>& transformers,
                              const std::vector<RouteInfo>& routes,
                              const std::vector<Forecast>& forecasts) {
    std::unordered_map<std::string, double> price;
    for (const auto& f : forecasts) price[f.station_id] = f.current_price_per_kwh;

    std::vector<Assignment> out;
    for (size_t i = 0; i < vehicles.size(); ++i) {
        const auto& v = vehicles[i];
        const auto& s = stations[i % stations.size()];   // placeholder
        double kwh = std::max(0.0,
            (v.target_battery_percent - v.current_battery_percent) / 100.0
            * v.battery_capacity_kwh);
        out.push_back({v.vehicle_id, s.station_id,
                       static_cast<int>(i % 6), kwh * price[s.station_id]});
    }
    return out;
}
