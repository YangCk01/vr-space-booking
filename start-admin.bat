@echo off
cd /d "%~dp0app"
npx vite --port 5173 --host 0.0.0.0
