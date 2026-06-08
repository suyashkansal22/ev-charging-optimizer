import { PlugZap } from "lucide-react";
import { AssignmentPanel } from "./AssignmentPanel";
import { StatsPanel } from "./StatsPanel";
import type { Assignment, Forecast, RouteInfo, Station, Transformer, Vehicle } from "../types";

type SidebarProps = {
  vehicles: Vehicle[];
  stations: Station[];
  transformers: Transformer[];
  forecasts: Forecast[];
  routes: RouteInfo[];
  assignments: Assignment[];
};

export function Sidebar({
  vehicles,
  stations,
  transformers,
  forecasts,
  routes,
  assignments
}: SidebarProps) {
  return (
    <aside className="absolute left-4 top-4 z-[1000] flex max-h-[calc(100vh-2rem)] w-[390px] flex-col overflow-hidden rounded-lg border border-white/70 bg-slate-50/95 shadow-panel backdrop-blur">
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-950">EV Charging Optimizer</h1>
            <p className="text-sm text-slate-500">Live fleet and grid dashboard</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-600 text-white">
            <PlugZap size={22} aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <StatsPanel
          vehicles={vehicles}
          stations={stations}
          transformers={transformers}
          forecasts={forecasts}
        />
        <AssignmentPanel assignments={assignments} routes={routes} />
      </div>
    </aside>
  );
}
