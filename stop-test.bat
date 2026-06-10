@echo off
setlocal
if /I not "%~1"=="/quiet" echo Stopping test environment...
for %%p in (4000 5173 5174) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p"') do taskkill /F /PID %%a >nul 2>&1
)
if /I not "%~1"=="/quiet" (
  echo Stopped test ports: 4000, 5173, 5174
  pause
)
endlocal
