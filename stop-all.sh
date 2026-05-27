#!/bin/bash
# VR大空间预约系统 - 一键停止脚本

echo "========================================="
echo "  VR Space 系统停止脚本"
echo "========================================="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 辅助函数：通过 PID 文件停止进程
stop_by_pidfile() {
    local pidfile="$1"
    local name="$2"
    if [ -f "$pidfile" ]; then
        local pid
        pid=$(cat "$pidfile")
        if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
            kill "$pid" 2>/dev/null
            sleep 1
            # 如果还在，强制终止
            if ps -p "$pid" > /dev/null 2>&1; then
                kill -9 "$pid" 2>/dev/null || taskkill //F //PID "$pid" 2>/dev/null
            fi
            echo "       ✅ $name 已停止 (PID: $pid)"
        else
            echo "       ✅ $name 未运行"
        fi
        rm -f "$pidfile"
    fi
}

# 辅助函数：通过端口停止进程（后备方案）
stop_by_port() {
    local port="$1"
    local name="$2"
    local pid
    pid=$(netstat -ano 2>/dev/null | grep ":$port.*LISTENING" | awk '{print $NF}' | head -n 1)
    if [ -n "$pid" ]; then
        taskkill //F //PID "$pid" 2>/dev/null
        echo "       ✅ $name 已停止 (端口 $port, PID: $pid)"
    fi
}

# 1. 停止前端服务
echo "[1/3] 停止前端服务..."
stop_by_pidfile "$SCRIPT_DIR/admin.pid" "管理后台"
stop_by_pidfile "$SCRIPT_DIR/reservation.pid" "用户端预约"
# 后备：按端口终止
stop_by_port 5173 "管理后台"
stop_by_port 5174 "用户端预约"
# 再尝试 pkill 作为兜底
pkill -f "vite --port 5173" 2>/dev/null
pkill -f "vite --port 5174" 2>/dev/null

# 2. 停止后端 API
echo "[2/3] 停止后端 API..."
stop_by_pidfile "$SCRIPT_DIR/server.pid" "后端 API"
# 后备：按端口终止
stop_by_port 4000 "后端 API"
# 再尝试 pkill 作为兜底
pkill -f "node dist/server.js" 2>/dev/null
pkill -f "npm run start" 2>/dev/null

# 3. 停止 PostgreSQL
echo "[3/3] 停止 PostgreSQL 数据库..."
cd "$SCRIPT_DIR/tools/pgsql"
./bin/pg_ctl.exe stop -D data -m fast > /dev/null 2>&1
echo "       ✅ PostgreSQL 已停止"

echo ""
echo "========================================="
echo "  所有服务已停止"
echo "========================================="
