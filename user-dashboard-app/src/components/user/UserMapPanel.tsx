import { Navigation, Sparkles, Clock, MapPin, Search, Car } from "lucide-react";
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Link } from "react-router-dom";
import { useState } from "react";
import { mockStations, mockVehicles } from "../../mockData";

// Helper to calculate a curved Bezier path between two points
const createCurve = (start: [number, number], end: [number, number], offset = 0.2, numPoints = 30) => {
  const points: [number, number][] = [];
  const midX = (start[0] + end[0]) / 2;
  const midY = (start[1] + end[1]) / 2;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  
  // Perpendicular vector for the control point
  const cpX = midX - dy * offset;
  const cpY = midY + dx * offset;

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const x = Math.pow(1 - t, 2) * start[0] + 2 * (1 - t) * t * cpX + Math.pow(t, 2) * end[0];
    const y = Math.pow(1 - t, 2) * start[1] + 2 * (1 - t) * t * cpY + Math.pow(t, 2) * end[1];
    points.push([x, y]);
  }
  return points;
};

export function UserMapPanel({ selectedVehicleId = "Tesla EV3" }: { selectedVehicleId?: string }) {
  const [animationState, setAnimationState] = useState<'idle' | 'calculating' | 'complete'>('idle');

  const optimalStation = mockStations.find(s => s.station_id === 'Charging Station Sector 5') || mockStations[0];
  const vehicle = mockVehicles.find(v => v.vehicle_id === selectedVehicleId) || mockVehicles[0];
  
  // Note: react-map-gl and GeoJSON expect [longitude, latitude]
  const userLocation: [number, number] = [vehicle.vehicle_longitude, vehicle.vehicle_latitude]; 

  const handleRequestRoute = () => {
    setAnimationState('calculating');
    setTimeout(() => {
      setAnimationState('complete');
    }, 2500);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
      {/* Interactive Map Area */}
      <div className="lg:col-span-2 relative overflow-hidden rounded-xl border border-green-300/80 bg-white shadow-sm h-[400px]">
        <Map
          initialViewState={{
            longitude: userLocation[0],
            latitude: userLocation[1],
            zoom: 13.5,
            pitch: 60, // 3D Pitch
            bearing: -15
          }}
          mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
          style={{ width: '100%', height: '100%' }}
          interactive={false} // Disable dragging for this dashboard view
        >
          
          {/* User Location / Car Icon in 3D */}
          <Marker longitude={userLocation[0]} latitude={userLocation[1]} anchor="bottom" pitchAlignment="map">
            <div className="relative group cursor-pointer" style={{ perspective: '500px' }}>
              {/* Fake 3D Shadow on the map surface */}
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-3 w-8 bg-black/30 blur-sm rounded-full transform rotate-x-60"></div>
              
              {/* Car Icon */}
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 border-2 border-white shadow-2xl text-white transform hover:scale-110 transition-transform duration-300">
                <Car size={20} />
              </div>
              
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 hidden group-hover:block w-max z-50">
                <div className="bg-slate-900 text-white rounded-lg shadow-xl px-3 py-1.5 text-xs font-medium">
                  {vehicle.vehicle_id} Location
                </div>
              </div>
            </div>
          </Marker>

          {/* All Stations Markers in 3D */}
          {mockStations.map(station => {
            if (animationState === 'complete' && station.station_id === optimalStation.station_id) {
              return null;
            }
            return (
              <Marker 
                key={`marker-${station.station_id}`} 
                longitude={station.station_longitude} 
                latitude={station.station_latitude} 
                anchor="bottom"
                pitchAlignment="map"
              >
                <div className="relative group cursor-pointer" style={{ perspective: '500px' }}>
                  <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-2 w-6 bg-black/20 blur-sm rounded-full transform rotate-x-60"></div>
                  <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-white border-2 border-slate-200 shadow-xl transform transition-transform duration-300 hover:-translate-y-1">
                    <div className="h-3 w-3 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-max z-50">
                    <div className="bg-white rounded-xl shadow-2xl px-3 py-2 text-xs border border-slate-100 backdrop-blur-sm">
                      <div className="font-semibold text-slate-900">{station.station_id}</div>
                      <div className="text-slate-500 mt-1">{station.available_chargers} chargers available</div>
                    </div>
                  </div>
                </div>
              </Marker>
            );
          })}

          {/* Calculating Animation: Curved Lines to all stations */}
          {animationState === 'calculating' && mockStations.map(station => {
            const curvedPath = createCurve(userLocation, [station.station_longitude, station.station_latitude]);
            
            const data = {
              type: 'Feature' as const,
              geometry: {
                type: 'LineString' as const,
                coordinates: curvedPath
              }
            };
            return (
              <Source key={`source-${station.station_id}`} id={`route-${station.station_id}`} type="geojson" data={data}>
                <Layer
                  id={`route-layer-${station.station_id}`}
                  type="line"
                  paint={{
                    'line-color': '#6366f1',
                    'line-width': 2,
                    'line-dasharray': [4, 4],
                    'line-opacity': 0.4
                  }}
                />
              </Source>
            );
          })}

          {/* Complete State: Final Optimal Route (Curved) */}
          {animationState === 'complete' && (
            <>
              <Marker 
                longitude={optimalStation.station_longitude} 
                latitude={optimalStation.station_latitude} 
                anchor="bottom"
                pitchAlignment="map"
              >
                <div className="relative group cursor-pointer z-50 animate-bounce" style={{ perspective: '500px' }}>
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-3 w-8 bg-blue-900/40 blur-md rounded-full transform rotate-x-60"></div>
                  <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-2xl ring-4 ring-blue-100">
                    <Sparkles size={18} className="animate-pulse" />
                  </div>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-max">
                    <div className="bg-slate-900 text-white rounded-xl shadow-2xl px-3 py-2 text-xs backdrop-blur-sm border border-slate-700">
                      <div className="font-semibold">{optimalStation.station_id}</div>
                      <div className="text-blue-300 mt-1 font-medium">Optimal AI Pick</div>
                    </div>
                  </div>
                </div>
              </Marker>

              <Source 
                id="optimal-route-source" 
                type="geojson" 
                data={{
                  type: 'Feature',
                  geometry: {
                    type: 'LineString',
                    coordinates: createCurve(userLocation, [optimalStation.station_longitude, optimalStation.station_latitude])
                  }
                }}
              >
                <Layer
                  id="optimal-route-layer-glow"
                  type="line"
                  paint={{
                    'line-color': '#3b82f6',
                    'line-width': 8,
                    'line-opacity': 0.3,
                    'line-blur': 4
                  }}
                />
                <Layer
                  id="optimal-route-layer"
                  type="line"
                  paint={{
                    'line-color': '#2563eb',
                    'line-width': 4
                  }}
                />
              </Source>
            </>
          )}

        </Map>
        
        {/* Map UI Overlay Elements */}
        <div className="absolute top-4 left-4 z-[1000] pointer-events-none">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur pointer-events-auto">
            <MapPin size={14} className="text-blue-600" />
            {animationState === 'idle' && "Ready to route"}
            {animationState === 'calculating' && "Analyzing 24k grid nodes..."}
            {animationState === 'complete' && "Showing Optimal AI Route"}
          </span>
        </div>
      </div>

      {/* AI Recommendation Panel */}
      <div className="relative flex flex-col justify-center overflow-hidden rounded-xl border border-green-300/80 bg-white p-6 shadow-sm">
        
        {animationState === 'idle' && (
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600 mb-4 ring-1 ring-blue-100">
              <Search size={32} />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Find the Best Charge</h2>
            <p className="text-sm text-slate-500 mb-8">Our AI analyzes live grid pricing, traffic, and station queues to find your optimal route.</p>
            <button 
              onClick={handleRequestRoute}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <Sparkles size={16} /> Request Optimal Route
            </button>
          </div>
        )}

        {animationState === 'calculating' && (
          <div className="text-center animate-pulse">
             <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 mb-4 ring-1 ring-indigo-100">
              <Sparkles size={32} className="animate-spin-slow" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Calculating...</h2>
            <p className="text-sm text-slate-500">Evaluating routes and live prices.</p>
          </div>
        )}

        {animationState === 'complete' && (
          <div className="h-full flex flex-col justify-between animate-in fade-in zoom-in duration-500">
            <div>
              <div className="flex items-center gap-2 mb-6">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200">
                  <Sparkles size={16} />
                </div>
                <h2 className="text-sm font-semibold text-slate-950 uppercase tracking-wide">AI Recommendation</h2>
              </div>

              <div className="mb-6 space-y-4">
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-slate-900">{optimalStation.station_id}</h3>
                    <span className="flex items-center gap-1 rounded bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                      <Clock size={10} /> 0 min wait
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mb-3">
                    Based on your current route and predicted grid prices, this is the optimal spot.
                  </p>
                  <div className="flex justify-between text-xs font-medium">
                    <span className="flex items-center gap-1 text-slate-500"><MapPin size={12}/> 2.4 miles away</span>
                    <span className="text-blue-600">₹3.80 / kWh (dropping soon)</span>
                  </div>
                </div>
              </div>
            </div>

            <Link to={`/user/navigate/${vehicle.vehicle_id}/${optimalStation.station_id}`} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
              <Navigation size={16} />
              Reserve & Navigate
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}
