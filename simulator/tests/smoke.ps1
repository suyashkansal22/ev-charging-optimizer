# Cross-platform end-to-end smoke test for the simulator (Person 4).
# Native Windows PowerShell sibling of simulator/tests/smoke.sh.
#
# Runs without Docker and without the API stack being up. If the API IS up
# (http://localhost:8000 reachable), the smoke also exercises the publish
# path through `POST /requests`.
#
# Exits 0 on success, non-zero on any failure. CI-friendly.

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir '..\..')
Set-Location $RepoRoot

$Python = $env:PYTHON
if (-not $Python) { $Python = 'python' }
$OutputDir = if ($env:OUTPUT) { $env:OUTPUT } else { Join-Path $RepoRoot 'simulator\output' }

$Script:Pass = 0
$Script:Fail = 0

function Banner($msg) { Write-Host "`n=== $msg ===" }
function Check-Ok([string]$msg) { Write-Host "[ OK ] $msg"; $Script:Pass++ }
function Check-Fail([string]$msg) { Write-Host "[FAIL] $msg"; $Script:Fail++ }

# 1. Prerequisites -----------------------------------------------------------
Banner 'prerequisites'
try {
    $pyVersion = (& $Python --version) 2>&1
    Check-Ok "python on PATH ($pyVersion)"
} catch {
    Check-Fail "$Python not on PATH"
    exit 1
}

$libsOk = $true
foreach ($lib in @('simpy', 'sklearn', 'numpy')) {
    & $Python -c "import $lib" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Check-Fail "$lib not importable"
        $libsOk = $false
    }
}
if (-not $libsOk) {
    Write-Host "  run: pip install -r simulator/requirements.txt"
    exit 1
}
Check-Ok 'simpy, scikit-learn, numpy importable'

# 2. Orchestrator --mode all (must produce the 4 JSONs first) ---------------
Banner '1. orchestrator --mode all'
$runOut = & $Python simulator/run.py --mode all --out $OutputDir 2>&1
if ($LASTEXITCODE -eq 0) {
    $expected = @('stations.json','transformers.json','forecasts.json','vehicles.json')
    $missing = @()
    foreach ($f in $expected) {
        $path = Join-Path $OutputDir $f
        if (-not (Test-Path $path) -or (Get-Item $path).Length -eq 0) {
            $missing += $f
        }
    }
    if ($missing.Count -eq 0) {
        Check-Ok 'orchestrator produced all 4 JSONs'
    } else {
        Check-Fail ("orchestrator missing files: " + ($missing -join ', '))
    }
} else {
    Check-Fail "orchestrator exited non-zero"
    $runOut | Select-Object -Last 30 | ForEach-Object { Write-Host "    $_" }
}

# 3. Contract validator ------------------------------------------------------
Banner '2. contract validator'
$contractOut = & $Python simulator/contract_check.py --all $OutputDir 2>&1
if ($LASTEXITCODE -eq 0 -and ($contractOut -match '^PASS')) {
    Check-Ok "contract_check passed for $OutputDir"
} else {
    Check-Fail "contract_check failed"
    $contractOut | ForEach-Object { Write-Host "    $_" }
}

# 4. Pytest suite ------------------------------------------------------------
Banner '3. pytest'
$pytestOut = & $Python -m pytest simulator/tests/ -q 2>&1
if ($LASTEXITCODE -eq 0) {
    $pytestOut | Select-Object -Last 5 | ForEach-Object { Write-Host "  $_" }
    $passedMatch = [regex]::Match(($pytestOut -join "`n"), '(\d+) passed')
    if ($passedMatch.Success -and [int]$passedMatch.Groups[1].Value -gt 0) {
        $passed = $passedMatch.Groups[1].Value
        Check-Ok "pytest ($passed test(s) passed)"
    } else {
        Check-Fail "pytest output didn't contain 'passed' count"
    }
} else {
    Check-Fail "pytest exited non-zero"
    $pytestOut | Select-Object -Last 30 | ForEach-Object { Write-Host "    $_" }
}

# 5. Optional: live API publish (if API up) ----------------------------------
Banner '4. live API publish (skipped if API is down)'
$apiBase = if ($env:API_BASE) { $env:API_BASE } else { 'http://localhost:8000' }
$healthOk = $false
try {
    & $Python -c "import urllib.request,sys; urllib.request.urlopen(sys.argv[1]+'/health', timeout=2).read()" $apiBase 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $healthOk = $true }
} catch { $healthOk = $false }

if ($healthOk) {
    $body = '{"vehicle_id":"SMOKE-001","vehicle_latitude":30.74,"vehicle_longitude":76.78,"current_battery_percent":12,"battery_capacity_kwh":50,"vehicle_max_charge_power_kw":50,"target_battery_percent":80}'
    # Use Python urllib (consistent with the /health check above) instead of
    # Invoke-WebRequest, which triggers Windows PowerShell's "Script Execution
    # Risk" warning because it parses responses as HTML by default.
    $postOut = & $Python -c @"
import sys, urllib.request, urllib.error
url = sys.argv[1] + '/requests'
body = sys.argv[2].encode()
req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'}, method='POST')
try:
    r = urllib.request.urlopen(req, timeout=5)
    print('OK', r.status)
except urllib.error.HTTPError as e:
    print('HTTP', e.code)
except Exception as e:
    print('ERR', type(e).__name__)
"@ $apiBase $body 2>&1
    $postOut = ($postOut -join ' ').Trim()
    if ($postOut -match '^OK\s+(\d+)') {
        Check-Ok "POST /requests accepted (HTTP $($Matches[1]))"
    } elseif ($postOut -match '^HTTP\s+(\d+)') {
        Check-Ok "POST /requests rejected (HTTP $($Matches[1])) (expected for out-of-data scenarios)"
    } else {
        Check-Fail "POST /requests failed: $postOut"
    }
} else {
    Write-Host "[SKIP] $apiBase not reachable - live API publish skipped (good for CI)"
}

# Summary ---------------------------------------------------------------------
Banner 'summary'
Write-Host "  passed: $Script:Pass"
Write-Host "  failed: $Script:Fail"
if ($Script:Fail -eq 0) {
    Write-Host ""
    Write-Host "  PASS - simulator smoke test green."
    exit 0
} else {
    Write-Host ""
    Write-Host "  FAIL - $($Script:Fail) check(s) failed."
    exit 1
}
