@echo off
setlocal

if "%ADMIN_TOKEN%"=="" (
  echo ADMIN_TOKEN is required.
  exit /b 1
)

set IMAGE_NAME=agent-manager-local
set IMAGE_TAG=dev

docker build -t %IMAGE_NAME%:%IMAGE_TAG% .
if errorlevel 1 exit /b 1

docker compose -f docker-compose.yml up --force-recreate

endlocal
