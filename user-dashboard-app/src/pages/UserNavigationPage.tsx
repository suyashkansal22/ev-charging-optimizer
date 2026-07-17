import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Navigation, Clock, Battery } from "lucide-react";
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mockStations, mockVehicles } from "../mockData";

export default function UserNavigationPage() {
  const { vehicleId, stationId } = useParams<{ vehicleId: string; stationId: string }>();
  
  // Use mock data to create a route
  const vehicle = mockVehicles.find(v => v.vehicle_id === vehicleId) || mockVehicles[0]; // Fallback to Tesla EV3
  const station = mockStations.find(s => s.station_id === stationId) || mockStations[0]; // Fallback to Charging Station Sector 5
  
  // Segmented route for mockup (aligned to orthogonal city streets)
  const start = [vehicle.vehicle_latitude, vehicle.vehicle_longitude] as [number, number]; // [lat, lng]
  const end = [station.station_latitude, station.station_longitude] as [number, number]; // [lat, lng]
  
  // Create a strict L-shape path to follow the grid roads
  // 1. Move North/South first
  const mid1 = [
    start[0] + (end[0] - start[0]) * 0.5, 
    start[1]
  ] as [number, number];
  
  const corner = [
    end[0], 
    start[1]
  ] as [number, number];

  // 2. Then move East/West
  const mid2 = [
    end[0], 
    start[1] + (end[1] - start[1]) * 0.5
  ] as [number, number];

  // Helper to convert [lat, lng] to [lng, lat] for GeoJSON
  const ll = (coord: [number, number]) => [coord[1], coord[0]];

  const clearSegment1 = [ll(start), ll(mid1)];
  const heavyTrafficSegment = [ll(mid1), ll(corner)];
  const moderateTrafficSegment = [ll(corner), ll(mid2)];
  const clearSegment2 = [ll(mid2), ll(end)];
  const allPositions = [ll(start), ll(mid1), ll(corner), ll(mid2), ll(end)];

  return (
    <div className="relative h-screen w-screen bg-green-50 overflow-hidden font-sans">
      
      {/* Top Bar overlay */}
      <div className="absolute top-0 left-0 right-0 z-[1000] p-4 pointer-events-none">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <Link 
            to="/user" 
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-slate-200 text-slate-700 hover:text-slate-900 transition-colors pointer-events-auto"
          >
            <ArrowLeft size={24} />
          </Link>
          <div className="rounded-full bg-white px-4 py-2 shadow-lg ring-1 ring-slate-200 pointer-events-auto flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-bold text-slate-900">Navigating</span>
          </div>
        </div>
      </div>

      {/* MapLibre 3D Map */}
      <Map
        initialViewState={{
          longitude: start[1],
          latitude: start[0],
          zoom: 14.5,
          pitch: 65, // Active navigation 3D view
          bearing: 30 // Adjust bearing to look "down the road"
        }}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        style={{ width: '100%', height: '100%' }}
      >
        
        {/* User Location Marker (Simulated Live GPS) */}
        <Marker longitude={start[1]} latitude={start[0]} anchor="center">
          <div className="relative flex items-center justify-center z-50">
            <div className="absolute h-10 w-10 animate-ping rounded-full bg-blue-400 opacity-75"></div>
            <div className="relative flex items-center justify-center h-8 w-8 rounded-full bg-blue-600 border-2 border-white shadow-lg text-white">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
                <circle cx="7" cy="17" r="2"/>
                <path d="M9 17h6"/>
                <circle cx="17" cy="17" r="2"/>
              </svg>
            </div>
          </div>
        </Marker>

        {/* Traffic Warning Marker */}
        <Marker longitude={mid1[1]} latitude={mid1[0]} anchor="center">
          <div className="flex flex-col items-center group cursor-pointer z-50">
            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-red-100 border-2 border-red-600 shadow-md text-red-600 font-bold text-xs">!</div>
            <div className="absolute bottom-full mb-1 hidden group-hover:block w-max">
              <div className="bg-white rounded-xl shadow-lg px-3 py-2 text-xs border border-slate-100">
                <div className="font-semibold text-red-600">Heavy Traffic Ahead</div>
                <div className="text-slate-500 mt-1">+3 min delay</div>
              </div>
            </div>
          </div>
        </Marker>

        {/* Destination Marker */}
        <Marker longitude={end[1]} latitude={end[0]} anchor="bottom">
          <div className="flex flex-col items-center group cursor-pointer z-40">
            <div className="h-4 w-4 bg-slate-900 rounded-full border-2 border-white shadow-md animate-pulse"></div>
            <div className="absolute bottom-full mb-1 w-max">
              <div className="bg-white rounded-xl shadow-lg px-3 py-2 text-xs border border-slate-100">
                <div className="font-semibold text-slate-900">Charging Station {station.station_id}</div>
              </div>
            </div>
          </div>
        </Marker>

        {/* Route Lines */}
        {/* Background dark border */}
        <Source id="bg-route" type="geojson" data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: allPositions } }}>
          <Layer id="bg-route-layer" type="line" paint={{ 'line-color': '#1e3a8a', 'line-width': 10, 'line-opacity': 0.6 }} />
        </Source>

        {/* Colored Segments */}
        <Source id="clear1" type="geojson" data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: clearSegment1 } }}>
          <Layer id="clear1-layer" type="line" paint={{ 'line-color': '#3b82f6', 'line-width': 6 }} />
        </Source>
        
        <Source id="heavy" type="geojson" data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: heavyTrafficSegment } }}>
          <Layer id="heavy-layer" type="line" paint={{ 'line-color': '#ef4444', 'line-width': 6 }} />
        </Source>
        
        <Source id="moderate" type="geojson" data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: moderateTrafficSegment } }}>
          <Layer id="moderate-layer" type="line" paint={{ 'line-color': '#f59e0b', 'line-width': 6 }} />
        </Source>
        
        <Source id="clear2" type="geojson" data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: clearSegment2 } }}>
          <Layer id="clear2-layer" type="line" paint={{ 'line-color': '#3b82f6', 'line-width': 6 }} />
        </Source>

      </Map>

      {/* Bottom Panel overlay */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000] p-4 pointer-events-none">
        <div className="mx-auto max-w-md w-full bg-white rounded-3xl shadow-2xl ring-1 ring-slate-200 overflow-hidden pointer-events-auto">
          
          <div className="p-6">
            <div className="flex items-end justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">12 <span className="text-xl text-slate-500 font-medium">min</span></h1>
                <p className="text-sm text-slate-500 mt-1">2.4 miles • 5:45 PM Arrival</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Navigation size={24} className="transform rotate-45" />
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                <Clock className="text-indigo-500" size={20} />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-900 uppercase tracking-wide">Reserved Slot</p>
                  <p className="text-xs text-slate-500">Slot 3 at {station.station_id} is held for 15 mins</p>
                </div>
              </div>
            </div>

            <Link 
              to="/user"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-4 text-sm font-semibold text-white transition-all hover:bg-red-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              End Navigation
            </Link>
          </div>
          
          <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex justify-between items-center text-sm font-medium">
             <span className="flex items-center gap-1.5 text-slate-600">
               <Battery size={16} className="text-green-500" />
               Est. Arrival Battery: 38%
             </span>
          </div>

        </div>
      </div>

    </div>
  );
}
