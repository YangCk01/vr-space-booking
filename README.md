# VR Space 大空间预约排场系统

面向 VR 大空间娱乐直营门店的预约、排场、收银、会员、营销、财务对账和设备管理系统。项目采用前后端分离架构，包含管理后台、顾客预约端和 Node.js 后端服务。

## 项目亮点

- B 端管理后台：门店排场、订单核销、会员管理、营销活动、财务对账、审批流、设备台账。
- C 端预约端：门店浏览、游戏选择、在线预约、订单支付、个人中心、会员权益。
- 后端服务：REST API、JWT 认证、RBAC 权限、Prisma 数据模型、Socket.IO 实时通知、定时任务。
- 财务闭环：支付流水、退款、充值、余额、积分、优惠券、爽约罚金和日结报表统一入账。
- 对账能力：支持业务账、支付账、退款账、设备日志之间的异常识别和人工处理。
- 本地开发友好：Windows 一键脚本区分开发服和测试服，开发库与测试库互不影响。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 管理后台 | React 19, TypeScript, Vite 7, Tailwind CSS, shadcn/ui, TanStack Query, Zustand, Recharts |
| 顾客预约端 | React 19, TypeScript, Vite 7, Tailwind CSS, Framer Motion, html5-qrcode |
| 后端服务 | Node.js, Express 5, TypeScript, Prisma ORM, Socket.IO, node-cron, Multer |
| 数据库 | PostgreSQL |
| 部署辅助 | Docker Compose, Nginx, PM2 配置 |

## 系统架构

```text
┌────────────────────┐     ┌────────────────────┐
│ 管理后台 app/src    │     │ 预约端 reservation  │
│ React + Vite       │     │ React + Vite       │
└─────────┬──────────┘     └─────────┬──────────┘
          │                          │
          └────────────┬─────────────┘
                       │ REST / Socket.IO
                       ▼
              ┌──────────────────┐
              │ server            │
              │ Express + Prisma  │
              └─────────┬────────┘
                        │
                        ▼
                 ┌────────────┐
                 │ PostgreSQL │
                 └────────────┘
```

## 功能模块

### 管理后台

| 模块 | 能力 |
| --- | --- |
| 首页看板 | 经营指标、今日排场、订单与营收概览 |
| 场馆管理 | 门店资料、场地状态、价格、图片、联系方式 |
| 游戏管理 | 游戏内容、封面、详情图、视频、价格、上下架 |
| 预约排场 | 日历排场、时段占用、核销、爽约、改签 |
| 订单管理 | 下单、支付、退款、作废、核销、状态流转 |
| 会员营销 | 会员等级、权益、积分、优惠券、营销活动 |
| 财务对账 | 财务汇总、日结报表、对账批次、异常处理 |
| 审批中心 | 退款、财务调整、异常处置等敏感操作审批 |
| 设备管理 | 设备台账、维护记录、预约设备分配 |
| 系统配置 | 页面配置、业务规则、操作日志、权限配置 |

### 顾客预约端

| 模块 | 能力 |
| --- | --- |
| 首页 | 门店推荐、活动信息、游戏入口 |
| 门店与游戏 | 门店详情、游戏详情、图片与视频展示 |
| 在线预约 | 选择日期、时段、人数、游戏和门店 |
| 支付与订单 | 订单确认、余额/积分/优惠券抵扣、支付结果 |
| 个人中心 | 订单历史、会员权益、余额积分、账户设置 |
| 门店联系 | 门店电话、地址、营业时间、联系入口 |

### 后端服务

| 模块 | 能力 |
| --- | --- |
| 认证权限 | JWT 登录、角色权限、门店数据隔离 |
| 业务 API | 预约、订单、会员、营销、财务、设备、审批 |
| 定时任务 | 订单超时、预约提醒、爽约检测、财务日报 |
| 文件上传 | 头像、门店图片、游戏封面、详情图 |
| 审计记录 | 操作日志、审批记录、财务调整留痕 |

