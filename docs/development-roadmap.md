# VR Space 系统开发路线图

> 基于运营专家、财务总监、产品经理三视角评审的输出
> 版本：v1.0 | 日期：2026-06-01

---

## 一、评审结论

当前系统已完成**核心业务流程闭环**（预约 → 支付 → 核销 → 退款），会员体系和财务对账基础扎实。但在**营销效果追踪、资金安全审计、权限精细化、配置化**四个方向存在明显短板，建议分三阶段迭代。

---

## 二、需求总览

| 模块 | 数量 | 涉及角色 |
|------|------|---------|
| 运营增长 | 5 项 | 运营专家 |
| 财务合规 | 5 项 | 财务总监 |
| 产品体验 | 6 项 | 产品经理 |

---

## 三、第一阶段（P0）—— 财务合规与资金安全

**目标**：消除合规风险，确保财务报表可审计

### 3.1 审计日志系统

**背景**：当前 `fixReconcileDiff()`、赠送积分、调整余额等操作只有业务流水，没有操作留痕。谁改的、改前多少、改后多少、为什么改，全部查不到。

**需求**：
- 新增 `AuditLog` 模型：
  ```prisma
  model AuditLog {
    id          String   @id @default(uuid())
    operatorId  String          // 操作人ID
    operatorName String         // 操作人姓名（冗余，防用户删除后无法追溯）
    targetType  String          // 操作对象类型：USER / ORDER / BALANCE / COUPON
    targetId    String          // 操作对象ID
    action      String          // 动作：ADJUST_BALANCE / FIX_RECON / GIFT_POINTS / GIFT_COUPON / REFUND / CANCEL_ORDER
    beforeValue Json?           // 变更前快照 { principalBalance: 10000, bonusBalance: 5000 }
    afterValue  Json?           // 变更后快照
    diffValue   Json?           // 变更差异 { principalAmount: -1000 }
    reason      String          // 操作原因（必填）
    ipAddress   String?         // 操作IP
    createdAt   DateTime @default(now())
  }
  ```
- 所有涉及资金变动的接口自动写入 AuditLog：
  - `POST /gift/points`
  - `POST /gift/coupon`
  - `POST /finance/fix-reconcile-diff`
  - `POST /orders/:id/refund`
  - `POST /orders/:id/cancel`
  - 任何修改 `User.principalBalance / bonusBalance / points` 的操作

**前端**：
- 用户详情页新增「操作日志」Tab
- 财务页面新增「审计日志」入口，支持按操作人/时间/动作筛选

**验收标准**：
- [ ] 赠送 100 积分后，AuditLog 能查到操作人、用户变更前积分、变更后积分、赠送原因
- [ ] 修复对账差异后，AuditLog 能查到调整前后的余额快照
- [ ] 日志不可删除、不可修改（只读）

---

### 3.2 收入确认时点修正

**背景**：当前 `directRevenue` 在订单 `PAID` 时即确认收入。但用户可能买了体验券过几天才用，甚至一直不用。按会计准则，**服务未完成前不应确认收入**。

**需求**：
- 订单状态流转：
  ```
  PENDING → PAID（预收账款）→ COMPLETED（确认收入）
  ```
- `DailyFinancialReport` 拆分：
  - `prepaidRevenue`：已付款但未核销的金额（预收）
  - `confirmedRevenue`：已核销的金额（真正营收）
  - 保留 `totalRecognizedRevenue = prepaidRevenue + confirmedRevenue` 用于总览，但财务对账时区分列示

**数据库**：
- `DailyFinancialReport` 新增字段：
  ```prisma
  prepaidRevenue    Int @default(0)  // 预收账款（已付款未核销）
  confirmedRevenue  Int @default(0)  // 已确认收入（已核销）
  ```

**前端**：
- 确权营收表拆分为「预收账款」和「已确认收入」两行
- 新增「预收转化率」指标 = 已核销 / 已付款

**验收标准**：
- [ ] 今天有 5 个订单付款（总额 ¥500），0 个核销 → `prepaidRevenue=500, confirmedRevenue=0`
- [ ] 明天这 5 个订单核销 → `prepaidRevenue=0, confirmedRevenue=500`（日期维度）

---

### 3.3 对账异常自动告警

