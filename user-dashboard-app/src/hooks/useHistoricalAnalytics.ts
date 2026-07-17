import { useEffect, useRef, useState } from "react";
import type { Assignment, Station, Vehicle } from "../types";

export type BatteryTrendPoint = {
  simulationSeconds: number;
  averageBatteryPercent: number;
};

export type HistoricalAnalytics = {
  completedSessions: number;
  averageWaitTime: number;
  chargerUtilizationPercent: number;
  totalEnergyDeliveredKwh: number;
  batteryTrend: BatteryTrendPoint[];
};

type UseHistoricalAnalyticsArgs = {
  vehicles: Vehicle[];
  stations: Station[];
  assignments: Assignment[];
  simulationSeconds: number;
};

function averageBatteryPercent(vehicles: Vehicle[]) {
  if (vehicles.length === 0) return 0;

  return vehicles.reduce((sum, vehicle) => sum + vehicle.current_battery_percent, 0) / vehicles.length;
}

function averageWaitTime(stations: Station[]) {
  if (stations.length === 0) return 0;

  return stations.reduce((sum, station) => sum + station.estimated_wait_time, 0) / stations.length;
}

function chargerUtilizationPercent(stations: Station[]) {
  const totalChargers = stations.reduce((sum, station) => sum + station.number_of_chargers, 0);
  const availableChargers = stations.reduce((sum, station) => sum + station.available_chargers, 0);

  if (totalChargers === 0) return 0;

  return ((totalChargers - availableChargers) / totalChargers) * 100;
}

function isVehicleAtAssignedStation(vehicle: Vehicle, stations: Station[], assignments: Assignment[]) {
  const assignment = assignments.find((item) => item.vehicle_id === vehicle.vehicle_id);
  const station = stations.find((item) => item.station_id === assignment?.station_id);

  if (!station) return false;

  return (
    Math.abs(station.station_latitude - vehicle.vehicle_latitude) +
      Math.abs(station.station_longitude - vehicle.vehicle_longitude) <
    0.0009
  );
}

function initialAnalytics(vehicles: Vehicle[], stations: Station[]): HistoricalAnalytics {
  return {
    completedSessions: 0,
    averageWaitTime: averageWaitTime(stations),
    chargerUtilizationPercent: chargerUtilizationPercent(stations),
    totalEnergyDeliveredKwh: 0,
    batteryTrend: [
      {
        simulationSeconds: 0,
        averageBatteryPercent: averageBatteryPercent(vehicles)
      }
    ]
  };
}

export function useHistoricalAnalytics({
  vehicles,
  stations,
  assignments,
  simulationSeconds
}: UseHistoricalAnalyticsArgs) {
  const [analytics, setAnalytics] = useState<HistoricalAnalytics>(() =>
    initialAnalytics(vehicles, stations)
  );
  const previousVehicles = useRef<Vehicle[]>(vehicles);
  const previousSimulationSeconds = useRef(simulationSeconds);
  const completedVehicleIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (simulationSeconds < previousSimulationSeconds.current) {
      previousVehicles.current = vehicles;
      previousSimulationSeconds.current = simulationSeconds;
      completedVehicleIds.current.clear();
      setAnalytics(initialAnalytics(vehicles, stations));
      return;
    }

    if (vehicles === previousVehicles.current && simulationSeconds === previousSimulationSeconds.current) {
      return;
    }

    if (vehicles === previousVehicles.current) {
      return;
    }

    let deliveredThisTick = 0;
    let completedThisTick = 0;

    vehicles.forEach((vehicle) => {
      const previousVehicle = previousVehicles.current.find(
        (item) => item.vehicle_id === vehicle.vehicle_id
      );

      if (previousVehicle && vehicle.current_battery_percent > previousVehicle.current_battery_percent) {
        const batteryGainPercent = vehicle.current_battery_percent - previousVehicle.current_battery_percent;
        deliveredThisTick += (batteryGainPercent / 100) * vehicle.battery_capacity_kwh;
      }

      const crossedTarget =
        previousVehicle &&
        previousVehicle.current_battery_percent < vehicle.target_battery_percent &&
        vehicle.current_battery_percent >= vehicle.target_battery_percent;

      if (
        crossedTarget &&
        isVehicleAtAssignedStation(vehicle, stations, assignments) &&
        !completedVehicleIds.current.has(vehicle.vehicle_id)
      ) {
        completedVehicleIds.current.add(vehicle.vehicle_id);
        completedThisTick += 1;
      }
    });

    setAnalytics((currentAnalytics) => ({
      completedSessions: currentAnalytics.completedSessions + completedThisTick,
      averageWaitTime: averageWaitTime(stations),
      chargerUtilizationPercent: chargerUtilizationPercent(stations),
      totalEnergyDeliveredKwh: currentAnalytics.totalEnergyDeliveredKwh + deliveredThisTick,
      batteryTrend: [
        ...currentAnalytics.batteryTrend,
        {
          simulationSeconds,
          averageBatteryPercent: averageBatteryPercent(vehicles)
        }
      ].slice(-40)
    }));

    previousVehicles.current = vehicles;
    previousSimulationSeconds.current = simulationSeconds;
  }, [assignments, simulationSeconds, stations, vehicles]);

  return analytics;
}
