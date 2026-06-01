# VR Space 系统开发路线图 v2.0

> 运营专家 × 财务总监 × 产品经理 三视角联合评审输出
> 版本：v2.0 | 日期：2026-06-01

---

## 评审结论

当前系统已完成**核心业务闭环**（预约 → 支付 → 核销 → 退款），会员体系和财务对账基础扎实。本次评审识别出 **15 项高价值改进点**，按影响面和实现成本分为三阶段，预计 **8 周（2 个月）** 完成全部交付。

**评审参与方**：
- 运营专家：关注增长、转化、留存、活动效果
- 财务总监：关注资金安全、审计合规、收入确认、对账准确
- 产品经理：关注权限安全、操作效率、配置化、技术债务

---

## 一、🎯 运营增长模块（5 项）

### 1.1 营销活动闭环（Campaign 模块）

**现状痛点**：能发券、能送积分，但**活动效果无法追踪**。发了 100 张券，不知道核销多少、带来多少额外消费、ROI 是正还是负。

**需求描述**：

新增「营销活动」管理模块，支持创建活动 → 绑定权益（券/积分）→ 自动/手动发放 → 效果追踪全链路。

**数据模型**：

```prisma
model Campaign {
  id          String   @id @default(uuid())
  name        String          // 活动名称：618大促、新客专享
  type        String          // AUTO_GIFT / MANUAL_GIFT / CONDITIONAL
  status      String   @default(DRAFT) // DRAFT / RUNNING / PAUSED / ENDED
  startAt     DateTime?
  endAt       DateTime?
  budget      Int?            // 预算上限（分）
  spent       Int      @default(0) // 已消耗（分）
  createdBy   String          // 创建人
  createdAt   DateTime @default(now())
}

model CampaignReward {
  id          String @id @default(uuid())
  campaignId  String
  rewardType  String // POINTS / COUPON_DISCOUNT / COUPON_EXPERIENCE
  pointsAmount Int?   // 积分数量
  couponName   String? // 券名称
  couponDiscountRate Int? // 折扣率
  couponValidDays Int?  // 有效期（天）
  maxQuantity Int    @default(0) // 发放上限，0=不限
  issuedCount Int    @default(0) // 已发放数
}

model CampaignTrack {
  id          String @id @default(uuid())
  campaignId  String
  userId      String
  step        String // ISSUED / USED / ORDER_COMPLETED / REORDERED
  orderId     String?
  amount      Int?   // 订单金额（分）
  createdAt   DateTime @default(now())
}
```

**核心指标**：

| 指标 | 公式 | 说明 |
|------|------|------|
| 发放率 | 实际发放 / 计划发放 | 活动触达效率 |
| 核销率 | 核销数 / 发放数 | 权益吸引力 |
| 带动消费 | 用券订单平均客单价 − 不用券订单平均客单价 | 券的撬动效果 |
| 活动 ROI | （用券订单总额 − 券成本）/ 券成本 | 投入产出比 |
| 7日复购率 | 用券后7天内再次消费人数 / 用券人数 | 长期价值 |

**前端页面**：
- 「营销活动」一级菜单：活动列表 + 创建活动
- 活动详情页：数据看板（发放/核销/ROI 趋势图）
- 用户详情页「参与活动」子模块

**接口设计**：
```
POST   /campaigns              // 创建活动
GET    /campaigns              // 活动列表
GET    /campaigns/:id          // 活动详情
GET    /campaigns/:id/stats    // 活动统计数据
POST   /campaigns/:id/pause    // 暂停活动
POST   /campaigns/:id/end      // 结束活动
```

**验收标准**：
- [ ] 创建「新客首单礼」活动，绑定体验券，预算 ¥5000
- [ ] 活动运行后，详情页显示：发放 100 张，核销 35 张，带动消费 ¥9800，ROI 196%
- [ ] 活动超预算后自动停止发放

---

### 1.2 用户生命周期运营（标签 + 自动化）

**现状痛点**：只有「沉睡本金」统计，没有用户分层。新客来了不知道，沉睡用户走了也不知道。

**需求描述**：

建立自动标签体系 + 触发器规则引擎，实现**事件驱动型自动化运营**。

**用户标签体系**：

```prisma
model UserTag {
  id        String @id @default(uuid())
  userId    String
  tag       String // 见下表
  scoredAt  DateTime @default(now())
  expireAt  DateTime? // 标签有效期，如 NEW_CUSTOMER 7天后过期

  @@index([userId])
  @@index([tag])
}
```

| 标签 | 规则 | 有效期 |
|------|------|--------|
| `NEW_CUSTOMER` | 注册 ≤ 7 天且未消费 | 7 天 |
| `FIRST_ORDER` | 完成首单 | 永久 |
| `ACTIVE` | 30 天内有消费 | 动态更新 |
| `DORMANT` | 30~90 天无消费 | 动态更新 |
| `CHURN_RISK` | ≥ 90 天无消费 | 动态更新 |
| `VIP` | 累计消费 ≥ ¥5000 或 30 天内消费 ≥ 3 次 | 动态更新 |
| `BIRTHDAY_MONTH` | 本月生日 | 当月 |

**标签计算任务**：每日 00:10 定时任务扫描全量用户，打标签/更新标签。

**触发器规则引擎**：