**背景**：对账差异当前需要人工点开查看，财务不可能每天手动检查。

**需求**：
- `reconciliationJob`（每日 02:00 执行）执行后，自动检查 `items` 中 `diff !== 0` 的项
- 触发条件（满足任一）：
  - 任一维度差异绝对值 > ¥100
  - 任一维度差异绝对值 > 该维度 expected 的 1%
  - 余额维度（本金/赠送/积分）diff ≠ 0
- 告警方式：
  - 推通知给 `role === 'FINANCE' | 'SUPER_ADMIN'` 的用户
  - 记录到 `Notification` 表，前端通知中心可见

**配置化**：
- `ReconConfig` 表（或系统配置表）存储告警阈值，后台可调整：
  ```prisma
  model SystemConfig {
    key    String @id
    value  String
    desc   String?
  }
  // recon_alert_amount_threshold = 10000 (分)
  // recon_alert_percent_threshold = 100 (表示1%，存储为万分比)
  ```

**验收标准**：
- [ ] 模拟对账差异 ¥150，次日 02:00 后财务收到告警通知
- [ ] 差异 ¥50（低于阈值），不产生告警

---

## 四、第二阶段（P1）—— 运营增长与权限治理

**目标**：提升用户留存和转化，完善数据安全

### 4.1 用户分层与自动化运营

**背景**：当前只有「沉睡本金」统计，没有用户生命周期管理。

**需求**：

#### 4.1.1 自动标签体系

```prisma
model UserTag {
  id     String @id @default(uuid())
  userId String
  tag    String // NEW_CUSTOMER / ACTIVE / DORMANT / CHURN_RISK / VIP
  scoredAt DateTime @default(now())
}
```

标签规则（每日 00:10 跑批）：

| 标签 | 规则 |
|------|------|
| `NEW_CUSTOMER` | 注册 ≤ 7 天且未消费 |
| `ACTIVE` | 30 天内有消费 |
| `DORMANT` | 30~90 天无消费 |
| `CHURN_RISK` | ≥ 90 天无消费 |
| `VIP` | 累计消费 ≥ ¥5000 或 30 天内消费 ≥ 3 次 |

#### 4.1.2 触发器规则引擎

```prisma
model TriggerRule {
  id          String @id @default(uuid())
  name        String
  event       String   // USER_REGISTERED / FIRST_ORDER / DORMANT_DETECTED / BIRTHDAY
  conditions  Json?    // { dormantDays: 90 }
  actions     Json     // [{ type: 'SEND_COUPON', couponTemplateId: 'xxx' }, { type: 'PUSH_NOTIFICATION' }]
  enabled     Boolean  @default(true)
}
```

内置规则示例：
- **新客首单礼**：`USER_REGISTERED` → 72 小时内未下单 → 自动推送「首单 8 折券」
- **沉睡唤醒**：`DORMANT_DETECTED`（90天）→ 自动赠送「满 200 减 50 券」
- **生日祝福**：`BIRTHDAY` → 当天自动赠送 200 积分 + 生日礼券

**验收标准**：
- [ ] 新注册用户 72 小时未消费，自动收到首单券推送
- [ ] 沉睡 90 天用户，自动收到唤醒券
- [ ] 规则可在后台「营销自动化」页面开启/关闭/编辑

---

### 4.2 优惠券效果追踪

**背景**：送了券不知道效果，无法评估 ROI。

**需求**：
- 在 `DailyFinancialReport` 或独立报表中增加券效果指标：
  - **核销率** = 核销数 / 发放数
  - **带动消费** = 用券订单的平均实付金额 vs 不用券订单的平均实付金额
  - **券后复购率** = 用券用户在 30 天内再次消费的比例

**数据库**：
```prisma
model DailyCouponReport {
  id                String @id @default(uuid())
  date              String @unique
  couponType        String // DISCOUNT / EXPERIENCE_FREE
  source            String // MANUAL_GIFT / EXCHANGE / RECHARGE_BONUS
  giftedCount       Int @default(0)
  usedCount         Int @default(0)
  expiredCount      Int @default(0)
  avgOrderAmount    Int @default(0) // 用券订单平均金额（分）
  totalOrderAmount  Int @default(0) // 用券订单总金额（分）
}
```

**前端**：
- 新增「营销效果报表」页面
- 券维度 ROI 可视化

