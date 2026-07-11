import L from "leaflet";

type MarkerIconOptions = {
  isDimmed?: boolean;
  isSelected?: boolean;
};

function createMarkerSvg(color: string, symbol: string, options: MarkerIconOptions = {}) {
  const opacity = options.isDimmed ? 0.4 : 1;
  const scale = options.isSelected ? 1.25 : 1;

  return `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="opacity: ${opacity}; transform: scale(${scale}); transform-origin: center; filter: drop-shadow(0 2px 4px rgba(15, 23, 42, 0.35));">
      <circle cx="12" cy="12" r="10.5" fill="${color}" stroke="white" stroke-width="2"/>
      ${symbol}
    </svg>
  `;
}

export function createVehicleIcon(color: string, options: MarkerIconOptions = {}) {
  return L.divIcon({
    className: "custom-map-marker",
    html: createMarkerSvg(
      color,
      `
        <path d="M6.7 13.1h.8l1-2.5c.3-.7.9-1.1 1.6-1.1h3.8c.7 0 1.3.4 1.6 1.1l1 2.5h.8c.5 0 .9.4.9.9v2.5c0 .5-.4.9-.9.9h-.7v.6c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-.6H9.2v.6c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-.6h-.7c-.5 0-.9-.4-.9-.9V14c0-.5.4-.9.9-.9Z" fill="white"/>
        <path d="M9.9 10.9 9.2 13h5.6l-.7-2.1c-.1-.2-.3-.3-.5-.3h-3.2c-.2 0-.4.1-.5.3Z" fill="${color}"/>
        <path d="M8.2 15.2h1.5M14.3 15.2h1.5" stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
      `,
      options
    ),
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
    tooltipAnchor: [0, -12]
  });
}

export function createStationIcon(color: string, options: MarkerIconOptions = {}) {
  return L.divIcon({
    className: "custom-map-marker",
    html: createMarkerSvg(
      color,
      `
        <rect x="8" y="6" width="7" height="12" rx="1.4" fill="white"/>
        <rect x="9.5" y="7.8" width="4" height="2.8" rx=".5" fill="${color}"/>
        <path d="M11.5 11.5h1.4l-1 2.1h1.7l-2.2 3.1.4-2.2h-1.5l1.2-3Z" fill="${color}"/>
        <path d="M15 9h1c1 0 1.8.8 1.8 1.8v3.8c0 .8.6 1.4 1.4 1.4" stroke="white" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M17 7.7v1.8M18.3 7.7v1.8" stroke="white" stroke-width="1.1" stroke-linecap="round"/>
      `,
      options
    ),
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
    tooltipAnchor: [0, -12]
  });
}