```prisma
model TriggerRule {
  id          String @id @default(uuid())
  name        String
  event       String   // USER_REGISTERED / FIRST_ORDER_COMPLETED / DORMANT_DETECTED / BIRTHDAY / LEVEL_UP
  conditions  Json?    // { dormantDays: 90, minAmount: 10000 }
  actions     Json     // [{ type: 'SEND_COUPON', config: {...} }, { type: 'SEND_POINTS', amount: 200 }, { type: 'PUSH_NOTIFICATION', template: '...' }]
  enabled     Boolean  @default(true)
  runOnce     Boolean  @default(true) // 每人只触发一次
  createdAt   DateTime @default(now())
}
```

**内置规则示例**：

| 规则名称 | 触发事件 | 条件 | 动作 |
|----------|---------|------|------|
| 新客首单礼 | `USER_REGISTERED` | 注册后 72h 未下单 | 推送「首单 8 折券」+ 站内信 |
| 沉睡唤醒 | `DORMANT_DETECTED` | 沉睡 90 天 | 赠送「满 200 减 50 券」+ 短信提醒 |
| 生日祝福 | `BIRTHDAY` | 生日当天 | 赠送 200 积分 + 生日礼券 |
| 消费升级 | `LEVEL_UP` | 等级提升时 | 赠送对应等级礼包 |
| 复购激励 | `ORDER_COMPLETED` | 30 天内第 3 单 | 赠送「下次消费 9 折券」 |

**前端页面**：
- 「营销自动化」一级菜单：规则列表 + 规则编辑器
- 规则编辑器：事件选择 → 条件配置 → 动作配置（可视化）
- 用户详情页显示当前标签

**验收标准**：
- [ ] 新用户注册后 72h 未消费，自动收到首单券推送
- [ ] 沉睡 90 天用户，自动收到唤醒券（可通过 CampaignTrack 追踪是否因该规则发放）
- [ ] 后台可开启/关闭/编辑规则，实时生效

---

### 1.3 场地利用率可视化（热力图 + 坪效）

**现状痛点**：排场靠经验，没有数据支撑。不知道哪些时段爆满、哪些时段空闲。

**需求描述**：

新增「场地运营」数据页面，提供**时段热力图**和**坪效分析**。

**数据聚合**：

```sql
-- 时段上座率
SELECT 
  venue_id,
  DATE(booking_time) as date,
  EXTRACT(HOUR FROM booking_time) as hour,
  COUNT(*) as bookings,
  SUM(player_count) as total_players,
  venue_capacity,
  ROUND(SUM(player_count) * 100.0 / venue_capacity, 2) as occupancy_rate
FROM Booking
WHERE booking_time >= '2026-05-01'
GROUP BY venue_id, DATE(booking_time), EXTRACT(HOUR FROM booking_time), venue_capacity
```

**页面设计**：

```
┌─────────────────────────────────────────────────────┐
│ 场地运营分析                              [近7天 ▼] │
├─────────────────────────────────────────────────────┤
│ 指标卡片                                            │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │
│ │ 日均上座率  │ │ 黄金时段占比 │ │ 闲时折扣建议│    │
│ │    67%      │ │    45%      │ │   开启      │    │
│ └─────────────┘ └─────────────┘ └─────────────┘    │
├─────────────────────────────────────────────────────┤
│ 时段热力图（深圳店）                                │
│         周一   周二   周三   周四   周五   周六   周日│
│ 10:00   ░░     ░░     ░░     ░░     ░░     ▓▓     ▓▓ │
│ 11:00   ░░     ░░     ░░     ░░     ░░     ▓▓     ▓▓ │
│ ...                                                         │
│ 15:00   ▓▓     ▓▓     ▓▓     ▓▓     ▓▓     ██     ██ │ ← 深绿=爆满
│ 20:00   ██     ██     ██     ██     ██     ██     ██ │
│                                                           │
│ 图例：░░ <30%  ░▒ 30-60%  ▓▓ 60-85%  ██ >85%            │
├─────────────────────────────────────────────────────┤
│ 游戏维度分析                                        │
│ 游戏名称      │ 场次 │ 平均上座 │ 复购率 │ 评分 │    │
│ 星际远征      │ 128  │   82%    │  45%   │ 4.8  │    │
│ 蛮荒险踪      │  86  │   71%    │  38%   │ 4.5  │    │
└─────────────────────────────────────────────────────┘
```

**新增指标**：

| 指标 | 说明 | 计算方式 |
|------|------|---------|
| 日均上座率 | 每日平均座位利用率 | SUM(实际人数) / SUM(场地容量) |
| 黄金时段占比 | 14:00-20:00 场次 / 总场次 | 时段筛选 |
| 坪效 | 单场地单位时间产值 | 场地营收 / (营业天数 × 每日营业小时数) |
| 游戏复购率 | 体验过该游戏后再次预约该游戏的比例 | 复购人数 / 总体验人数 |

**前端页面**：
- 「场地运营」一级菜单（或放在「数据分析」下）
- 热力图组件：使用 ECharts Heatmap 或自研 CSS Grid
- 门店筛选器：切换不同场地

**后端接口**：
```
GET /analytics/venue-occupancy?venueId=xxx&startDate=xxx&endDate=xxx
GET /analytics/game-performance?startDate=xxx&endDate=xxx
```

**验收标准**：
- [ ] 深圳店周末 15:00 时段显示深绿色（上座率 85%+）
- [ ] 深圳店工作日 10:00 时段显示浅色（上座率 < 30%）
- [ ] 游戏复购率排行榜正确排序

---

### 1.4 优惠券效果追踪（券维度 ROI）

**现状痛点**：送了券不知道效果，无法评估哪种券更划算。

**需求描述**：

建立券效果追踪体系，覆盖**核销率、带动消费、复购转化**三个维度。

