# 顾客超时未到场（No-Show）处理方案

## 一、问题定义

当前系统存在以下问题：
- 顾客预约后超时未到场核销，订单状态永远停留在 `PAID`/`待核销`
- 排场资源被无效占用，其他顾客无法预约
- 财务上这笔钱计入了营收，但服务未实际交付，数据不透明
- 没有自动化的超时处理机制

---

## 二、核心设计原则

1. **票务与排场解耦**：订单权益（钱）和物理空间（排场）独立管理，但状态实时同步
2. **时间参数全部可配置**：所有阈值通过「预约设置」后台调整，无需改代码
3. **自动流转 + 人工干预**：系统按规则自动处理，同时保留店长/前台的 override 权限
4. **财务可追溯**：No-Show 收入单独科目，不影响正常营收统计

---

## 三、状态机设计

### 3.1 订单（Order）状态流转

```
PENDING（待支付）
  → 支付成功 → PAID（已付款）
    → 开场前15分钟 → READY_TO_VERIFY（待核销）
      → 顾客到场扫码/前台核销 → COMPLETED（已核销）
      → 开场时间到达 → PLAYING（游戏中）
        → 游戏结束 → COMPLETED（已核销）
      → 超过缓冲期未到场 → NO_SHOW（已作废/爽约）
        → 店长手动激活 → COMPLETED（已核销）
        → 店长转为候补 → STANDBY（候补票）
  → 顾客/管理员取消 → CANCELLED（已取消）
  → 管理员退款 → REFUNDED（已退款）
```

**新增状态说明：**

| 状态 | 颜色 | 含义 | 可见端 |
|------|------|------|--------|
| `READY_TO_VERIFY` | 蓝色 | 待核销（开场前15分钟可开始入场） | 后台+C端 |
| `PLAYING` | 绿色（闪烁） | 游戏中（场次已开始，顾客已入场） | 后台+排场 |
| `NO_SHOW` | 灰色 | 已作废/爽约（超时未到场） | 后台 |
| `STANDBY` | 橙色 | 候补票（由作废订单转来，现场 walk-in 可用） | 后台 |

### 3.2 预约（Booking）状态流转

```
CONFIRMED（已确认）
  → 开场前15分钟 → READY（待入场）
    → 顾客到场 → CHECKED_IN（已签到）
      → 游戏开始 → PLAYING（游戏中）
        → 游戏结束 → COMPLETED（已完成）
    → 超过缓冲期未到场 → NO_SHOW（爽约）
      → 排场立即释放为 IDLE（空闲）
      → 设备解绑
```

**新增状态说明：**

| 状态 | 含义 |
|------|------|
| `READY` | 待入场（开场前15分钟~开场时间） |
| `CHECKED_IN` | 已签到（顾客已到场，正在佩戴设备/教学） |
| `PLAYING` | 游戏中（VR体验进行中） |
| `NO_SHOW` | 爽约（超时未到场） |
| `IDLE` | 空闲（排场释放，可接受 walk-in） |

---

## 四、时间参数配置（全部在「预约设置」后台可调）

新增以下系统设置项：

| 设置Key | 默认值 | 说明 |
|---------|--------|------|
| `verify_advance_minutes` | 15 | 开场前多少分钟进入「待核销」状态 |
| `late_buffer_minutes` | 10 | 迟到宽限期（开场后多少分钟内仍可入场） |
| `no_show_deadline_minutes` | 15 | 最大缓冲期（超过后自动标记为爽约） |
| `playing_duration_minutes` | 40 | 单场游戏标准时长（用于排场倒计时和游戏中状态） |
| `no_show_penalty_rate` | 100 | 爽约违约金比例（%），默认100%即不退款 |
| `enable_auto_no_show` | true | 是否开启自动爽约标记 |
| `enable_standby_conversion` | true | 是否允许店长将作废订单转为候补票 |

> 所有时间参数支持动态调整，修改后立即生效（定时任务每次执行时读取最新配置）。

---

## 五、C端体验设计

### 5.1 购票页面提示（加粗展示）

在C端预约/支付页面的显著位置（订单确认页、支付页、订单详情页）展示：

```
⚠️ 重要提示
大空间 VR 为定时场次，请务必提前 15 分钟到场进行佩戴教学。
迟到将导致游戏时间缩短或无法入场，敬请合理安排时间。
```

样式要求：红色/橙色背景高亮，加粗，不可忽略。

### 5.2 开场前通知提醒

**通知时机（根据距离开场时间动态触发）：**

