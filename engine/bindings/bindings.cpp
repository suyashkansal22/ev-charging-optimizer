#include <pybind11/pybind11.h>
#include <pybind11/stl.h>      // marshals std::vector / std::optional <-> Python
#include "optimizer.hpp"
namespace py = pybind11;

// ---------------------------------------------------------------------------
// Goal: `import ev_engine as engine` must be a *drop-in* for engine_stub.
// engine_stub.solve takes the API's Pydantic models and returns list[dict].
// So we (a) register every input struct (Python can build them directly), and
// (b) expose a `solve` that duck-reads any object with the contract's attribute
// names (works for both ev_engine.* objects AND the API's Pydantic models) and
// returns list[dict] — keeping json.dumps()/FastAPI in main.py unchanged.
// ---------------------------------------------------------------------------

namespace {

// Required-field readers (the contract guarantees these names exist).
double      rd(const py::handle& o, const char* f) { return o.attr(f).cast<double>(); }
int         ri(const py::handle& o, const char* f) { return o.attr(f).cast<int>(); }
std::string rs(const py::handle& o, const char* f) { return o.attr(f).cast<std::string>(); }

// Optional fields: leave the struct's default (NAN / "") when Python sends None.
void setOpt(const py::handle& o, const char* f, double& dst) {
    py::object v = o.attr(f); if (!v.is_none()) dst = v.cast<double>();
}
void setOpt(const py::handle& o, const char* f, std::string& dst) {
    py::object v = o.attr(f); if (!v.is_none()) dst = v.cast<std::string>();
}

Vehicle toVehicle(const py::handle& o) {
    Vehicle v;
    v.vehicle_id                  = rs(o, "vehicle_id");
    v.vehicle_latitude            = rd(o, "vehicle_latitude");
    v.vehicle_longitude           = rd(o, "vehicle_longitude");
    v.current_battery_percent     = rd(o, "current_battery_percent");
    v.battery_capacity_kwh        = rd(o, "battery_capacity_kwh");
    v.vehicle_max_charge_power_kw = rd(o, "vehicle_max_charge_power_kw");
    v.target_battery_percent      = rd(o, "target_battery_percent");
    setOpt(o, "vehicle_destination_lat", v.vehicle_destination_lat);
    setOpt(o, "vehicle_destination_lng", v.vehicle_destination_lng);
    setOpt(o, "vehicle_destination_deadline", v.vehicle_destination_deadline);
    return v;
}
Station toStation(const py::handle& o) {
    Station s;
    s.station_id          = rs(o, "station_id");
    s.station_latitude    = rd(o, "station_latitude");
    s.station_longitude   = rd(o, "station_longitude");
    s.transformer_id      = rs(o, "transformer_id");
    s.number_of_chargers  = ri(o, "number_of_chargers");
    s.available_chargers  = ri(o, "available_chargers");
    s.charger_power_kw    = rd(o, "charger_power_kw");
    s.queue_length        = ri(o, "queue_length");
    s.estimated_wait_time = rd(o, "estimated_wait_time");
    return s;
}
Transformer toTransformer(const py::handle& o) {
    Transformer t;
    t.transformer_id              = rs(o, "transformer_id");
    t.transformer_capacity_kw     = rd(o, "transformer_capacity_kw");
    t.current_transformer_load_kw = rd(o, "current_transformer_load_kw");
    return t;
}
RouteInfo toRoute(const py::handle& o) {
    RouteInfo r;
    r.vehicle_id                 = rs(o, "vehicle_id");
    r.station_id                 = rs(o, "station_id");
    r.travel_distance_to_station = rd(o, "travel_distance_to_station");
    r.travel_time_to_station     = rd(o, "travel_time_to_station");
    setOpt(o, "travel_distance_from_station_to_destination",
           r.travel_distance_from_station_to_destination);
    setOpt(o, "travel_time_from_station_to_destination",
           r.travel_time_from_station_to_destination);
    return r;
}
Forecast toForecast(const py::handle& o) {
    Forecast f;
    f.station_id            = rs(o, "station_id");
    f.current_price_per_kwh = rd(o, "current_price_per_kwh");
    f.future_price_per_kwh  = o.attr("future_price_per_kwh").cast<std::vector<double>>();
    f.horizon_mins          = ri(o, "horizon_mins");
    return f;
}

template <class T, class F>
std::vector<T> collect(const py::iterable& seq, F conv) {
    std::vector<T> out;
    for (py::handle item : seq) out.push_back(conv(item));
    return out;
}

py::list solve_py(py::iterable vehicles, py::iterable stations, py::iterable transformers,
                  py::iterable routes, py::iterable forecasts) {
    auto result = solve(collect<Vehicle>(vehicles, toVehicle),
                        collect<Station>(stations, toStation),
                        collect<Transformer>(transformers, toTransformer),
                        collect<RouteInfo>(routes, toRoute),
                        collect<Forecast>(forecasts, toForecast));
    py::list out;
    for (const auto& a : result) {
        py::dict d;
        d["vehicle_id"] = a.vehicle_id;
        d["station_id"] = a.station_id;
        d["time_slot"] = a.time_slot;
        d["est_cost"]  = a.est_cost;
        out.append(d);
    }
    return out;
}

}  // namespace