**数据模型**：

```prisma
model CouponEffectReport {
  id              String @id @default(uuid())
  date            String
  couponType      String // DISCOUNT / EXPERIENCE_FREE
  source          String // MANUAL_GIFT / CAMPAIGN / EXCHANGE / RECHARGE_BONUS
  
  // 发放侧
  giftedCount     Int @default(0)
  
  // 使用侧
  usedCount       Int @default(0)
  expiredCount    Int @default(0)
  
  // 消费侧
  totalOrderAmount   Int @default(0) // 用券订单总金额（分）
  avgOrderAmount     Int @default(0) // 用券订单平均金额（分）
  couponDiscountCost Int @default(0) // 券实际折让成本（分）
  
  // 复购侧
  reorderUserCount   Int @default(0) // 30天内复购人数
  reorderAmount      Int @default(0) // 复购订单总金额
  
  createdAt       DateTime @default(now())
  @@unique([date, couponType, source])
}
```

**核心指标**：

| 指标 | 公式 | 业务含义 |
|------|------|---------|
| 核销率 | usedCount / giftedCount | 券的吸引力 |
| 带动消费 | avgOrderAmount(用券) − avgOrderAmount(不用券) | 券的撬动能力 |
| 净收入 | totalOrderAmount − couponDiscountCost | 券贡献的实际收入 |
| 复购率 | reorderUserCount / usedCount | 券带来的长期价值 |
| 综合 ROI | (净收入 + 复购金额) / couponDiscountCost | 整体投入产出 |

**前端页面**：
- 「营销效果」二级菜单（在「营销活动」下）
- 券效果对比表：体验券 vs 折扣券哪种 ROI 更高
- 时间趋势图：核销率、带动消费随时间变化

**后端逻辑**：
- 每日 00:15 跑批，统计昨日券效果
- `CouponEffectReport` 数据来源于 `UserCoupon` + `Order` 关联查询

**验收标准**：
- [ ] 某体验券发放 100 张，核销 30 张 → 核销率 30%
- [ ] 用券订单平均 ¥280，不用券平均 ¥200 → 带动消费 +40%
- [ ] 体验券 ROI 1.8，折扣券 ROI 2.5 → 结论：折扣券更划算

---

### 1.5 用户分层画像（数据支撑）

**现状痛点**：用户列表只有基础信息，没有价值分层。

**需求描述**：

在用户列表和详情中展示用户价值分层数据。

**用户价值模型**：

| 分层 | 标准 | 运营策略 |
|------|------|---------|
| S 级（超级用户） | 累计消费 ≥ ¥10000 或 月消费 ≥ 3 次 | 专属客服、提前体验新游戏、VIP 活动邀请 |
| A 级（高价值） | 累计消费 ≥ ¥5000 | 优先排场、生日双倍积分 |
| B 级（潜力） | 累计消费 ≥ ¥1000 且近 30 天有消费 | 推送复购券、拼团活动 |
| C 级（普通） | 有消费记录但金额 < ¥1000 | 新客引导、首充优惠 |
| D 级（沉睡） | ≥ 90 天无消费 | 大额唤醒券、短信召回 |
| F 级（流失） | 注册后从未消费 | 放弃或极低成本的触达 |

**前端改动**：
- 用户列表新增「价值等级」列（S/A/B/C/D/F 彩色标签）
- 用户列表新增「最近消费」「累计消费」排序
- 用户详情页新增「消费画像」卡片：消费频次、偏好游戏、平均客单价、生命周期价值(LTV)

**验收标准**：
- [ ] 用户列表可按价值等级筛选
- [ ] 点击 S 级用户，详情页显示 LTV 预估 ¥15000

---

## 二、💰 财务合规模块（4 项）

### 2.1 审计日志系统（AuditLog）

**现状痛点**：`fixReconcileDiff()`、赠送积分、调整余额等操作**只有业务流水，没有操作留痕**。谁改的、改前多少、改后多少、为什么改，全部查不到。

**需求描述**：

所有涉及资金变动的操作必须记录完整审计日志，**不可删除、不可修改**。

**数据模型**：

```prisma
model AuditLog {
  id            String   @id @default(uuid())
  operatorId    String          // 操作人ID
  operatorName  String          // 操作人姓名（冗余，防用户删除后无法追溯）
  operatorRole  String          // 操作人角色
  
  targetType    String          // USER / ORDER / BALANCE / COUPON / RECON
  targetId      String          // 操作对象ID
  targetDesc    String?         // 对象描述（如用户姓名、订单号）
  
  action        String          // 动作编码
  actionName    String          // 动作中文名
  
  beforeValue   Json?           // 变更前完整快照
  afterValue    Json?           // 变更后完整快照
  diffValue     Json?           // 变更差异（仅变化字段）
  
  amount        Int?            // 涉及金额（分），如有
  reason        String          // 操作原因（必填）
  
  ipAddress     String?         // 操作IP
  userAgent     String?         // 浏览器UA
  
  createdAt     DateTime @default(now())
  
  @@index([targetType, targetId])
  @@index([operatorId])
  @@index([action])
  @@index([createdAt])
}
```

**动作编码清单**：

| action | actionName | 触发场景 |
|--------|-----------|---------|
| `BALANCE_ADJUST` | 余额调整 | fixReconcileDiff |
| `POINTS_GIFT` | 积分赠送 | giftPoints |
| `COUPON_GIFT` | 优惠券赠送 | giftCoupon |
| `ORDER_REFUND` | 订单退款 | refundOrder |
| `ORDER_CANCEL` | 订单取消 | cancelOrder |
| `RECON_FIX` | 对账修复 | fixReconcileDiff |
| `USER_LEVEL_UP` | 等级提升 | 系统自动 |