**验收标准**：
- [ ] 查看某张体验券：发放 100 张，核销 30 张 → 核销率 30%
- [ ] 用券订单平均 ¥280，不用券平均 ¥200 → 带动消费 +40%

---

### 4.3 RBAC 权限细化

**背景**：当前角色是硬编码的，「运营」和「财务」的权限边界不清晰。

**需求**：
- 新增权限配置表：
  ```prisma
  model Permission {
    id     String @id @default(uuid())
    code   String @unique // order:read / order:refund / finance:read / finance:adjust / user:gift
    name   String
    module String // orders / finance / users / venues / marketing
  }

  model RolePermission {
    roleId       String
    permissionId String
    @@id([roleId, permissionId])
  }
  ```
- 内置权限清单：

| 权限码 | 说明 |
|--------|------|
| `order:read` | 查看订单 |
| `order:refund` | 执行退款 |
| `order:verify` | 核销订单 |
| `finance:read` | 查看财务数据 |
| `finance:adjust` | 调整余额/修复差异 |
| `user:read` | 查看用户 |
| `user:gift` | 赠送积分/券 |
| `venue:manage` | 管理所分配场地 |
| `marketing:rule` | 配置营销规则 |

- 后端中间件：每个接口声明所需权限，自动校验

**前端**：
- 设置页面新增「角色权限管理」：勾选各角色拥有的权限
- 前端路由/按钮根据权限动态渲染（无权限则隐藏）

**验收标准**：
- [ ] 创建「店长助理」角色，只给 `order:read` + `order:verify`，该角色无法退款
- [ ] 「财务」角色没有 `user:gift`，用户列表不显示「赠送」按钮

---

## 五、第三阶段（P2）—— 效率提升与配置化

**目标**：降低运维成本，提升人效

### 5.1 系统配置化

**背景**：会员等级阈值、积分规则、折扣率等全部硬编码在 `memberConfig.ts` 里，改规则需要发版。

**需求**：
- 新增 `SystemConfig` 表（见 3.3）
- 后台「系统配置」页面，支持修改：

| 配置项 | 当前值 | 说明 |
|--------|--------|------|
| `member_level_thresholds` | `[0,10000,50000,100000]` | 等级阈值（分） |
| `member_discount_rates` | `[100,95,90,85]` | 等级折扣率（%） |
| `points_earn_ratio` | `100` | 消费 1 元得 100 积分 |
| `points_deduct_ratio` | `100` | 100 积分抵 1 元 |
| `dormant_days` | `90` | 沉睡天数 |
| `booking_cancel_hours` | `2` | 预约取消时限（小时） |

- 启动时加载配置到内存，变更后热更新（或重启后生效）

**验收标准**：
- [ ] 后台修改「等级 2 阈值」从 ¥500 改为 ¥300，无需发版，新用户立即生效

---

### 5.2 批量操作

**背景**：运营每天处理大量订单，逐条操作效率低。

**需求**：
- 订单列表支持多选（checkbox），批量操作：
  - 批量核销
  - 批量退款
  - 批量导出
- 用户列表支持批量操作：
  - 批量发券
  - 批量赠送积分

**前端**：
- 表格行首增加 checkbox
- 顶部工具栏显示「已选 X 项」+ 批量操作按钮
- 批量操作前二次确认（弹窗列出影响的数据量）

**验收标准**：
- [ ] 勾选 5 个「已付款」订单，一键核销
- [ ] 勾选 10 个用户，一键赠送 100 积分

---

### 5.3 场地利用率热力图

**背景**：排场靠经验，没有数据支撑。

**需求**：
- 新增「场地运营」页面
- 热力图维度：
  - X 轴：日期（近 7/30 天）
  - Y 轴：时段（10:00-22:00，每小时一格）
  - 色值：上座率（0% 白色 → 100% 深绿色）
- 指标卡片：
  - 日均上座率
  - 黄金时段占比（周末 14:00-20:00）
  - 闲时占比（工作日 10:00-14:00）

**数据源**：
```sql
SELECT DATE(booking_time) as date, EXTRACT(HOUR FROM booking_time) as hour,
       COUNT(*) as bookings, venue_capacity,
       COUNT(*) / venue_capacity as occupancy_rate
FROM Booking
GROUP BY DATE(booking_time), EXTRACT(HOUR FROM booking_time), venue_id
```

