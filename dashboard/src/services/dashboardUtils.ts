import type { Assignment, Station, Vehicle } from "../types";

export const mapCenter: [number, number] = [30.733, 76.779];

export function batteryColor(current_battery_percent: number) {
  if (current_battery_percent < 25) return "#ef4444";
  if (current_battery_percent < 50) return "#f59e0b";
  if (current_battery_percent < 75) return "#38bdf8";
  return "#22c55e";
}

export function stationColor(station: Station) {
  const busyRatio = 1 - station.available_chargers / station.number_of_chargers;
  if (busyRatio > 0.82 || station.queue_length >= 5) return "#ef4444";
  if (busyRatio > 0.58 || station.queue_length >= 3) return "#f59e0b";
  return "#10b981";
}

export function formatCurrency(value: number) {
  return `Rs ${value.toFixed(1)}`;
}

export function moveVehicles(vehicles: Vehicle[], assignments: Assignment[], stations: Station[]) {
  return vehicles.map((vehicle) => {
    const assignment = assignments.find((item) => item.vehicle_id === vehicle.vehicle_id);
    const station = stations.find((item) => item.station_id === assignment?.station_id);

    if (!station) return vehicle;

    const latDelta = station.station_latitude - vehicle.vehicle_latitude;
    const lngDelta = station.station_longitude - vehicle.vehicle_longitude;
    const nearStation = Math.abs(latDelta) + Math.abs(lngDelta) < 0.0009;

    if (nearStation) {
      return {
        ...vehicle,
        current_battery_percent: Math.min(vehicle.target_battery_percent, vehicle.current_battery_percent + 2)
      };
    }

    return {
      ...vehicle,
      vehicle_latitude: vehicle.vehicle_latitude + latDelta * 0.14,
      vehicle_longitude: vehicle.vehicle_longitude + lngDelta * 0.14,
      current_battery_percent: Math.max(4, vehicle.current_battery_percent - 0.5)
    };
  });
}
