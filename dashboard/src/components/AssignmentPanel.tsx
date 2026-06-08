import { Route, Timer } from "lucide-react";
import { formatCurrency } from "../services/dashboardUtils";
import type { Assignment, RouteInfo } from "../types";

type AssignmentPanelProps = {
  assignments: Assignment[];
  routes: RouteInfo[];
};

export function AssignmentPanel({ assignments, routes }: AssignmentPanelProps) {
  return (
    <section className="mt-4 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-950">Assignments</h2>
        <Timer size={16} className="text-slate-500" aria-hidden="true" />
      </div>
      <div className="mt-3 space-y-2">
        {assignments.map((assignment) => {
          const route = routes.find(
            (item) =>
              item.vehicle_id === assignment.vehicle_id && item.station_id === assignment.station_id
          );

          return (
            <div
              key={`${assignment.vehicle_id}-${assignment.station_id}`}
              className="grid grid-cols-[1fr_auto] gap-2 rounded-md bg-slate-50 p-2 text-sm"
            >
              <div>
                <div className="font-medium text-slate-900">
                  {assignment.vehicle_id} - {assignment.station_id}
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <Route size={13} aria-hidden="true" />
                  {route
                    ? `${route.travel_distance_to_station} km - ${route.travel_time_to_station} min`
                    : "Route pending"}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-slate-900">{formatCurrency(assignment.est_cost)}</div>
                <div className="text-xs text-slate-500">slot {assignment.time_slot}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
