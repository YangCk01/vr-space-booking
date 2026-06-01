@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

color 0C
title VR Space - 数据库故障排查

set SCRIPT_DIR=%~dp0
set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                                                                ║
echo ║        VR 大空间预约排场系统 - 数据库故障排查工具           ║
echo ║                                                                ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

:menu
echo.
echo 选择要执行的操作:
echo.
echo    1. 检查 PostgreSQL 是否运行
echo    2. 重启 PostgreSQL
echo    3. 查看 PostgreSQL 日志
echo    4. 初始化数据库（从零开始）
echo    5. 运行数据库迁移
echo    6. 清理数据库（危险操作）
echo    7. 检查数据库连接
echo    0. 退出
echo.
set /p choice="请选择 (0-7): "

if "%choice%"=="1" goto :check_pg
if "%choice%"=="2" goto :restart_pg
if "%choice%"=="3" goto :view_log
if "%choice%"=="4" goto :init_db
if "%choice%"=="5" goto :migrate_db
if "%choice%"=="6" goto :reset_db
if "%choice%"=="7" goto :test_connection
if "%choice%"=="0" exit /b 0

echo.
echo 无效选择
echo.
pause
goto :menu

:: ==========================================
:: 1. 检查 PostgreSQL 状态
:: ==========================================
:check_pg
cls
echo.
echo [检查] PostgreSQL 运行状态...
echo.

netstat -ano 2>nul | findstr ":5432" >nul
if !errorlevel! equ 0 (
    echo [OK] PostgreSQL 正在运行 (localhost:5432)
) else (
    echo [OFF] PostgreSQL 未运行
    echo.
    echo 尝试启动 PostgreSQL...
    cd /d "%SCRIPT_DIR%\..\tools\pgsql"
    .\bin\pg_ctl.exe start -D data -l logfile -w -t 30 >nul 2>&1
    if !errorlevel! equ 0 (
        echo [OK] PostgreSQL 启动成功
    ) else (
        echo [ERR] PostgreSQL 启动失败
        echo.
        echo 检查日志: %SCRIPT_DIR%\..\tools\pgsql\logfile
    )
)

echo.
pause
goto :menu

:: ==========================================
:: 2. 重启 PostgreSQL
:: ==========================================
:restart_pg
cls
echo.
echo [操作] 停止 PostgreSQL...
cd /d "%SCRIPT_DIR%\..\tools\pgsql"
.\bin\pg_ctl.exe stop -D data -w -t 30 >nul 2>&1

echo        等待进程结束...
timeout /t 3 /nobreak >nul

echo        启动 PostgreSQL...
.\bin\pg_ctl.exe start -D data -l logfile -w -t 30 >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] PostgreSQL 已重启
) else (
    echo [ERR] PostgreSQL 重启失败
    echo.
    echo 检查日志: %SCRIPT_DIR%\..\tools\pgsql\logfile
)

echo.
pause
goto :menu

:: ==========================================
:: 3. 查看日志
:: ==========================================
:view_log
cls
echo.
echo [查看] PostgreSQL 日志文件内容:
echo.
echo ════════════════════════════════════════════════════════════════
echo.
type "%SCRIPT_DIR%\..\tools\pgsql\logfile"
echo.
echo ════════════════════════════════════════════════════════════════
echo.
pause
goto :menu

:: ==========================================
:: 4. 初始化数据库
:: ==========================================
:init_db
cls
echo.
echo [初始化] 运行数据库初始化脚本...
echo.
cd /d "%SCRIPT_DIR%"
call init-db.bat
goto :menu

:: ==========================================
:: 5. 运行数据库迁移
:: ==========================================
:migrate_db
cls
echo.
echo [迁移] 运行 Prisma 数据库迁移...
echo.
cd /d "%SCRIPT_DIR%"

echo    安装依赖...
call npm install >nul 2>&1

echo    生成 Prisma 客户端...
call npx prisma generate >nul 2>&1

echo    执行迁移...
call npx prisma migrate deploy 

if !errorlevel! equ 0 (
    echo.
    echo [OK] 迁移成功
) else (
    echo.
    echo [ERR] 迁移失败，尝试 prisma db push...
    call npx prisma db push
)

echo.
pause
goto :menu

:: ==========================================
:: 6. 清理数据库（危险操作）
:: ==========================================
:reset_db
cls
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                     危险操作警告                               ║
echo ║              这将删除所有数据库数据！                         ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

set /p confirm="确认删除所有数据吗？(yes/no): "
if /i not "%confirm%"=="yes" goto :menu

cd /d "%SCRIPT_DIR%"

echo.
echo [清理] 重置数据库...
echo    安装依赖...
call npm install >nul 2>&1

echo    清除旧迁移...
call npx prisma migrate reset --force >nul 2>&1

if !errorlevel! equ 0 (
    echo.
    echo [OK] 数据库已重置，迁移已重新应用
) else (
    echo.
    echo [ERR] 数据库重置失败
)

echo.
pause
goto :menu

:: ==========================================
:: 7. 测试数据库连接
:: ==========================================
:test_connection
cls
echo.
echo [测试] 数据库连接...
echo.
echo    主机: 127.0.0.1
echo    端口: 5432
echo    用户: vruser
echo    密码: vrpass
echo    数据库: vrspace
echo.

cd /d "%SCRIPT_DIR%\..\tools\pgsql"

echo    正在连接...
.\bin\psql.exe -U vruser -h 127.0.0.1 -d vrspace -c "SELECT NOW();" >nul 2>&1

if !errorlevel! equ 0 (
    echo [OK] 数据库连接成功！
    echo.
    echo    当前时间:
    .\bin\psql.exe -U vruser -h 127.0.0.1 -d vrspace -c "SELECT NOW();"
) else (
    echo [ERR] 数据库连接失败
    echo.
    echo 可能的原因:
    echo    1. PostgreSQL 未运行
    echo    2. 用户 vruser 不存在
    echo    3. 数据库 vrspace 不存在
    echo    4. 密码错误
    echo.
    echo 解决方案: 运行 4 选项初始化数据库
)

echo.
pause
goto :menu

endlocal
