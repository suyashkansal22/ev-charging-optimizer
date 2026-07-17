import { Activity, PlugZap } from "lucide-react";
import { AssignmentPanel } from "./AssignmentPanel";
import { EventFeedPanel } from "./EventFeedPanel";
import { HistoricalAnalyticsPanel } from "./HistoricalAnalyticsPanel";
import { StatsPanel } from "./StatsPanel";
import type { EventFeedItem } from "../hooks/useEventFeed";
import type { HistoricalAnalytics } from "../hooks/useHistoricalAnalytics";
import type { Assignment, Forecast, RouteInfo, Station, Transformer, Vehicle } from "../types";

type SidebarProps = {
  vehicles: Vehicle[];
  stations: Station[];
  transformers: Transformer[];
  forecasts: Forecast[];
  routes: RouteInfo[];
  assignments: Assignment[];
  events: EventFeedItem[];
  analytics: HistoricalAnalytics;
};

export function Sidebar({
  vehicles,
  stations,
  transformers,
  forecasts,
  routes,
  assignments,
  events,
  analytics
}: SidebarProps) {
  const lowBatteryCount = vehicles.filter((vehicle) => vehicle.current_battery_percent < 30).length;
  const averageTransformerLoad =
    transformers.reduce(
      (sum, transformer) =>
        sum + transformer.current_transformer_load_kw / transformer.transformer_capacity_kw,
      0
    ) / transformers.length;
  const fleetStatus = lowBatteryCount > 0 ? "Attention" : "Stable";
  const gridStatus = averageTransformerLoad > 0.82 ? "High load" : "Healthy";

  return (
    <aside className="absolute left-4 top-4 z-[1000] flex max-h-[calc(100vh-2rem)] w-[410px] flex-col overflow-hidden rounded-2xl border border-white/80 bg-slate-50/95 shadow-panel backdrop-blur">
      <div className="border-b border-slate-200/80 bg-white px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
              Live Operations
            </p>
            <h1 className="mt-1 text-xl font-semibold text-slate-950">EV Charging Optimizer</h1>
            <p className="mt-1 text-sm text-slate-500">Fleet, charger, and grid allocation view</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-green-100">
                <Activity size={12} aria-hidden="true" />
                Grid {gridStatus}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-100">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                Fleet {fleetStatus}
              </span>
            </div>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white shadow-sm">
            <PlugZap size={23} aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <StatsPanel
          vehicles={vehicles}
          stations={stations}
          transformers={transformers}
          forecasts={forecasts}
        />
        <HistoricalAnalyticsPanel analytics={analytics} />
        <AssignmentPanel assignments={assignments} routes={routes} />
        <EventFeedPanel events={events} />
      </div>
    </aside>
  );
}
