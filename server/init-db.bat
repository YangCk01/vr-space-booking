@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

color 0A
title VR Space - 数据库初始化

set SCRIPT_DIR=%~dp0
set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                                                                ║
echo ║           VR 大空间预约排场系统 - 数据库初始化               ║
echo ║                                                                ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

:: ==========================================
:: 步骤 1: 启动 PostgreSQL
:: ==========================================
echo [1/3] 启动 PostgreSQL 数据库...
cd /d "%SCRIPT_DIR%\..\tools\pgsql"

netstat -ano 2>nul | findstr ":5432" >nul
if !errorlevel! equ 0 (
    echo        PostgreSQL 已在运行
    goto :pg_check
)

echo        启动 PostgreSQL...
.\bin\pg_ctl.exe start -D data -l logfile -w -t 30 >nul 2>&1
if !errorlevel! neq 0 (
    echo.
    echo        错误: PostgreSQL 启动失败
    echo        请检查日志: tools\pgsql\logfile
    echo.
    pause
    exit /b 1
)

echo        PostgreSQL 启动成功

:pg_check
echo        验证数据库连接...
timeout /t 2 /nobreak >nul

:: ==========================================
:: 步骤 2: 创建数据库用户和数据库（如果不存在）
:: ==========================================
echo.
echo [2/3] 初始化数据库用户和数据库...
echo        用户: vruser
echo        数据库: vrspace

cd /d "%SCRIPT_DIR%\..\tools\pgsql"

:: 创建用户（如果不存在）
echo        创建数据库用户 vruser...
.\bin\psql.exe -U postgres -h 127.0.0.1 -c "CREATE USER vruser WITH PASSWORD 'vrpass';" >nul 2>&1

:: 赋予权限
echo        设置用户权限...
.\bin\psql.exe -U postgres -h 127.0.0.1 -c "ALTER USER vruser WITH CREATEDB;" >nul 2>&1
.\bin\psql.exe -U postgres -h 127.0.0.1 -c "ALTER USER vruser WITH SUPERUSER;" >nul 2>&1

:: 创建数据库（如果不存在）
echo        创建数据库 vrspace...
.\bin\psql.exe -U postgres -h 127.0.0.1 -c "CREATE DATABASE vrspace OWNER vruser;" >nul 2>&1

echo        数据库初始化完成

:: ==========================================
:: 步骤 3: 运行 Prisma 迁移
:: ==========================================
echo.
echo [3/3] 运行数据库迁移...
cd /d "%SCRIPT_DIR%"

echo        安装依赖...
call npm install >nul 2>&1
if !errorlevel! neq 0 (
    echo        错误: npm install 失败
    pause
    exit /b 1
)

echo        生成 Prisma 客户端...
call npx prisma generate >nul 2>&1

echo        执行数据库迁移...
call npx prisma migrate deploy >nul 2>&1
if !errorlevel! neq 0 (
    echo        尝试运行初始迁移...
    call npx prisma db push >nul 2>&1
)

echo        迁移完成

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║              数据库初始化完成                                  ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo 连接信息:
echo    主机: 127.0.0.1
echo    端口: 5432
echo    用户: vruser
echo    密码: vrpass
echo    数据库: vrspace
echo.
echo 现在可以启动 API 服务了！
echo.
pause
