import { CircleMarker, Popup, Tooltip } from "react-leaflet";
import { stationColor } from "../services/dashboardUtils";
import type { Station } from "../types";

type StationMarkerProps = {
  station: Station;
};

export function StationMarker({ station }: StationMarkerProps) {
  const stationPosition: [number, number] = [station.station_latitude, station.station_longitude];

  return (
    <CircleMarker
      center={stationPosition}
      radius={13}
      pathOptions={{
        color: stationColor(station),
        fillColor: stationColor(station),
        fillOpacity: 0.92,
        weight: 3
      }}
    >
      <Tooltip direction="top" offset={[0, -8]}>
        {station.station_id}
      </Tooltip>
      <Popup>
        <div className="min-w-44">
          <div className="font-semibold">{station.station_id}</div>
          <div>{station.available_chargers} available chargers</div>
          <div>{station.charger_power_kw} kW max charger power</div>
          <div>{station.estimated_wait_time} min estimated wait</div>
          <div>{station.transformer_id}</div>
        </div>
      </Popup>
    </CircleMarker>
  );
}
