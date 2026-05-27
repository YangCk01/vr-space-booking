@echo off
chcp 65001 >nul
title VR Space 停止器
echo =========================================
echo   VR Space 系统停止脚本
echo =========================================
echo.

set "BASEDIR=%~dp0"
set "BASEDIR=%BASEDIR:~0,-1%"

REM =========================================
REM 自动检测并配置 Node.js / npm / PM2 路径
REM =========================================

REM 检查 node 是否可用
node --version >nul 2>&1
if errorlevel 1 (
    if exist "D:\Nodejs\node.exe" (
        set "PATH=D:\Nodejs;%PATH%"
    ) else if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    )
)

REM 检查 pm2 是否可用
pm2 --version >nul 2>&1
if errorlevel 1 (
    if exist "%USERPROFILE%\AppData\Roaming\npm\pm2.cmd" (
        set "PATH=%USERPROFILE%\AppData\Roaming\npm;%PATH%"
    )
)

REM =========================================
REM 1. 停止前端服务（通过端口号查找进程）
REM =========================================
echo [1/4] 停止用户端预约 (端口 5174)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5174') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo        [OK] 用户端预约已停止

echo [2/4] 停止管理后台 (端口 5173)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo        [OK] 管理后台已停止

REM =========================================
REM 2. 使用 PM2 停止后端 API
REM =========================================
echo [3/4] 使用 PM2 停止后端 API...
pm2 delete vr-space-api >nul 2>&1
echo        [OK] 后端 API 已停止

REM =========================================
REM 3. 停止 PostgreSQL
REM =========================================
echo [4/4] 停止 PostgreSQL 数据库...
cd /d "%BASEDIR%\tools\pgsql"
bin\pg_ctl.exe stop -D data -m fast >nul 2>&1
echo        [OK] PostgreSQL 已停止

echo.
echo =========================================
echo   所有服务已停止
echo =========================================
echo.
pause
