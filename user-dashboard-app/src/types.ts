export type Vehicle = {
  vehicle_id: string;
  vehicle_latitude: number;
  vehicle_longitude: number;
  current_battery_percent: number;
  battery_capacity_kwh: number;
  vehicle_max_charge_power_kw: number;
  target_battery_percent: number;
  vehicle_destination_lat?: number;
  vehicle_destination_lng?: number;
  vehicle_destination_deadline?: string;
};

export type Station = {
  station_id: string;
  station_latitude: number;
  station_longitude: number;
  transformer_id: string;
  number_of_chargers: number;
  available_chargers: number;
  charger_power_kw: number;
  queue_length: number;
  estimated_wait_time: number;
};

export type Transformer = {
  transformer_id: string;
  transformer_capacity_kw: number;
  current_transformer_load_kw: number;
};

export type RouteInfo = {
  vehicle_id: string;
  station_id: string;
  travel_distance_to_station: number;
  travel_time_to_station: number;
  travel_distance_from_station_to_destination?: number;
  travel_time_from_station_to_destination?: number;
};

export type Forecast = {
  station_id: string;
  current_price_per_kwh: number;
  future_price_per_kwh: number[];
  horizon_mins: number;
};

export type Assignment = {
  vehicle_id: string;
  station_id: string;
  time_slot: number;
  est_cost: number;
};
