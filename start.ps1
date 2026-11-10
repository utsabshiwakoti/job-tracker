# Starts the API and the dashboard, each in its own PowerShell window.
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File C:\Users\utsab\Desktop\Projects\job-tracker\start.ps1
# Close a window (or press Ctrl+C in it) to stop that server.

$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'

# First run on a new machine: create the venv and install packages.
if (-not (Test-Path (Join-Path $backend '.venv'))) {
    Write-Host 'Setting up the Python environment (first run only)...'
    python -m venv (Join-Path $backend '.venv')
    & (Join-Path $backend '.venv\Scripts\python.exe') -m pip install -q -r (Join-Path $backend 'requirements-dev.txt')
}
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    Write-Host 'Installing front-end packages (first run only)...'
    Push-Location $frontend; npm install --no-fund --no-audit; Pop-Location
}

# A fixed dev key keeps you logged in across restarts. Use a real secret if you deploy.
$apiCmd = "`$host.UI.RawUI.WindowTitle = 'Job Tracker API'; Set-Location '$backend'; `$env:SECRET_KEY = 'dev-only-local-key'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --reload-dir app --port 8000"
$webCmd = "`$host.UI.RawUI.WindowTitle = 'Job Tracker Web'; Set-Location '$frontend'; npm run dev -- --port 5173 --strictPort"

Start-Process powershell -ArgumentList '-NoExit', '-Command', $apiCmd
Start-Process powershell -ArgumentList '-NoExit', '-Command', $webCmd

Write-Host 'Started. Dashboard: http://localhost:5173   API docs: http://localhost:8000/docs'
