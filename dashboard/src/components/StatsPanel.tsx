import type { ReactNode } from "react";
import { BatteryCharging, Car, Gauge, PlugZap } from "lucide-react";
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
  detail
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-slate-500">{icon}</div>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
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
        />
        <StatCard
          icon={<BatteryCharging size={18} aria-hidden="true" />}
          label="Avg Battery"
          value={`${Math.round(averageBattery)}%`}
          detail="Across active fleet"
        />
        <StatCard
          icon={<PlugZap size={18} aria-hidden="true" />}
          label="Chargers"
          value={`${availableChargers}/${totalChargers}`}
          detail="Currently available"
        />
        <StatCard
          icon={<Gauge size={18} aria-hidden="true" />}
          label="Grid Load"
          value={`${Math.round(transformerLoad * 100)}%`}
          detail="Transformer average"
        />
      </div>

      <section className="mt-4 rounded-md border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-950">Station Status</h2>
          <span className="text-xs text-slate-500">{Math.round(averageWait)} min avg wait</span>
        </div>
        <div className="mt-3 space-y-3">
          {stations.map((station) => {
            const forecast = forecasts.find((item) => item.station_id === station.station_id);
            const busyPercent = Math.round(
              (1 - station.available_chargers / station.number_of_chargers) * 100
            );

            return (
              <div key={station.station_id}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-800">{station.station_id}</span>
                  <span className="text-slate-500">
                    {station.available_chargers}/{station.number_of_chargers} open
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${busyPercent}%`,
                      backgroundColor: stationColor(station)
                    }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
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
