# VR Space 大空间娱乐直营门店管理系统 — 项目总览文档

> **文档版本：** v1.0  
> **生成日期：** 2026-06-09  
> **项目仓库：** https://github.com/YangCk01/vr-space-booking.git  
> **当前版本：** v1.5.2 (commit `2afe028`)

---

## 一、项目简介

VR Space 是一套面向 **VR 大空间娱乐直营门店** 的综合管理系统，覆盖顾客端预约、门店排场、收银支付、会员体系、营销活动、财务对账、设备管理等全链路业务。系统采用前后端分离架构，支持多门店统一管理。

### 核心业务场景

| 场景 | 说明 |
|------|------|
| **C 端预约** | 顾客通过手机端浏览门店、选择游戏/时段、下单支付、签到核销 |
| **门店排场** | 店长在管理后台管理场地预约日历、分配设备、核销签到 |
| **收银支付** | 支持微信/支付宝/余额/积分组合支付，会员充值、退款 |
| **会员体系** | 用户等级、本金/赠送余额、积分、优惠券、生日权益 |
| **营销活动** | 自动化/手动营销活动，人群定向，券/积分发放，效果追踪 |
| **财务对账** | 三方十字交叉对账（系统账-渠道账-硬件账），差错池处理 |
| **设备管理** | PICO 头显等 VR 设备的登记、维护、预约分配 |
| **审批流程** | 敏感操作（退款、余额调整、积分调整等）需走审批工作流 |

---

## 二、技术架构

