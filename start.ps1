# NoteRx One-Click Start Script (PowerShell)
# Usage: .\start.ps1

$ErrorActionPreference = "Stop"

Write-Host "NoteRx Starting..." -ForegroundColor Cyan

# Check .env
if (-not (Test-Path "backend\.env") -and -not (Test-Path ".env")) {
    Write-Host "Warning: .env not found. Run: copy .env.example backend\.env" -ForegroundColor Yellow
}

$projectRoot = $PSScriptRoot
$backendPid = $null
$frontendPid = $null

# Register cleanup on exit
Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
    if ($global:backendPid)  { Stop-Process -Id $global:backendPid -ErrorAction SilentlyContinue }
    if ($global:frontendPid) { Stop-Process -Id $global:frontendPid -ErrorAction SilentlyContinue }
    Write-Host "`nAll services stopped." -ForegroundColor Red
}

# Start backend
Write-Host "Starting backend..." -ForegroundColor Green
Set-Location "$projectRoot\backend"

if (-not (Test-Path "venv")) {
    python -m venv venv
}
& "$projectRoot\backend\venv\Scripts\Activate.ps1"
pip install -r requirements.txt -q

$backendProc = Start-Process -FilePath "python" -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload" -NoNewWindow -PassThru
$backendPid = $backendProc.Id
$global:backendPid = $backendPid

Set-Location $projectRoot

# Start frontend
Write-Host "Starting frontend..." -ForegroundColor Green
Set-Location "$projectRoot\frontend"
npm install --silent 2>$null

$frontendProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npx", "vite", "--port", "5173" -NoNewWindow -PassThru
$frontendPid = $frontendProc.Id
$global:frontendPid = $frontendPid

Set-Location $projectRoot

Write-Host ""
Write-Host "NoteRx is running!" -ForegroundColor Green
Write-Host "   Frontend: http://localhost:5173"
Write-Host "   Backend:  http://localhost:8000"
Write-Host "   API Docs: http://localhost:8000/docs"
Write-Host ""
Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Yellow
Write-Host ""

# Wait - Ctrl+C will trigger the Exiting event
while ($true) {
    Start-Sleep -Seconds 1
}