**示例数据**：

```json
{
  "operatorId": "admin-001",
  "operatorName": "系统管理员",
  "operatorRole": "SUPER_ADMIN",
  "targetType": "USER",
  "targetId": "user-123",
  "targetDesc": "杨文博",
  "action": "POINTS_GIFT",
  "actionName": "积分赠送",
  "beforeValue": { "points": 1000, "principalBalance": 50000 },
  "afterValue": { "points": 1100, "principalBalance": 50000 },
  "diffValue": { "points": 100 },
  "amount": 0,
  "reason": "生日礼 - 系统自动发放",
  "ipAddress": "192.168.1.100"
}
```

**前端页面**：
- 「审计日志」一级菜单（仅 FINANCE / SUPER_ADMIN 可见）
- 筛选条件：时间范围、操作人、动作类型、对象类型
- 详情弹窗：展示变更前后 JSON 对比（高亮差异字段）

**后端实现**：
- 封装 `auditLogService.record()` 方法
- 在以下接口中自动调用：
  - `POST /gift/points`
  - `POST /gift/coupon`
  - `POST /finance/fix-reconcile-diff`
  - `POST /orders/:id/refund`
  - `POST /orders/:id/cancel`

**验收标准**：
- [ ] 赠送 100 积分后，AuditLog 能查到操作人、用户变更前积分、变更后积分、赠送原因
- [ ] 修复对账差异后，AuditLog 能查到调整前后的余额快照
- [ ] 日志表无 UPDATE / DELETE 接口，只读

---

### 2.2 收入确认时点修正（预收 vs 营收）

**现状痛点**：订单 `PAID` 即确认收入。但用户可能买了体验券过几天才用，甚至一直不用。**按会计准则，服务未完成前不应确认收入**。

**需求描述**：

将收入拆分为 **「预收账款」（已付款未核销）** 和 **「已确认收入」（已核销）**，符合权责发生制。

**订单状态与收入关系**：

```
PENDING ──付款──→ PAID（预收账款）──核销──→ COMPLETED（已确认收入）
                      │                              │
                      ▼                              ▼
               不确认收入                     确认收入
               记为负债                      记为营收
```

**数据库变更**：

```prisma
model DailyFinancialReport {
  // ... 已有字段 ...
  
  // 收入拆分（替代原有的 directRevenue / memberPrincipalRevenue）
  prepaidDirectRevenue        Int @default(0) // 线上直付预收（已付款未核销）
  confirmedDirectRevenue      Int @default(0) // 线上直付已确认收入（已核销）
  prepaidMemberRevenue        Int @default(0) // 会员本金预收
  confirmedMemberRevenue      Int @default(0) // 会员本金已确认收入
  
  // 兼容旧字段（过渡期后删除）
  directRevenue          Int @default(0) // = prepaidDirectRevenue + confirmedDirectRevenue
  memberPrincipalRevenue Int @default(0) // = prepaidMemberRevenue + confirmedMemberRevenue
}
```

**统计逻辑变更（runDailyReport）**：

```typescript
// 预收账款：PAID 但未核销
const prepaidOrders = await prisma.order.aggregate({
  where: {
    status: 'PAID', // 已付款但未核销
    payMethod: { in: ['WECHAT', 'ALIPAY'] }
  },
  _sum: { amount: true }
})

// 已确认收入：COMPLETED
const confirmedOrders = await prisma.order.aggregate({
  where: {
    status: 'COMPLETED',
    payMethod: { in: ['WECHAT', 'ALIPAY'] }
  },
  _sum: { amount: true }
})

// 会员消费同理：按 principalDeduction 拆分
```

**前端变更**：

```
每日确权营收表（权责发生制）
┌─────────────────┬─────────────────┬─────────────────┐
│   预收账款        │   已确认收入      │    营收合计      │
├─────────────────┼─────────────────┼─────────────────┤
│ 线上直付预收 ¥200 │ 线上直付已确认 ¥800│ 线上直付合计 ¥1000│
│ 会员本金预收 ¥150 │ 会员本金已确认 ¥600│ 会员本金合计 ¥750 │
├─────────────────┼─────────────────┼─────────────────┤
│   预收合计 ¥350   │   已确认合计 ¥1400 │   总营收 ¥1750   │
└─────────────────┴─────────────────┴─────────────────┘

预收转化率：80%（= 已确认 / 营收合计）
```

**验收标准**：
- [ ] 今天 5 个订单付款（总额 ¥500），0 个核销 → `prepaid=500, confirmed=0`
- [ ] 明天这 5 个订单核销 → 明天的报表 `prepaid=0, confirmed=500`
- [ ] 预收转化率指标正确计算

---

### 2.3 资金池隔离（多门店分账）

**现状痛点**：所有门店共用一个资金池。用户在深圳充值，可以在成都消费。如果是加盟模式，会导致**分账纠纷**。

**需求描述**：

支持按门店隔离资金，用户充值时可选/默认关联门店，该本金优先在充值门店消费。

**数据模型**：

```prisma
model UserStoreBalance {
  id                String @id @default(uuid())
  userId            String
  venueId           String
  principalBalance  Int @default(0) // 在该门店的本金余额
  bonusBalance      Int @default(0) // 在该门店的赠送余额
  totalRecharged    Int @default(0) // 累计充值（用于等级计算）
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([userId, venueId])
  @@index([userId])
}
```