```
┌──────────────────────────────────────────────────────────────┐
│                        前端 (app/)                            │
│  ┌─────────────────────┐  ┌─────────────────────────────┐    │
│  │  管理后台 (src/)     │  │  C端顾客端 (reservation/)    │    │
│  │  React 19 + Vite 7  │  │  React 19 + Vite 7         │    │
│  │  TailwindCSS 3      │  │  TailwindCSS 3             │    │
│  │  shadcn/ui + Radix  │  │  自定义移动端组件            │    │
│  │  Recharts + xlsx    │  │  Socket.IO Client           │    │
│  └──────────┬──────────┘  └──────────────┬──────────────┘    │
│             │                            │                    │
│             └────────────┬───────────────┘                    │
│                          │ HTTP REST + Socket.IO              │
├──────────────────────────┼───────────────────────────────────┤
│                    后端 (server/)                              │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  Express 5 + TypeScript + Prisma ORM                  │    │
│  │  PostgreSQL 数据库                                     │    │
│  │  JWT 认证 + RBAC 权限                                  │    │
│  │  node-cron 定时任务                                    │    │
│  │  Socket.IO 实时推送                                    │    │
│  │  Multer 文件上传                                       │    │
│  └───────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### 技术栈详情

| 层级 | 技术 | 版本 |
|------|------|------|
| **前端框架** | React | 19.2 |
| **构建工具** | Vite | 7.2 |
| **UI 框架** | TailwindCSS + shadcn/ui (Radix UI) | 3.4 / latest |
| **路由** | React Router DOM | 7.15 |
| **状态管理** | Zustand | 5.0 |
| **数据请求** | TanStack React Query + Axios | 5.100 / 1.16 |
| **表单** | React Hook Form + Zod | 7.70 / 4.3 |
| **图表** | Recharts | 2.15 |
| **实时通信** | Socket.IO Client | 4.8 |
| **后端框架** | Express | 5.1 |
| **ORM** | Prisma | 6.19 |
| **数据库** | PostgreSQL | (通过 Docker) |
| **认证** | JWT (jsonwebtoken) + bcryptjs | 9.0 / 2.4 |
| **定时任务** | node-cron | 4.2 |
| **文件上传** | Multer | 1.4 |

---

## 三、项目目录结构

```
d:\VR\
├── README.md                    # 项目说明
├── CHANGELOG.md                 # 变更日志
├── dev.bat                      # 开发环境启动脚本
├── start-pg.bat                 # 启动 PostgreSQL
├── stop-all.bat                 # 停止所有服务
├── stop-dev.bat                 # 停止开发服务
├── stop-test.bat                # 停止测试服务
├── sync-to-test.bat             # 同步到测试环境
├── test.bat                     # 测试环境启动
│
├── app/                         # 前端项目（管理后台 + C端）
│   ├── package.json             # 前端依赖
│   ├── vite.config.ts           # Vite 配置
│   ├── tailwind.config.js       # TailwindCSS 配置
│   ├── tsconfig.json            # TypeScript 配置
│   ├── index.html               # 入口 HTML
│   ├── src/                     # 管理后台源码
│   │   ├── App.tsx              # 根组件 + 路由
│   │   ├── main.tsx             # 入口
│   │   ├── api/                 # API 调用层 (28 个模块)
│   │   ├── components/          # 通用组件 + UI 组件
│   │   ├── pages/               # 页面组件 (24 个页面)
│   │   ├── hooks/               # 自定义 Hooks
│   │   ├── stores/              # Zustand 状态管理
│   │   ├── providers/           # Context Providers
│   │   └── lib/                 # 工具函数
│   └── reservation/             # C端顾客端源码
│       └── src/
│           ├── App.tsx          # 根组件 + 路由
│           ├── api/             # API 调用层 (10 个模块)
│           ├── components/      # 移动端组件
│           ├── pages/           # 页面组件 (17 个页面)
│           ├── hooks/           # 自定义 Hooks
│           ├── providers/       # Auth Provider
│           └── lib/             # 工具函数
│
├── server/                      # 后端项目
│   ├── package.json             # 后端依赖
│   ├── tsconfig.json            # TypeScript 配置
│   ├── docker-compose.yml       # PostgreSQL Docker 配置
│   ├── Dockerfile               # 应用 Docker 镜像
│   ├── nginx.conf               # Nginx 反向代理配置
│   ├── ecosystem.config.js      # PM2 进程管理配置
│   ├── nodemon.json             # 开发热重载配置
│   ├── prisma/
│   │   └── schema.prisma        # 数据库模型定义 (1108 行, 40+ 模型)
│   ├── scripts/                 # 数据库脚本
│   └── src/
│       ├── server.ts            # 服务入口
│       ├── app.ts               # Express 应用配置
│       ├── controllers/         # 控制器 (32 个)
│       ├── routes/              # 路由定义 (31 个)
│       ├── services/            # 业务服务层 (13 个)
│       ├── middleware/          # 中间件 (5 个)
│       ├── jobs/                # 定时任务 (8 个)
│       ├── types/               # TypeScript 类型定义
│       └── utils/               # 工具函数 (9 个)
│
├── docs/                        # 项目文档
│   ├── project-layout.md        # 项目布局说明
│   ├── development-roadmap-v2.md# 当前保留的开发路线图
│   ├── no-show-handling-design.md # 爽约处理设计
│   ├── reconciliation-design.md # 财务对账系统设计
│   ├── agents/                  # Agent 技能配置
│   └── adr/                     # 架构决策记录
│
└── tools/                       # 工具
    └── pgsql/                   # PostgreSQL 绿色版
```

---

## 四、数据库模型总览

系统使用 PostgreSQL 数据库，通过 Prisma ORM 管理，共定义 **40+ 个数据模型**，按业务领域分类如下：

### 4.1 用户与权限

| 模型 | 说明 | 关键字段 |
|------|------|---------|
| `User` | 用户主表 | phone, password, name, level, role, balance, points, principalBalance, bonusBalance |
| `Role` | 角色定义 | name, description, isSystem |
| `Permission` | 权限定义 | code, name, module |
| `RolePermission` | 角色-权限关联 | roleId, permissionId |
| `VenueManager` | 门店管理员关联 | userId, venueId |

**用户角色枚举：** `SUPER_ADMIN` / `ADMIN` / `OPERATOR` / `FINANCE` / `CUSTOMER` / `MANAGER`

**用户等级枚举：** `NORMAL` / `MEMBER` / `VIP` / `VIP_PLUS`

### 4.2 门店与场地

| 模型 | 说明 | 关键字段 |
|------|------|---------|
| `Venue` | 门店/场地 | name, theme, status, area, capacity, pricePerHour, deviceCount, openTime, closeTime |

**场地状态：** `FREE` / `IN_USE` / `MAINTENANCE` / `DISABLED`

### 4.3 预约与排场

| 模型 | 说明 | 关键字段 |
|------|------|---------|
| `Booking` | 预约记录 | venueId, userId, gameId, type, date, startTime, endTime, personCount, status, bookingMode |
| `Game` | 游戏/内容 | title, description, coverImage, price, duration, tags, status |

**预约状态流转：**
```
CONFIRMED → READY → CHECKED_IN → PLAYING → COMPLETED
                                      ↓
                                  NO_SHOW (爽约)
                                      ↓
                                 CANCELLED (取消)
