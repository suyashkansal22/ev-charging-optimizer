# Simulator → API ingest spec (Person 4 → Person 2)

> **Status: NOT YET WIRED.** This document specifies the endpoint shape Person 4
> needs Person 2 to add before the simulator can stop writing JSONs to disk
> and start feeding the API live. Until then the simulator emits its snapshots
> to `simulator/output/` and Person 1/3's engine still reads the static
> `api/seed/*.json` fixtures.

## Why

Person 4 (simulator) emits four artefacts that all match `contracts/schemas.md`:

| File | Shape from | Today |
|------|-----------|-------|
| `simulator/output/stations.json` | `Station` | written to disk |
| `simulator/output/transformers.json` | `Transformer` | written to disk |
| `simulator/output/forecasts.json` | `Forecast` | written to disk |
| `simulator/output/vehicles.json` | `Vehicle` | written to disk + POSTed to `/requests` |

Only `Vehicle` has a live ingest path today (`POST /requests`, added by Person 2).
The grid state and price forecasts still need an ingest endpoint so the simulator
can replace the static `api/seed/*.json` fixtures.

## Endpoint spec (proposed)

```
POST /ingest/world
Content-Type: application/json

{ "stations":     [ <Station>, ... ],
  "transformers": [ <Transformer>, ... ],
  "forecasts":    [ <Forecast>, ... ]
}
```

- **Idempotent.** A POST replaces the server's current grid+price state. The
  previous state is overwritten.
- **Atomic per call.** All three lists are validated; if any row is rejected
  the entire POST fails (`422`) with a precise error.
- **Best-effort writes.** Downstream consumers (Redis live-state cache) should
  treat this as a refresh, not a critical write — Redis outage must NOT 500
  the POST (mirror the resilience rule Person 2 already applies to `/optimize`).

### Validation

* Every row must match its model in `api/app/models.py`.
* `forecast.future_price_per_kwh` must be non-empty and have length
  `slot_count` consistent with the rest of the system (today: 6 slots / 2 h).
* `station.transformer_id` must reference a transformer in the same POST.

### Response (200)

```json
{ "ingested": { "stations": 3, "transformers": 2, "forecasts": 3 },
  "writes": { "redis_live_state": true,
              "redis_assignments": "skipped — no /optimize result yet" }
}
```

### Response (422)

```json
{ "detail": [ { "loc": ["forecasts", 1, "horizon_mins"],
                "msg": "value must be a positive integer",
                "type": "value_error" }, ... ]
}
```

## Compatibility notes

* **No new fields are added to the contract.** The endpoint just moves the
  existing shapes from disk → HTTP. `contracts/schemas.md` is unchanged.
* **The simulator writes the same JSON shape to disk.** Person 2 can copy
  the body-validation rule from `simulator/contract_check.py` directly.
* **A old API version can still read `api/seed/*.json`.** Nothing about the
  static-fixtures path is removed; this endpoint is additive.

## Suggested implementation order

1. Add the Pydantic envelope `WorldIngestRequest` to `api/app/models.py`.
2. Add the `POST /ingest/world` endpoint to `api/app/main.py` that validates,
   overwrites an in-process "current world" state, and refreshes Redis.
3. Replace the `_load("stations.json")…` calls inside `/optimize` and
   `/requests` with a read from the in-process current world (fall back to
   the file fixtures if the world has never been POSTed).
4. Update `scripts/smoke_test.py` to POST a simulator snapshot before
   `POST /optimize` so the e2e test exercises the live path.
5. Flip Person 4's orchestrator default mode from `--mode all` (writes to
   disk) to `--mode demo --publish-world` (POSTs every tick).

## What this is *not*

* This spec does NOT propose changing the `solve(...)` signature.
* This spec does NOT propose any new service contract between the API and
  the engine.
* This spec does NOT propose deleting the seed fixtures — they remain the
  fallback when no live world has been POSTed.
