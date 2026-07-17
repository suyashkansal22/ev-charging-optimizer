"""Price forecaster — predict `future_price_per_kwh[horizon]` per station,
producing the `Forecast` shape from `contracts/schemas.md` (Person 4 owns this).

Pipeline
--------
1. **Synthetic history** — for each station, generate ~14 days of hourly
   price samples driven by:
     - a base price (per-station bias),
     - a daily time-of-day curve (low overnight, peaks at commute hours),
     - a weekly pattern (weekday vs. weekend),
     - station load as a co-variate (higher load -> higher price),
     - Gaussian noise.
   This stands in for real grid+market data (a future hook can drop in a
   CSV/DB feed without changing this module's interface).
2. **Feature engineering** — `sin/cos` encodings of hour-of-day and
   day-of-week, station-one-hot, and a lag-1h / lag-24h price feature
   per station. Output: a (rows, features) matrix.
3. **Model** — `sklearn.ensemble.GradientBoostingRegressor` per station,
   selected for its interview-grade explainability vs. accuracy trade-off
   (deterministic, monotonic-friendly, tree-based). Trained to predict the
   `t+1` .. `t+H` price for each horizon slot; for H=6 (~120 min) we
   train one regressor per slot OR a single multi-output regressor. The
   default is one regressor per slot (cleaner per-slot calibration).
4. **Snapshot** — return a list of `Forecast` rows with `future_price_per_kwh`
   of length `slot_count`. All values clipped to a configurable minimum
   (default 1.0 INR/kWh) so the engine never sees a negative price.

CLI
---
    python simulator/price_forecaster.py --days 14 --horizon-mins 120
    python simulator/price_forecaster.py --days 14 --out simulator/output
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import pickle
import random
import sys
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor

# ---- model constants (documented so the numbers are reproducible) -----------
DEFAULT_SAMPLES_PER_DAY = 24          # hourly granularity
DAYS_HISTORY = 14                      # ~2 weeks of synthetic history
HORIZON_MINS = 120                     # matches the seed fixtures
SLOT_MINUTES = 20.0                    # matches the seed fixtures
DEFAULT_SLOT_COUNT = int(HORIZON_MINS / SLOT_MINUTES)   # = 6
DEFAULT_MIN_PRICE = 1.0                # floor on predicted price/kWh
RNG_SEED = 42

# Default per-station biases so the synthetic market looks plausible.
# (person 4 owns this list — feel free to tune)
DEFAULT_STATIONS_BIAS: Dict[str, float] = {
    "ST-1": 9.5,
    "ST-2": 12.0,
    "ST-3": 7.8,
}


@dataclass
class ForecastCfg:
    """Static config the forecaster needs."""
    station_ids: List[str]
    horizon_mins: int = HORIZON_MINS
    slot_minutes: float = SLOT_MINUTES
    days_history: int = DAYS_HISTORY
    samples_per_day: int = DEFAULT_SAMPLES_PER_DAY
    station_bias: Optional[Dict[str, float]] = None  # default = DEFAULT_STATIONS_BIAS
    rng_seed: int = RNG_SEED
    min_price: float = DEFAULT_MIN_PRICE

    @property
    def slot_count(self) -> int:
        return max(1, int(round(self.horizon_mins / self.slot_minutes)))


# ---- step 1: synthetic history ----------------------------------------------

def _hour_curve(hour: float) -> float:
    """Daily price shape: deep valleys overnight, two peaks at 9 and 19."""
    morning = 2.5 * math.exp(-((hour - 9.0) ** 2) / 1.5)
    evening = 3.0 * math.exp(-((hour - 19.0) ** 2) / 2.0)
    night = -2.0 * math.exp(-((hour - 3.0) ** 2) / 4.0)
    return morning + evening + night


def _weekday_curve(day_of_week: int) -> float:
    """Light weekly pattern: slightly cheaper on weekends."""
    return -0.6 if day_of_week >= 5 else 0.0


def synth_history(cfg: ForecastCfg) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Generate synthetic per-station price history.

    Returns:
      t_index       (n_samples,)  float hour-of-day
      day_index     (n_samples,)  int   day-of-week
      prices        (n_samples, n_stations)  INR/kWh
    """
    rng = random.Random(cfg.rng_seed)
    n = cfg.samples_per_day * cfg.days_history
    t_index = np.zeros(n, dtype=float)
    day_index = np.zeros(n, dtype=int)
    prices = np.zeros((n, len(cfg.station_ids)), dtype=float)
    biases = cfg.station_bias or DEFAULT_STATIONS_BIAS
    for i in range(n):
        hour = (i % cfg.samples_per_day) * (24.0 / cfg.samples_per_day)
        dow = (i // cfg.samples_per_day) % 7
        t_index[i] = hour
        day_index[i] = dow
        day_factor = _hour_curve(hour) + _weekday_curve(dow)
        load_factor = sum(1.5 * math.exp(-((hour - h) ** 2) / 4.0)
                          for h in (9.0, 19.0))   # synthetic aggregate load curve
        for j, sid in enumerate(cfg.station_ids):
            base = biases.get(sid, 9.0)
            noise = rng.gauss(0.0, 0.35)
            prices[i, j] = base + 0.30 * day_factor + 0.15 * load_factor + noise
    return t_index, day_index, prices


# ---- step 2: feature engineering --------------------------------------------

def _features(t: np.ndarray, d: np.ndarray,
              prices: np.ndarray, slot_idx: int) -> Tuple[np.ndarray, np.ndarray]:
    """Build the (X, y) pair for predicting the slot-th-ahead price per station.

    Lag features are per-station so the model can learn station-specific momentum.
    """
    n, n_st = prices.shape
    # X columns: sin(hour), cos(hour), sin(dow), cos(dow), p_lag_1h, p_lag_24h, station_one_hot
    base = np.stack([
        np.sin(2 * math.pi * t / 24.0),
        np.cos(2 * math.pi * t / 24.0),
        np.sin(2 * math.pi * d / 7.0),
        np.cos(2 * math.pi * d / 7.0),
    ], axis=1)                                                       # (n, 4)
    p_lag_1h = np.vstack([prices[0:1, :], prices[:-1, :]])            # (n, n_st)
    p_lag_24h_idx = max(0, n - 24)
    p_lag_24h = np.vstack([
        np.tile(prices[:1, :], (24, 1)),
        prices[:-24, :],
    ])[:n, :]
    X_per_station = np.concatenate([base,
                                     p_lag_1h,
                                     p_lag_24h], axis=1)              # (n, 4 + 2*n_st)
    # y = price at slot_idx ahead. Truncate so we have valid targets.
    cutoff = n - slot_idx
    y = prices[slot_idx:, :]
    X = X_per_station[:cutoff, :]
    return X, y


# ---- step 3: training + inference -------------------------------------------

def _train_per_slot(prices_history: np.ndarray,
                    t_index: np.ndarray, day_index: np.ndarray,
                    slot_count: int, station_ids: Sequence[str],
                    *, rng_seed: int) -> List[List[GradientBoostingRegressor]]:
    """Train one `GradientBoostingRegressor` per (slot, station).

    Returns a `slot_count` x `n_stations` matrix of regressors — each
    predicts the price of one station one slot ahead, given the current
    features."""
    models: List[List[GradientBoostingRegressor]] = []
    n_st = len(station_ids)
    for slot in range(slot_count):
        X, y = _features(t_index, day_index, prices_history, slot)
        col: List[GradientBoostingRegressor] = []
        for j in range(n_st):
            m = GradientBoostingRegressor(
                n_estimators=80, max_depth=3, learning_rate=0.05,
                random_state=rng_seed + 1000 * slot + j,
            )
            m.fit(X, y[:, j])
            col.append(m)
        models.append(col)
    return models


@dataclass
class _LiveContext:
    """Features at the moment we want to predict from."""
    hour: float
    day_of_week: int
    p_lag_1h: List[float]            # n_stations
    p_lag_24h: List[float]           # n_stations


def _live_feature_row(ctx: _LiveContext, n_st: int) -> np.ndarray:
    base = np.array([
        math.sin(2 * math.pi * ctx.hour / 24.0),
        math.cos(2 * math.pi * ctx.hour / 24.0),
        math.sin(2 * math.pi * ctx.day_of_week / 7.0),
        math.cos(2 * math.pi * ctx.day_of_week / 7.0),
    ])
    lags = np.array(list(ctx.p_lag_1h) + list(ctx.p_lag_24h))
    return np.concatenate([base, lags]).reshape(1, -1)


def _build_live_context(prices_history: np.ndarray,
                         *, hour: Optional[float] = None,
                         day_of_week: Optional[int] = None) -> _LiveContext:
    """Use the most recent history rows as the 'current' lag features."""
    n = prices_history.shape[0]
    last_idx = n - 1
    if hour is None:
        hour = (last_idx % DEFAULT_SAMPLES_PER_DAY) * (24.0 / DEFAULT_SAMPLES_PER_DAY)
    if day_of_week is None:
        day_of_week = (last_idx // DEFAULT_SAMPLES_PER_DAY) % 7
    p_lag_1h = prices_history[max(0, last_idx - 1), :].tolist()
    p_lag_24h = prices_history[max(0, last_idx - 24), :].tolist()
    return _LiveContext(hour=hour, day_of_week=day_of_week,
                        p_lag_1h=p_lag_1h, p_lag_24h=p_lag_24h)


def forecast(station_ids: Sequence[str],
             cfg: Optional[ForecastCfg] = None,
             *,
             history_prices: Optional[np.ndarray] = None,
             history_t: Optional[np.ndarray] = None,
             history_dow: Optional[np.ndarray] = None) -> List[Dict[str, Any]]:
    """Train + predict. Returns a list of `Forecast` rows.

    `history_*` can be passed in by callers that want to reuse a single
    synthetic history (e.g. the orchestrator); otherwise we build one
    ourselves. The price *now* is taken from the last history row.

    Output shape (per contracts/schemas.md):
        station_id            : str
        current_price_per_kwh : float    # last history row
        future_price_per_kwh  : list[float]  # len == slot_count
        horizon_mins          : int
    """
    cfg = cfg or ForecastCfg(station_ids=list(station_ids))
    if history_prices is None:
        history_t, history_dow, history_prices = synth_history(cfg)
    models = _train_per_slot(history_prices, history_t, history_dow,
                              cfg.slot_count, station_ids,
                              rng_seed=cfg.rng_seed)

    n_st = len(station_ids)
    ctx = _build_live_context(history_prices)
    X_live = _live_feature_row(ctx, n_st)

    forecasts: List[Dict[str, Any]] = []
    for j, sid in enumerate(station_ids):
        future = []
        for slot in range(cfg.slot_count):
            price_pred = float(models[slot][j].predict(X_live)[0])
            price_pred = max(price_pred, cfg.min_price)
            future.append(round(price_pred, 2))
        current = float(history_prices[-1, j])
        forecasts.append({
            "station_id": sid,
            "current_price_per_kwh": round(current, 2),
            "future_price_per_kwh": future,
            "horizon_mins": cfg.horizon_mins,
        })
    return forecasts


# ---- CLI ---------------------------------------------------------------------

DEFAULT_STATION_IDS = list(DEFAULT_STATIONS_BIAS.keys())


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Train a per-station price forecaster and emit a snapshot.")
    ap.add_argument("--days", type=int, default=DAYS_HISTORY,
                    help=f"days of synthetic history (default {DAYS_HISTORY})")
    ap.add_argument("--horizon-mins", type=int, default=HORIZON_MINS,
                    help=f"forecast horizon (default {HORIZON_MINS})")
    ap.add_argument("--slot-minutes", type=float, default=SLOT_MINUTES,
                    help=f"forecast slot length in minutes (default {SLOT_MINUTES})")
    ap.add_argument("--seed", type=int, default=RNG_SEED, help="RNG seed (default 42)")
    ap.add_argument("--model-out", metavar="PATH",
                    help="if given, pickle the per-slot GBRT models to PATH")
    ap.add_argument("--out", metavar="DIR",
                    help="if given, write forecasts.json into DIR")
    args = ap.parse_args(argv)

    cfg = ForecastCfg(station_ids=DEFAULT_STATION_IDS,
                      horizon_mins=args.horizon_mins,
                      slot_minutes=args.slot_minutes,
                      days_history=args.days,
                      rng_seed=args.seed)
    t, dow, prices = synth_history(cfg)
    forecasts = forecast(cfg.station_ids, cfg,
                          history_prices=prices, history_t=t, history_dow=dow)

    print(f"days history     : {args.days}")
    print(f"slot count       : {cfg.slot_count}  (horizon {cfg.horizon_mins} min / "
          f"{cfg.slot_minutes} min slot)")
    for f in forecasts:
        series = " ".join(f"{p:>5.2f}" for p in f["future_price_per_kwh"])
        print(f"station {f['station_id']}: now={f['current_price_per_kwh']:.2f}"
              f"  fut=[{series}]  horizon={f['horizon_mins']} min")

    if args.model_out:
        t, dow, prices = synth_history(cfg)   # deterministic with the same seed
        # train a clean copy so it matches the snapshot we just printed
        cfg2 = ForecastCfg(station_ids=cfg.station_ids, rng_seed=cfg.rng_seed,
                           days_history=cfg.days_history,
                           slot_minutes=cfg.slot_minutes,
                           horizon_mins=cfg.horizon_mins)
        models = _train_per_slot(prices, t, dow, cfg2.slot_count, cfg2.station_ids,
                                  rng_seed=cfg2.rng_seed)
        with open(args.model_out, "wb") as f:
            pickle.dump({"config": cfg2.__dict__, "models": models}, f)
        print(f"pickled {cfg2.slot_count * len(cfg2.station_ids)} model(s) -> {args.model_out}")

    if args.out:
        outdir = pathlib.Path(args.out)
        outdir.mkdir(parents=True, exist_ok=True)
        (outdir / "forecasts.json").write_text(json.dumps(forecasts, indent=2) + "\n")
        print(f"wrote {len(forecasts)} forecast(s) -> {outdir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
