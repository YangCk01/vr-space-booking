#!/bin/bash
# VR大空间预约系统 - 一键启动脚本

echo "========================================="
echo "  VR Space 系统启动脚本"
echo "========================================="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 先执行 stop，确保没有残留进程
"$SCRIPT_DIR/stop-all.sh" >/dev/null 2>&1
sleep 1

# 1. 启动 PostgreSQL
echo "[1/4] 启动 PostgreSQL 数据库..."
cd "$SCRIPT_DIR/tools/pgsql"
./bin/pg_ctl.exe status -D data > /dev/null 2>&1
if [ $? -ne 0 ]; then
    ./bin/pg_ctl.exe start -D data -l logfile > /dev/null 2>&1
    sleep 2
fi
./bin/pg_isready.exe -h localhost -p 5432 > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "       ✅ PostgreSQL 已启动 (localhost:5432)"
else
    echo "       ❌ PostgreSQL 启动失败"
    exit 1
fi

# 2. 启动后端 API
echo "[2/4] 启动后端 API 服务..."
cd "$SCRIPT_DIR/server"
# 直接启动 node（绕过 npm），并将 PID 写入文件
node dist/server.js > "$SCRIPT_DIR/server.log" 2>&1 &
echo $! > "$SCRIPT_DIR/server.pid"
sleep 3
# 验证端口是否监听
if netstat -ano | grep -q ":4000.*LISTENING"; then
    echo "       ✅ 后端 API 已启动 (http://localhost:4000)"
else
    echo "       ❌ 后端 API 启动失败，请检查 server.log"
    exit 1
fi

# 3. 启动管理后台
echo "[3/4] 启动管理后台..."
cd "$SCRIPT_DIR/app"
npx vite --port 5173 --host > "$SCRIPT_DIR/admin.log" 2>&1 &
echo $! > "$SCRIPT_DIR/admin.pid"
sleep 3
echo "       ✅ 管理后台已启动 (http://localhost:5173)"

# 4. 启动用户端预约
echo "[4/4] 启动用户端预约..."
cd "$SCRIPT_DIR/app/reservation"
npx vite --port 5174 --host > "$SCRIPT_DIR/reservation.log" 2>&1 &
echo $! > "$SCRIPT_DIR/reservation.pid"
sleep 3
echo "       ✅ 用户端预约已启动 (http://localhost:5174)"

echo ""
echo "========================================="
echo "  所有服务已启动！"
echo "========================================="
echo ""
echo "  📊 管理后台:    http://localhost:5173"
echo "  📱 用户端预约:  http://localhost:5174"
echo "  ⚙️  API 接口:   http://localhost:4000/api"
echo ""
echo "  默认管理员账号:"
echo "    账号: admin"
echo "    密码: admin123"
echo ""
echo "  按 Ctrl+C 可中断此窗口，服务将在后台继续运行"
echo "  运行 ./stop-all.sh 停止所有服务"
echo ""

# 保持脚本运行
wait
