@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"

call :ensure_port_free_or_running 4000 "CardCasper402 Backend" "cd /d ""%ROOT%backend"" && npm start"
call :ensure_port_free_or_running 3000 "CardCasper402 Web" "cd /d ""%ROOT%web"" && npm run dev"

echo.
echo Backend URL: http://127.0.0.1:4000
echo Web URL:     http://127.0.0.1:3000
exit /b 0

:ensure_port_free_or_running
set "PORT=%~1"
set "TITLE=%~2"
set "COMMAND=%~3"
set "PID="

for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)"`) do (
  set "PID=%%P"
)

if defined PID (
  echo [%TITLE%] port %PORT% is already in use by PID %PID%. Leaving the existing process running.
  set "PID="
  exit /b 0
)

start "%TITLE%" cmd /k "%COMMAND%"
echo [%TITLE%] starting on port %PORT%...
exit /b 0
