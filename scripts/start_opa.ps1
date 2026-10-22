# scripts/start_opa.ps1
Write-Host "Starting OPA server on port 8181..." -ForegroundColor Cyan
& ".\opa.exe" run --server --addr :8181 ./policies
