@echo off
cd /d "%~dp0app\reservation"
npx vite --port 5174 --host 0.0.0.0
