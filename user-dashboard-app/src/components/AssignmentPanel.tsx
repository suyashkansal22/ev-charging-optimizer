import { ArrowUpRight, Route, Timer } from "lucide-react";
import { formatCurrency } from "../services/dashboardUtils";
import type { Assignment, RouteInfo } from "../types";

type AssignmentPanelProps = {
  assignments: Assignment[];
  routes: RouteInfo[];
};

export function AssignmentPanel({ assignments, routes }: AssignmentPanelProps) {
  return (
    <section className="mt-5 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/60">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Assignments</h2>
          <p className="mt-0.5 text-xs text-slate-500">Scheduled charging tasks</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-100">
          <Timer size={13} aria-hidden="true" />
          {assignments.length} active
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {assignments.map((assignment) => {
          const route = routes.find(
            (item) =>
              item.vehicle_id === assignment.vehicle_id && item.station_id === assignment.station_id
          );

          return (
            <div
              key={`${assignment.vehicle_id}-${assignment.station_id}`}
              className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-sm shadow-sm shadow-slate-100/70"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{assignment.vehicle_id}</span>
                    <ArrowUpRight size={13} className="text-blue-500" aria-hidden="true" />
                    <span className="font-semibold text-slate-900">{assignment.station_id}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <Route size={13} aria-hidden="true" />
                    {route
                      ? `${route.travel_distance_to_station} km - ${route.travel_time_to_station} min`
                      : "Route pending"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-slate-900">{formatCurrency(assignment.est_cost)}</div>
                  <div className="mt-1 inline-flex rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-100">
                    slot {assignment.time_slot}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
