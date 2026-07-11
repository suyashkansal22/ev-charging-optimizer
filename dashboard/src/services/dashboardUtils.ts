import type { Assignment, Station, Vehicle } from "../types";

export const mapCenter: [number, number] = [30.733, 76.779];

type RoutePoint = {
  latitude: number;
  longitude: number;
};

type CachedRoute = {
  points: RoutePoint[];
  pointIndex: number;
};

const osrmBaseUrl = "https://router.project-osrm.org/route/v1/driving";
const routeCache: Record<string, CachedRoute> = {};
const routeRequests: Record<string, Promise<RoutePoint[]>> = {};

export function resetVehicleRouteCache() {
  Object.keys(routeCache).forEach((key) => {
    delete routeCache[key];
  });
  Object.keys(routeRequests).forEach((key) => {
    delete routeRequests[key];
  });
}

export function batteryColor(current_battery_percent: number) {
  if (current_battery_percent < 30) return "#ef4444";
  if (current_battery_percent <= 70) return "#f59e0b";
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

function routeKey(vehicle_id: string, station_id: string) {
  return `${vehicle_id}:${station_id}`;
}

function distanceBetween(first: RoutePoint, second: RoutePoint) {
  return Math.hypot(first.latitude - second.latitude, first.longitude - second.longitude);
}

function currentVehiclePoint(vehicle: Vehicle): RoutePoint {
  return {
    latitude: vehicle.vehicle_latitude,
    longitude: vehicle.vehicle_longitude
  };
}

function stationPoint(station: Station): RoutePoint {
  return {
    latitude: station.station_latitude,
    longitude: station.station_longitude
  };
}

function latLngPosition(point: RoutePoint): [number, number] {
  return [point.latitude, point.longitude];
}

export function cachedRoutePositions(vehicle: Vehicle, station: Station): [number, number][] | undefined {
  const route = routeCache[routeKey(vehicle.vehicle_id, station.station_id)];

  if (!route || route.points.length === 0) {
    return undefined;
  }

  const currentPosition = currentVehiclePoint(vehicle);
  const stationPosition = stationPoint(station);
  const positions: [number, number][] = [
    latLngPosition(currentPosition),
    ...route.points.slice(route.pointIndex).map(latLngPosition)
  ];
  const lastPosition = positions[positions.length - 1];

  if (
    lastPosition &&
    distanceBetween(
      { latitude: lastPosition[0], longitude: lastPosition[1] },
      stationPosition
    ) > 0.00001
  ) {
    positions.push(latLngPosition(stationPosition));
  }

  return positions;
}

async function fetchOsrmRoute(vehicle: Vehicle, station: Station) {
  const coordinates = `${vehicle.vehicle_longitude},${vehicle.vehicle_latitude};${station.station_longitude},${station.station_latitude}`;
  const routeUrl = `${osrmBaseUrl}/${coordinates}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(routeUrl);

    if (!response.ok) {
      throw new Error(`OSRM route request failed with ${response.status}`);
    }

    const data = (await response.json()) as {
      routes?: Array<{
        geometry?: {
          coordinates?: Array<[number, number]>;
        };
      }>;
    };

    const coordinatesFromRoute = data.routes?.[0]?.geometry?.coordinates ?? [];
    const roadPoints = coordinatesFromRoute.map(([longitude, latitude]) => ({
      latitude,
      longitude
    }));

    if (roadPoints.length > 0) {
      return roadPoints;
    }
  } catch (error) {
    console.warn("Falling back to direct vehicle route because OSRM routing failed.", error);
  }

  return [currentVehiclePoint(vehicle), stationPoint(station)];
}

async function routeForAssignment(vehicle: Vehicle, station: Station) {
  const key = routeKey(vehicle.vehicle_id, station.station_id);

  if (routeCache[key]) {
    return routeCache[key];
  }

  routeRequests[key] ??= fetchOsrmRoute(vehicle, station);
  const points = await routeRequests[key];
  routeCache[key] = {
    points,
    pointIndex: 0
  };
  delete routeRequests[key];

  return routeCache[key];
}

function advanceRoutePoint(route: CachedRoute, vehicle: Vehicle) {
  const currentPosition = currentVehiclePoint(vehicle);

  while (
    route.pointIndex < route.points.length - 1 &&
    distanceBetween(currentPosition, route.points[route.pointIndex]) < 0.0002
  ) {
    route.pointIndex += 1;
  }
}

export async function moveVehicles(vehicles: Vehicle[], assignments: Assignment[], stations: Station[]) {
  return Promise.all(
    vehicles.map(async (vehicle) => {
      const assignment = assignments.find((item) => item.vehicle_id === vehicle.vehicle_id);
      const station = stations.find((item) => item.station_id === assignment?.station_id);

      if (!station) return vehicle;

      const route = await routeForAssignment(vehicle, station);
      advanceRoutePoint(route, vehicle);

      const targetPoint = route.points[route.pointIndex] ?? stationPoint(station);
      const hasReachedLastRoadPoint =
        route.pointIndex >= route.points.length - 1 &&
        distanceBetween(currentVehiclePoint(vehicle), targetPoint) < 0.0002;
      const movementTarget = hasReachedLastRoadPoint ? stationPoint(station) : targetPoint;
      const latDelta = movementTarget.latitude - vehicle.vehicle_latitude;
      const lngDelta = movementTarget.longitude - vehicle.vehicle_longitude;
      const nearStation =
        Math.abs(station.station_latitude - vehicle.vehicle_latitude) +
          Math.abs(station.station_longitude - vehicle.vehicle_longitude) <
        0.0009;
      const nearRoutePoint = Math.abs(latDelta) + Math.abs(lngDelta) < 0.0002;

      if (nearStation) {
        return {
          ...vehicle,
          current_battery_percent: Math.min(vehicle.target_battery_percent, vehicle.current_battery_percent + 2)
        };
      }

      return {
        ...vehicle,
        vehicle_latitude: nearRoutePoint ? movementTarget.latitude : vehicle.vehicle_latitude + latDelta * 0.35,
        vehicle_longitude: nearRoutePoint ? movementTarget.longitude : vehicle.vehicle_longitude + lngDelta * 0.35,
        current_battery_percent: Math.max(4, vehicle.current_battery_percent - 0.5)
      };
    })
  );
}
