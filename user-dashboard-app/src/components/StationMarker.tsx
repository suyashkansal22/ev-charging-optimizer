import { Marker, Tooltip } from "react-leaflet";
import { stationColor } from "../services/dashboardUtils";
import { createStationIcon } from "../services/markerIcons";
import type { Station } from "../types";

type StationMarkerProps = {
  station: Station;
  onSelect: (station: Station) => void;
  isDimmed?: boolean;
  isSelected?: boolean;
};

export function StationMarker({
  station,
  onSelect,
  isDimmed = false,
  isSelected = false
}: StationMarkerProps) {
  const stationIcon = createStationIcon(
    stationColor(station),
    { isDimmed, isSelected }
  );
  const stationPosition: [number, number] = [station.station_latitude, station.station_longitude];

  return (
    <Marker
      position={stationPosition}
      icon={stationIcon}
      eventHandlers={{
        click: (event) => {
          event.originalEvent.stopPropagation();
          onSelect(station);
        }
      }}
    >
      <Tooltip direction="top" offset={[0, -8]}>
        {station.station_id}
      </Tooltip>
    </Marker>
  );
}
