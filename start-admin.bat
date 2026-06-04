@echo off
cd /d "%~dp0app"

:: Ensure test frontend uses test backend (4000)
if exist .env.development.local del .env.development.local >nul 2>&1
if exist .env.local.bak (
    if exist .env.local del .env.local >nul 2>&1
    ren .env.local.bak .env.local >nul 2>&1
)

npx vite --port 5173 --host 0.0.0.0
