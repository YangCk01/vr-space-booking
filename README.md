# VR 大空间预约排场系统

> 一套面向 VR 大空间体验场馆的完整预约管理与运营系统，包含 B 端管理后台、C 端用户预约小程序、Node.js 后端服务。

---

## 📋 目录

- [功能概览](#-功能概览)
- [技术架构](#-技术架构)
- [项目结构](#-项目结构)
- [快速开始](#-快速开始)
- [开发指南](#-开发指南)
- [部署指南](#-部署指南)
- [数据库模型](#-数据库模型)
- [API 概览](#-api-概览)
- [默认账号](#-默认账号)
- [环境变量](#-环境变量)

---

## ✨ 功能概览

### B 端管理后台 (`app/`)

| 模块 | 功能 |
|------|------|
| 🏠 首页概览 | 核心 KPI 看板、今日排场、营业额/预约/核销统计 |
| 🏢 场地管理 | 场地 CRUD、设备数量、维护时段设置、状态管理 |
| 🎮 内容管理 | VR 游戏/体验内容管理、价格、时长、标签、图片 |
| 📅 预约排场 | 日历视图预约管理、团队/个人/企业预约创建 |
| 📦 订单管理 | 订单全流程、退款处理、多种支付方式 |
| 👥 会员管理 | 会员等级、积分、双钱包（本金+赠送余额）、充值记录 |
| 📊 数据统计 | 营收分析、客单价趋势、会员消费分析 |
| 💰 财务管理 | 收支明细、每日财务跑批（现金解缴/确权营收/负债存量） |
| 🔔 账号管理 | 多角色权限（超管/管理员/运营/财务/店长） |
| 🎁 会员营销 | 优惠券管理、第三方平台券（美团/抖音/大众点评）验券 |
| ⚙️ 系统设置 | 系统参数配置、操作日志、数据备份 |

### C 端用户预约端 (`app/reservation/`)

| 模块 | 功能 |
|------|------|
| 🔍 场馆浏览 | 场地列表、详情、游戏内容展示 |
| 📅 在线预约 | 选择场地/日期/时段、游戏选择、人数配置 |
| 💳 订单支付 | 微信支付/支付宝/余额/积分抵扣、会员折扣 |
| 🎫 优惠券 | 平台优惠券领取与使用、第三方券扫码验券 |
| 👤 个人中心 | 订单历史、会员权益、余额/积分查询 |
| ⚙️ 账户设置 | 头像上传、昵称/邮箱/手机号修改、密码修改 |

### 后端服务 (`server/`)

- RESTful API + JWT 认证
- Socket.IO 实时通知
- 定时任务（每日财务跑批、预约提醒）
- 文件上传（头像、场地图片、游戏封面）
- Prisma ORM + 自动化数据库迁移

---

## 🏗 技术架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   管理后台      │     │   用户预约端    │     │   Nginx         │
│   :5173         │     │   :5174         │     │   :80 / :443    │
│   React + Vite  │     │   React + Vite  │     │   (生产环境)    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                    ┌─────────────────────┐
                    │   API Gateway       │
                    │   :4000             │
                    │   Express + Prisma  │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
       ┌────────────┐   ┌────────────┐   ┌────────────┐
       │ PostgreSQL │   │   Redis    │   │  uploads/  │
       │   :5432    │   │   :6379    │   │  文件存储  │
       └────────────┘   └────────────┘   └────────────┘
```

### 技术栈

| 层级 | 技术 |
|------|------|
| **B 端前端** | React 19 + TypeScript + Vite 7 + Tailwind CSS + shadcn/ui + Zustand + TanStack Query |
| **C 端前端** | React 19 + TypeScript + Vite 7 + Tailwind CSS + Framer Motion + html5-qrcode |
| **后端** | Node.js 20 + Express 5 + TypeScript + Prisma ORM |
| **数据库** | PostgreSQL 15 |
| **缓存** | Redis 7 |
| **实时通信** | Socket.IO 4 |
| **容器化** | Docker + Docker Compose + Nginx |

---

## 📁 项目结构

```
vr-space-booking/
├── app/                          # B 端管理后台
│   ├── src/
│   │   ├── api/                  # API 接口封装
│   │   ├── components/           # 公共组件 + shadcn/ui 组件库
│   │   ├── pages/                # 页面组件
│   │   ├── stores/               # Zustand 状态管理
│   │   ├── hooks/                # 自定义 Hooks
│   │   ├── lib/                  # 工具函数
│   │   └── providers/            # 全局 Provider
│   ├── public/                   # 静态资源
│   └── reservation/              # C 端用户预约端（独立子项目）
│       ├── src/
│       │   ├── api/
│       │   ├── components/
│       │   ├── pages/
│       │   └── providers/
│       └── public/
│
├── server/                       # 后端服务
│   ├── src/
│   │   ├── controllers/          # 业务控制器
│   │   ├── routes/               # 路由定义
│   │   ├── middleware/           # 中间件（认证、日志、异常处理）
│   │   ├── services/             # 业务服务层
│   │   ├── utils/                # 工具函数
│   │   └── types/                # 类型定义
│   ├── prisma/
│   │   └── schema.prisma         # 数据库模型定义
│   ├── scripts/                  # 数据迁移/清理脚本
│   ├── uploads/                  # 上传文件存储
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── tools/pgsql/                  # 嵌入式 PostgreSQL（Windows 本地开发）
├── start-all.sh / stop-all.sh    # 一键启动/停止脚本
└── .gitignore
```

---

## 🚀 快速开始

### 环境要求

- Node.js >= 20
- npm >= 10
- PostgreSQL >= 15（或使用项目自带的嵌入式 PostgreSQL）
- Redis >= 7（可选，用于缓存和会话）

### 1. 克隆项目

```bash
git clone https://github.com/YangCk01/vr-space-booking.git
cd vr-space-booking
```

### 2. 安装依赖

```bash
# 后端
cd server && npm install

# B 端管理后台
cd ../app && npm install

# C 端用户端
cd reservation && npm install
```

### 3. 配置环境变量

在 `server/` 目录下创建 `.env`：

```env
DATABASE_URL="postgresql://用户名:密码@localhost:5432/vrspace?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-jwt-secret"
JWT_REFRESH_SECRET="your-refresh-secret"
NODE_ENV="development"
PORT=4000
```

在 `app/` 目录下创建 `.env.local`：

```env
VITE_API_BASE_URL=http://localhost:4000/api
```

在 `app/reservation/` 目录下创建 `.env.local`：

```env
VITE_API_BASE_URL=http://localhost:4000/api
```

### 4. 初始化数据库

```bash
cd server
npx prisma migrate dev
npx prisma db seed
```

### 5. 一键启动（推荐）

```bash
# Windows Git Bash
./start-all.sh

# Windows CMD
start-all.bat
```

启动后会同时运行：
- PostgreSQL 数据库
- 后端 API（http://localhost:4000）
- B 端管理后台（http://localhost:5173）
- C 端用户端（http://localhost:5174）

---

## 🛠 开发指南

### 单独启动各服务

```bash
# 后端（开发模式，热重载）
cd server && npm run dev

# B 端管理后台
cd app && npm run dev

# C 端用户端
cd app/reservation && npm run dev
```

### 常用命令

```bash
# 后端
cd server
npm run build          # 编译 TypeScript → dist/
npm run start          # 生产模式启动
npm run db:migrate     # 执行数据库迁移
npm run db:generate    # 生成 Prisma Client
npm run db:seed        # 执行种子数据
npm run db:studio      # 打开 Prisma Studio（可视化数据库）

# 前端
cd app
npm run build          # 构建生产包
cd reservation
npm run build          # 构建 C 端生产包
```

---

## 📦 部署指南

### Docker Compose 部署（推荐）

```bash
cd server
docker-compose up -d
```

服务清单：

| 服务 | 容器名 | 端口 | 说明 |
|------|--------|------|------|
| postgres | vrspace-postgres | 5432 | PostgreSQL 数据库 |
| redis | vrspace-redis | 6379 | 缓存服务 |
| api | vrspace-api | 4000 | Node.js API |
| nginx | vrspace-nginx | 80/443 | 反向代理 + 静态资源 |

部署前确保：
1. 已构建前端生产包：`cd app && npm run build`
2. `server/.env.production` 已配置正确的环境变量
3. Nginx 配置 `server/nginx.conf` 已按需调整

### 手动部署

1. 构建后端：`cd server && npm run build`
2. 构建 B 端：`cd app && npm run build`
3. 构建 C 端：`cd app/reservation && npm run build`
4. 配置 Nginx 反向代理到 `app/dist`（B 端）和 `app/reservation/dist`（C 端）
5. 使用 PM2 或 systemd 运行后端：`node server/dist/server.js`

---

## 🗄 数据库模型

核心表结构：

| 表名 | 说明 |
|------|------|
| `User` | 用户/管理员，支持多角色，含双钱包（本金+赠送）+ 积分 |
| `Venue` | VR 场地信息（面积、容量、设备数、维护时段） |
| `Booking` | 预约记录（团队/个人/企业/维护类型） |
| `Order` | 订单（多支付方式、积分抵扣、会员折扣） |
| `Payment` | 支付流水 |
| `RechargeRecord` | 会员充值记录 |
| `BalanceTransaction` | 余额/积分变动流水 |
| `Equipment` | VR 设备台账（头显/追踪器/手柄/电脑） |
| `MaintenanceRecord` | 设备维护记录 |
| `Game` | VR 游戏内容库 |
| `ThirdPartyCoupon` | 第三方平台优惠券（美团/抖音/大众点评） |
| `DailyFinancialReport` | 每日财务跑批数据 |
| `SystemSetting` | 系统配置（Key-Value） |
| `OperationLog` | 操作审计日志 |

查看完整模型定义：
```bash
cd server && npx prisma studio
```

---

## 🔌 API 概览

后端服务运行在 `http://localhost:4000/api`

主要路由模块：

| 路由 | 说明 |
|------|------|
| `/api/auth` | 登录、注册、JWT 刷新、个人信息 |
| `/api/venues` | 场地 CRUD |
| `/api/games` | 游戏内容管理 |
| `/api/bookings` | 预约创建、查询、取消 |
| `/api/orders` | 订单全流程 |
| `/api/users` | 会员管理 |
| `/api/finance` | 财务数据与跑批 |
| `/api/analytics` | 数据统计 |
| `/api/coupons` | 优惠券管理 |
| `/api/upload` | 文件上传 |
| `/api/settings` | 系统配置 |
| `/api/notifications` | 消息通知 |

---

## 🔑 默认账号

首次启动并执行 seed 后，系统会创建默认管理员：

| 角色 | 账号 | 密码 |
|------|------|------|
| 系统管理员 | `admin` | `admin123` |

> ⚠️ 生产环境请务必修改默认密码！

---

## 🔧 环境变量

### 后端 `.env`

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL 连接串 |
| `REDIS_URL` | ✅ | Redis 连接串 |
| `JWT_SECRET` | ✅ | JWT 签名密钥 |
| `JWT_REFRESH_SECRET` | ✅ | Refresh Token 密钥 |
| `NODE_ENV` | ✅ | `development` / `production` |
| `PORT` | ✅ | 服务端口，默认 4000 |

### 前端 `.env.local`

| 变量 | 说明 |
|------|------|
| `VITE_API_BASE_URL` | 后端 API 地址 |

---

## 📄 许可证

[MIT](LICENSE)

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。
