@echo off
cd /d "%~dp0server"
set "DATABASE_URL=postgresql://vruser:vrpass@127.0.0.1:5432/vrspace?schema=public&connection_limit=15"

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000') do (
    echo [Info] Killing process using port 4000 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)

timeout /t 1 >nul

node dist\server.js
