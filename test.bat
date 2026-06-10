@echo off
setlocal enabledelayedexpansion

if /I "%~1"=="backend" goto backend
if /I "%~1"=="admin" goto admin
if /I "%~1"=="reservation" goto reservation

title VR Space - Test
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1 -ExpandProperty IPAddress)"`) do set TEST_HOST=%%i
if "%TEST_HOST%"=="" set TEST_HOST=127.0.0.1

echo ==========================================
echo   VR Space - Test
echo ==========================================
echo   Backend     : http://%TEST_HOST%:4000
echo   Admin       : http://%TEST_HOST%:5173
echo   Reservation : http://%TEST_HOST%:5174
echo   DB          : vrspace
echo   Jobs        : enabled
echo ==========================================
echo.

call "%~dp0stop-test.bat" /quiet

echo [1/3] Building backend...
cd /d "%~dp0server" || exit /b 1
call npm run build
if errorlevel 1 exit /b 1
echo.

echo [2/3] Building admin frontend for LAN...
cd /d "%~dp0app" || exit /b 1
set VITE_API_URL=http://%TEST_HOST%:4000/api
set VITE_API_BASE_URL=http://%TEST_HOST%:4000
call npx vite build
if errorlevel 1 exit /b 1
echo.

echo [3/3] Building reservation frontend for LAN...
cd /d "%~dp0app\reservation" || exit /b 1
set VITE_API_URL=http://%TEST_HOST%:4000/api
set VITE_API_BASE_URL=http://%TEST_HOST%:4000
call npx vite build
if errorlevel 1 exit /b 1
echo.

start "VR Space - Test Backend (4000)" cmd /k call "%~f0" backend %TEST_HOST%
timeout /t 3 /nobreak >nul
start "VR Space - Test Admin (5173)" cmd /k call "%~f0" admin
start "VR Space - Test Reservation (5174)" cmd /k call "%~f0" reservation

echo Started test environment.
echo   Admin       http://%TEST_HOST%:5173
echo   Reservation http://%TEST_HOST%:5174
echo.
exit /b 0

:backend
title VR Space - Test Backend (4000)
set TEST_HOST=%~2
if "%TEST_HOST%"=="" set TEST_HOST=127.0.0.1
cd /d "%~dp0server" || exit /b 1
set NODE_ENV=development
set PORT=4000
set ENABLE_JOBS=true
set "DATABASE_URL=postgresql://vruser:vrpass@127.0.0.1:5432/vrspace?schema=public&connection_limit=15"
set "CORS_ORIGIN=http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://%TEST_HOST%:5173,http://%TEST_HOST%:5174"
node dist\server.js
exit /b %errorlevel%

:admin
title VR Space - Test Admin (5173)
cd /d "%~dp0app" || exit /b 1
call npx vite preview --port 5173 --host 0.0.0.0
exit /b %errorlevel%

:reservation
title VR Space - Test Reservation (5174)
cd /d "%~dp0app\reservation" || exit /b 1
call npx vite preview --port 5174 --host 0.0.0.0
exit /b %errorlevel%
