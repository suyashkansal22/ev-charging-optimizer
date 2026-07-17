"""Tests for the demand / Vehicle generator (simulator/vehicle_generator.py).

Invariants we enforce on every emitted `Vehicle`:
  * shape exactly matches `contracts/schemas.md` (no extra keys; `is_fleet`
    fields appear together, never partially)
  * `current_battery_percent` and `target_battery_percent` are in [0, 100]
  * `target >= current` (you can't ask for less charge than you have)
  * `vehicle_max_charge_power_kw` and `battery_capacity_kwh` are positive
  * positions lie within a few km of a configured station anchor
  * fleet vehicles all carry an ISO-8601 deadline in the future
  * the generator is determinstic for a fixed seed (re-running is identical)
  * vehicles are sorted by urgency (lowest battery first)
"""
from __future__ import annotations

import math
import sys
import pathlib
from datetime import datetime, timezone

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from vehicle_generator import (
    VehicleGenCfg, generate_vehicles, DEFAULT_ANCHORS, _offset_km_to_latlon,
    EARTH_RADIUS_KM,
)


BASE_FIELDS = {"vehicle_id", "vehicle_latitude", "vehicle_longitude",
               "current_battery_percent", "battery_capacity_kwh",
               "vehicle_max_charge_power_kw", "target_battery_percent"}
FLEET_FIELDS = {"vehicle_destination_lat", "vehicle_destination_lng",
                "vehicle_destination_deadline"}


# ---- helpers -----------------------------------------------------------------

def _hav(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in km (matches routing/route_generator.haversine_km)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


# ---- shape -------------------------------------------------------------------

def test_all_vehicles_have_exact_base_shape():
    cfg = VehicleGenCfg(count=20, fleet_fraction=0.0)
    for v in generate_vehicles(cfg):
        assert set(v.keys()) == BASE_FIELDS, v


def test_fleet_vehicles_carry_full_set_of_fleet_fields():
    """A fleet vehicle has ALL three fleet fields, never a partial subset."""
    cfg = VehicleGenCfg(count=20, fleet_fraction=0.5)
    for v in generate_vehicles(cfg):
        if v.get("vehicle_destination_deadline"):
            assert FLEET_FIELDS.issubset(v.keys()), v


def test_non_fleet_have_no_fleet_keys():
    cfg = VehicleGenCfg(count=20, fleet_fraction=0.0)
    for v in generate_vehicles(cfg):
        assert v.keys() == BASE_FIELDS, v


# ---- ranges ------------------------------------------------------------------

def test_battery_percent_in_range():
    cfg = VehicleGenCfg(count=50, fleet_fraction=0.2)
    for v in generate_vehicles(cfg):
        assert 0.0 <= v["current_battery_percent"] <= 100.0, v
        assert 0.0 <= v["target_battery_percent"] <= 100.0, v


def test_target_at_least_current():
    cfg = VehicleGenCfg(count=50, fleet_fraction=0.2)
    for v in generate_vehicles(cfg):
        assert v["target_battery_percent"] >= v["current_battery_percent"], v


def test_charger_profile_positive():
    cfg = VehicleGenCfg(count=50, fleet_fraction=0.2)
    for v in generate_vehicles(cfg):
        assert v["vehicle_max_charge_power_kw"] > 0, v
        assert v["battery_capacity_kwh"] > 0, v


# ---- geography ---------------------------------------------------------------

def test_position_near_a_station_anchor():
    cfg = VehicleGenCfg(count=40, fleet_fraction=0.0)
    vehicles = generate_vehicles(cfg)
    for v in vehicles:
        nearest = None
        for a in DEFAULT_ANCHORS:
            d = _hav(v["vehicle_latitude"], v["vehicle_longitude"],
                     a["station_latitude"], a["station_longitude"])
            nearest = d if nearest is None else min(nearest, d)
        assert nearest is not None and nearest <= 5.0, (v, nearest)


# ---- urgency ordering --------------------------------------------------------

def test_vehicles_sorted_by_battery_ascending():
    cfg = VehicleGenCfg(count=30, fleet_fraction=0.2)
    vehicles = generate_vehicles(cfg)
    batteries = [v["current_battery_percent"] for v in vehicles]
    assert batteries == sorted(batteries), "vehicles must be sorted by urgency"


def test_unique_vehicle_ids():
    cfg = VehicleGenCfg(count=30, fleet_fraction=0.2)
    ids = [v["vehicle_id"] for v in generate_vehicles(cfg)]
    assert len(ids) == len(set(ids))


# ---- deadlines ---------------------------------------------------------------

def test_fleet_deadline_is_iso_future():
    cfg = VehicleGenCfg(count=20, fleet_fraction=1.0)
    fixed_now = datetime(2026, 7, 17, 9, 0, 0, tzinfo=timezone.utc)
    for v in generate_vehicles(cfg, now=fixed_now):
        deadline_str = v["vehicle_destination_deadline"]
        assert isinstance(deadline_str, str)
        # ISO-8601 with timezone offset (the API expects this)
        parsed = datetime.fromisoformat(deadline_str)
        assert parsed.tzinfo is not None
        assert parsed > fixed_now


def test_fleet_fraction_rounded_to_integer():
    cfg = VehicleGenCfg(count=20, fleet_fraction=0.15)
    vehicles = generate_vehicles(cfg)
    fleet = sum(1 for v in vehicles if v.get("vehicle_destination_deadline"))
    assert fleet == cfg.fleet_count  # 15 % * 20 = 3


# ---- determinism -------------------------------------------------------------

def test_same_seed_same_vehicles():
    """Same seed AND same `now` -> identical snapshot. Without `now`, the
    deadline embeds the wall-clock microseconds, so two consecutive calls
    would diverge by exactly those digits."""
    fixed_now = datetime(2026, 7, 17, 9, 0, 0, tzinfo=timezone.utc)
    a = generate_vehicles(VehicleGenCfg(count=10, fleet_fraction=0.2, rng_seed=7),
                          now=fixed_now)
    b = generate_vehicles(VehicleGenCfg(count=10, fleet_fraction=0.2, rng_seed=7),
                          now=fixed_now)
    assert a == b


def test_different_seed_different_vehicles():
    fixed_now = datetime(2026, 7, 17, 9, 0, 0, tzinfo=timezone.utc)
    a = generate_vehicles(VehicleGenCfg(count=10, fleet_fraction=0.2, rng_seed=7),
                          now=fixed_now)
    b = generate_vehicles(VehicleGenCfg(count=10, fleet_fraction=0.2, rng_seed=8),
                          now=fixed_now)
    assert a != b


def test_offset_helper_sanity():
    """A 1 km north offset should add ~0.009 degrees latitude."""
    lat, lng = _offset_km_to_latlon(30.74, 76.78, 1.0, 0.0)
    assert abs(lat - 30.74 - 0.00898) < 0.001
    assert abs(lng - 76.78) < 0.001
