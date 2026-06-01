@echo off
echo Stopping all services...
taskkill /F /IM node.exe >/dev/null 2>&1
cd /d "%~dp0tools\pgsql"
.\bin\pg_ctl.exe stop -D data -m fast >/dev/null 2>&1
echo Done.
pause