**验收标准**：
- [ ] 深圳店周末 15:00 时段显示深绿色（上座率 90%+）
- [ ] 深圳店工作日 10:00 时段显示白色（上座率 < 20%）

---

### 5.4 发票管理

**背景**：企业客户/个人用户需要开票，系统没有入口。

**需求**：
```prisma
model InvoiceRequest {
  id            String @id @default(uuid())
  orderId       String
  userId        String
  type          String // PERSONAL / COMPANY
  title         String // 发票抬头
  taxNumber     String? // 税号
  amount        Int // 开票金额（分）
  status        String // PENDING / ISSUED / REJECTED
  invoiceNo     String? // 发票号码
  issuedAt      DateTime?
  createdAt     DateTime @default(now())
}
```

**流程**：
1. 用户在 C 端「我的订单」申请开票
2. Admin 后台「发票管理」列表审核
3. 财务开具后回填发票号，状态变为 `ISSUED`
4. 用户收到通知，可在 C 端查看/下载

**验收标准**：
- [ ] 用户提交开票申请，财务后台收到待处理通知
- [ ] 财务开具后，用户可在订单详情查看发票号

---

## 六、技术债务清理

### 6.1 彻底废弃 `user.balance`
- 所有代码中删除对 `user.balance` 的读取和写入
- Prisma schema 中标记 `@deprecated` 或直接 `DROP COLUMN`（需确认无历史依赖）

### 6.2 数据一致性校验任务
- 每日 03:00 定时任务：
  - 校验所有用户的 `principalBalance + bonusBalance` 是否等于流水累计
  - 校验 `User.points` 是否等于积分流水累计
  - 异常写入 `ReconException` 表，推通知给管理员

### 6.3 风控规则
- 单日赠送积分上限（如 10000 分/人/天）
- 单日赠送券上限（如 10 张/人/天）
- 异常操作监控：同一人 1 分钟内赠送 > 5 次 → 触发风控告警

---

## 七、排期建议

| 阶段 | 周期 | 主要交付 |
|------|------|---------|
| **第一阶段** | 2 周 | 审计日志、收入确认修正、对账告警 |
| **第二阶段** | 3 周 | 用户分层、券效果追踪、RBAC |
| **第三阶段** | 2 周 | 配置化、批量操作、热力图、发票 |
| **技术债务** | 1 周 | balance 清理、一致性校验、风控 |

**合计：8 周（2 个月）**

---

## 八、附录

### 8.1 当前系统功能清单（基线）

| 模块 | 功能点 | 状态 |
|------|--------|------|
| 预约 | 场地选择、时段选择、游戏选择 | ✅ |
| 预约 | Admin 代客预约 | ✅ |
| 订单 | 创建、支付、核销、退款、取消 | ✅ |
| 订单 | 线上(C端) / 线下(Admin) 来源区分 | ✅ |
| 会员 | 注册、等级、折扣 | ✅ |
| 会员 | 余额（本金+赠送） | ✅ |
| 会员 | 积分（消费获得、兑换商品、赠送） | ✅ |
| 营销 | 优惠券（折扣券、体验券） | ✅ |
| 营销 | 积分商城 | ✅ |
| 营销 | 管理员赠送（积分/券） | ✅ |
| 财务 | 每日报表（现金解缴、确权营收、负债） | ✅ |
| 财务 | 对账中心（余额/充值/消费/退款/积分/券） | ✅ |
| 财务 | 对账异常修复 | ✅ |
| 通知 | 站内消息、场景开关 | ✅ |
| 场地 | 多门店、店长权限 | ✅ |

### 8.2 缺失功能清单（本路线图中覆盖）

- [ ] 审计日志
- [ ] 收入确认时点拆分（预收 vs 营收）
- [ ] 对账异常自动告警
- [ ] 用户分层标签
- [ ] 营销自动化（触发器规则）
- [ ] 优惠券效果追踪（ROI）
- [ ] RBAC 权限细化
- [ ] 系统配置后台化
- [ ] 批量操作
- [ ] 场地利用率热力图
- [ ] 发票管理
- [ ] `user.balance` 彻底清理
- [ ] 数据一致性校验
- [ ] 风控规则
