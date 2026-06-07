from typing import Optional, List
from pydantic import BaseModel


class Vehicle(BaseModel):
    vehicle_id: str
    vehicle_latitude: float
    vehicle_longitude: float
    current_battery_percent: float
    battery_capacity_kwh: float
    vehicle_max_charge_power_kw: float
    # RECOMMENDED (not in the base list): how full the car wants to be.
    # Defaults to 100 so the engine knows the job size. See README note.
    target_battery_percent: float = 100.0
    # fleet only
    vehicle_destination_lat: Optional[float] = None
    vehicle_destination_lng: Optional[float] = None
    vehicle_destination_deadline: Optional[str] = None


class Station(BaseModel):
    station_id: str
    station_latitude: float
    station_longitude: float
    transformer_id: str            # foreign key -> Transformer.transformer_id
    number_of_chargers: int
    available_chargers: int
    charger_power_kw: float
    queue_length: int
    estimated_wait_time: float     # minutes


class Transformer(BaseModel):
    transformer_id: str
    transformer_capacity_kw: float
    current_transformer_load_kw: float


class RouteInfo(BaseModel):
    """Traffic parameters for one (vehicle, station) pair (via maps API)."""
    vehicle_id: str
    station_id: str
    travel_distance_to_station: float       # km
    travel_time_to_station: float           # minutes
    # fleet only
    travel_distance_from_station_to_destination: Optional[float] = None
    travel_time_from_station_to_destination: Optional[float] = None


class Forecast(BaseModel):
    station_id: str
    current_price_per_kwh: float
    future_price_per_kwh: List[float]       # one entry per upcoming slot
    horizon_mins: int


class Assignment(BaseModel):
    vehicle_id: str
    station_id: str
    time_slot: int
    est_cost: float


class OptimizeResponse(BaseModel):
    assignments: List[Assignment]
