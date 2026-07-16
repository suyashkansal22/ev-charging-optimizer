import { History, Zap, CheckCircle2 } from "lucide-react";

export function ChargingHistory({ selectedVehicleId = "Tesla EV3" }: { selectedVehicleId?: string }) {
  const history = selectedVehicleId === "Tesla EV3" ? [
    {
      id: 1,
      date: "Today, 8:45 AM",
      station: "Charging Station Sector 5",
      energy: "42 kWh",
      cost: "₹168.00",
      status: "Completed",
      savings: "+ ₹45.00",
    },
    {
      id: 2,
      date: "Yesterday, 6:30 PM",
      station: "Charging Station Sector 15",
      energy: "28 kWh",
      cost: "₹112.00",
      status: "Completed",
      savings: "+ ₹25.00",
    },
    {
      id: 3,
      date: "Oct 12, 9:15 AM",
      station: "Charging Station Sector 17",
      energy: "65 kWh",
      cost: "₹260.00",
      status: "Completed",
      savings: "+ ₹120.00",
    }
  ] : [
    {
      id: 4,
      date: "Today, 10:15 AM",
      station: "Charging Station Sector 9",
      energy: "30 kWh",
      cost: "₹125.00",
      status: "Completed",
      savings: "+ ₹20.00",
    },
    {
      id: 5,
      date: "Yesterday, 2:00 PM",
      station: "Charging Station Sector 20",
      energy: "55 kWh",
      cost: "₹210.00",
      status: "Completed",
      savings: "+ ₹80.00",
    }
  ];

  return (
    <div className="rounded-xl border border-green-300/80 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-6">
        <History className="text-purple-600" size={24} />
        <h2 className="text-sm font-semibold text-slate-950 uppercase tracking-wide">Recent Sessions</h2>
      </div>

      <div className="space-y-4">
        {history.map((session) => (
          <div key={session.id} className="rounded-xl bg-slate-50 p-4 border border-slate-200 transition-colors hover:bg-slate-100">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-semibold text-slate-900">{session.station}</h3>
                <p className="text-xs text-slate-500">{session.date}</p>
              </div>
              <div className="text-right">
                <span className="font-bold text-slate-900">{session.cost}</span>
                <p className="text-xs font-medium text-green-700">{session.savings}</p>
              </div>
            </div>
            
            <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                  <Zap size={12} className="text-amber-500" />
                  {session.energy}
                </span>
                <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                  <CheckCircle2 size={12} className="text-green-600" />
                  {session.status}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <button className="mt-4 w-full rounded-lg py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors">
        View All History
      </button>
    </div>
  );
}