PYBIND11_MODULE(ev_engine, m) {
    // Registered so callers can also build inputs natively (e.g. ev_engine.Vehicle()).
    py::class_<Vehicle>(m, "Vehicle").def(py::init<>())
        .def_readwrite("vehicle_id", &Vehicle::vehicle_id)
        .def_readwrite("vehicle_latitude", &Vehicle::vehicle_latitude)
        .def_readwrite("vehicle_longitude", &Vehicle::vehicle_longitude)
        .def_readwrite("current_battery_percent", &Vehicle::current_battery_percent)
        .def_readwrite("battery_capacity_kwh", &Vehicle::battery_capacity_kwh)
        .def_readwrite("vehicle_max_charge_power_kw", &Vehicle::vehicle_max_charge_power_kw)
        .def_readwrite("target_battery_percent", &Vehicle::target_battery_percent)
        .def_readwrite("vehicle_destination_lat", &Vehicle::vehicle_destination_lat)
        .def_readwrite("vehicle_destination_lng", &Vehicle::vehicle_destination_lng)
        .def_readwrite("vehicle_destination_deadline", &Vehicle::vehicle_destination_deadline);

    py::class_<Station>(m, "Station").def(py::init<>())
        .def_readwrite("station_id", &Station::station_id)
        .def_readwrite("station_latitude", &Station::station_latitude)
        .def_readwrite("station_longitude", &Station::station_longitude)
        .def_readwrite("transformer_id", &Station::transformer_id)
        .def_readwrite("number_of_chargers", &Station::number_of_chargers)
        .def_readwrite("available_chargers", &Station::available_chargers)
        .def_readwrite("charger_power_kw", &Station::charger_power_kw)
        .def_readwrite("queue_length", &Station::queue_length)
        .def_readwrite("estimated_wait_time", &Station::estimated_wait_time);

    py::class_<Transformer>(m, "Transformer").def(py::init<>())
        .def_readwrite("transformer_id", &Transformer::transformer_id)
        .def_readwrite("transformer_capacity_kw", &Transformer::transformer_capacity_kw)
        .def_readwrite("current_transformer_load_kw", &Transformer::current_transformer_load_kw);

    py::class_<RouteInfo>(m, "RouteInfo").def(py::init<>())
        .def_readwrite("vehicle_id", &RouteInfo::vehicle_id)
        .def_readwrite("station_id", &RouteInfo::station_id)
        .def_readwrite("travel_distance_to_station", &RouteInfo::travel_distance_to_station)
        .def_readwrite("travel_time_to_station", &RouteInfo::travel_time_to_station)
        .def_readwrite("travel_distance_from_station_to_destination",
                       &RouteInfo::travel_distance_from_station_to_destination)
        .def_readwrite("travel_time_from_station_to_destination",
                       &RouteInfo::travel_time_from_station_to_destination);

    py::class_<Forecast>(m, "Forecast").def(py::init<>())
        .def_readwrite("station_id", &Forecast::station_id)
        .def_readwrite("current_price_per_kwh", &Forecast::current_price_per_kwh)
        .def_readwrite("future_price_per_kwh", &Forecast::future_price_per_kwh)
        .def_readwrite("horizon_mins", &Forecast::horizon_mins);

    m.def("solve", &solve_py,
          py::arg("vehicles"), py::arg("stations"), py::arg("transformers"),
          py::arg("routes"), py::arg("forecasts"),
          "Optimal vehicle -> {station, time_slot} assignment. Returns list[dict] "
          "matching the Assignment contract (drop-in for engine_stub.solve).");
}
