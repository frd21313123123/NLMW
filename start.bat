@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "APP_DIR=%ROOT_DIR%lmstudio-chat"
set "APP_URL=http://localhost:3000"
set "SERVER_SCRIPT=%APP_DIR%\server.js"
set "SERVER_PID="

cd /d "%APP_DIR%" || goto :fail_cd

echo Starting NLMW Chat...
echo %APP_URL%
echo.

set "NPM_CONFIG_CACHE=%CD%\.npm-cache"

where node >nul 2>nul
if errorlevel 1 goto :fail_node

where npm.cmd >nul 2>nul
if errorlevel 1 goto :fail_npm

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing '%APP_URL%/api/health' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if not errorlevel 1 goto :find_running_server

for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($conn) { [string]$conn.OwningProcess }"`) do set "SERVER_PID=%%P"
if defined SERVER_PID for /f "delims=0123456789" %%A in ("%SERVER_PID%") do set "SERVER_PID="
if defined SERVER_PID goto :fail_port_in_use

goto :start_server

:find_running_server
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($conn) { [string]$conn.OwningProcess }"`) do set "SERVER_PID=%%P"
if defined SERVER_PID for /f "delims=0123456789" %%A in ("%SERVER_PID%") do set "SERVER_PID="
if defined SERVER_PID goto :stop_existing

goto :fail_port_in_use

:start_server
if not exist "node_modules" (
  echo Installing dependencies...
  if exist "package-lock.json" (
    call npm.cmd ci
  ) else (
    call npm.cmd install
  )
  if errorlevel 1 goto :fail_install
  echo.
)

call npm.cmd start
if errorlevel 1 goto :fail_start
goto :end

:stop_existing
echo Stopping existing server process %SERVER_PID%...
taskkill /PID %SERVER_PID% /T /F >nul 2>nul
if errorlevel 1 goto :fail_stop

timeout /t 1 /nobreak >nul
set "SERVER_PID="
goto :start_server

:fail_port_in_use
echo Port 3000 is already in use by another process.
echo Close that process or change the app port, then try again.
goto :fail

:fail_cd
echo Failed to open project directory:
echo %APP_DIR%
goto :fail

:fail_node
echo Node.js was not found in PATH.
echo Install Node.js 18 or newer and try again.
goto :fail

:fail_npm
echo npm.cmd was not found in PATH.
echo Reinstall Node.js or fix PATH and try again.
goto :fail

:fail_install
echo Dependency installation failed.
goto :fail

:fail_start
echo Server start failed.
goto :fail

:fail_stop
echo Failed to stop existing server process %SERVER_PID%.
goto :fail

:fail
echo.
pause

:end
endlocal
