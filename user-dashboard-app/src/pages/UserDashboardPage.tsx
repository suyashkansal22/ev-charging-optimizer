import { useState } from "react";
import { UserNavbar } from "../components/user/UserNavbar";
import { Leaf } from "lucide-react";
import { UserHeroStatus } from "../components/user/UserHeroStatus";
import { UserMapPanel } from "../components/user/UserMapPanel";
import { ChargingHistory } from "../components/user/ChargingHistory";
import { mockVehicles } from "../mockData";

export default function UserDashboardPage() {
  const [selectedVehicleId, setSelectedVehicleId] = useState(mockVehicles[0].vehicle_id);

  return (
    <div className="min-h-screen bg-green-50 font-sans text-slate-950 selection:bg-green-300 selection:text-green-900">
      <UserNavbar selectedVehicleId={selectedVehicleId} onVehicleChange={setSelectedVehicleId} />
      
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <UserHeroStatus selectedVehicleId={selectedVehicleId} />
        <UserMapPanel selectedVehicleId={selectedVehicleId} />
        
        <div className="mt-6">
          <ChargingHistory selectedVehicleId={selectedVehicleId} />
        </div>

        {/* Eco Impact Stats - Floating at the bottom */}
        <div className="mt-16 mb-8 flex flex-col justify-center items-center text-center">
          <div className="flex flex-col items-center w-full max-w-2xl">
            <h2 className="text-xs font-bold text-green-800/80 uppercase tracking-widest mb-1 flex items-center gap-2">
              <Leaf size={14} /> Environmental Impact
            </h2>
            <p className="text-sm text-green-600/90 font-medium mb-8">
              Thank you for making green choices!
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 w-full text-center max-w-lg mx-auto">
              <div className="flex flex-col items-center">
                <p className="text-green-700/60 text-[10px] uppercase font-bold tracking-wider mb-1">CO₂ Saved</p>
                <p className="font-black text-green-950 text-4xl tracking-tight">186<span className="text-2xl text-green-800 ml-1">kg</span></p>
              </div>
              <div className="flex flex-col items-center">
                <p className="text-green-700/60 text-[10px] uppercase font-bold tracking-wider mb-1">Equivalent to</p>
                <p className="font-black text-green-950 text-4xl tracking-tight">9<span className="text-2xl text-green-800 ml-2">Trees 🌳</span></p>
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
