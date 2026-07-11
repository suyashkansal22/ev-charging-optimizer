import { useEffect, useRef, useState } from "react";
import { moveVehicles, resetVehicleRouteCache } from "../services/dashboardUtils";
import type { Assignment, Station, Vehicle } from "../types";

export type SimulationSpeed = 1 | 2 | 5;

export function useVehicleSimulation(
  initialVehicles: Vehicle[],
  assignments: Assignment[],
  stations: Station[],
  isRunning = true,
  speed: SimulationSpeed = 1,
  resetKey = 0
) {
  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);
  const [simulationSeconds, setSimulationSeconds] = useState(0);
  const vehiclesRef = useRef(initialVehicles);

  useEffect(() => {
    resetVehicleRouteCache();
    vehiclesRef.current = initialVehicles;
    setVehicles(initialVehicles);
    setSimulationSeconds(0);
  }, [initialVehicles, resetKey]);

  useEffect(() => {
    if (!isRunning) return;

    let cancelled = false;
    const timer = window.setInterval(() => {
      void moveVehicles(vehiclesRef.current, assignments, stations).then((nextVehicles) => {
        if (!cancelled) {
          vehiclesRef.current = nextVehicles;
          setVehicles(nextVehicles);
        }
      });
      setSimulationSeconds((currentSeconds) => currentSeconds + 3);
    }, 3000 / speed);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [assignments, isRunning, speed, stations]);

  return {
    vehicles,
    simulationSeconds
  };
}