```

### 4.4 订单与支付

| 模型 | 说明 | 关键字段 |
|------|------|---------|
| `Order` | 订单主表 | orderNo, amount, status, payMethod, paidAt, refundAmount, principalDeduction, bonusDeduction, pointsUsed, couponDiscount, penaltyAmount |
| `Payment` | 支付流水 | orderId, amount, method, transactionId, status |

**订单状态：** `PENDING` → `PAID` → `READY_TO_VERIFY` → `PLAYING` → `COMPLETED` / `NO_SHOW` / `CANCELLED` / `REFUNDING` / `REFUNDED`

**支付方式：** `WECHAT` / `ALIPAY` / `CASH` / `CARD` / `BALANCE` / `BALANCE_POINTS`

### 4.5 会员资产

| 模型 | 说明 | 关键字段 |
|------|------|---------|
| `BalanceTransaction` | 余额/积分变动流水 | userId, type, amount, principalAmount, bonusAmount, pointsAmount, orderId |
| `RechargeRecord` | 充值记录 | userId, amount, bonus, total, payMethod, status |
| `UserCoupon` | 用户优惠券 | userId, name, type, discountRate, status, validFrom, validTo, usedOrderId |
| `PointsProduct` | 积分商城商品 | name, type, pointsCost, stock, status |
| `PointsExchange` | 积分兑换记录 | userId, productId, pointsCost, status |
| `PointsOrder` | 积分订单（实物） | orderNo, userId, productId, deliveryType, status, trackingNumber |
| `UserBenefitUsage` | 会员权益使用记录 | userId, benefitType, totalQuota, usedQuota |

**交易类型枚举（部分）：** `RECHARGE` / `DEDUCT` / `REFUND` / `POINTS_EARN` / `POINTS_DEDUCT` / `POINTS_GIFT` / `CANCEL_RESTORE` / `ADJUSTMENT` / `FREEZE` / `NO_SHOW_PENALTY` / `NO_SHOW_REVERSE` / `RESCHEDULE_FEE`

### 4.6 设备管理

| 模型 | 说明 | 关键字段 |
|------|------|---------|
| `Equipment` | 设备台账 | name, model, code, type, status, venueId, buyDate, warranty |
| `BookingEquipment` | 预约-设备分配 | bookingId, equipmentId, assignedAt, releasedAt |
| `MaintenanceRecord` | 设备维保记录 | equipmentId, date, type, description, operator |

**设备类型：** `HEADSET` / `TRACKER` / `CONTROLLER` / `COMPUTER`

### 4.7 营销活动

| 模型 | 说明 | 关键字段 |
|------|------|---------|
| `Campaign` | 营销活动 | name, type, status, startAt, endAt, budget, spent, targetTags, priority |
| `CampaignReward` | 活动奖励 | campaignId, rewardType, pointsAmount, couponName, maxQuantity, issuedCount |
| `CampaignTrack` | 活动追踪 | campaignId, userId, step, orderId, amount |
| `CampaignExecutionLog` | 活动执行日志 | campaignId, userId, triggerEvent, status, reason, rewardType, rewardValue |
| `TriggerRule` | 触发规则 | name, event, conditions, actions, enabled |
| `UserTag` | 用户标签 | userId, tag, scoredAt, expireAt |
| `CouponEffectReport` | 券效果报表 | date, couponType, source, giftedCount, usedCount, couponDiscountCost |
| `ThirdPartyCoupon` | 第三方优惠券 | code, source, name, discountAmount, status |

### 4.8 财务与对账

| 模型 | 说明 | 关键字段 |
|------|------|---------|
| `DailyFinancialReport` | 每日财务汇总 | date, rechargePrincipalIn, directPayIn, refundOut, netCashFlow, totalRecognizedRevenue, noShowPenalty |
| `ReconBatch` | 对账批次 | reconDate, status, matchedCount, exceptionCount, matchedAmount |
| `ReconException` | 对账异常明细 | exceptionType, exceptionStatus, bizOrderNo, channelTransactionId, diffAmount |
| `ReconChannelBill` | 渠道对账单 | channel, channelTransactionId, merchantOrderNo, buyerPaidAmount, channelFee, settlementAmount |
| `ReconBankStatement` | 银行流水 | bankSerialNo, counterpartyName, creditAmount, debitAmount |
| `ReconConfig` | 对账配置 | key, value (渠道 API 密钥、费率等) |
| `DeviceSessionLog` | 头显设备运行日志 | deviceId, venueId, appPackageName, sessionStartAt, sessionDurationSec, isCompleted |

### 4.9 系统与审计

| 模型 | 说明 | 关键字段 |
|------|------|---------|
| `SystemSetting` | 系统设置（JSON） | key, value, category |
| `SystemConfig` | 系统配置（字符串） | key, value, type |
| `OperationLog` | 操作日志 | userId, operator, type, content, ip |
| `AuditLog` | 审计日志（结构化） | operatorId, targetType, targetId, action, beforeValue, afterValue, diffValue |
| `ApprovalRequest` | 审批请求 | type, status, targetType, targetId, requesterId, approverId, requestPayload |
| `Notification` | 通知消息 | userId, type, title, content, read |
| `BackupRecord` | 备份记录 | fileName, filePath, size, type, status |
| `DataCheckResult` | 数据校验结果 | checkType, checkDate, totalChecked, errorCount, errors |

### 4.10 资金池隔离（可选）

| 模型 | 说明 |
|------|------|
| `UserStoreBalance` | 用户-门店维度余额（支持跨店资金隔离） |

---

## 五、后端架构详解

### 5.1 控制器 (Controllers) — 32 个

| 控制器 | 职责 |
|--------|------|
| `authController` | 登录/注册/Token 刷新/修改密码 |
| `usersController` | 用户 CRUD、会员等级、余额调整 |
| `venueController` | 门店 CRUD、状态管理 |
| `bookingController` | 预约创建/取消/状态流转/签到 |
| `orderController` | 订单创建/支付/退款/爽约处理 |
| `gameController` | 游戏 CRUD、上下架 |
| `rechargeController` | 会员充值、充值记录 |
| `pointsController` | 积分商品管理、兑换处理、积分订单 |
| `couponController` | 发券/用券/过期处理 |
| `giftController` | 手动赠送券/积分 |
| `campaignController` | 活动创建/状态管理/奖励发放 |
|
| couponEffectController | 优惠券效果报表查询 |
| triggerRuleController | 自动化规则 CRUD |
| userTagController | 标签管理/人群圈选 |
| userBenefitController | 权益配额管理/使用记录 |
| financeController | 财务报表/资金流水 |
| financialController | 日报/月报生成 |
| reconController | 对账批次/异常处理 |
| reconConfigController | 渠道密钥/费率配置 |
| refundController | 退款审批/执行 |
| approvalController | 审批流/审批操作 |
| analyticsController | 经营分析/用户分析 |
| searchController | 跨模块搜索 |
| equipmentController | 设备台账/维保记录 |
| deviceLogController | 头显运行日志查询 |
| monitorController | 服务状态/健康检查 |
| logController | 操作日志查询 |
| notificationController | 消息推送/已读 |
| roleController | 角色 CRUD/权限分配 |
| systemConfigController | 系统参数配置 |
| settingsController | JSON 格式设置管理 |


### 5.2 路由 (Routes) — 31 个

| 路由文件 | 路径前缀 | 说明 |
|---------|---------|------|
| auth.ts | /api/auth | 认证相关 |
| users.ts | /api/users | 用户管理 |
| venues.ts | /api/venues | 门店管理 |
| bookings.ts | /api/bookings | 预约管理 |
| orders.ts | /api/orders | 订单管理 |
| games.ts | /api/games | 游戏管理 |
| recharges.ts | /api/recharges | 充值管理 |
| points.ts | /api/points | 积分商城 |
| coupons.ts | /api/coupons | 优惠券 |
| gift.ts | /api/gift | 赠送管理 |
| campaign.ts | /api/campaigns | 营销活动 |
| couponEffects.ts | /api/coupon-effects | 券效果 |
| triggerRules.ts | /api/trigger-rules | 触发规则 |
| userBenefits.ts | /api/user-benefits | 会员权益 |
| finance.ts | /api/finance | 财务管理 |
| financial.ts | /api/financial | 财务汇总 |
| recon.ts | /api/recon | 对账管理 |
| approvals.ts | /api/approvals | 审批管理 |
| analytics.ts | /api/analytics | 数据分析 |
| search.ts | /api/search | 全局搜索 |
| equipment.ts | /api/equipment | 设备管理 |
| deviceLog.ts | /api/device-logs | 设备日志 |
| monitor.ts | /api/monitor | 系统监控 |
| logs.ts | /api/logs | 操作日志 |
| auditLog.ts | /api/audit-logs | 审计日志 |
| notifications.ts | /api/notifications | 通知消息 |
| role.ts | /api/roles | 角色管理 |
| systemConfig.ts | /api/system-configs | 底层业务配置接口，前端入口已拆分到会员营销和财务对账中心 |
| settings.ts | /api/settings | 系统设置 |
| upload.ts | /api/upload | 文件上传 |
| debug.ts | /api/debug | 调试接口 |


### 5.3 服务层 (Services) — 13 个

| 服务 | 职责 |
|------|------|
| authService | JWT 签发/验证、密码加密、Token 刷新 |
| bookingService | 预约冲突检测、时段校验、状态机流转 |
| orderService | 订单创建/支付/退款、组合支付计算、爽约扣款 |
| balanceService | 余额操作（本金/赠送分离）、积分变动、流水记录 |
| couponService | 发券/用券/过期处理、优惠计算 |
| campaignService | 活动匹配/奖励发放/预算控制 |
| triggerService | 事件监听/规则匹配/自动执行 |
| reconService | 对账数据导入/匹配算法/异常生成 |
| financeService | 日报生成/收入确认/现金流计算 |
| notificationService | 站内消息/推送通知 |
| approvalService | 审批流创建/流转/回调 |
| uploadService | 文件上传/存储 |
| auditService | 审计日志记录/变更追踪 |


### 5.4 中间件 (Middleware) — 5 个

| 中间件 | 说明 |
|--------|------|
| auth.ts | JWT Token 验证、用户身份注入 req.user |
| role.ts | RBAC 角色权限校验 |
| venueAccess.ts | 门店数据隔离（店长只能看自己门店） |
| auditLog.ts | 自动记录敏感操作的审计日志 |
| upload.ts | 文件上传 Multer 配置 |

### 5.5 定时任务 (Jobs) — 8 个

| 任务 | 执行频率 | 说明 |
|------|---------|------|
| dailyReportJob | 每日 00:05 | 生成前一日财务日报 |
| couponExpireJob | 每日 00:10 | 标记过期优惠券 |
| campaignJob | 每分钟 | 检查活动状态、自动启停 |
| triggerJob | 每分钟 | 扫描触发规则并执行 |
| reconJob | 每日 06:00 | 自动拉取渠道账单并执行对账 |
| noShowJob | 每 5 分钟 | 检测超时未签到预约，标记爽约 |
| backupJob | 每日 03:00 | 数据库自动备份 |
| dataCheckJob | 每日 04:00 | 数据一致性校验 |


---

## 六、前端架构详解

### 6.1 管理后台 (app/src/) — 24 个页面

| 页面 | 路由 | 说明 |
|------|------|------|
| Login | /login | 登录页 |
| Dashboard | / | 仪表盘（核心指标、图表） |
| VenueManagement | /venues | 门店 CRUD、状态管理 |
| VenueCalendar | /venues/:id/calendar | 门店预约日历视图 |
| BookingManagement | /bookings | 预约列表、筛选、状态管理 |
| BookingDetail | /bookings/:id | 预约详情、签到核销 |
| OrderManagement | /orders | 订单列表、退款处理 |
| OrderDetail | /orders/:id | 订单详情、支付记录 |
| GameManagement | /games | 游戏 CRUD、上下架 |
| UserManagement | /users | 用户列表、等级管理 |
| UserDetail | /users/:id | 用户详情、资产流水 |
| RechargeManagement | /recharges | 充值记录、手动充值 |
| CouponManagement | /coupons | 优惠券管理、发券 |
| PointsManagement | /points | 积分商品、兑换管理 |
| CampaignManagement | /campaigns | 营销活动 CRUD |
| TriggerRules | /trigger-rules | 自动化规则配置 |
| FinanceDashboard | /finance | 财务报表、日报月报 |
| Reconciliation | /recon | 对账批次、异常处理 |
| EquipmentManagement | /equipment | 设备台账、维保 |
| ApprovalManagement | /approvals | 审批列表、审批操作 |
| Analytics | /analytics | 经营分析图表 |
| SystemSettings | /settings | 系统参数配置 |
| RoleManagement | /roles | 角色权限管理 |
| OperationLogs | /logs | 操作日志查询 |


### 6.2 C端顾客端 (app/reservation/) — 17 个页面

| 页面 | 路由 | 说明 |
|------|------|------|
| Home | / | 首页（门店列表、推荐） |
| VenueDetail | /venue/:id | 门店详情、游戏列表 |
| GameDetail | /game/:id | 游戏详情、预约入口 |
| BookingCreate | /booking/create | 选择日期/时段/人数 |
| BookingConfirm | /booking/confirm | 确认预约信息 |
| Payment | /payment/:orderId | 支付页面 |
| PaymentSuccess | /payment/success | 支付成功 |
| MyBookings | /my/bookings | 我的预约列表 |
| BookingDetail | /booking/:id | 预约详情、签到码 |
| Profile | /my/profile | 个人中心 |
| MyCoupons | /my/coupons | 我的优惠券 |
| MyPoints | /my/points | 积分明细、兑换 |
| PointsMall | /points-mall | 积分商城 |
| Recharge | /recharge | 会员充值 |
| BalanceHistory | /my/balance | 余额流水 |
| Login | /login | 登录/注册 |
| Notifications | /my/notifications | 消息通知 |

### 6.3 管理后台 API 模块 (app/src/api/) — 28 个

| 模块 | 说明 |
|------|------|
| auth.ts | 登录/登出/Token 刷新 |
| users.ts | 用户 CRUD |
| venues.ts | 门店 CRUD |
| bookings.ts | 预约管理 |
| orders.ts | 订单管理 |
| games.ts | 游戏管理 |
| recharges.ts | 充值管理 |
| coupons.ts | 优惠券管理 |
| points.ts | 积分商城 |
| gift.ts | 赠送管理 |
| campaigns.ts | 营销活动 |
| couponEffects.ts | 券效果报表 |
| triggerRules.ts | 触发规则 |
| userBenefits.ts | 会员权益 |
| finance.ts | 财务管理 |
| financial.ts | 财务汇总 |
| recon.ts | 对账管理 |
| approvals.ts | 审批管理 |
| analytics.ts | 数据分析 |
| search.ts | 全局搜索 |
| equipment.ts | 设备管理 |
| deviceLogs.ts | 设备日志 |
| monitor.ts | 系统监控 |
| logs.ts | 操作日志 |
| auditLogs.ts | 审计日志 |
| notifications.ts | 通知消息 |
| roles.ts | 角色管理 |
| settings.ts | 系统设置 |
