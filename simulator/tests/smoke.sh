#!/usr/bin/env bash
# Cross-platform end-to-end smoke test for the simulator (Person 4).
#
# Runs without Docker and without the API stack being up. If the API IS up
# (http://localhost:8000 reachable), the smoke also exercises the publish
# path through `POST /requests`.
#
# Exits 0 on success, non-zero on any failure. CI-friendly.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

PYTHON="${PYTHON:-python}"
OUTPUT="${OUTPUT:-${REPO_ROOT}/simulator/output}"
PASS=0
FAIL=0

# Helpers --------------------------------------------------------------------
banner() { printf "\n=== %s ===\n" "$1"; }
check_ok() { echo "[ OK ] $1"; PASS=$((PASS+1)); }
check_fail() { echo "[FAIL] $1"; FAIL=$((FAIL+1)); }
have() { command -v "$1" >/dev/null 2>&1; }

# Sanity: python + required libs ---------------------------------------------
banner "prerequisites"
if ! have "${PYTHON}"; then
  check_fail "${PYTHON} not on PATH"
  echo "  install Python 3.11+ and retry"
  exit 1
fi
check_ok "python on PATH ($(${PYTHON} --version))"

if ! ${PYTHON} -c "import simpy, sklearn, numpy" >/dev/null 2>&1; then
  check_fail "simpy / scikit-learn / numpy not installed"
  echo "  run: pip install -r simulator/requirements.txt"
  exit 1
fi
check_ok "simpy, scikit-learn, numpy importable"

# 1. End-to-end orchestrator run (must produce the 4 JSONs first) -----------
banner "1. orchestrator --mode all"
if ${PYTHON} simulator/run.py --mode all --out "${OUTPUT}" > /tmp/run.txt 2>&1; then
  expected=(stations.json transformers.json forecasts.json vehicles.json)
  missing=()
  for f in "${expected[@]}"; do
    if [ ! -s "${OUTPUT}/${f}" ]; then
      missing+=("${f}")
    fi
  done
  if [ ${#missing[@]} -eq 0 ]; then
    check_ok "orchestrator produced all 4 JSONs"
  else
    check_fail "orchestrator missing files: ${missing[*]}"
  fi
else
  check_fail "orchestrator exited non-zero; tail:"
  tail -n 30 /tmp/run.txt | sed 's/^/    /'
fi

# 2. Contract validator must pass against the data contract -----------------
banner "2. contract validator"
${PYTHON} simulator/contract_check.py --all "${OUTPUT}" > /tmp/contract.txt 2>&1 || true
if grep -q "^PASS" /tmp/contract.txt; then
  check_ok "contract_check passed for ${OUTPUT}"
else
  check_fail "contract_check failed; tail of output:"
  tail -n 20 /tmp/contract.txt | sed 's/^/    /'
fi

# 3. Pytest suite must pass cleanly ------------------------------------------
banner "3. pytest"
if ${PYTHON} -m pytest simulator/tests/ -q > /tmp/pytest.txt 2>&1; then
  tail -n 5 /tmp/pytest.txt
  passed=$(grep -oE "[0-9]+ passed" /tmp/pytest.txt | head -n 1 | awk '{print $1}')
  if [ -n "${passed:-}" ] && [ "${passed}" -gt 0 ]; then
    check_ok "pytest (${passed} test(s) passed)"
  else
    check_fail "pytest reported 0 passed; tail:"
    tail -n 20 /tmp/pytest.txt | sed 's/^/    /'
  fi
else
  check_fail "pytest exited non-zero; tail:"
  tail -n 30 /tmp/pytest.txt | sed 's/^/    /'
fi

# 4. Optional: live API publish (only if API is up) -------------------------
banner "4. live API publish (skipped if API is down)"
API_BASE="${API_BASE:-http://localhost:8000}"
if have curl && curl -fsS -m 2 "${API_BASE}/health" > /dev/null 2>&1; then
  # fire one vehicle at the live API; we expect a 200 or the 422 the API
  # raises when no assignment is feasible (neither is a failure of the
  # simulator — but for sanity we expect ANY response, not a connection error)
  VIDEO='{"vehicle_id":"SMOKE-001","vehicle_latitude":30.74,"vehicle_longitude":76.78,"current_battery_percent":12,"battery_capacity_kwh":50,"vehicle_max_charge_power_kw":50,"target_battery_percent":80}'
  code=$(curl -s -o /tmp/live.txt -w "%{http_code}" -m 5 \
    -H "Content-Type: application/json" \
    -d "${VIDEO}" "${API_BASE}/requests" || echo "000")
  case "${code}" in
    2*) check_ok "POST /requests accepted (HTTP ${code})";;
    4*) check_ok "POST /requests rejected with HTTP ${code} (expected for out-of-data scenarios)";;
    *)  check_fail "POST /requests returned ${code}: $(cat /tmp/live.txt)";;
  esac
else
  echo "[SKIP] ${API_BASE} not reachable — live API publish skipped (good for CI)"
fi

# Summary ---------------------------------------------------------------------
banner "summary"
echo "  passed: ${PASS}"
echo "  failed: ${FAIL}"
if [ "${FAIL}" -eq 0 ]; then
  echo
  echo "  PASS — simulator smoke test green."
  exit 0
else
  echo
  echo "  FAIL — ${FAIL} check(s) failed."
  exit 1
fi
