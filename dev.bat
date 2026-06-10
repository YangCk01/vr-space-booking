@echo off
setlocal

if /I "%~1"=="backend" goto backend
if /I "%~1"=="admin" goto admin
if /I "%~1"=="reservation" goto reservation

title VR Space - Dev
echo ==========================================
echo   VR Space - Dev
echo ==========================================
echo   Backend     : http://localhost:4001
echo   Admin       : http://localhost:5175
echo   Reservation : http://localhost:5176
echo   DB          : vrspace_dev
echo   Jobs        : disabled
echo ==========================================
echo.

call "%~dp0stop-dev.bat" /quiet

start "VR Space - Dev Backend (4001)" cmd /k call "%~f0" backend
timeout /t 3 /nobreak >nul
start "VR Space - Dev Admin (5175)" cmd /k call "%~f0" admin
start "VR Space - Dev Reservation (5176)" cmd /k call "%~f0" reservation

echo Started dev environment.
echo   Admin       http://localhost:5175
echo   Reservation http://localhost:5176
echo.
exit /b 0

:backend
title VR Space - Dev Backend (4001)
cd /d "%~dp0server" || exit /b 1
set NODE_ENV=development
set PORT=4001
set ENABLE_JOBS=false
set "DATABASE_URL=postgresql://vruser:vrpass@127.0.0.1:5432/vrspace_dev?schema=public&connection_limit=15"
call npm run dev:dev
exit /b %errorlevel%

:admin
title VR Space - Dev Admin (5175)
cd /d "%~dp0app" || exit /b 1
set VITE_API_URL=http://localhost:4001/api
set VITE_API_BASE_URL=http://localhost:4001
call npx vite --port 5175 --host 127.0.0.1
exit /b %errorlevel%

:reservation
title VR Space - Dev Reservation (5176)
cd /d "%~dp0app\reservation" || exit /b 1
set VITE_API_URL=http://localhost:4001/api
set VITE_API_BASE_URL=http://localhost:4001
call npx vite --port 5176 --host 127.0.0.1
exit /b %errorlevel%