| 场景 | 触发时间 | 通知内容 |
|------|---------|---------|
| 标准提醒 | 开场前2小时 | 「您预约的 {场地} {开场时间} 场次即将开始，请提前15分钟到场准备。」 |
| 临近提醒 | 开场前15分钟 | 「您预约的场次即将开始，请尽快到场签到入场。」 |
| 紧急提醒（预约时距开场不足2小时） | 预约成功后立即发送 | 「您预约的场次距开场仅剩 {X} 分钟，请务必提前15分钟到达 {场地} 进行准备。」 |
| 开场后提醒（迟到中） | 开场时间到达 | 「您的场次已开始，请在 {late_buffer_minutes} 分钟内到场，超时将无法入场。」 |

**通知渠道**：微信订阅消息（优先）+ 短信（备选）

### 5.3 订单详情页状态展示

```
┌─────────────────────────────────┐
│ 待核销      [倒计时: 00:08:32]   │  ← 开场前15分钟~开场时间
├─────────────────────────────────┤
│ 开场时间: 2026-06-04 20:00      │
│ 最迟入场: 2026-06-04 20:10      │  ← 开场+late_buffer_minutes
│ 核销码: [二维码]                │
│ 提示: 请提前15分钟到场          │
└─────────────────────────────────┘
```

---

## 六、后台订单管理设计

### 6.1 状态标签页调整

当前标签：`全部` `未付款` `已付款` `已核销` `退款中` `已退款` `已取消`

调整为：

```
全部(52)  未付款(8)  已付款(12)  待核销(5)  游戏中(3)  已核销(31)  已作废(2)  退款中(1)  已退款(11)  已取消(10)
```

**状态映射规则：**

| 标签 | 包含的订单状态 |
|------|---------------|
| 未付款 | `PENDING` |
| 已付款 | `PAID`（开场前，还未进入待核销阶段） |
| 待核销 | `READY_TO_VERIFY` |
| 游戏中 | `PLAYING` |
| 已核销 | `COMPLETED`（正常核销完成） |
| 已作废 | `NO_SHOW` |
| 退款中 | `REFUNDING` |
| 已退款 | `REFUNDED` |
| 已取消 | `CANCELLED` |

### 6.2 订单列表状态列显示

| 状态 | Badge颜色 | 显示文字 |
|------|----------|---------|
| PENDING | 黄色 | 未付款 |
| PAID | 蓝色 | 已付款 |
| READY_TO_VERIFY | 蓝色（闪烁） | 待核销 |
| PLAYING | 绿色（闪烁） | 游戏中 |
| COMPLETED | 绿色 | 已核销 |
| NO_SHOW | 灰色 | 已作废 |
| REFUNDING | 橙色 | 退款中 |
| REFUNDED | 灰色 | 已退款 |
| CANCELLED | 红色 | 已取消 |

### 6.3 订单详情页操作按钮

**不同状态下的可操作按钮：**

| 当前状态 | 可执行操作 |
|---------|-----------|
| PENDING | 取消订单、确认收款（线下） |
| PAID | 申请退款、核销订单 |
| READY_TO_VERIFY | 核销订单、申请退款、手动标记作废 |
| PLAYING | （无操作，等待游戏结束） |
| COMPLETED | 申请退款（限当天） |
| NO_SHOW | 手动激活（转为已核销）、转为候补票、申请退款 |
| REFUNDING | 确认退款完成 |
| REFUNDED | （无操作） |
| CANCELLED | （无操作） |

---

## 七、排场系统（Reservation）设计

### 7.1 排场日历状态显示

**网格/甘特图颜色规则：**

| 状态 | 颜色 | 说明 |
|------|------|------|
| IDLE（空闲） | 白色/浅灰 | 可预约 |
| RESERVED（已预约） | 蓝色 | 有顾客预约，未开场 |
| READY（待入场） | 蓝色（深） | 开场前15分钟内 |
| CHECKED_IN（已签到） | 绿色 | 顾客已到场 |
| PLAYING（游戏中） | 绿色（闪烁） | VR体验进行中 |
| NO_SHOW（爽约） | 灰色（虚线边框） | 顾客未到场，排场已释放 |
| BLOCKED（维护/包场） | 红色 | 不对外 |

### 7.2 占位释放逻辑

```
当订单状态变为 NO_SHOW 时：
  1. Booking.status = 'NO_SHOW'
  2. Booking 对应的排场时段立即变为 IDLE（空闲）
  3. 设备绑定解除（如果有预分配设备记录）
  4. 排场日历刷新，该时段可接受新预约或 walk-in
```

### 7.3 拼场 vs 包场显示差异

**拼场（散客模式）：**
- 4人局到了2人，另外2人超时
- 排场系统：游戏正常启动（因为有人到场）
- 超时者订单：标记为 `NO_SHOW`
- 到场者订单：正常流转为 `PLAYING` → `COMPLETED`
- 排场时间块：显示「游戏中(2/4)」，缺席位置标记为灰色

