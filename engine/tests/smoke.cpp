// Standalone verification harness for the C++ optimizer — no pybind/Python needed.
//
//   g++ -std=c++17 -Iengine/include engine/src/optimizer.cpp engine/tests/smoke.cpp -o smoke
//   ./smoke        # prints the assignment table + PASS/FAIL, exits non-zero on failure
//
// It rebuilds the api/seed/*.json scenario in-memory, calls solve(), prints the
// result, and independently re-checks the hard constraints from the OUTPUT alone:
//   1. completeness   — exactly one assignment per vehicle, fields well-formed
//   2. reachability   — the car had the range to reach its assigned station
//   3. chargers       — per (station, slot) count never exceeds available_chargers
//   4. transformer    — per (transformer, slot) summed rated draw never exceeds
//                       capacity - baseline load  (the binding grid constraint)

#include "optimizer.hpp"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <map>
#include <string>
#include <unordered_map>
#include <vector>

namespace {
constexpr double KWH_PER_KM = 0.15;   // must match optimizer.cpp's range model
constexpr double EPS = 1e-6;

Vehicle mkV(std::string id, double lat, double lng, double batt, double cap,
            double maxp, double target) {
    Vehicle v; v.vehicle_id = id; v.vehicle_latitude = lat; v.vehicle_longitude = lng;
    v.current_battery_percent = batt; v.battery_capacity_kwh = cap;
    v.vehicle_max_charge_power_kw = maxp; v.target_battery_percent = target;
    return v;                                  // fleet optionals stay empty
}
Station mkS(std::string id, double lat, double lng, std::string tx, int nCh, int avail,
            double power, int queue, double wait) {
    Station s; s.station_id = id; s.station_latitude = lat; s.station_longitude = lng;
    s.transformer_id = tx; s.number_of_chargers = nCh; s.available_chargers = avail;
    s.charger_power_kw = power; s.queue_length = queue; s.estimated_wait_time = wait;
    return s;
}
Transformer mkT(std::string id, double cap, double load) {
    Transformer t; t.transformer_id = id; t.transformer_capacity_kw = cap;
    t.current_transformer_load_kw = load; return t;
}
RouteInfo mkR(std::string vid, std::string sid, double dist, double time) {
    RouteInfo r; r.vehicle_id = vid; r.station_id = sid;
    r.travel_distance_to_station = dist; r.travel_time_to_station = time; return r;
}
Forecast mkF(std::string sid, double cur, std::vector<double> fut, int horizon) {
    Forecast f; f.station_id = sid; f.current_price_per_kwh = cur;
    f.future_price_per_kwh = std::move(fut); f.horizon_mins = horizon; return f;
}
}  // namespace

