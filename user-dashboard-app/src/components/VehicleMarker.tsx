import { Fragment } from "react";
import { Marker, Polyline, Tooltip } from "react-leaflet";
import { batteryColor, cachedRoutePositions } from "../services/dashboardUtils";
import { createVehicleIcon } from "../services/markerIcons";
import type { Station, Vehicle } from "../types";

type VehicleMarkerProps = {
  vehicle: Vehicle;
  station?: Station;
  onSelect: (vehicle: Vehicle) => void;
  isDimmed?: boolean;
  isSelected?: boolean;
  isRouteSelected?: boolean;
};

export function VehicleMarker({
  vehicle,
  station,
  onSelect,
  isDimmed = false,
  isSelected = false,
  isRouteSelected = false
}: VehicleMarkerProps) {
  const vehicleIcon = createVehicleIcon(
    batteryColor(vehicle.current_battery_percent),
    { isDimmed, isSelected }
  );
  const vehiclePosition: [number, number] = [vehicle.vehicle_latitude, vehicle.vehicle_longitude];
  const routePositions = station ? cachedRoutePositions(vehicle, station) : undefined;

  return (
    <Fragment>
      {routePositions ? (
        <>
          <Polyline
            positions={routePositions}
            pathOptions={{
              color: "#93c5fd",
              lineCap: "round",
              lineJoin: "round",
              opacity: isRouteSelected ? 0.38 : 0.14,
              weight: isRouteSelected ? 14 : 10
            }}
          />
          <Polyline
            positions={routePositions}
            pathOptions={{
              color: "#3b82f6",
              lineCap: "round",
              lineJoin: "round",
              opacity: isRouteSelected ? 1 : 0.45,
              weight: isRouteSelected ? 6 : 5
            }}
          />
          {isRouteSelected ? (
            <Polyline
              positions={routePositions}
              pathOptions={{
                className: "assignment-route-flow",
                color: "#dbeafe",
                dashArray: "1 16",
                lineCap: "round",
                lineJoin: "round",
                opacity: 0.95,
                weight: 3
              }}
            />
          ) : null}
        </>
      ) : null}
      <Marker
        position={vehiclePosition}
        icon={vehicleIcon}
        eventHandlers={{
          click: (event) => {
            event.originalEvent.stopPropagation();
            onSelect(vehicle);
          }
        }}
      >
        <Tooltip direction="top" offset={[0, -8]}>
          {vehicle.vehicle_id} - {Math.round(vehicle.current_battery_percent)}%
        </Tooltip>
      </Marker>
    </Fragment>
  );
}
