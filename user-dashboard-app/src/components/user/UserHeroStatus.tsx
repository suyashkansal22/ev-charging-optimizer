import { BatteryCharging, Coins } from "lucide-react";
import { mockVehicles } from "../../mockData";

export function UserHeroStatus({ selectedVehicleId = "Tesla EV3" }: { selectedVehicleId?: string }) {
  const vehicle = mockVehicles.find(v => v.vehicle_id === selectedVehicleId) || mockVehicles[0];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      {/* Battery Status & Eco Warning */}
      <div className="flex flex-col gap-4">
        <div className="relative overflow-hidden rounded-xl border border-green-300/80 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BatteryCharging className="text-green-600" size={24} />
              <h2 className="text-sm font-semibold text-slate-950 uppercase tracking-wide">Battery Status</h2>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-green-100">
              Charging
            </span>
          </div>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-4xl font-bold text-slate-950 tracking-tight">{vehicle.current_battery_percent}</span>
            <span className="text-xl font-medium text-slate-500 mb-1">%</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">180 miles estimated standard range</p>
          
          {/* Progress Bar */}
          <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden ring-1 ring-slate-200 inset-0">
            <div className="h-full bg-green-500 rounded-full" style={{ width: `${vehicle.current_battery_percent}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate-500 font-medium">
            <span>Target: {vehicle.target_battery_percent}%</span>
            <span>45 mins remaining</span>
          </div>
        </div>
      </div>

      {/* Smart Grid & Savings */}
      <div className="rounded-xl border border-green-300/80 bg-white p-6 shadow-sm flex flex-col justify-center items-center text-center">
        <div className="flex flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 mb-4 ring-1 ring-blue-100">
            <Coins size={28} />
          </div>
          <h2 className="text-sm font-semibold text-slate-950 uppercase tracking-wide mb-2">Smart Grid & Savings</h2>
          <div className="flex items-end justify-center gap-1 mb-2">
            <span className="text-5xl font-bold text-slate-950 tracking-tight">₹340.50</span>
          </div>
          <p className="text-sm text-slate-500 max-w-[250px]">
            Total amount saved this month by charging during optimal off-peak hours
          </p>
        </div>
      </div>
    </div>
  );
}