**包场（团队模式）：**
- 整个团队迟到
- 排场系统：时间块按原定计划开始倒计时
- UI上显示进度条：「剩余可用游戏时间: 35分钟/40分钟」
- 如果团队在缓冲期内到达 → 正常开始，游戏时间缩短
- 如果团队超过缓冲期 → 整个包场标记为 `NO_SHOW`，排场释放

---

## 八、财务与对账设计

### 8.1 新增财务科目

| 科目代码 | 科目名称 | 说明 |
|---------|---------|------|
| `6101` | 营业收入-散客票款 | 正常核销的订单收入 |
| `6102` | 营业收入-会员本金 | 会员余额支付的订单 |
| `6301` | 营业外收入-违约金/沉淀资金 | No-Show 订单收入（服务未交付） |
| `6302` | 营业外收入-改签手续费 | 改签收取的手续费（如后期开通） |

### 8.2 No-Show 资金流转

```
顾客支付 → 订单 PAID
  → 正常核销 → COMPLETED → 计入「营业收入-散客票款/会员本金」
  → 超时未到场 → NO_SHOW
    → 系统自动：
      1. 从「营业收入」科目中冲减该笔金额
      2. 记入「营业外收入-违约金/沉淀资金」
      3. 生成财务流水：
         - 借：营业收入-散客票款  -¥X
         - 贷：营业外收入-违约金/沉淀资金  +¥X
    → 店长手动作废时同上
    → 店长手动激活（转为核销）时反向冲回：
      - 借：营业外收入-违约金/沉淀资金  -¥X
      - 贷：营业收入-散客票款  +¥X
```

### 8.3 对账设计

**对账维度拆分：**

| 对账项目 | 包含内容 | 核对方式 |
|---------|---------|---------|
| 实际核销营收 | `COMPLETED` 订单金额 | 与「到场人次 × 单价」核对 |
| 预收账款 | `PAID` + `READY_TO_VERIFY` + `PLAYING` | 待核销的资金池 |
| 营业外收入-违约金 | `NO_SHOW` 订单金额 | 与系统作废记录核对 |
| 退款金额 | `REFUNDED` 订单 refundAmount | 与支付渠道退款流水核对 |

**每日对账报表新增字段：**

```
日期: 2026-06-04
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
实际核销营收:        ¥3,200.00  （顾客实际到场体验）
预收账款（待核销）:   ¥1,500.00  （已付款但未开场/未核销）
营业外收入-违约金:    ¥  400.00  （No-Show 爽约沉淀）
退款金额:            ¥  200.00  （当日退款）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
当日资金流入合计:     ¥3,900.00  （= 实际核销 + 违约金）
当日应收调整:        ¥1,500.00  （预收账款变动）
```

### 8.4 No-Show 率统计

新增运营指标：
- **No-Show 率** = No-Show 订单数 / 总预约订单数 × 100%
- **No-Show 损失金额** = No-Show 订单总金额
- **候补转化率** = 转为候补票后实际核销数 / 候补票总数

---

## 九、定时任务设计

### 9.1 `bookingLifecycleJob`（预订生命周期定时任务）

**执行频率**：每分钟

```
每分钟执行：
  
  // 1. 开场前 X 分钟：将 PAID 订单变为 READY_TO_VERIFY
  for (booking.startTime - verify_advance_minutes <= now) {
    order.status = 'READY_TO_VERIFY'
    booking.status = 'READY'
    发送"待核销"通知给顾客
  }
  
  // 2. 开场时间到达：将到场订单变为 PLAYING
  for (booking.startTime <= now && booking.status == 'CHECKED_IN') {
    order.status = 'PLAYING'
    booking.status = 'PLAYING'
  }
  
  // 3. 开场后 X 分钟：自动标记 No-Show
  for (booking.startTime + no_show_deadline_minutes <= now 
       && booking.status IN ['CONFIRMED', 'READY']
       && order.status IN ['PAID', 'READY_TO_VERIFY']) {
    
    order.status = 'NO_SHOW'
    booking.status = 'NO_SHOW'
    
    // 财务处理
    createBalanceTransaction({
      type: 'NO_SHOW_PENALTY',
      amount: order.amount,
      orderId: order.id,
      remark: '顾客超时未到场，自动标记爽约'
    })
    
    // 释放排场
    releaseBookingSlot(booking)
    
    // 发送通知
    pushNotification(userId, 'NO_SHOW', '场次已过期', '您预约的场次已超时，订单已自动作废。')
  }
  
  // 4. 游戏结束：将 PLAYING 变为 COMPLETED
  for (booking.startTime + playing_duration_minutes <= now 
       && booking.status == 'PLAYING') {
    order.status = 'COMPLETED'
    booking.status = 'COMPLETED'
  }
```

