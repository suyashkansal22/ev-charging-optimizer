import { Fragment } from "react";
import { CircleMarker, Polyline, Popup, Tooltip } from "react-leaflet";
import { batteryColor } from "../services/dashboardUtils";
import type { Station, Vehicle } from "../types";

type VehicleMarkerProps = {
  vehicle: Vehicle;
  station?: Station;
};

export function VehicleMarker({ vehicle, station }: VehicleMarkerProps) {
  const color = batteryColor(vehicle.current_battery_percent);
  const vehiclePosition: [number, number] = [vehicle.vehicle_latitude, vehicle.vehicle_longitude];
  const stationPosition: [number, number] | undefined = station
    ? [station.station_latitude, station.station_longitude]
    : undefined;
  const routePositions: [number, number][] | undefined = stationPosition
    ? [vehiclePosition, stationPosition]
    : undefined;

  return (
    <Fragment>
      {routePositions ? (
        <Polyline
          positions={routePositions}
          pathOptions={{ color, dashArray: "7 9", opacity: 0.65, weight: 2 }}
        />
      ) : null}
      <CircleMarker
        center={vehiclePosition}
        radius={9}
        pathOptions={{
          color: "#0f172a",
          fillColor: color,
          fillOpacity: 0.95,
          weight: 2
        }}
      >
        <Tooltip direction="top" offset={[0, -8]}>
          {vehicle.vehicle_id} - {Math.round(vehicle.current_battery_percent)}%
        </Tooltip>
        <Popup>
          <div className="min-w-44">
            <div className="font-semibold">{vehicle.vehicle_id}</div>
            <div>{Math.round(vehicle.current_battery_percent)}% current battery</div>
            <div>{vehicle.target_battery_percent}% target battery</div>
            <div>{vehicle.battery_capacity_kwh} kWh capacity</div>
            <div>{vehicle.vehicle_max_charge_power_kw} kW max charge</div>
          </div>
        </Popup>
      </CircleMarker>
    </Fragment>
  );
}
