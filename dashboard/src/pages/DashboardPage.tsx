import { useMemo } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import { MapPin, Zap } from "lucide-react";
import { Sidebar } from "../components/Sidebar";
import { StationMarker } from "../components/StationMarker";
import { VehicleMarker } from "../components/VehicleMarker";
import { useVehicleSimulation } from "../hooks/useVehicleSimulation";
import {
  mockAssignments,
  mockForecasts,
  mockRoutes,
  mockStations,
  mockTransformers,
  mockVehicles
} from "../mockData";
import { mapCenter } from "../services/dashboardUtils";
import type { Station } from "../types";

export default function DashboardPage() {
  const vehicles = useVehicleSimulation(mockVehicles, mockAssignments, mockStations);

  const assignedStationByVehicle = useMemo(
    () =>
      mockAssignments.reduce<Record<string, Station | undefined>>((lookup, assignment) => {
        lookup[assignment.vehicle_id] = mockStations.find(
          (station) => station.station_id === assignment.station_id
        );
        return lookup;
      }, {}),
    []
  );

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-900">
      <MapContainer center={mapCenter} zoom={13} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {mockStations.map((station) => (
          <StationMarker key={station.station_id} station={station} />
        ))}

        {vehicles.map((vehicle) => (
          <VehicleMarker
            key={vehicle.vehicle_id}
            vehicle={vehicle}
            station={assignedStationByVehicle[vehicle.vehicle_id]}
          />
        ))}
      </MapContainer>

      <Sidebar
        vehicles={vehicles}
        stations={mockStations}
        transformers={mockTransformers}
        forecasts={mockForecasts}
        routes={mockRoutes}
        assignments={mockAssignments}
      />

      <div className="absolute bottom-4 right-4 z-[1000] flex items-center gap-2 rounded-md border border-white/70 bg-white/95 px-3 py-2 text-sm text-slate-700 shadow-panel backdrop-blur">
        <MapPin size={16} className="text-emerald-600" aria-hidden="true" />
        Chandigarh live mock - vehicles update every 3s
        <Zap size={16} className="text-amber-500" aria-hidden="true" />
      </div>
    </main>
  );
}
