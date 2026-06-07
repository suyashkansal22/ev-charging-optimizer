#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include "optimizer.hpp"
namespace py = pybind11;

PYBIND11_MODULE(ev_engine, m) {
    py::class_<Vehicle>(m, "Vehicle").def(py::init<>());
    py::class_<Station>(m, "Station").def(py::init<>());
    py::class_<Transformer>(m, "Transformer").def(py::init<>());
    py::class_<RouteInfo>(m, "RouteInfo").def(py::init<>());
    py::class_<Forecast>(m, "Forecast").def(py::init<>());
    m.def("solve", &solve,
          "Optimal vehicle -> station/time-slot assignment "
          "(vehicles, stations, transformers, routes, forecasts)");
}
