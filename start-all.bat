@echo off
chcp 65001 >nul
title VR Space 启动器
echo =========================================
echo   VR Space 系统启动脚本
echo =========================================
echo.

REM 获取脚本所在目录
set "BASEDIR=%~dp0"
set "BASEDIR=%BASEDIR:~0,-1%"

REM =========================================
REM 自动检测并配置 Node.js / npm / PM2 路径
REM =========================================

REM 检查 node 是否可用
node --version >nul 2>&1
if errorlevel 1 (
    echo [环境检测] node 未在 PATH 中，尝试自动添加...
    if exist "D:\Nodejs\node.exe" (
        set "PATH=D:\Nodejs;%PATH%"
        echo [环境检测] 已添加 D:\Nodejs 到 PATH
    ) else if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
        echo [环境检测] 已添加 C:\Program Files\nodejs 到 PATH
    ) else (
        echo [错误] 找不到 node.exe！请检查 Node.js 是否已安装。
        pause
        exit /b 1
    )
)

REM 检查 npm 是否可用
npm --version >nul 2>&1
if errorlevel 1 (
    echo [环境检测] npm 未在 PATH 中
    pause
    exit /b 1
)

REM 检查 pm2 是否可用
pm2 --version >nul 2>&1
if errorlevel 1 (
    echo [环境检测] PM2 未在 PATH 中，尝试自动添加...
    if exist "%USERPROFILE%\AppData\Roaming\npm\pm2.cmd" (
        set "PATH=%USERPROFILE%\AppData\Roaming\npm;%PATH%"
        echo [环境检测] 已添加 npm 全局包路径到 PATH
    ) else (
        echo [错误] 找不到 PM2！请先运行: npm install -g pm2
        pause
        exit /b 1
    )
)

echo [环境检测] Node.js / npm / PM2 路径已就绪
echo.

REM =========================================
REM 1. 启动 PostgreSQL
REM =========================================
echo [1/4] 启动 PostgreSQL 数据库...
cd /d "%BASEDIR%\tools\pgsql"

bin\pg_isready.exe -h localhost -p 5432 >nul 2>&1
if errorlevel 1 (
    bin\pg_ctl.exe status -D data >nul 2>&1
    if errorlevel 1 (
        bin\pg_ctl.exe start -D data -l logfile >nul 2>&1
        timeout /t 2 /nobreak >nul
    )
    bin\pg_isready.exe -h localhost -p 5432 >nul 2>&1
    if errorlevel 1 (
        echo        [X] PostgreSQL 启动失败
        pause
        exit /b 1
    ) else (
        echo        [OK] PostgreSQL 已启动 (localhost:5432)
    )
) else (
    echo        [OK] PostgreSQL 已在运行 (localhost:5432)
)

REM =========================================
REM 2. 使用 PM2 启动后端 API
REM =========================================
echo [2/4] 使用 PM2 启动后端 API...
cd /d "%BASEDIR%\server"

REM 先清理旧进程
pm2 delete vr-space-api >nul 2>&1

pm2 start ecosystem.config.js --only vr-space-api >nul 2>&1
if errorlevel 1 (
    echo        [X] PM2 启动后端失败
    echo        请检查 server/ecosystem.config.js 配置
    pause
    exit /b 1
)
timeout /t 2 /nobreak >nul

echo        [OK] 后端 API 已启动 (http://localhost:4000)

REM =========================================
REM 3. 启动管理后台（独立窗口）
REM =========================================
echo [3/4] 启动管理后台...
cd /d "%BASEDIR%\app"

REM 检测端口是否已被占用
netstat -ano | findstr ":5173" >nul 2>&1
if errorlevel 1 (
    start "VR-管理后台" cmd /k "npm run dev"
    timeout /t 3 /nobreak >nul
    echo        [OK] 管理后台已启动 (http://localhost:5173)
) else (
    echo        [OK] 管理后台已在运行 (http://localhost:5173)
)

REM =========================================
REM 4. 启动用户端预约（独立窗口）
REM =========================================
echo [4/4] 启动用户端预约...
cd /d "%BASEDIR%\app\reservation"

REM 检测端口是否已被占用
netstat -ano | findstr ":5174" >nul 2>&1
if errorlevel 1 (
    start "VR-用户端" cmd /k "npm run dev"
    timeout /t 3 /nobreak >nul
    echo        [OK] 用户端预约已启动 (http://localhost:5174)
) else (
    echo        [OK] 用户端预约已在运行 (http://localhost:5174)
)

echo.
echo =========================================
echo   所有服务已就绪！
echo =========================================
echo.
echo   管理后台:    http://localhost:5173
echo   用户端预约:  http://localhost:5174
echo   API 接口:    http://localhost:4000/api
echo.
echo   PM2 后端管理命令:
echo     pm2 status              查看状态
echo     pm2 logs vr-space-api   查看后端日志
echo     pm2 monit               监控面板
echo     pm2 stop vr-space-api   停止后端
echo.
echo   默认管理员账号:
echo     账号: 13800000000
echo     密码: admin123
echo.
echo   运行 stop-all.bat 停止所有服务
echo.
pm2 status
pause
