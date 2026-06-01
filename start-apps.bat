@echo off
echo =========================================
echo   VR Space - Start Apps (No Database)
echo =========================================
echo.
echo Make sure PostgreSQL is running first!
echo Run start-pg.bat if not started yet.
echo.
pause
start "Backend API" cmd /k call %~dp0start-backend.bat
start "Admin Dashboard" cmd /k call %~dp0start-admin.bat
start "Reservation" cmd /k call %~dp0start-reservation.bat
