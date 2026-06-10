@echo off
cd /d "%~dp0tools\pgsql" || exit /b 1
.\bin\pg_ctl.exe start -D data -l logfile -w -t 30
echo PostgreSQL started.
