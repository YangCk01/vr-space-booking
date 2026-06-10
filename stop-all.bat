@echo off
echo Stopping dev, test, and PostgreSQL...
call "%~dp0stop-dev.bat" /quiet
call "%~dp0stop-test.bat" /quiet
cd /d "%~dp0tools\pgsql" || exit /b 1
.\bin\pg_ctl.exe stop -D data -m fast >nul 2>&1
echo Done.
pause
