import {
  BatteryCharging,
  Car,
  Clock,
  Gauge,
  PlugZap,
  Route,
  X
} from "lucide-react";
import { batteryColor, formatCurrency, stationColor } from "../services/dashboardUtils";
import type { Assignment, RouteInfo, Station, Vehicle } from "../types";

export type SelectedMapItem =
  | { type: "vehicle"; vehicle_id: string }
  | { type: "station"; station_id: string };

type InfoDrawerProps = {
  selectedItem: SelectedMapItem | null;
  vehicles: Vehicle[];
  stations: Station[];
  assignments: Assignment[];
  routes: RouteInfo[];
  onClose: () => void;
};

function DetailCard({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/60">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
      {detail ? <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div> : null}
    </div>
  );
}

function StatusBadge({ color, label }: { color: string; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
      style={{ boxShadow: `inset 4px 0 0 ${color}` }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function VehicleDrawer({
  vehicle,
  station,
  assignment,
  route
}: {
  vehicle: Vehicle;
  station?: Station;
  assignment?: Assignment;
  route?: RouteInfo;
}) {
  const color = batteryColor(vehicle.current_battery_percent);
  const batteryStatus =
    vehicle.current_battery_percent < 30
      ? "Low battery"
      : vehicle.current_battery_percent <= 70
        ? "Charging recommended"
        : "Healthy battery";

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ backgroundColor: color }}>
            <Car size={23} aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-slate-950">{vehicle.vehicle_id}</h2>
          <p className="mt-1 text-sm text-slate-500">Live vehicle telemetry and assignment</p>
        </div>
        <StatusBadge color={color} label={batteryStatus} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <DetailCard
          label="Battery"
          value={`${Math.round(vehicle.current_battery_percent)}%`}
          detail={`${vehicle.target_battery_percent}% target`}
        />
        <DetailCard
          label="Capacity"
          value={`${vehicle.battery_capacity_kwh} kWh`}
          detail={`${vehicle.vehicle_max_charge_power_kw} kW max charge`}
        />
        <DetailCard
          label="Assigned Station"
          value={assignment?.station_id ?? "Pending"}
          detail={station ? `${station.available_chargers}/${station.number_of_chargers} chargers open` : "No station assigned"}
        />
        <DetailCard
          label="Route"
          value={route ? `${route.travel_distance_to_station} km` : "Pending"}
          detail={route ? `${route.travel_time_to_station} min travel time` : "Route pending"}
        />
      </div>

      <div className="mt-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/60">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <PlugZap size={16} className="text-blue-600" aria-hidden="true" />
          Assignment
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-slate-500">Slot</div>
            <div className="font-semibold text-slate-900">{assignment ? assignment.time_slot : "n/a"}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Cost</div>
            <div className="font-semibold text-slate-900">
              {assignment ? formatCurrency(assignment.est_cost) : "n/a"}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Wait</div>
            <div className="font-semibold text-slate-900">
              {station ? `${station.estimated_wait_time} min` : "n/a"}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function StationDrawer({
  station,
  assignments,
  routes
}: {
  station: Station;
  assignments: Assignment[];
  routes: RouteInfo[];
}) {
  const color = stationColor(station);
  const busyPercent = Math.round((1 - station.available_chargers / station.number_of_chargers) * 100);
  const loadStatus = busyPercent > 82 || station.queue_length >= 5 ? "High load" : busyPercent > 58 ? "Moderate load" : "Low load";

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ backgroundColor: color }}>
            <PlugZap size={23} aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-slate-950">{station.station_id}</h2>
          <p className="mt-1 text-sm text-slate-500">Charging station load and assignment queue</p>
        </div>
        <StatusBadge color={color} label={loadStatus} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <DetailCard
          label="Chargers"
          value={`${station.available_chargers}/${station.number_of_chargers}`}
          detail="Currently available"
        />
        <DetailCard
          label="Power"
          value={`${station.charger_power_kw} kW`}
          detail="Charger output"
        />
        <DetailCard
          label="Wait Time"
          value={`${station.estimated_wait_time} min`}
          detail={`${station.queue_length} vehicles queued`}
        />
        <DetailCard
          label="Transformer"
          value={station.transformer_id}
          detail={`${busyPercent}% station utilization`}
        />
      </div>

      <div className="mt-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/60">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <Gauge size={16} className="text-blue-600" aria-hidden="true" />
          Assigned Vehicles
        </div>
        <div className="mt-3 space-y-2">
          {assignments.length > 0 ? (
            assignments.map((assignment) => {
              const route = routes.find(
                (item) =>
                  item.vehicle_id === assignment.vehicle_id && item.station_id === assignment.station_id
              );

              return (
                <div
                  key={`${assignment.vehicle_id}-${assignment.station_id}`}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{assignment.vehicle_id}</div>
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Route size={12} aria-hidden="true" />
                      {route ? `${route.travel_distance_to_station} km - ${route.travel_time_to_station} min` : "Route pending"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-slate-900">{formatCurrency(assignment.est_cost)}</div>
                    <div className="text-xs text-slate-500">slot {assignment.time_slot}</div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
              No active assignments
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function InfoDrawer({
  selectedItem,
  vehicles,
  stations,
  assignments,
  routes,
  onClose
}: InfoDrawerProps) {
  const vehicle =
    selectedItem?.type === "vehicle"
      ? vehicles.find((item) => item.vehicle_id === selectedItem.vehicle_id)
      : undefined;
  const station =
    selectedItem?.type === "station"
      ? stations.find((item) => item.station_id === selectedItem.station_id)
      : undefined;
  const vehicleAssignment = vehicle
    ? assignments.find((item) => item.vehicle_id === vehicle.vehicle_id)
    : undefined;
  const assignedStation = vehicleAssignment
    ? stations.find((item) => item.station_id === vehicleAssignment.station_id)
    : undefined;
  const vehicleRoute = vehicleAssignment
    ? routes.find(
        (item) =>
          item.vehicle_id === vehicleAssignment.vehicle_id &&
          item.station_id === vehicleAssignment.station_id
      )
    : undefined;
  const stationAssignments = station
    ? assignments.filter((item) => item.station_id === station.station_id)
    : [];

  return (
    <aside
      className={`absolute right-4 top-[13rem] z-[1000] flex max-h-[calc(100vh-14rem)] w-[390px] flex-col overflow-hidden rounded-2xl border border-white/80 bg-slate-50/95 shadow-panel backdrop-blur transition-all duration-300 ${
        selectedItem ? "translate-x-0 opacity-100" : "translate-x-[calc(100%+2rem)] opacity-0"
      }`}
      aria-hidden={!selectedItem}
    >
      <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {selectedItem?.type === "vehicle" ? (
            <BatteryCharging size={17} className="text-blue-600" aria-hidden="true" />
          ) : (
            <Clock size={17} className="text-blue-600" aria-hidden="true" />
          )}
          Live Details
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          aria-label="Close details"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {vehicle ? (
          <VehicleDrawer
            vehicle={vehicle}
            station={assignedStation}
            assignment={vehicleAssignment}
            route={vehicleRoute}
          />
        ) : null}
        {station ? (
          <StationDrawer station={station} assignments={stationAssignments} routes={routes} />
        ) : null}
      </div>
    </aside>
  );
}
