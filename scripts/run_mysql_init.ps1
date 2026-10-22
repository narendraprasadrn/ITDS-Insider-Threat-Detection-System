# scripts/run_mysql_init.ps1
param (
  [string]$MysqlPath = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
  [string]$User = "root",
  [string]$Password = "Narendra@2006"
)

Write-Host "Initializing MySQL schemas and seeding target_db..." -ForegroundColor Cyan

if (-not (Test-Path $MysqlPath)) {
  Write-Error "mysql.exe not found at $MysqlPath. Please adjust the path parameter."
  exit 1
}

Write-Host "1. Running 01_init_schemas.sql..." -ForegroundColor Yellow
Get-Content ./scripts/mysql-init/01_init_schemas.sql -Raw | & $MysqlPath -u $User "-p$Password"

Write-Host "2. Running 02_seed_target_db.sql..." -ForegroundColor Yellow
Get-Content ./scripts/mysql-init/02_seed_target_db.sql -Raw | & $MysqlPath -u $User "-p$Password"

Write-Host "MySQL initialization complete!" -ForegroundColor Green