## 项目结构

```text
D:\VR
├── app/                         # 前端工程
│   ├── src/                     # B 端管理后台
│   └── reservation/             # C 端顾客预约端
├── server/                      # 后端服务
│   ├── prisma/                  # Prisma schema 与迁移
│   ├── scripts/                 # 数据检查与辅助脚本
│   └── src/                     # Express API、服务、任务
├── docs/                        # 项目文档、ADR、Agent 配置
├── tools/                       # 本地工具，例如 PostgreSQL 绿色版
├── dev.bat                      # 启动开发环境
├── test.bat                     # 构建并启动测试环境
├── sync-to-test.bat             # 同步开发数据/配置到测试环境
├── stop-dev.bat                 # 停止开发环境
├── stop-test.bat                # 停止测试环境
└── start-pg.bat                 # 启动本地 PostgreSQL
```

## 快速开始

### 环境要求

- Windows 10/11
- Node.js 20+
- npm 10+
- PostgreSQL 15+，或使用项目内置 `tools/pgsql`

### 安装依赖

```bash
cd server
npm install

cd ../app
npm install

cd reservation
npm install
```

### 数据库配置

后端通过 `server/.env` 或 `server/.env.dev` 读取数据库连接。开发脚本默认连接：

```text
postgresql://vruser:vrpass@127.0.0.1:5432/vrspace_dev?schema=public
```

首次启动前执行迁移：

```bash
cd server
npx prisma migrate dev
npx prisma generate
```

### 启动开发环境

```bat
dev.bat
```

开发环境默认地址：

| 服务 | 地址 |
| --- | --- |
| 后端 API | http://localhost:4001 |
| 管理后台 | http://localhost:5175 |
| 顾客预约端 | http://localhost:5176 |
| 数据库 | `vrspace_dev` |

开发环境默认关闭定时任务，避免影响测试数据。

### 启动测试环境

```bat
test.bat
```

测试环境会先构建后端、管理后台和预约端，再启动服务：

| 服务 | 地址 |
| --- | --- |
| 后端 API | http://localhost:4000 |
| 管理后台 | http://localhost:5173 |
| 顾客预约端 | http://localhost:5174 |
| 数据库 | `vrspace` |

## 常用命令

```bash
# 后端类型检查
cd server
npm run lint

# 后端构建
cd server
npm run build

# 管理后台构建
cd app
npm run build

# 顾客预约端构建
cd app/reservation
npm run build

# 打开 Prisma Studio
cd server
npm run db:studio
```

## 默认账号

执行种子数据后可使用默认管理员登录：

| 角色 | 账号 | 密码 |
| --- | --- | --- |
| 系统管理员 | `admin` | `admin123` |

生产环境请在首次部署后立即修改默认密码，并替换 JWT 密钥与数据库密码。

## 环境变量

### 后端

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串 |
| `PORT` | API 端口 |
| `NODE_ENV` | 运行环境 |
| `JWT_SECRET` | JWT 签名密钥 |
| `JWT_REFRESH_SECRET` | Refresh Token 密钥 |
| `CORS_ORIGIN` | 允许访问的前端源，多个地址用逗号分隔 |
| `ENABLE_JOBS` | 是否启用定时任务，开发环境通常设为 `false` |

### 前端

| 变量 | 说明 |
| --- | --- |
| `VITE_API_URL` | API 地址，通常为 `http://localhost:4001/api` |
| `VITE_API_BASE_URL` | API 根地址，通常为 `http://localhost:4001` |

## 文档

- `CONTEXT.md`：领域上下文与实现约定。
- `docs/project-overview.md`：项目总览。
- `docs/project-layout.md`：目录结构说明。
- `docs/development-roadmap-v2.md`：开发路线图。
- `docs/adr/`：架构决策记录。

## GitHub

仓库地址：<https://github.com/YangCk01/vr-space-booking>

欢迎通过 Issue 记录需求、缺陷和后续优化项。
