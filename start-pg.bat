@echo off
cd /d "%~dp0tools\pgsql"
.\bin\pg_ctl.exe start -D data -l logfile -w -t 30
echo PostgreSQL started.
pause
