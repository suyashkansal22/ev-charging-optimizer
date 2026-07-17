"""Tests for the price forecaster (simulator/price_forecaster.py).

Invariants we enforce on every emitted `Forecast`:
  * shape exactly matches `contracts/schemas.md` (no extra / missing fields)
  * `len(future_price_per_kwh) == slot_count` (config-driven)
  * `current_price_per_kwh` and every future slot are > 0 and finite
  * deterministic for a fixed seed (re-running gives the identical snapshot)
"""
from __future__ import annotations

import math
import sys
import pathlib

import pytest
import numpy as np

# Make the simulator/ folder importable without an install step.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from price_forecaster import (
    ForecastCfg, synth_history, forecast, DEFAULT_STATION_IDS,
    _features, _build_live_context, _train_per_slot,
)
from grid_model import simulate, DEFAULT_STATIONS, DEFAULT_TRANSFORMERS


FIELD_SET = {"station_id", "current_price_per_kwh",
             "future_price_per_kwh", "horizon_mins"}


# ---- helper ------------------------------------------------------------------

def _default_cfg(**overrides) -> ForecastCfg:
    base = {"station_ids": list(DEFAULT_STATION_IDS)}
    base.update(overrides)
    return ForecastCfg(**base)


# ---- shape + value invariants -----------------------------------------------

def test_every_forecast_has_exact_contract_shape():
    out = forecast(DEFAULT_STATION_IDS, _default_cfg())
    for f in out:
        assert set(f.keys()) == FIELD_SET, f"unexpected fields: {set(f.keys())}"


def test_every_future_slot_length_matches_slot_count():
    cfg = _default_cfg()
    out = forecast(DEFAULT_STATION_IDS, cfg)
    assert cfg.slot_count > 0
    for f in out:
        assert len(f["future_price_per_kwh"]) == cfg.slot_count, f


def test_every_price_is_positive_and_finite():
    out = forecast(DEFAULT_STATION_IDS, _default_cfg())
    for f in out:
        assert math.isfinite(f["current_price_per_kwh"]), f
        assert f["current_price_per_kwh"] > 0.0, f
        for p in f["future_price_per_kwh"]:
            assert math.isfinite(p), f
            assert p > 0.0, ("negative/zero predicted price", f)


def test_horizon_mins_is_an_int_and_matches_cfg():
    cfg = _default_cfg(horizon_mins=120)
    out = forecast(DEFAULT_STATION_IDS, cfg)
    for f in out:
        assert f["horizon_mins"] == 120
        assert isinstance(f["horizon_mins"], int)


def test_slot_count_derivation_from_horizon_and_slot_minutes():
    cfg = ForecastCfg(station_ids=list(DEFAULT_STATION_IDS),
                       horizon_mins=120, slot_minutes=20.0)
    assert cfg.slot_count == 6
    cfg = ForecastCfg(station_ids=list(DEFAULT_STATION_IDS),
                       horizon_mins=60, slot_minutes=20.0)
    assert cfg.slot_count == 3


# ---- determinism -------------------------------------------------------------

def test_same_seed_same_forecasts():
    a = forecast(DEFAULT_STATION_IDS, _default_cfg(rng_seed=42))
    b = forecast(DEFAULT_STATION_IDS, _default_cfg(rng_seed=42))
    assert a == b


def test_different_seeds_diverge():
    a = forecast(DEFAULT_STATION_IDS, _default_cfg(rng_seed=42))
    b = forecast(DEFAULT_STATION_IDS, _default_cfg(rng_seed=43))
    assert a != b


# ---- feature engineering & training smoke ----------------------------------

def test_history_shapes_match_docs():
    cfg = _default_cfg(days_history=14, samples_per_day=24)
    t, d, p = synth_history(cfg)
    assert t.shape[0] == 14 * 24
    assert d.shape[0] == 14 * 24
    assert p.shape == (14 * 24, len(DEFAULT_STATION_IDS))


def test_features_truncate_to_valid_target_count():
    cfg = _default_cfg(days_history=14, samples_per_day=24)
    t, d, p = synth_history(cfg)
    n_samples = t.shape[0]
    X, y = _features(t, d, p, slot_idx=3)
    assert X.shape[0] == y.shape[0] == n_samples - 3


def test_models_predict_finite_values():
    cfg = _default_cfg(days_history=7, samples_per_day=24)
    t, d, p = synth_history(cfg)
    models = _train_per_slot(p, t, d, cfg.slot_count, cfg.station_ids, rng_seed=cfg.rng_seed)
    assert len(models) == cfg.slot_count
    ctx = _build_live_context(p)
    base = [math.sin(2 * math.pi * ctx.hour / 24.0),
            math.cos(2 * math.pi * ctx.hour / 24.0),
            math.sin(2 * math.pi * ctx.day_of_week / 7.0),
            math.cos(2 * math.pi * ctx.day_of_week / 7.0)]
    X_live = np.array([base + list(ctx.p_lag_1h) + list(ctx.p_lag_24h)])
    for slot_models in models:
        for m in slot_models:
            pred = m.predict(X_live)
            assert math.isfinite(float(pred[0]))
            assert float(pred[0]) > 0.0


# ---- "model learned something" ------------------------------------------------

def test_predictions_track_known_daily_cycle():
    """Peak predictions should generally occur at the morning/evening commute
    windows (close to hour 9 and 19) when the model is fed those live hours.

    This is a soft test: the strongest predicted slot should be in
    [morning peak +/- 3h] OR [`evening peak +/- 3h]."""
    cfg = _default_cfg(days_history=21)
    t, d, p = synth_history(cfg)
    models = _train_per_slot(p, t, d, cfg.slot_count, cfg.station_ids, rng_seed=cfg.rng_seed)
    # Build a live row at exactly hour 9 (morning peak)
    hours = [3.0, 9.0, 13.0, 19.0, 23.0]
    ctx_base = _build_live_context(p)
    means = []
    for h in hours:
        ctx = type(ctx_base)(hour=h, day_of_week=ctx_base.day_of_week,
                             p_lag_1h=ctx_base.p_lag_1h, p_lag_24h=ctx_base.p_lag_24h)
        base = [math.sin(2 * math.pi * ctx.hour / 24.0),
                math.cos(2 * math.pi * ctx.hour / 24.0),
                math.sin(2 * math.pi * ctx.day_of_week / 7.0),
                math.cos(2 * math.pi * ctx.day_of_week / 7.0)]
        X_live = np.array([base + list(ctx.p_lag_1h) + list(ctx.p_lag_24h)])
        m_pred = np.mean([float(models[0][j].predict(X_live)[0])
                          for j in range(len(ctx.p_lag_1h))])
        means.append(m_pred)
    peak_idx = int(np.argmax(means))
    assert peak_idx in (1, 3), (
        f"model didn't pick up the daily cycle: hour->pred was {list(zip(hours, means))}"
    )
