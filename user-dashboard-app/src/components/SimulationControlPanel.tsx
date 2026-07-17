import { Pause, Play, RotateCcw } from "lucide-react";
import type { SimulationSpeed } from "../hooks/useVehicleSimulation";

type SimulationControlPanelProps = {
  isRunning: boolean;
  speed: SimulationSpeed;
  simulationSeconds: number;
  onToggleRunning: () => void;
  onSpeedChange: (speed: SimulationSpeed) => void;
  onReset: () => void;
};

function formatSimulationTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function SimulationControlPanel({
  isRunning,
  speed,
  simulationSeconds,
  onToggleRunning,
  onSpeedChange,
  onReset
}: SimulationControlPanelProps) {
  return (
    <section className="absolute right-4 top-4 z-[1000] w-[360px] rounded-2xl border border-white/80 bg-white/95 p-4 shadow-panel backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Simulation Control</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">
            {isRunning ? "Simulation Running" : "Paused"}
          </h2>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
            isRunning
              ? "bg-green-50 text-green-700 ring-green-100"
              : "bg-orange-50 text-orange-700 ring-orange-100"
          }`}
        >
          {isRunning ? "Live" : "Paused"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-3">
        <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
          <div className="text-xs font-medium text-slate-500">Simulation time</div>
          <div className="mt-0.5 font-mono text-xl font-semibold text-slate-950">
            {formatSimulationTime(simulationSeconds)}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleRunning}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          {isRunning ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {isRunning ? "Pause" : "Play"}
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          {([1, 2, 5] as SimulationSpeed[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onSpeedChange(option)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                speed === option ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {option}x
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-white"
        >
          <RotateCcw size={15} aria-hidden="true" />
          Reset
        </button>
      </div>
    </section>
  );
}
