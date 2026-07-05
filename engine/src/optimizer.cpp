#include "optimizer.hpp"
#include <algorithm>
#include <cmath>
#include <queue>
#include <string>
#include <unordered_map>
#include <vector>

// =============================================================================
//  EV Smart-Charging Router — constrained greedy optimizer
//
//  One pass, urgency-ordered, grid-aware. For each charge request we choose a
//  (station, time_slot) that respects every physical limit, ranked by the
//  team's priority order:  TIME  >  CONVENIENCE  >  COST.
//
//    * TIME        — a feasibility GATE: serve the most urgent vehicles first
//                    (lowest battery / nearest deadline) and only accept a slot
//                    the car can actually finish charging in within the
//                    horizon.
//    * CONVENIENCE — among in-time options, prefer near, un-congested stations
//                    (travel time + queue wait, plus the onward leg for
//                    fleets).
//    * COST        — break near-ties by the cheapest forecast slot price; this
//                    is where the time-of-use price optimisation lives.
//
//  Hard constraints (never violated):
//    - reachability: a car must have the range to reach the station;
//    - charge power  = min(charger_power_kw, vehicle_max_charge_power_kw);
//    - a session RESERVES its rated power for one slot, so the slot is feasible
//      only if the transformer still has that much headroom free  ->  per
//      (transformer, slot) the summed draw never exceeds capacity (the binding
//      constraint, see EV-103 below);
//    - per-station charger availability, per time slot.
//  If nothing is feasible (unreachable / grid saturated) the vehicle still gets
//  a best-effort row, but draws no grid load (it queues — estimated_wait_time).
//
//  Complexity: O(N log N) to order vehicles + O(N · M · S) to evaluate options
//  (N vehicles, M stations, S price slots). Deterministic: every comparison has
//  an explicit tie-break, so identical input always yields identical output.
//
//  Design note: greedy keeps this fast, readable, and deterministic. A provably
//  optimal joint assignment could be modelled as min-cost flow / ILP, but that
//  trades the clarity this project wants for marginal gain at our scale.
// =============================================================================

namespace {

// ---- Tunable modelling constants (the contract omits these, so we name them)
// ----
constexpr double KWH_PER_KM = 0.15; // EV consumption used for the range check
constexpr double WAIT_W =
    1.0; // weight of a station's wait time in "convenience"
constexpr double CONVENIENCE_TOL =
    2.0; // minutes: stations this close tie -> cost decides
constexpr double MIN_POWER =
    0.5; // kW: below this a charger can't meaningfully charge
constexpr double EPS = 1e-9;

// One scored way to serve a vehicle: plug into `station_idx` at `slot`.
struct Candidate {
  int station_idx = -1;
  int slot = -1;
  double power_kw = 0.0; // rated charge power reserved on the transformer
  double convenience =
      0.0;               // travel + wait (+ fleet onward leg); lower is better
  double cost = 0.0;     // est_cost = kWh * slot price; lower is better
  bool feasible = false; // passed the reachability / charger / grid / time gate
};

// Tiered preference (CONVENIENCE -> COST -> deterministic tie-break). TIME is
// already enforced as a gate before a Candidate is ever marked feasible.
// Returns true iff `a` is strictly preferred over `b`.
bool better(const Candidate &a, const Candidate &b) {
  if (std::fabs(a.convenience - b.convenience) > CONVENIENCE_TOL)
    return a.convenience < b.convenience; // clearly closer/quieter wins
  if (std::fabs(a.cost - b.cost) > EPS)
    return a.cost < b.cost; // else cheapest slot wins
  if (a.slot != b.slot)
    return a.slot < b.slot;             // else earliest slot
  return a.station_idx < b.station_idx; // final stable tie-break
}

double round2(double x) { return std::round(x * 100.0) / 100.0; }

} // namespace

