import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, BatteryCharging, Car, Gauge, PlugZap } from "lucide-react";
import { formatCurrency, stationColor } from "../services/dashboardUtils";
import type { Forecast, Station, Transformer, Vehicle } from "../types";

type StatsPanelProps = {
  vehicles: Vehicle[];
  stations: Station[];
  transformers: Transformer[];
  forecasts: Forecast[];
};

function StatCard({
  icon,
  label,
  value,
  detail,
  accent = "green",
  trend,
  trendTone = "good"
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  accent?: "green" | "blue" | "orange";
  trend?: string;
  trendTone?: "good" | "watch";
}) {
  const accentClass = {
    green: "bg-green-50 text-green-700 ring-green-100",
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    orange: "bg-orange-50 text-orange-700 ring-orange-100"
  }[accent];
  const TrendIcon = trendTone === "good" ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/60">
      <div className="flex items-center justify-between gap-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${accentClass}`}>
          {icon}
        </div>
        {trend ? (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-100">
            <TrendIcon size={12} aria-hidden="true" />
            {trend}
          </span>
        ) : null}
      </div>
      <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div>
    </div>
  );
}

export function StatsPanel({ vehicles, stations, transformers, forecasts }: StatsPanelProps) {
  const averageBattery =
    vehicles.reduce((sum, vehicle) => sum + vehicle.current_battery_percent, 0) / vehicles.length;
  const lowBatteryCount = vehicles.filter((vehicle) => vehicle.current_battery_percent < 30).length;
  const availableChargers = stations.reduce((sum, station) => sum + station.available_chargers, 0);
  const totalChargers = stations.reduce((sum, station) => sum + station.number_of_chargers, 0);
  const transformerLoad =
    transformers.reduce(
      (sum, transformer) =>
        sum + transformer.current_transformer_load_kw / transformer.transformer_capacity_kw,
      0
    ) / transformers.length;
  const averageWait =
    stations.reduce((sum, station) => sum + station.estimated_wait_time, 0) / stations.length;

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Car size={18} aria-hidden="true" />}
          label="Vehicles"
          value={String(vehicles.length)}
          detail={`${lowBatteryCount} below 30%`}
          accent="blue"
          trend="Live"
        />
        <StatCard
          icon={<BatteryCharging size={18} aria-hidden="true" />}
          label="Avg Battery"
          value={`${Math.round(averageBattery)}%`}
          detail="Across active fleet"
          accent={averageBattery > 70 ? "green" : "orange"}
          trend={averageBattery > 70 ? "Good" : "Watch"}
          trendTone={averageBattery > 70 ? "good" : "watch"}
        />
        <StatCard
          icon={<PlugZap size={18} aria-hidden="true" />}
          label="Chargers"
          value={`${availableChargers}/${totalChargers}`}
          detail="Currently available"
          accent="green"
          trend="Open"
        />
        <StatCard
          icon={<Gauge size={18} aria-hidden="true" />}
          label="Grid Load"
          value={`${Math.round(transformerLoad * 100)}%`}
          detail="Transformer average"
          accent={transformerLoad > 0.82 ? "orange" : "blue"}
          trend={transformerLoad > 0.82 ? "High" : "Nominal"}
          trendTone={transformerLoad > 0.82 ? "watch" : "good"}
        />
      </div>

      <section className="mt-5 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/60">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Station Status</h2>
            <p className="mt-0.5 text-xs text-slate-500">Utilization and pricing signal</p>
          </div>
          <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 ring-1 ring-orange-100">
            {Math.round(averageWait)} min avg
          </span>
        </div>
        <div className="mt-4 space-y-4">
          {stations.map((station) => {
            const forecast = forecasts.find((item) => item.station_id === station.station_id);
            const busyPercent = Math.round(
              (1 - station.available_chargers / station.number_of_chargers) * 100
            );

            return (
              <div key={station.station_id} className="rounded-lg bg-slate-50/80 p-3">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-slate-800">{station.station_id}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-100">
                    {station.available_chargers}/{station.number_of_chargers} open
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${busyPercent}%`,
                      backgroundColor: stationColor(station)
                    }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{station.transformer_id}</span>
                  <span>
                    {station.queue_length} queued - {station.estimated_wait_time} min -{" "}
                    {forecast ? formatCurrency(forecast.current_price_per_kwh) : "n/a"}/kWh
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