### 9.2 通知定时任务

**开场前2小时提醒**：
```
每小时执行一次：
  for (booking.startTime - 2hours <= now + 1hour 
       && booking.startTime - 2hours > now) {
    发送"开场前2小时提醒"
  }
```

**开场前15分钟提醒**：
```
每分钟执行：
  for (booking.startTime - 15minutes <= now 
       && booking.status == 'READY') {
    发送"开场前15分钟提醒"
  }
```

---

## 十、数据模型变更

### 10.1 Order 模型新增字段

```prisma
model Order {
  // ... 现有字段 ...
  
  noShowAt          DateTime?    // 标记爽约时间
  noShowReason      String?      // 爽约原因（系统auto / 店长manual）
  penaltyAmount     Int?         // 违约金金额（= amount * no_show_penalty_rate / 100）
  standbyConverted  Boolean      @default(false)  // 是否已转为候补票
  
  // 核销时间戳
  verifiedAt        DateTime?    // 实际核销时间
  playingStartedAt  DateTime?    // 游戏开始时间
  playingEndedAt    DateTime?    // 游戏结束时间
}
```

### 10.2 Booking 模型新增字段

```prisma
model Booking {
  // ... 现有字段 ...
  
  checkedInAt       DateTime?    // 实际签到时间
  playingStartedAt  DateTime?    // 游戏开始时间
  playingEndedAt    DateTime?    // 游戏结束时间
  noShowAt          DateTime?    // 爽约时间
  
  // 排场类型标记
  bookingMode       BookingMode  @default(SINGLE)  // SINGLE(散客) / TEAM(包场)
}

enum BookingMode {
  SINGLE
  TEAM
}
```

### 10.3 BalanceTransaction 新增类型

```prisma
enum TransactionType {
  // ... 现有类型 ...
  NO_SHOW_PENALTY      // 爽约违约金（营业收入→营业外收入）
  NO_SHOW_REVERSE      // 爽约冲回（店长手动激活时）
  STANDBY_SALE         // 候补票销售
}
```

---

## 十一、API 接口清单

### 11.1 新增接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/orders/:id/mark-no-show` | 店长手动标记爽约 |
| POST | `/orders/:id/activate` | 店长手动激活（作废→已核销） |
| POST | `/orders/:id/convert-standby` | 转为候补票 |
| POST | `/bookings/:id/check-in` | 顾客到场签到（扫码/前台） |
| GET | `/bookings/:id/status` | 获取预约实时状态（含倒计时） |
| GET | `/settings/booking-lifecycle` | 获取生命周期配置（C端用） |

### 11.2 修改接口

| 方法 | 路径 | 修改内容 |
|------|------|---------|
| GET | `/orders` | 列表支持按新状态筛选 |
| GET | `/orders/:id` | 详情返回核销倒计时、最迟入场时间 |
| PUT | `/orders/:id/status` | 支持 PLAYING、NO_SHOW 状态流转 |

---

## 十二、实施优先级

### Phase 1（核心功能，1-2天）
- [ ] 数据模型变更（Prisma schema + migration）
- [ ] 预约设置后台新增时间参数配置
- [ ] `bookingLifecycleJob` 定时任务（自动状态流转）
- [ ] 订单状态标签页调整（后台）
- [ ] C端购票页面加粗提示

### Phase 2（财务闭环，1天）
- [ ] `NO_SHOW_PENALTY` 财务流水自动记账
- [ ] 对账报表新增「营业外收入-违约金」字段
- [ ] No-Show 率运营指标

### Phase 3（体验优化，1天）
- [ ] 开场前通知提醒（2小时/15分钟）
- [ ] 排场日历状态颜色区分
- [ ] 拼场/包场显示差异
- [ ] 候补票功能

### Phase 4（高级功能，可选）
- [ ] 开场前改签功能
- [ ] 会员免手续费改签权益
- [ ] 播控设备预分配与解绑

---

## 十三、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 定时任务误标记 | 高 | 缓冲期留够（默认15分钟），支持店长手动激活 |
| 财务数据不一致 | 高 | No-Show 流水必须有明确的 type 标记，便于审计追溯 |
| C端投诉 | 中 | 购票页面强制提示，通知多次提醒，保留申诉通道 |
| 排场释放延迟 | 中 | 定时任务每分钟执行，释放逻辑在事务中完成 |

---

**请确认方案后，我将按 Phase 1 → Phase 2 → Phase 3 的顺序逐步实施。**
