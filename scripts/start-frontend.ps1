Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $repoRoot "frontend"
$npmCmd = "npm.cmd"
$runtimeDir = Join-Path $repoRoot ".runtime"
$pidFile = Join-Path $runtimeDir "frontend.pid"
$stdoutFile = Join-Path $runtimeDir "frontend.stdout.log"
$stderrFile = Join-Path $runtimeDir "frontend.stderr.log"

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

$listeningPid = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty OwningProcess
if ($listeningPid) {
  Write-Host "Port 5173 is already in use by PID $listeningPid"
  Set-Content -Path $pidFile -Value $listeningPid
  exit 0
}

if (Test-Path $pidFile) {
  $existingPid = Get-Content $pidFile -ErrorAction SilentlyContinue
  if ($existingPid) {
    $existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
    if ($existingProcess) {
      Write-Host "Frontend already running with PID $existingPid"
      exit 0
    }
  }
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}

Remove-Item $stdoutFile, $stderrFile -ErrorAction SilentlyContinue

$process = Start-Process `
  -FilePath $npmCmd `
  -ArgumentList "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173" `
  -WorkingDirectory $frontendDir `
  -RedirectStandardOutput $stdoutFile `
  -RedirectStandardError $stderrFile `
  -PassThru

Set-Content -Path $pidFile -Value $process.Id
Write-Host "Frontend started on http://127.0.0.1:5173 (PID $($process.Id))"
Write-Host "Logs:"
Write-Host "  $stdoutFile"
Write-Host "  $stderrFile"