**资金流转规则**：

| 场景 | 规则 |
|------|------|
| 充值 | 本金进入「充值门店」资金池 |
| 消费 | 优先扣「消费门店」资金池，不足时提示「余额在 XXX 店，是否跨店消费？」 |
| 退款 | 退回原充值门店资金池 |
| 跨店消费 | 需门店间结算（可二期做自动分账） |

**配置开关**：

```prisma
model SystemConfig {
  key   String @id
  value String
}
// balance_isolation_mode = "STRICT" | "LOOSE" | "NONE"
// STRICT = 完全隔离，不可跨店
// LOOSE = 优先本店，允许跨店
// NONE = 当前模式，全局通用
```

**前端变更**：
- 充值页面：显示「当前充值门店：深圳店，本金仅限深圳店使用」
- 预约页面：余额显示「本店余额 ¥200 / 其他门店余额 ¥500」
- 用户详情：显示各门店余额分布

**后端变更**：
- `wallet.ts` 中所有余额操作增加 `venueId` 参数
- 充值接口：写入 `UserStoreBalance`
- 消费接口：先查本店余额，再决定扣款策略

**验收标准**：
- [ ] 用户在深圳店充值 ¥100，深圳店显示余额 ¥100，成都店显示 ¥0
- [ ] STRICT 模式下，用户在成都店消费时提示「余额不足（本店余额 ¥0，深圳店余额 ¥100）」
- [ ] LOOSE 模式下，允许跨店消费，但记录跨店流水

**注意**：此项改动面大，涉及充值/消费/退款全链路，建议单独一个迭代。如果当前是直营模式（非加盟），可降级为 P2。

---

### 2.4 对账异常自动告警

**现状痛点**：对账差异需要人工点开「对账异常」Tab 查看，财务不可能每天手动检查。

**需求描述**：

对账任务执行后，自动检测差异并推送给相关人员。

**告警规则配置**：

```prisma
model SystemConfig {
  key   String @id
  value String
}

// recon_alert_enabled = "true"
// recon_alert_amount_threshold = "10000"  // 差异金额阈值（分）
// recon_alert_percent_threshold = "100"    // 差异百分比阈值（万分比，100=1%）
// recon_alert_balance_strict = "true"      // 余额维度 diff≠0 时必告警
```

**告警触发条件**（满足任一即触发）：

1. 任一维度差异绝对值 > `recon_alert_amount_threshold`（默认 ¥100）
2. 任一维度差异绝对值 > `expected × recon_alert_percent_threshold / 10000`（默认 1%）
3. 余额维度（本金/赠送/积分）diff ≠ 0（零容忍）

**告警内容**：

```
标题：对账异常告警 - 2026-06-01
内容：
- 本金余额：实际 ¥42,408，期望 ¥42,400，差异 ¥8
- 触发条件：余额差异 ≠ 0
- 请尽快查看对账中心处理
```

**接收人**：
- `role === 'FINANCE'` 的所有用户
- `role === 'SUPER_ADMIN'` 的所有用户

**前端页面**：
- 「系统设置」新增「对账告警配置」子页面
- 可调整阈值、开启/关闭告警

**后端实现**：

```typescript
// reconciliationJob.ts
export async function runReconciliationJob() {
  const reconcileResult = await reconcileInternal()
  
  // 检查是否需要告警
  const shouldAlert = reconcileResult.items.some(item => {
    if (['本金余额', '赠送余额', '积分余额'].includes(item.name) && item.diff !== 0) return true
    if (Math.abs(item.diff) > alertAmountThreshold) return true
    if (item.expected !== 0 && Math.abs(item.diff) / Math.abs(item.expected) > alertPercentThreshold) return true
    return false
  })
  
  if (shouldAlert) {
    await notifyFinanceTeam(reconcileResult)
  }
}
```

**验收标准**：
- [ ] 模拟本金余额差异 ¥8，次日 02:00 后财务收到告警通知
- [ ] 差异 ¥50（低于阈值）且余额平衡，不产生告警
- [ ] 后台可关闭告警，关闭后不再推送

---

## 三、📱 产品体验模块（6 项）

### 3.1 RBAC 权限细化

**现状痛点**：角色只有 6 个枚举值，权限边界硬编码。「运营」和「财务」的权限无法灵活调整。

**需求描述**：

引入基于权限码的细粒度访问控制，支持自定义角色和权限组合。

**数据模型**：

```prisma
model Permission {
  id     String @id @default(uuid())
  code   String @unique // 权限码
  name   String         // 权限名称
  module String         // 所属模块
}

model Role {
  id          String @id @default(uuid())
  name        String @unique
  description String?
  isSystem    Boolean @default(false) // 系统内置角色不可删除
}

model RolePermission {
  roleId       String
  permissionId String
  @@id([roleId, permissionId])
}

model UserRole {
  userId String
  roleId String
  @@id([userId, roleId])
}
```

**权限码清单**：

| 权限码 | 名称 | 模块 |
|--------|------|------|
| `order:read` | 查看订单 | 订单 |
| `order:refund` | 执行退款 | 订单 |
| `order:verify` | 核销订单 | 订单 |
| `order:export` | 导出订单 | 订单 |
| `finance:read` | 查看财务 | 财务 |
| `finance:adjust` | 调整余额/修复差异 | 财务 |
| `finance:report` | 生成/导出报表 | 财务 |
| `user:read` | 查看用户 | 用户 |
| `user:edit` | 编辑用户 | 用户 |
| `user:gift` | 赠送积分/券 | 用户 |
| `user:export` | 导出用户 | 用户 |
| `venue:read` | 查看场地 | 场地 |
| `venue:manage` | 管理场地 | 场地 |
| `marketing:campaign` | 创建活动 | 营销 |
| `marketing:rule` | 配置自动化规则 | 营销 |
| `setting:read` | 查看设置 | 系统 |
| `setting:write` | 修改系统设置 | 系统 |
| `audit:read` | 查看审计日志 | 审计 |

