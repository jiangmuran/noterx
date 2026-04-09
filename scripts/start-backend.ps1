Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot "backend"
$pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"
$runtimeDir = Join-Path $repoRoot ".runtime"
$pidFile = Join-Path $runtimeDir "backend.pid"
$stdoutFile = Join-Path $runtimeDir "backend.stdout.log"
$stderrFile = Join-Path $runtimeDir "backend.stderr.log"

if (-not (Test-Path $pythonExe)) {
  throw "Backend Python not found: $pythonExe"
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

$listeningPid = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty OwningProcess
if ($listeningPid) {
  Write-Host "Port 8000 is already in use by PID $listeningPid"
  Set-Content -Path $pidFile -Value $listeningPid
  exit 0
}

if (Test-Path $pidFile) {
  $existingPid = Get-Content $pidFile -ErrorAction SilentlyContinue
  if ($existingPid) {
    $existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
    if ($existingProcess) {
      Write-Host "Backend already running with PID $existingPid"
      exit 0
    }
  }
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}

Remove-Item $stdoutFile, $stderrFile -ErrorAction SilentlyContinue

$process = Start-Process `
  -FilePath $pythonExe `
  -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000" `
  -WorkingDirectory $backendDir `
  -RedirectStandardOutput $stdoutFile `
  -RedirectStandardError $stderrFile `
  -PassThru

Set-Content -Path $pidFile -Value $process.Id
Write-Host "Backend started on http://127.0.0.1:8000 (PID $($process.Id))"
Write-Host "Logs:"
Write-Host "  $stdoutFile"
Write-Host "  $stderrFile"
