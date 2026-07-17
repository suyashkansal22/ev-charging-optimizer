"""Validate the simulator's emitted JSON files against the data contract.

The contract is the SINGLE SOURCE OF TRUTH (see `contracts/schemas.md`), and
its authoritative mirror is the Pydantic models in `api/app/models.py` (this
keeps Person 4's code strictly inside `simulator/` while still letting us
catch any field rename against the API's actual models).

Usage
-----
    python simulator/contract_check.py simulator/output/*.json
    python simulator/contract_check.py --all simulator/output/   # checks every *.json

Exits non-zero the moment any file fails to load into its expected model.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
from typing import Any, Dict, List, Optional, Type

# We import the API's models read-only — touching api/app/models.py would
# violate Person 4's ownership boundary.
REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from api.app.models import (    # noqa: E402  (after sys.path mutation)
    Vehicle, Station, Transformer, RouteInfo, Forecast, Assignment,
)


# Map: emitted filename -> expected model class
DEFAULT_FILE_MODEL_MAP: Dict[str, Type[Any]] = {
    "vehicles.json": Vehicle,
    "stations.json": Station,
    "transformers.json": Transformer,
    "routes.json": RouteInfo,
    "forecasts.json": Forecast,
    "assignments.json": Assignment,
}


def _check_file(path: pathlib.Path, model: Type[Any]) -> List[str]:
    errs: List[str] = []
    try:
        raw = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        return [f"{path}: invalid JSON ({exc})"]
    if not isinstance(raw, list):
        return [f"{path}: expected a JSON list, got {type(raw).__name__}"]
    for i, row in enumerate(raw):
        try:
            # pydantic v2 — skip-strict-on-extra so an extra key fails noisily.
            model.model_validate(row)
        except Exception as exc:
            errs.append(f"{path}[{i}]: {exc}")
    return errs


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Validate simulator output against the data contract.")
    ap.add_argument("files", nargs="*",
                    help="JSON files to validate (defaults: --everything in --all)")
    ap.add_argument("--all", metavar="DIR",
                    help="validate every *.json in DIR against the default filename->model map")
    ap.add_argument("--quiet", action="store_true",
                    help="only print on success / failure (no per-file noise)")
    args = ap.parse_args(argv)

    targets: List[tuple[pathlib.Path, Type[Any]]] = []

    if args.all:
        d = pathlib.Path(args.all)
        for name, model in DEFAULT_FILE_MODEL_MAP.items():
            p = d / name
            if p.exists():
                targets.append((p, model))

    for f in args.files:
        p = pathlib.Path(f)
        # try mapping by basename, else validate as Vehicle (the most common shape)
        model = DEFAULT_FILE_MODEL_MAP.get(p.name, Vehicle)
        targets.append((p, model))

    if not targets:
        ap.error("no files to validate (give paths or --all DIR)")

    total_errors = 0
    for path, model in targets:
        errs = _check_file(path, model)
        if errs:
            total_errors += len(errs)
            print(f"FAIL  {path.name} ({model.__name__}): {len(errs)} error(s)")
            for e in errs:
                print(f"  - {e}")
        elif not args.quiet:
            print(f"OK    {path.name} ({model.__name__})")

    if total_errors == 0:
        print(f"\nPASS — {len(targets)} file(s) match the data contract.")
        return 0
    print(f"\nFAIL — {total_errors} contract violation(s).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
