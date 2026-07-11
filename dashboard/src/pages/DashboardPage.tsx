import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { MapPin, Zap } from "lucide-react";
import { InfoDrawer } from "../components/InfoDrawer";
import type { SelectedMapItem } from "../components/InfoDrawer";
import { Sidebar } from "../components/Sidebar";
import { SimulationControlPanel } from "../components/SimulationControlPanel";
import { StationMarker } from "../components/StationMarker";
import { VehicleMarker } from "../components/VehicleMarker";
import { useEventFeed } from "../hooks/useEventFeed";
import { useHistoricalAnalytics } from "../hooks/useHistoricalAnalytics";
import { useVehicleSimulation } from "../hooks/useVehicleSimulation";
import type { SimulationSpeed } from "../hooks/useVehicleSimulation";
import {
  mockAssignments,
  mockForecasts,
  mockRoutes,
  mockStations,
  mockTransformers,
  mockVehicles
} from "../mockData";
import { mapCenter } from "../services/dashboardUtils";
import type { Station, Vehicle } from "../types";

function MapClickHandler({ onClose }: { onClose: () => void }) {
  useMapEvents({
    click: onClose
  });

  return null;
}

function SelectionBoundsController({
  selectedItem,
  vehicles,
  stations
}: {
  selectedItem: SelectedMapItem | null;
  vehicles: Vehicle[];
  stations: Station[];
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedItem) return;

    if (selectedItem.type === "vehicle") {
      const vehicle = vehicles.find((item) => item.vehicle_id === selectedItem.vehicle_id);
      const assignment = mockAssignments.find((item) => item.vehicle_id === selectedItem.vehicle_id);
      const station = stations.find((item) => item.station_id === assignment?.station_id);

      if (vehicle && station) {
        map.fitBounds(
          [
            [vehicle.vehicle_latitude, vehicle.vehicle_longitude],
            [station.station_latitude, station.station_longitude]
          ],
          {
            animate: true,
            duration: 0.7,
            maxZoom: 15,
            paddingTopLeft: [440, 90],
            paddingBottomRight: [430, 90]
          }
        );
      }
    }

    if (selectedItem.type === "station") {
      const station = stations.find((item) => item.station_id === selectedItem.station_id);
      const assignedVehicleIds = mockAssignments
        .filter((item) => item.station_id === selectedItem.station_id)
        .map((item) => item.vehicle_id);
      const assignedVehicles = vehicles.filter((item) => assignedVehicleIds.includes(item.vehicle_id));
      const positions: [number, number][] = station
        ? [[station.station_latitude, station.station_longitude]]
        : [];

      assignedVehicles.forEach((vehicle) => {
        positions.push([vehicle.vehicle_latitude, vehicle.vehicle_longitude]);
      });

      if (positions.length > 0) {
        map.fitBounds(positions, {
          animate: true,
          duration: 0.7,
          maxZoom: 15,
          paddingTopLeft: [440, 90],
          paddingBottomRight: [430, 90]
        });
      }
    }
  }, [map, selectedItem, stations, vehicles]);

  return null;
}

export default function DashboardPage() {
  const [isSimulationRunning, setIsSimulationRunning] = useState(true);
  const [simulationSpeed, setSimulationSpeed] = useState<SimulationSpeed>(1);
  const [simulationResetKey, setSimulationResetKey] = useState(0);
  const { vehicles, simulationSeconds } = useVehicleSimulation(
    mockVehicles,
    mockAssignments,
    mockStations,
    isSimulationRunning,
    simulationSpeed,
    simulationResetKey
  );
  const [selectedItem, setSelectedItem] = useState<SelectedMapItem | null>(null);
  const events = useEventFeed({
    vehicles,
    stations: mockStations,
    assignments: mockAssignments,
    simulationSeconds
  });
  const analytics = useHistoricalAnalytics({
    vehicles,
    stations: mockStations,
    assignments: mockAssignments,
    simulationSeconds
  });

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
  const hasSelection = Boolean(selectedItem);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-900">
      <MapContainer center={mapCenter} zoom={13} scrollWheelZoom className="h-full w-full">
        <MapClickHandler onClose={() => setSelectedItem(null)} />
        <SelectionBoundsController
          selectedItem={selectedItem}
          vehicles={vehicles}
          stations={mockStations}
        />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        {mockStations.map((station) => (
          <StationMarker
            key={station.station_id}
            station={station}
            isDimmed={
              hasSelection &&
              !(selectedItem?.type === "station" && selectedItem.station_id === station.station_id)
            }
            isSelected={selectedItem?.type === "station" && selectedItem.station_id === station.station_id}
            onSelect={(selectedStation) =>
              setSelectedItem({ type: "station", station_id: selectedStation.station_id })
            }
          />
        ))}

        {vehicles.map((vehicle) => (
          <VehicleMarker
            key={vehicle.vehicle_id}
            vehicle={vehicle}
            station={assignedStationByVehicle[vehicle.vehicle_id]}
            isDimmed={
              hasSelection &&
              !(selectedItem?.type === "vehicle" && selectedItem.vehicle_id === vehicle.vehicle_id)
            }
            isSelected={selectedItem?.type === "vehicle" && selectedItem.vehicle_id === vehicle.vehicle_id}
            isRouteSelected={
              selectedItem?.type === "vehicle"
                ? selectedItem.vehicle_id === vehicle.vehicle_id
                : selectedItem?.type === "station" &&
                  assignedStationByVehicle[vehicle.vehicle_id]?.station_id === selectedItem.station_id
            }
            onSelect={(selectedVehicle) =>
              setSelectedItem({ type: "vehicle", vehicle_id: selectedVehicle.vehicle_id })
            }
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
        events={events}
        analytics={analytics}
      />

      <InfoDrawer
        selectedItem={selectedItem}
        vehicles={vehicles}
        stations={mockStations}
        assignments={mockAssignments}
        routes={mockRoutes}
        onClose={() => setSelectedItem(null)}
      />

      <SimulationControlPanel
        isRunning={isSimulationRunning}
        speed={simulationSpeed}
        simulationSeconds={simulationSeconds}
        onToggleRunning={() => setIsSimulationRunning((currentValue) => !currentValue)}
        onSpeedChange={setSimulationSpeed}
        onReset={() => {
          setSimulationResetKey((currentKey) => currentKey + 1);
          setSelectedItem(null);
        }}
      />

      <div
        className={`absolute bottom-4 right-4 z-[1000] flex items-center gap-2 rounded-md border border-white/70 bg-white/95 px-3 py-2 text-sm text-slate-700 shadow-panel backdrop-blur transition-opacity ${
          selectedItem ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <MapPin size={16} className="text-emerald-600" aria-hidden="true" />
        Chandigarh live mock - vehicles update every 3s
        <Zap size={16} className="text-amber-500" aria-hidden="true" />
      </div>
    </main>
  );
}
