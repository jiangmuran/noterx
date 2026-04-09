Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot ".runtime"
$pidFiles = @(
  Join-Path $runtimeDir "backend.pid",
  Join-Path $runtimeDir "frontend.pid"
)

foreach ($pidFile in $pidFiles) {
  if (-not (Test-Path $pidFile)) {
    continue
  }

  $pidValue = Get-Content $pidFile -ErrorAction SilentlyContinue
  if ($pidValue) {
    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($process) {
      Stop-Process -Id $pidValue -Force
      Write-Host "Stopped PID $pidValue"
    }
  }

  Remove-Item $pidFile -ErrorAction SilentlyContinue
}
