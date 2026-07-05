#!/usr/bin/env python3
"""Cross-platform end-to-end smoke test (owned by Person 3 / integration).

`smoke_test.sh` is the quick bash one-liner; this is its portable sibling. It needs no
curl, no bash, no pip installs — just Python stdlib — so it runs the same on Windows,
macOS and Linux. It exercises the whole loop through the API and checks the results
against the data contract, exiting non-zero on any failure (usable in CI).

    docker compose up --build          # in one terminal
    python scripts/smoke_test.py       # in another

Checks:
  1. GET  /health        -> {"status":"ok"}
  2. POST /optimize      -> one Assignment per vehicle, well-formed, station exists
  3. GET  /assignments   -> same set comes back from the Redis cache
  4. GET  /state/live    -> live snapshot present, per-transformer utilisation sane
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

DEFAULT_BASE = "http://localhost:8000"


def _req(method: str, url: str, timeout: float = 10.0):
    req = urllib.request.Request(url, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))


class Checker:
    def __init__(self) -> None:
        self.failures = 0

    def ok(self, label: str) -> None:
        print(f"  [ OK ] {label}")

    def fail(self, label: str) -> None:
        self.failures += 1
        print(f"  [FAIL] {label}")

    def expect(self, cond: bool, label: str) -> bool:
        (self.ok if cond else self.fail)(label)
        return cond


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="End-to-end smoke test for the EV API.")
    ap.add_argument("--base", default=DEFAULT_BASE, help=f"API base URL (default {DEFAULT_BASE})")
    args = ap.parse_args(argv)
    base = args.base.rstrip("/")
    c = Checker()

    print(f"\nEV Charging Optimizer — smoke test against {base}\n")

    # 1) health -----------------------------------------------------------------
    try:
        status, health = _req("GET", f"{base}/health")
        c.expect(status == 200 and health.get("status") == "ok", f"/health -> {health}")
    except urllib.error.URLError as e:
        c.fail(f"/health unreachable ({e}). Is `docker compose up` running?")
        print("\n  Aborting — the API is not up.\n")
        return 1

    # 2) optimize ---------------------------------------------------------------
    seed_vehicles = None
    try:
        _, seed = _req("GET", f"{base}/seed")
        seed_vehicles = {v["vehicle_id"] for v in seed.get("vehicles", [])}
        seed_stations = {s["station_id"] for s in seed.get("stations", [])}
    except Exception:
        seed_stations = None

    _, opt = _req("POST", f"{base}/optimize")
    assignments = opt.get("assignments", [])
    c.expect(len(assignments) > 0, f"/optimize returned {len(assignments)} assignments")

    fields_ok = all(
        isinstance(a.get("vehicle_id"), str)
        and isinstance(a.get("station_id"), str)
        and isinstance(a.get("time_slot"), int)
        and isinstance(a.get("est_cost"), (int, float))
        and a.get("est_cost") >= 0
        for a in assignments
    )
    c.expect(fields_ok, "every assignment matches the Assignment contract shape")

    ids = [a["vehicle_id"] for a in assignments]
    c.expect(len(ids) == len(set(ids)), "exactly one assignment per vehicle (no dupes)")
    if seed_vehicles:
        c.expect(set(ids) == seed_vehicles, "every seeded vehicle got an assignment")
    if seed_stations:
        c.expect(all(a["station_id"] in seed_stations for a in assignments),
                 "every assignment points at a real station")

    # 3) assignments cache ------------------------------------------------------
    _, cached = _req("GET", f"{base}/assignments")
    cached_ids = {a["vehicle_id"] for a in cached.get("assignments", [])}
    c.expect(cached_ids == set(ids), "GET /assignments returns the same set from Redis")

    # 4) live state -------------------------------------------------------------
    try:
        _, live = _req("GET", f"{base}/state/live")
        has_snapshot = live.get("generated_at") is not None
        c.expect(has_snapshot, "GET /state/live has a snapshot after optimize")
        if has_snapshot:
            txs = live.get("transformers", [])
            c.expect(len(txs) > 0, f"live snapshot exposes {len(txs)} transformer(s)")
            util_sane = all(
                isinstance(t.get("peak_utilisation_pct"), (int, float))
                and t["peak_utilisation_pct"] >= 0
                for t in txs
            )
            c.expect(util_sane, "per-transformer utilisation values are sane")
    except urllib.error.HTTPError as e:
        c.fail(f"/state/live errored ({e}) — is livestate wired into main.py?")

    print()
    if c.failures == 0:
        print("  PASS — the whole loop works end-to-end.\n")
        return 0
    print(f"  FAIL — {c.failures} check(s) failed.\n")
    return 1


if __name__ == "__main__":
    sys.exit(main())