int main() {
    // ---- api/seed/*.json, transcribed ----
    std::vector<Vehicle> vehicles = {
        mkV("EV-101", 30.7280, 76.7920, 18, 50, 50, 80),
        mkV("EV-102", 30.7390, 76.7700, 42, 40,  7, 90),
        mkV("EV-103", 30.7200, 76.7850,  9, 60, 120, 70),
        mkV("EV-104", 30.7450, 76.7800, 55, 50, 50, 100),
        mkV("EV-105", 30.7330, 76.7600, 30, 45, 11, 85),
    };
    std::vector<Station> stations = {
        mkS("ST-1", 30.7333, 76.7794, "TX-A", 4, 3, 60, 1, 8),
        mkS("ST-2", 30.7411, 76.7689, "TX-A", 2, 2, 150, 0, 0),
        mkS("ST-3", 30.7194, 76.8000, "TX-B", 6, 1, 30, 4, 25),
    };
    std::vector<Transformer> transformers = { mkT("TX-A", 250, 180), mkT("TX-B", 160, 120) };
    std::vector<Forecast> forecasts = {
        mkF("ST-1", 9.5, {9.5,10.2,11.0,12.5,11.8,10.0}, 120),
        mkF("ST-2", 12.0, {12.0,11.5,10.8,10.0,9.6,9.2}, 120),
        mkF("ST-3", 7.8, {7.8,8.4,9.0,9.5,10.1,10.5}, 120),
    };
    std::vector<RouteInfo> routes = {
        mkR("EV-101","ST-1",1.34,2.7), mkR("EV-101","ST-2",2.65,5.3), mkR("EV-101","ST-3",1.22,2.4),
        mkR("EV-102","ST-1",1.10,2.2), mkR("EV-102","ST-2",0.26,0.5), mkR("EV-102","ST-3",3.60,7.2),
        mkR("EV-103","ST-1",1.57,3.1), mkR("EV-103","ST-2",2.81,5.6), mkR("EV-103","ST-3",1.44,2.9),
        mkR("EV-104","ST-1",1.30,2.6), mkR("EV-104","ST-2",1.15,2.3), mkR("EV-104","ST-3",3.43,6.9),
        mkR("EV-105","ST-1",1.85,3.7), mkR("EV-105","ST-2",1.24,2.5), mkR("EV-105","ST-3",4.11,8.2),
    };

    auto out = solve(vehicles, stations, transformers, routes, forecasts);

    // ---- lookups for checking ----
    std::unordered_map<std::string, const Vehicle*> vById;
    for (auto& v : vehicles) vById[v.vehicle_id] = &v;
    std::unordered_map<std::string, const Station*> sById;
    for (auto& s : stations) sById[s.station_id] = &s;
    std::unordered_map<std::string, const Transformer*> tById;
    for (auto& t : transformers) tById[t.transformer_id] = &t;
    std::map<std::pair<std::string,std::string>, const RouteInfo*> rByPair;
    for (auto& r : routes) rByPair[{r.vehicle_id, r.station_id}] = &r;

    int S = 0, horizon = 0;
    for (auto& f : forecasts) {
        S = std::max<int>(S, (int)f.future_price_per_kwh.size());
        horizon = std::max(horizon, f.horizon_mins);
    }

    std::printf("\n  vehicle  -> station   slot   est_cost   draw_kW   note\n");
    std::printf("  -----------------------------------------------------------------------\n");
    int fails = 0;

    // (1) completeness
    if ((int)out.size() != (int)vehicles.size()) {
        std::printf("  [FAIL] got %d assignments, expected %d\n",
                    (int)out.size(), (int)vehicles.size());
        ++fails;
    }
    std::map<std::string,int> seen;

    // per-slot accumulators for grid checks
    std::map<std::pair<std::string,int>, int>    chargerUse;  // (station, slot) -> count
    std::map<std::pair<std::string,int>, double> txLoad;      // (transformer, slot) -> kW

    for (auto& a : out) {
        const Vehicle*  v = vById.count(a.vehicle_id) ? vById[a.vehicle_id] : nullptr;
        const Station*  s = sById.count(a.station_id) ? sById[a.station_id] : nullptr;
        double draw = (v && s) ? std::min(s->charger_power_kw, v->vehicle_max_charge_power_kw) : 0.0;
        // A car whose full charge can't fit the horizon even starting at slot 0 was
        // placed best-effort (it charges partially / queues — estimated_wait_time).
        double kwhNeeded = v ? std::max(0.0, (v->target_battery_percent - v->current_battery_percent)
                                              / 100.0 * v->battery_capacity_kwh) : 0.0;
        double chargeMin = draw > 0 ? kwhNeeded / draw * 60.0 : 1e9;
        const char* note = (chargeMin > horizon + 1e-6) ? "best-effort (slow charger)" : "";
        std::printf("  %-7s  -> %-7s   %2d    %8.2f   %6.1f   %s\n",
                    a.vehicle_id.c_str(), a.station_id.c_str(), a.time_slot, a.est_cost, draw, note);

        seen[a.vehicle_id]++;
        if (!v) { std::printf("  [FAIL] unknown vehicle %s\n", a.vehicle_id.c_str()); ++fails; continue; }
        if (!s) { std::printf("  [FAIL] unknown station %s\n", a.station_id.c_str()); ++fails; continue; }
        if (a.time_slot < 0 || a.time_slot >= S) {
            std::printf("  [FAIL] %s slot %d out of [0,%d)\n", a.vehicle_id.c_str(), a.time_slot, S); ++fails; }
        if (!(a.est_cost >= 0.0) || !std::isfinite(a.est_cost)) {
            std::printf("  [FAIL] %s bad est_cost %.3f\n", a.vehicle_id.c_str(), a.est_cost); ++fails; }

        // (2) reachability
        auto rit = rByPair.find({a.vehicle_id, a.station_id});
        double curEnergy = v->current_battery_percent / 100.0 * v->battery_capacity_kwh;
        if (rit == rByPair.end() ||
            curEnergy + 1e-9 < rit->second->travel_distance_to_station * KWH_PER_KM) {
            std::printf("  [FAIL] %s cannot reach %s\n", a.vehicle_id.c_str(), a.station_id.c_str()); ++fails;
        }

        chargerUse[{a.station_id, a.time_slot}]++;
        txLoad[{s->transformer_id, a.time_slot}] += draw;
    }

    // (1b) one row per vehicle
    for (auto& v : vehicles)
        if (seen[v.vehicle_id] != 1) {
            std::printf("  [FAIL] %s appears %d times (expected 1)\n",
                        v.vehicle_id.c_str(), seen[v.vehicle_id]); ++fails; }

    // (3) charger capacity per (station, slot)
    for (auto& kv : chargerUse) {
        const Station* s = sById[kv.first.first];
        if (kv.second > s->available_chargers) {
            std::printf("  [FAIL] %s slot %d uses %d chargers > %d available\n",
                        kv.first.first.c_str(), kv.first.second, kv.second, s->available_chargers); ++fails;
        }
    }

    // (4) transformer capacity per (transformer, slot)
    for (auto& kv : txLoad) {
        const Transformer* t = tById[kv.first.first];
        double cap = t->transformer_capacity_kw - t->current_transformer_load_kw;
        if (kv.second > cap + EPS) {
            std::printf("  [FAIL] %s slot %d load %.1f kW > %.1f kW headroom\n",
                        kv.first.first.c_str(), kv.first.second, kv.second, cap); ++fails;
        }
    }

    std::printf("  --------------------------------------------------\n");
    std::printf("  per-(transformer,slot) peak load vs headroom:\n");
    for (auto& kv : txLoad) {
        const Transformer* t = tById[kv.first.first];
        std::printf("    %s slot %d : %.1f / %.1f kW\n", kv.first.first.c_str(), kv.first.second,
                    kv.second, t->transformer_capacity_kw - t->current_transformer_load_kw);
    }

    std::printf("\n  %s  (%d check failure%s)\n\n",
                fails == 0 ? "PASS" : "FAIL", fails, fails == 1 ? "" : "s");
    return fails == 0 ? 0 : 1;
}
