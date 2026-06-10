@echo off
setlocal
if /I not "%~1"=="/quiet" echo Stopping dev environment...
for %%p in (4001 5175 5176) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p"') do taskkill /F /PID %%a >nul 2>&1
)
if /I not "%~1"=="/quiet" (
  echo Stopped dev ports: 4001, 5175, 5176
  pause
)
endlocal
