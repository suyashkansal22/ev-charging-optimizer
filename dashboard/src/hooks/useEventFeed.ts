import { useEffect, useRef, useState } from "react";
import type { Assignment, Station, Vehicle } from "../types";

export type EventFeedItem = {
  id: string;
  type: "assignment" | "arrival" | "charging" | "complete" | "queue";
  title: string;
  description: string;
  timeLabel: string;
  tone: "blue" | "green" | "orange";
};

type UseEventFeedArgs = {
  vehicles: Vehicle[];
  stations: Station[];
  assignments: Assignment[];
  simulationSeconds: number;
};

function formatSimulationTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `T+${minutes}:${String(seconds).padStart(2, "0")}`;
}

function isVehicleAtStation(vehicle: Vehicle, station: Station) {
  return (
    Math.abs(station.station_latitude - vehicle.vehicle_latitude) +
      Math.abs(station.station_longitude - vehicle.vehicle_longitude) <
    0.0009
  );
}

function vehicleById(vehicles: Vehicle[], vehicle_id: string) {
  return vehicles.find((vehicle) => vehicle.vehicle_id === vehicle_id);
}

function stationById(stations: Station[], station_id: string) {
  return stations.find((station) => station.station_id === station_id);
}

export function useEventFeed({
  vehicles,
  stations,
  assignments,
  simulationSeconds
}: UseEventFeedArgs) {
  const [events, setEvents] = useState<EventFeedItem[]>([]);
  const eventSequence = useRef(0);
  const loggedAssignments = useRef<Set<string>>(new Set());
  const loggedQueueSnapshots = useRef<Set<string>>(new Set());
  const arrivedVehicles = useRef<Set<string>>(new Set());
  const chargingVehicles = useRef<Set<string>>(new Set());
  const completedVehicles = useRef<Set<string>>(new Set());
  const previousStations = useRef<Station[]>(stations);
  const previousVehicles = useRef<Vehicle[]>(vehicles);

  useEffect(() => {
    const timeLabel = formatSimulationTime(simulationSeconds);
    const nextEvents: EventFeedItem[] = [];

    const createEvent = (event: Omit<EventFeedItem, "id" | "timeLabel">) => {
      eventSequence.current += 1;
      nextEvents.push({
        ...event,
        id: `${event.type}-${eventSequence.current}`,
        timeLabel
      });
    };

    assignments.forEach((assignment) => {
      const key = `${assignment.vehicle_id}:${assignment.station_id}`;

      if (!loggedAssignments.current.has(key)) {
        loggedAssignments.current.add(key);
        createEvent({
          type: "assignment",
          title: `${assignment.vehicle_id} assigned`,
          description: `Vehicle routed to ${assignment.station_id} in slot ${assignment.time_slot}.`,
          tone: "blue"
        });
      }
    });

    stations.forEach((station) => {
      if (!loggedQueueSnapshots.current.has(station.station_id)) {
        loggedQueueSnapshots.current.add(station.station_id);
        createEvent({
          type: "queue",
          title: `${station.station_id} queue observed`,
          description: `${station.queue_length} waiting, ${station.available_chargers}/${station.number_of_chargers} chargers open.`,
          tone: station.queue_length >= 3 ? "orange" : "green"
        });
      }
    });

    stations.forEach((station) => {
      const previousStation = previousStations.current.find(
        (item) => item.station_id === station.station_id
      );

      if (previousStation && previousStation.queue_length !== station.queue_length) {
        const change = station.queue_length - previousStation.queue_length;
        createEvent({
          type: "queue",
          title: `${station.station_id} queue ${change > 0 ? "increased" : "decreased"}`,
          description: `${Math.abs(change)} vehicle${Math.abs(change) === 1 ? "" : "s"} ${
            change > 0 ? "joined" : "cleared from"
          } the queue.`,
          tone: change > 0 ? "orange" : "green"
        });
      }
    });

    assignments.forEach((assignment) => {
      const vehicle = vehicleById(vehicles, assignment.vehicle_id);
      const station = stationById(stations, assignment.station_id);

      if (!vehicle || !station || !isVehicleAtStation(vehicle, station)) {
        return;
      }

      if (!arrivedVehicles.current.has(vehicle.vehicle_id)) {
        arrivedVehicles.current.add(vehicle.vehicle_id);
        createEvent({
          type: "arrival",
          title: `${vehicle.vehicle_id} reached ${station.station_id}`,
          description: `Arrived with ${Math.round(vehicle.current_battery_percent)}% battery.`,
          tone: "green"
        });
      }

      if (
        vehicle.current_battery_percent < vehicle.target_battery_percent &&
        !chargingVehicles.current.has(vehicle.vehicle_id)
      ) {
        chargingVehicles.current.add(vehicle.vehicle_id);
        createEvent({
          type: "charging",
          title: `${vehicle.vehicle_id} charging started`,
          description: `${station.charger_power_kw} kW charger active toward ${vehicle.target_battery_percent}%.`,
          tone: "blue"
        });
      }

      const previousVehicle = previousVehicles.current.find(
        (item) => item.vehicle_id === vehicle.vehicle_id
      );
      const crossedTarget =
        previousVehicle &&
        previousVehicle.current_battery_percent < vehicle.target_battery_percent &&
        vehicle.current_battery_percent >= vehicle.target_battery_percent;

      if (
        (crossedTarget || vehicle.current_battery_percent >= vehicle.target_battery_percent) &&
        !completedVehicles.current.has(vehicle.vehicle_id)
      ) {
        completedVehicles.current.add(vehicle.vehicle_id);
        createEvent({
          type: "complete",
          title: `${vehicle.vehicle_id} charging completed`,
          description: `Target battery ${vehicle.target_battery_percent}% reached at ${station.station_id}.`,
          tone: "green"
        });
      }
    });

    if (nextEvents.length > 0) {
      setEvents((currentEvents) => [...nextEvents.reverse(), ...currentEvents].slice(0, 20));
    }

    previousStations.current = stations;
    previousVehicles.current = vehicles;
  }, [assignments, simulationSeconds, stations, vehicles]);

  return events;
}
