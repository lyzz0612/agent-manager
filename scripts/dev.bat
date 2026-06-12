@echo off
setlocal

if "%APP_ENV%"=="" set APP_ENV=development
if "%ADMIN_TOKEN%"=="" set ADMIN_TOKEN=123456
if "%PORT%"=="" set PORT=3000

echo [agent-manager] APP_ENV=%APP_ENV%
echo [agent-manager] ADMIN_TOKEN=%ADMIN_TOKEN%
echo [agent-manager] PORT=%PORT%
echo [agent-manager] Starting Vite dev server in a new terminal window...

start "agent-manager-web" cmd /k "npm run dev:web"

echo [agent-manager] Starting Axum server in current terminal...
npm run dev:server