std::vector<Assignment> solve(const std::vector<Vehicle> &vehicles,
                              const std::vector<Station> &stations,
                              const std::vector<Transformer> &transformers,
                              const std::vector<RouteInfo> &routes,
                              const std::vector<Forecast> &forecasts) {
  const int N = static_cast<int>(vehicles.size());
  const int M = static_cast<int>(stations.size());
  const int T = static_cast<int>(transformers.size());
  if (N == 0 || M == 0)
    return {};

  // ---- O(1) lookups -------------------------------------------------------
  std::unordered_map<std::string, const Forecast *> forecastByStation;
  for (const auto &f : forecasts)
    forecastByStation[f.station_id] = &f;

  std::unordered_map<std::string, const RouteInfo *>
      routeByPair; // "veh|stn" -> route
  routeByPair.reserve(routes.size() * 2);
  for (const auto &r : routes)
    routeByPair[r.vehicle_id + '|' + r.station_id] = &r;

  std::unordered_map<std::string, int> txIndex; // transformer_id -> row
  for (int t = 0; t < T; ++t)
    txIndex[transformers[t].transformer_id] = t;

  std::vector<int> stationTx(M, -1); // station -> transformer row
  for (int s = 0; s < M; ++s) {
    auto it = txIndex.find(stations[s].transformer_id);
    if (it != txIndex.end())
      stationTx[s] = it->second;
  }

  // ---- Time horizon -> number of price slots S ----------------------------
  int S = 1, horizonMins = 0;
  for (const auto &f : forecasts) {
    S = std::max(S, static_cast<int>(f.future_price_per_kwh.size()));
    horizonMins = std::max(horizonMins, f.horizon_mins);
  }
  if (horizonMins <= 0)
    horizonMins = S * 30; // sane fallback
  const double slotMinutes = static_cast<double>(horizonMins) / S;

  auto priceAt = [&](const std::string &sid, int slot) -> double {
    auto it = forecastByStation.find(sid);
    if (it == forecastByStation.end())
      return 0.0; // no forecast known
    const Forecast &f = *it->second;
    if (slot < static_cast<int>(f.future_price_per_kwh.size()))
      return f.future_price_per_kwh[slot];
    if (!f.future_price_per_kwh.empty())
      return f.future_price_per_kwh.back();
    return f.current_price_per_kwh;
  };

  // ---- Mutable grid state, tracked per time slot --------------------------
  std::vector<std::vector<double>> headroomKw(T, std::vector<double>(S, 0.0));
  for (int t = 0; t < T; ++t) {
    double h = transformers[t].transformer_capacity_kw -
               transformers[t].current_transformer_load_kw;
    std::fill(headroomKw[t].begin(), headroomKw[t].end(), std::max(0.0, h));
  }
  std::vector<std::vector<int>> freeChargers(M, std::vector<int>(S, 0));
  for (int s = 0; s < M; ++s)
    std::fill(freeChargers[s].begin(), freeChargers[s].end(),
              std::max(0, stations[s].available_chargers));

  // ---- Urgency: serve the most desperate vehicle first (max-heap) ---------
  auto urgency = [&](int i) {
    const Vehicle &v = vehicles[i];
    double score = 100.0 - v.current_battery_percent; // emptier => more urgent
    if (!v.vehicle_destination_deadline.empty())
      score += 1000.0; // fleet deadline => top priority
    return score;
  };
  auto lessUrgent = [&](int a, int b) { // max-heap pops most urgent
    double ua = urgency(a), ub = urgency(b);
    if (std::fabs(ua - ub) > EPS)
      return ua < ub;
    return vehicles[a].vehicle_id >
           vehicles[b].vehicle_id; // smaller id served first
  };
  std::priority_queue<int, std::vector<int>, decltype(lessUrgent)> pq(
      lessUrgent);
  for (int i = 0; i < N; ++i)
    pq.push(i);

  // ---- Assign, committing grid load as we go ------------------------------
  std::vector<Assignment> result(N); // indexed by input order
  while (!pq.empty()) {
    const int vi = pq.top();
    pq.pop();
    const Vehicle &v = vehicles[vi];

    const double kwhNeeded =
        std::max(0.0, (v.target_battery_percent - v.current_battery_percent) /
                          100.0 * v.battery_capacity_kwh);
    const double currentEnergy =
        v.current_battery_percent / 100.0 * v.battery_capacity_kwh;
    const bool needsCharge = kwhNeeded > EPS;

    Candidate best; // best feasible option
    Candidate fallback;
    double fbScore = 0;
    bool haveFb = false; // least-bad option

    for (int s = 0; s < M; ++s) {
      const Station &st = stations[s];
      const int tx = stationTx[s];
      auto rit = routeByPair.find(v.vehicle_id + '|' + st.station_id);
      const RouteInfo *rt = (rit == routeByPair.end()) ? nullptr : rit->second;

      const double travelTime =
          rt ? rt->travel_time_to_station : 1e6; // unknown => far
      const double travelDist = rt ? rt->travel_distance_to_station : 1e6;
      const bool reachable =
          rt && currentEnergy + EPS >= travelDist * KWH_PER_KM;

      // Convenience is a station-level quantity (identical across slots).
      double convenience = travelTime + WAIT_W * st.estimated_wait_time;
      if (rt &&
          !std::isnan(
              rt->travel_time_from_station_to_destination)) // fleet onward leg
        convenience += rt->travel_time_from_station_to_destination;

      const double basePower =
          std::min(st.charger_power_kw, v.vehicle_max_charge_power_kw);

      for (int slot = 0; slot < S; ++slot) {
        const double headroom = (tx >= 0) ? headroomKw[tx][slot] : basePower;
        const double cost = kwhNeeded * priceAt(st.station_id, slot);

        Candidate c;
        c.station_idx = s;
        c.slot = slot;
        c.power_kw = basePower;
        c.convenience = convenience;
        c.cost = cost;

        // Best-effort ledger: prefer reachable, then more grid room, then
        // cheaper, then closer. Guarantees every vehicle gets a row.
        double score = (reachable ? 0.0 : 1e9) - headroom + 1e-3 * cost +
                       1e-3 * convenience;
        if (!haveFb || score < fbScore) {
          fbScore = score;
          fallback = c;
          haveFb = true;
        }

        // ---- TIME gate: only truly servable options become "feasible" ----
        if (!reachable)
          continue;
        if (needsCharge) {
          if (basePower < MIN_POWER)
            continue; // can't deliver power
          if (freeChargers[s][slot] < 1)
            continue; // every charger busy
          if (headroom + EPS < basePower)
            continue; // grid can't fit rated draw
          const double finishMin =
              slot * slotMinutes + (kwhNeeded / basePower) * 60.0;
          if (finishMin > horizonMins + EPS)
            continue; // can't finish in time
        }
        c.feasible = true;
        if (!best.feasible || better(c, best))
          best = c;
      }
    }

    const Candidate chosen = best.feasible ? best : fallback;

    // Commit grid load only for a genuinely feasible charge. A best-effort
    // fallback draws nothing now (it queues), so the grid is never overloaded.
    if (needsCharge && chosen.feasible) {
      const int s = chosen.station_idx, tx = stationTx[s];
      if (tx >= 0)
        headroomKw[tx][chosen.slot] -=
            chosen.power_kw; // <= headroom by the gate
      if (freeChargers[s][chosen.slot] > 0)
        freeChargers[s][chosen.slot] -= 1;
    }

    result[vi] =
        Assignment{v.vehicle_id, stations[chosen.station_idx].station_id,
                   chosen.slot < 0 ? 0 : chosen.slot, round2(chosen.cost)};
  }

  return result;
}
