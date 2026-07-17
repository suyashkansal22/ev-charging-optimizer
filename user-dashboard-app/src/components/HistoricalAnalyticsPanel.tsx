import type { ReactNode } from "react";
import { CheckCircle, Clock, Gauge, PlugZap } from "lucide-react";
import type { HistoricalAnalytics } from "../hooks/useHistoricalAnalytics";

type HistoricalAnalyticsPanelProps = {
  analytics: HistoricalAnalytics;
};

function formatSimulationTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function trendPolyline(batteryTrend: HistoricalAnalytics["batteryTrend"]) {
  if (batteryTrend.length === 0) return "";

  const chartWidth = 300;
  const chartHeight = 74;
  const chartPadding = 8;
  const values = batteryTrend.map((point) => point.averageBatteryPercent);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(maxValue - minValue, 1);

  return batteryTrend
    .map((point, index) => {
      const x =
        batteryTrend.length === 1
          ? chartPadding
          : chartPadding + (index / (batteryTrend.length - 1)) * (chartWidth - chartPadding * 2);
      const y =
        chartHeight -
        chartPadding -
        ((point.averageBatteryPercent - minValue) / range) * (chartHeight - chartPadding * 2);

      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  accent = "green"
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  accent?: "green" | "blue" | "orange";
}) {
  const accentClass = {
    green: "bg-green-50 text-green-700 ring-green-100",
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    orange: "bg-orange-50 text-orange-700 ring-orange-100"
  }[accent];

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ring-1 ${accentClass}`}>
          {icon}
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <div className="mt-3 text-lg font-semibold text-slate-950">{value}</div>
      <div className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</div>
    </div>
  );
}

export function HistoricalAnalyticsPanel({ analytics }: HistoricalAnalyticsPanelProps) {
  const latestTrendPoint = analytics.batteryTrend[analytics.batteryTrend.length - 1];
  const firstTrendPoint = analytics.batteryTrend[0];
  const batteryDelta =
    latestTrendPoint && firstTrendPoint
      ? latestTrendPoint.averageBatteryPercent - firstTrendPoint.averageBatteryPercent
      : 0;
  const points = trendPolyline(analytics.batteryTrend);

  return (
    <section className="mt-5 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/60">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Historical Analytics</h2>
          <p className="mt-0.5 text-xs text-slate-500">Simulation metrics over time</p>
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-100">
          {latestTrendPoint ? formatSimulationTime(latestTrendPoint.simulationSeconds) : "0:00"}
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Avg Fleet Battery
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-950">
              {latestTrendPoint ? `${Math.round(latestTrendPoint.averageBatteryPercent)}%` : "0%"}
            </div>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
              batteryDelta >= 0
                ? "bg-green-50 text-green-700 ring-green-100"
                : "bg-orange-50 text-orange-700 ring-orange-100"
            }`}
          >
            {batteryDelta >= 0 ? "+" : ""}
            {batteryDelta.toFixed(1)}%
          </span>
        </div>
        <svg
          aria-label="Average fleet battery trend"
          className="h-24 w-full overflow-visible"
          preserveAspectRatio="none"
          viewBox="0 0 300 74"
        >
          <line x1="8" x2="292" y1="62" y2="62" stroke="#e2e8f0" strokeWidth="1" />
          <line x1="8" x2="292" y1="36" y2="36" stroke="#e2e8f0" strokeDasharray="3 4" strokeWidth="1" />
          <line x1="8" x2="292" y1="10" y2="10" stroke="#e2e8f0" strokeDasharray="3 4" strokeWidth="1" />
          {points ? (
            <polyline
              fill="none"
              points={points}
              stroke="#2563eb"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
          ) : null}
        </svg>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <MetricCard
          icon={<CheckCircle size={15} aria-hidden="true" />}
          label="Sessions"
          value={String(analytics.completedSessions)}
          detail="Completed charges"
          accent="green"
        />
        <MetricCard
          icon={<Clock size={15} aria-hidden="true" />}
          label="Wait"
          value={`${Math.round(analytics.averageWaitTime)} min`}
          detail="Average station wait"
          accent="orange"
        />
        <MetricCard
          icon={<Gauge size={15} aria-hidden="true" />}
          label="Utilization"
          value={`${Math.round(analytics.chargerUtilizationPercent)}%`}
          detail="Chargers in use"
          accent="blue"
        />
        <MetricCard
          icon={<PlugZap size={15} aria-hidden="true" />}
          label="Energy"
          value={`${analytics.totalEnergyDeliveredKwh.toFixed(1)} kWh`}
          detail="Delivered during sim"
          accent="green"
        />
      </div>
    </section>
  );
}
