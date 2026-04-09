Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot

& (Join-Path $scriptDir "start-backend.ps1")
& (Join-Path $scriptDir "start-frontend.ps1")

Start-Sleep -Seconds 3

try {
  $backend = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/health" -UseBasicParsing -TimeoutSec 10
  Write-Host "Backend health:" $backend.Content
} catch {
  Write-Warning "Backend health check failed: $($_.Exception.Message)"
}

try {
  $frontend = Invoke-WebRequest -Uri "http://127.0.0.1:5173" -UseBasicParsing -TimeoutSec 10
  Write-Host "Frontend status:" $frontend.StatusCode
} catch {
  Write-Warning "Frontend check failed: $($_.Exception.Message)"
}
