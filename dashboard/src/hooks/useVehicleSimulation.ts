import { useEffect, useState } from "react";
import { moveVehicles } from "../services/dashboardUtils";
import type { Assignment, Station, Vehicle } from "../types";

export function useVehicleSimulation(
  initialVehicles: Vehicle[],
  assignments: Assignment[],
  stations: Station[]
) {
  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVehicles((currentVehicles) => moveVehicles(currentVehicles, assignments, stations));
    }, 3000);

    return () => window.clearInterval(timer);
  }, [assignments, stations]);

  return vehicles;
}