**内置角色权限映射**：

| 角色 | 权限 |
|------|------|
| SUPER_ADMIN | 全部 |
| ADMIN | 全部（除审计日志） |
| FINANCE | finance:* + order:read + user:read + audit:read |
| OPERATOR | order:* + user:read + marketing:* |
| MANAGER | order:* + venue:manage（仅限所分配场地）+ user:read |
| CUSTOMER | 仅C端 |

**后端中间件**：

```typescript
// requirePermission('order:refund')
export function requirePermission(...permissions: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userPermissions = req.user?.permissions || []
    const hasPermission = permissions.some(p => userPermissions.includes(p))
    if (!hasPermission) {
      return error(res, '权限不足', 403)
    }
    next()
  }
}

// 使用
router.post('/orders/:id/refund', authenticate, requirePermission('order:refund'), refundOrder)
```

**前端实现**：
- 路由守卫：无权限页面自动 403
- 按钮级权限：无权限按钮不渲染（如「运营」看不到「赠送」按钮）
- `usePermission('order:refund')` Hook

**管理页面**：
- 「角色权限管理」：创建角色 → 勾选权限 → 分配用户

**验收标准**：
- [ ] 创建「店长助理」角色，只给 `order:read` + `order:verify`，无法退款
- [ ] 「财务」角色没有 `user:gift`，用户列表不显示「赠送」按钮
- [ ] SUPER_ADMIN 可以给任意用户分配/回收角色

---

### 3.2 批量操作

**现状痛点**：用户列表、订单列表都是单条操作。每天处理几十个订单，逐条核销/退款效率极低。

**需求描述**：

支持表格多选 + 批量操作。

**批量操作清单**：

| 页面 | 批量操作 |
|------|---------|
| 订单列表 | 批量核销、批量退款、批量导出 |
| 用户列表 | 批量发券、批量赠送积分、批量导出 |
| 预约列表 | 批量取消 |

**前端交互**：

```
┌─────────────────────────────────────────────────────┐
│ 已选 5 项    [批量核销] [批量退款] [批量导出]        │
├─────────────────────────────────────────────────────┤
│ ☐ 订单号        用户      金额    状态              │
│ ☑ VR2026...     杨文博    ¥200   已付款             │
│ ☑ VR2026...     张三      ¥150   已付款             │
│ ☐ VR2026...     李四      ¥300   已核销             │
│ ☑ VR2026...     王五      ¥180   已付款             │
└─────────────────────────────────────────────────────┘
```

**后端接口**：

```
POST /orders/batch-verify    // { ids: ['id1', 'id2'] }
POST /orders/batch-refund    // { ids: ['id1', 'id2'], reason: '...' }
POST /users/batch-gift-points   // { userIds: ['u1', 'u2'], points: 100, reason: '...' }
POST /users/batch-gift-coupon   // { userIds: ['u1', 'u2'], couponConfig: {...} }
```

**事务处理**：
- 批量操作使用 `$transaction`，全部成功或全部失败
- 部分失败时返回成功列表和失败列表（及失败原因）

**风控**：
- 批量退款单次最多 50 条
- 批量赠送积分单次最多 100 人，单日上限 10000 分/人

**验收标准**：
- [ ] 勾选 5 个「已付款」订单，一键核销，全部成功
- [ ] 勾选 10 个用户，一键赠送 100 积分，全部成功
- [ ] 批量操作中某条失败，其他不受影响（或全部回滚，视业务而定）

---

### 3.3 系统配置化

**现状痛点**：会员等级阈值、积分规则、折扣率等全部硬编码在 `memberConfig.ts` 里，改规则需要发版。

**需求描述**：

后台「系统配置」页面，支持热更新核心规则。

**数据模型**：

```prisma
model SystemConfig {
  key         String @id
  value       String
  type        String @default(STRING) // STRING / NUMBER / JSON / BOOLEAN
  description String?
  updatedBy   String?
  updatedAt   DateTime @updatedAt
}
```

**配置项清单**：

| key | 当前值 | 类型 | 说明 |
|-----|--------|------|------|
| `member_level_thresholds` | `[0,10000,50000,100000]` | JSON | 等级阈值（分） |
| `member_discount_rates` | `[100,95,90,85]` | JSON | 等级折扣率（%） |
| `member_level_names` | `["普通","白银","黄金","钻石"]` | JSON | 等级名称 |
| `points_earn_ratio` | `100` | NUMBER | 消费 1 元得 X 积分 |
| `points_deduct_ratio` | `100` | NUMBER | X 积分抵 1 元 |
| `points_gift_daily_limit` | `10000` | NUMBER | 单日赠送积分上限（分/人） |
| `coupon_gift_daily_limit` | `10` | NUMBER | 单日赠送券上限（张/人） |
| `dormant_days` | `90` | NUMBER | 沉睡天数 |
| `booking_cancel_hours` | `2` | NUMBER | 预约取消时限（小时） |
| `booking_advance_hours` | `24` | NUMBER | 提前预约时限（小时） |
| `recon_alert_enabled` | `true` | BOOLEAN | 对账告警开关 |
| `recon_alert_amount_threshold` | `10000` | NUMBER | 对账告警金额阈值（分） |
| `balance_isolation_mode` | `NONE` | STRING | 资金池隔离模式 |

