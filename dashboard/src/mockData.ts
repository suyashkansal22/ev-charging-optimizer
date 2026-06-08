import type { Assignment, Forecast, RouteInfo, Station, Transformer, Vehicle } from "./types";

export const mockVehicles: Vehicle[] = [
  {
    vehicle_id: "EV-101",
    vehicle_latitude: 30.7339,
    vehicle_longitude: 76.7794,
    current_battery_percent: 18,
    battery_capacity_kwh: 62,
    vehicle_max_charge_power_kw: 55,
    target_battery_percent: 90,
    vehicle_destination_lat: 30.7217,
    vehicle_destination_lng: 76.7702,
    vehicle_destination_deadline: "2026-06-08T21:30:00+05:30"
  },
  {
    vehicle_id: "EV-204",
    vehicle_latitude: 30.7421,
    vehicle_longitude: 76.7878,
    current_battery_percent: 42,
    battery_capacity_kwh: 74,
    vehicle_max_charge_power_kw: 80,
    target_battery_percent: 85,
    vehicle_destination_lat: 30.7526,
    vehicle_destination_lng: 76.7721,
    vehicle_destination_deadline: "2026-06-08T22:00:00+05:30"
  },
  {
    vehicle_id: "EV-318",
    vehicle_latitude: 30.7248,
    vehicle_longitude: 76.7649,
    current_battery_percent: 67,
    battery_capacity_kwh: 58,
    vehicle_max_charge_power_kw: 48,
    target_battery_percent: 95,
    vehicle_destination_lat: 30.7331,
    vehicle_destination_lng: 76.8011,
    vehicle_destination_deadline: "2026-06-08T22:40:00+05:30"
  },
  {
    vehicle_id: "EV-427",
    vehicle_latitude: 30.7527,
    vehicle_longitude: 76.7655,
    current_battery_percent: 29,
    battery_capacity_kwh: 82,
    vehicle_max_charge_power_kw: 120,
    target_battery_percent: 88,
    vehicle_destination_lat: 30.7368,
    vehicle_destination_lng: 76.7486,
    vehicle_destination_deadline: "2026-06-08T21:50:00+05:30"
  },
  {
    vehicle_id: "EV-512",
    vehicle_latitude: 30.7167,
    vehicle_longitude: 76.7851,
    current_battery_percent: 76,
    battery_capacity_kwh: 64,
    vehicle_max_charge_power_kw: 70,
    target_battery_percent: 100,
    vehicle_destination_lat: 30.7046,
    vehicle_destination_lng: 76.7952,
    vehicle_destination_deadline: "2026-06-08T23:10:00+05:30"
  }
];

export const mockStations: Station[] = [
  {
    station_id: "ST-A",
    station_latitude: 30.7355,
    station_longitude: 76.7821,
    transformer_id: "TX-01",
    number_of_chargers: 8,
    available_chargers: 3,
    charger_power_kw: 60,
    queue_length: 2,
    estimated_wait_time: 14
  },
  {
    station_id: "ST-B",
    station_latitude: 30.7469,
    station_longitude: 76.7705,
    transformer_id: "TX-02",
    number_of_chargers: 6,
    available_chargers: 1,
    charger_power_kw: 90,
    queue_length: 5,
    estimated_wait_time: 33
  },
  {
    station_id: "ST-C",
    station_latitude: 30.7184,
    station_longitude: 76.7734,
    transformer_id: "TX-03",
    number_of_chargers: 10,
    available_chargers: 6,
    charger_power_kw: 45,
    queue_length: 1,
    estimated_wait_time: 7
  },
  {
    station_id: "ST-D",
    station_latitude: 30.7282,
    station_longitude: 76.8008,
    transformer_id: "TX-01",
    number_of_chargers: 5,
    available_chargers: 2,
    charger_power_kw: 120,
    queue_length: 3,
    estimated_wait_time: 20
  }
];

export const mockTransformers: Transformer[] = [
  {
    transformer_id: "TX-01",
    transformer_capacity_kw: 780,
    current_transformer_load_kw: 514
  },
  {
    transformer_id: "TX-02",
    transformer_capacity_kw: 520,
    current_transformer_load_kw: 468
  },
  {
    transformer_id: "TX-03",
    transformer_capacity_kw: 640,
    current_transformer_load_kw: 276
  }
];

export const mockForecasts: Forecast[] = [
  {
    station_id: "ST-A",
    current_price_per_kwh: 11.8,
    future_price_per_kwh: [11.8, 10.9, 9.7, 10.2],
    horizon_mins: 60
  },
  {
    station_id: "ST-B",
    current_price_per_kwh: 12.6,
    future_price_per_kwh: [12.6, 12.1, 10.8, 9.9],
    horizon_mins: 60
  },
  {
    station_id: "ST-C",
    current_price_per_kwh: 10.4,
    future_price_per_kwh: [10.4, 9.8, 9.3, 9.5],
    horizon_mins: 60
  },
  {
    station_id: "ST-D",
    current_price_per_kwh: 13.1,
    future_price_per_kwh: [13.1, 12.4, 11.2, 10.6],
    horizon_mins: 60
  }
];

export const mockAssignments: Assignment[] = [
  { vehicle_id: "EV-101", station_id: "ST-A", time_slot: 1, est_cost: 486.2 },
  { vehicle_id: "EV-204", station_id: "ST-B", time_slot: 3, est_cost: 351.4 },
  { vehicle_id: "EV-318", station_id: "ST-C", time_slot: 2, est_cost: 169.8 },
  { vehicle_id: "EV-427", station_id: "ST-D", time_slot: 2, est_cost: 542.7 },
  { vehicle_id: "EV-512", station_id: "ST-C", time_slot: 0, est_cost: 156.1 }
];

export const mockRoutes: RouteInfo[] = mockVehicles.flatMap((vehicle) =>
  mockStations.map((station) => ({
    vehicle_id: vehicle.vehicle_id,
    station_id: station.station_id,
    travel_distance_to_station:
      Math.round(
        Math.hypot(
          vehicle.vehicle_latitude - station.station_latitude,
          vehicle.vehicle_longitude - station.station_longitude
        ) *
          111 *
          10
      ) / 10,
    travel_time_to_station:
      Math.round(
        Math.hypot(
          vehicle.vehicle_latitude - station.station_latitude,
          vehicle.vehicle_longitude - station.station_longitude
        ) *
          111 *
          2.3 *
          10
      ) / 10,
    travel_distance_from_station_to_destination:
      vehicle.vehicle_destination_lat && vehicle.vehicle_destination_lng
        ? Math.round(
            Math.hypot(
              station.station_latitude - vehicle.vehicle_destination_lat,
              station.station_longitude - vehicle.vehicle_destination_lng
            ) *
              111 *
              10
          ) / 10
        : undefined,
    travel_time_from_station_to_destination:
      vehicle.vehicle_destination_lat && vehicle.vehicle_destination_lng
        ? Math.round(
            Math.hypot(
              station.station_latitude - vehicle.vehicle_destination_lat,
              station.station_longitude - vehicle.vehicle_destination_lng
            ) *
              111 *
              2.3 *
              10
          ) / 10
        : undefined
  }))
);