**配置加载机制**：

```typescript
// configService.ts
let cachedConfig: Record<string, any> = {}

export async function loadConfig() {
  const configs = await prisma.systemConfig.findMany()
  cachedConfig = {}
  for (const c of configs) {
    cachedConfig[c.key] = parseValue(c.value, c.type)
  }
}

export function getConfig(key: string, defaultValue?: any) {
  return cachedConfig[key] ?? defaultValue
}

// 启动时加载
loadConfig()

// 配置变更时热更新
export async function updateConfig(key: string, value: string, operatorId: string) {
  await prisma.systemConfig.update({ where: { key }, data: { value, updatedBy: operatorId } })
  await loadConfig() // 重新加载
}
```

**前端页面**：
- 「系统设置」→「业务规则」子页面
- 表单编辑各配置项，保存后立即生效
- 变更记录：显示最近修改人和修改时间

**验收标准**：
- [ ] 后台修改「等级 2 阈值」从 ¥500 改为 ¥300，无需发版，新用户立即生效
- [ ] 关闭对账告警，次日对账异常不再推送通知
- [ ] 修改积分兑换比例，C 端积分商城价格实时更新

---

### 3.4 数据一致性校验（技术债务清理）

**现状痛点**：`user.balance` 已废弃但字段还在，存在数据不一致风险。

**需求描述**：

建立定时校验机制，自动发现并修复数据异常。

#### 3.4.1 彻底清理 `user.balance`

**步骤**：
1. 全代码扫描，确保没有任何地方读取/写入 `user.balance`
2. Prisma schema 中标记 `@ignore` 或直接删除字段
3. 数据库执行 `ALTER TABLE "User" DROP COLUMN balance`

#### 3.4.2 一致性校验定时任务

```prisma
model DataCheckResult {
  id          String @id @default(uuid())
  checkType   String // BALANCE / POINTS / COUPON / ORDER
  checkDate   String // YYYY-MM-DD
  totalChecked Int
  errorCount  Int
  errors      Json?  // [{ userId, expected, actual, diff }]
  status      String // PASSED / FAILED
  createdAt   DateTime @default(now())
}
```

**校验规则**：

| 校验项 | 规则 | 频率 |
|--------|------|------|
| 余额一致性 | `principalBalance + bonusBalance` = 流水累计 | 每日 03:00 |
| 积分一致性 | `points` = 积分流水累计 | 每日 03:00 |
| 订单状态一致性 | PAID 订单必须有 payment 记录 | 每日 03:00 |
| 券状态一致性 | USED 券必须有 usedOrderId 和 usedAt | 每日 03:00 |

**告警**：
- 校验失败时推送通知给 SUPER_ADMIN
- 失败详情写入 `DataCheckResult`，后台「系统健康」页面查看

**验收标准**：
- [ ] `user.balance` 字段从数据库删除，系统正常运行
- [ ] 某用户余额不一致，次日 03:00 后管理员收到通知
- [ ] 「系统健康」页面显示历史校验记录

---

### 3.5 容错与风控规则

**现状痛点**：赠送积分是直接扣减/增加，没有风控。运营误操作可能导致巨额损失。

**需求描述**：

增加操作风控层，防止误操作和恶意操作。

**风控规则**：

| 规则 | 阈值 | 动作 |
|------|------|------|
| 单日赠送积分上限 | 10000 分/人/天 | 超限拒绝，提示「超出单日赠送上限」 |
| 单日赠送券上限 | 10 张/人/天 | 超限拒绝 |
| 单用户累计赠送上限 | 50000 分/月 | 超限需 SUPER_ADMIN 审批 |
| 异常频率检测 | 1 分钟内同一操作人赠送 > 5 次 | 触发风控告警，暂停该操作人赠送权限 |
| 大额调整审批 | 单笔调整 > ¥500 | 需二次确认 + 记录 AuditLog |

**实现方式**：

```typescript
// riskControlService.ts
export async function checkGiftRisk(userId: string, operatorId: string, points: number) {
  const dailyLimit = getConfig('points_gift_daily_limit', 10000)
  const monthlyLimit = 50000
  
  // 检查单日上限
  const todayGifted = await prisma.balanceTransaction.aggregate({
    where: {
      userId,
      type: 'POINTS_GIFT',
      createdAt: { gte: startOfDay(new Date()) }
    },
    _sum: { pointsAmount: true }
  })
  if ((todayGifted._sum.pointsAmount || 0) + points > dailyLimit) {
    throw new Error(`超出单日赠送上限 ${dailyLimit} 分`)
  }
  
  // 检查异常频率
  const recentGifts = await prisma.balanceTransaction.count({
    where: {
      type: 'POINTS_GIFT',
      createdAt: { gte: subMinutes(new Date(), 1) }
    }
  })
  if (recentGifts > 5) {
    await alertRiskControl(operatorId, '异常频率：1分钟内赠送超过5次')
    throw new Error('操作过于频繁，请稍后再试')
  }
  
  return true
}
```

**前端**：
- 赠送积分时，如果超出阈值，弹窗提示并拒绝
- 大额调整（> ¥500）需输入验证码或二次密码确认

**验收标准**：
- [ ] 给用户赠送 15000 积分（超出单日上限），系统拒绝并提示
- [ ] 1 分钟内连续赠送 6 次，第 6 次被拒绝并触发风控告警
- [ ] 调整余额 ¥600，弹出二次确认框

---

### 3.6 移动端适配

**现状痛点**：Admin 是桌面端 React 应用，店长/运营人员离开电脑后无法处理紧急事务（如退款审批、查看今日营收）。

**需求描述**：

Admin 后台增加**响应式适配**，确保核心功能在手机浏览器可用。

**适配范围（MVP）**：

| 页面 | 适配方式 |
|------|---------|
| 登录页 | 完全响应式 |
| 首页看板 | 卡片纵向堆叠，图表简化 |
| 订单列表 | 卡片式列表（替代表格），支持滑动操作 |
| 订单详情 | 纵向布局，关键信息置顶 |
| 通知中心 | 完全响应式 |

**技术方案**：
- Tailwind CSS 响应式类：`md:hidden`、`lg:table` 等
- 表格组件：小屏自动切换为卡片列表
- 侧边栏：小屏收起为汉堡菜单

**验收标准**：
- [ ] iPhone 14 Pro 打开 Admin，首页数据卡片正常显示
- [ ] 订单列表以卡片形式展示，可点击「退款」
- [ ] 侧边栏收起为底部 Tab 或抽屉菜单

**后续扩展**：
- 二期可考虑微信小程序版管理端（更轻量，适合店长每日查看）

---

## 四、排期与里程碑

### 4.1 阶段划分

| 阶段 | 周期 | 主题 | 交付项 |
|------|------|------|--------|
| **第一阶段** | 2 周 | 财务合规底座 | 审计日志、收入确认修正、对账告警、数据一致性校验 |
| **第二阶段** | 3 周 | 运营增长引擎 | 营销活动、用户标签/自动化、券效果追踪、用户分层 |
| **第三阶段** | 2 周 | 效率与治理 | RBAC、批量操作、系统配置化、风控规则 |
| **第四阶段** | 1 周 | 体验收尾 | 移动端适配、场地热力图、清理 balance 字段 |

**合计：8 周（2 个月）**

### 4.2 关键里程碑

```
Week 1-2  [财务合规]
  ├─ Day 1-3:   AuditLog 模型 + 接口改造
  ├─ Day 4-7:   收入确认拆分（预收/已确认）
  ├─ Day 8-10:  对账异常告警 + 数据一致性校验
  └─ Milestone: 财务报表可审计、对账异常自动通知

Week 3-5  [运营增长]
  ├─ Day 11-15: Campaign 模块 + 券效果追踪
  ├─ Day 16-19: 用户标签体系 + 触发器规则引擎
  ├─ Day 20-23: 用户分层画像 + 生日/沉睡自动化
  └─ Milestone: 可创建活动并追踪 ROI，自动化规则上线

Week 6-7  [效率治理]
  ├─ Day 24-27: RBAC 权限体系
  ├─ Day 28-30: 批量操作 + 系统配置化
  ├─ Day 31-33: 风控规则（赠送上限、异常检测）
  └─ Milestone: 角色权限可控、运营配置无需发版

Week 8    [体验收尾]
  ├─ Day 34-35: 场地热力图 + 坪效分析
  ├─ Day 36-37: 移动端响应式适配
  ├─ Day 38-39: balance 字段清理 + 回归测试
  └─ Milestone: 全系统响应式可用、技术债务清零
```

---

## 五、附录

### 5.1 新增模型汇总

| 模型 | 用途 | 阶段 |
|------|------|------|
| `AuditLog` | 审计日志 | P0 |
| `Campaign` | 营销活动 | P1 |
| `CampaignReward` | 活动权益 | P1 |
| `CampaignTrack` | 活动追踪 | P1 |
| `UserTag` | 用户标签 | P1 |
| `TriggerRule` | 自动化规则 | P1 |
| `CouponEffectReport` | 券效果日报 | P1 |
| `UserStoreBalance` | 门店资金池 | P2 |
| `Permission` | 权限定义 | P2 |
| `Role` | 角色定义 | P2 |
| `RolePermission` | 角色权限关联 | P2 |
| `SystemConfig` | 系统配置 | P2 |
| `DataCheckResult` | 数据校验结果 | P0 |

### 5.2 接口变更汇总

| 接口 | 变更 | 阶段 |
|------|------|------|
| `POST /gift/points` | 增加风控校验 + AuditLog | P0/P2 |
| `POST /gift/coupon` | 增加风控校验 + AuditLog | P0/P2 |
| `POST /finance/fix-reconcile-diff` | 增加 AuditLog | P0 |
| `GET /finance/daily-report` | 返回 prepaid/confirmed 拆分 | P0 |
| `POST /campaigns` | 新增 | P1 |
| `GET /campaigns/:id/stats` | 新增 | P1 |
| `POST /users/batch-gift-points` | 新增 | P2 |
| `POST /orders/batch-verify` | 新增 | P2 |
| `GET /analytics/venue-occupancy` | 新增 | P3 |
| `PUT /system-config/:key` | 新增 | P2 |

### 5.3 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| 资金池隔离改动面大 | 高 | 如果当前是直营模式，可降级为 P2 或只做 LOOSE 模式 |
| 收入确认时点变更影响历史数据 | 中 | 旧字段保留至少 1 个季度，新旧并行运行 |
| RBAC 改动涉及所有接口 | 中 | 分阶段：先改核心接口，再逐步覆盖 |
| 自动化规则引擎复杂度 | 中 | MVP 只支持内置规则，自定义规则二期再做 |

---

*文档结束*
