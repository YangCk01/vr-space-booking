# 财务自动化对账系统与风控模块设计文档

> **文档版本：** v1.0  
> **适用系统：** VR Space 大空间娱乐直营门店管理系统  
> **编写日期：** 2026-05-29  
> **核心目标：** 实现"系统账（数据库）— 渠道账（支付网关）— 物理账（硬件头显日志）"的三方十字交叉核对，确保资金安全并阻断线下门店跑漏单。

---

## 一、 当前系统现状分析

### 1.1 已具备的数据基础

当前数据库（`prisma/schema.prisma`）已具备以下核心资金相关表，可直接作为**业务系统账**的数据源：

| 表名 | 对账用途 | 关键字段 |
|------|---------|---------|
| `Order` | 业务订单主账 | `orderNo`, `amount`, `status`, `payMethod`, `paidAt`, `principalDeduction`, `bonusDeduction`, `pointsUsed`, `refundAmount` |
| `Payment` | 支付流水明细 | `orderId`, `amount`, `method`, `transactionId`, `status`, `createdAt` |
| `RechargeRecord` | 会员充值流水 | `amount`, `bonus`, `status`, `payMethod`, `paidAt` |
| `BalanceTransaction` | 余额/积分变动流水 | `type`, `principalAmount`, `bonusAmount`, `pointsAmount`, `orderId`, `createdAt` |
| `DailyFinancialReport` | 每日跑批汇总 | `rechargePrincipalIn`, `directPayIn`, `refundOut`, `netCashFlow`, `directRevenue` 等 |
| `Booking` | 预约/排场记录 | `venueId`, `gameId`, `status`, `personCount`, `date`, `startTime`, `endTime` |
| `Venue` | 门店基础信息 | `deviceCount`, `name` |

### 1.2 当前对账能力缺口

| 缺失维度 | 现状 | 风险等级 |
|----------|------|---------|
| **支付渠道账** | 系统仅记录了 `Payment` 表，但未与微信/支付宝的真实结算账单做交叉核对 | 🔴 高 |
| **银行资金账** | 无银行流水接入，无法确认"平台显示的营收最终是否到账" | 🔴 高 |
| **对账引擎** | 现有 `/finance/reconcile` 仅做数据库内部恒等式校验，未涉及外部渠道 | 🟡 中 |
| **差错池** | 无异常流水归档与工单化处理机制 | 🔴 高 |
| **硬件设备账** | PICO 头显运行日志未接入，无法识别"私收现金放客" | 🟡 中 |
| **手续费核算** | 现有 `Payment` 表未记录渠道手续费，导致净现金流计算失真 | 🟡 中 |

### 1.3 已修复的数据层问题

在编写本文档前，系统已修复以下影响对账准确性的历史 bug：

1. **积分收回流水缺失：** 订单取消/退款时扣除用户已赠送积分，未创建 `BalanceTransaction` 流水，导致积分总账差异。已补录 4 笔缺失流水（合计 561 分），并在代码中增加 `POINTS_REVOKE` 类型流水记录。
2. **消费对账口径偏差：** 按日对账中 `CANCELLED` 订单被排除在 actual 之外，但 `DEDUCT` 流水仍计入 expected。已将 `CANCELLED` 纳入消费对账的 actual 范围，积分抵扣 expected 已限定为 `pointsAmount < 0`。

---

## 二、 三方对账架构总览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         财务自动化对账系统 (Reconciliation Hub)               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  业务系统账   │  │  支付渠道账   │  │  银行资金账   │  │  物理硬件账      │  │
│  │  (数据库)     │  │  (微信/支付宝)│  │  (银行流水)   │  │  (头显日志)      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘  │
│         │                 │                 │                   │           │
│         └─────────────────┴─────────────────┴───────────────────┘           │
│                                   │                                         │
│                    ┌──────────────▼──────────────┐                          │
│                    │      数据清洗 & 标准化       │                          │
│                    │   (ETL / 字段映射 / 去重)    │                          │
│                    └──────────────┬──────────────┘                          │
│                                   │                                         │
│                    ┌──────────────▼──────────────┐                          │
│                    │       对账引擎 (Matching)    │                          │
│                    │   十字交叉核对 / 哈希匹配    │                          │
│                    └──────────────┬──────────────┘                          │
│                                   │                                         │
│              ┌────────────────────┼────────────────────┐                    │
│              │                    │                    │                    │
│    ┌─────────▼────────┐  ┌───────▼────────┐  ┌──────▼───────┐             │
│    │   匹配成功池      │  │   异常差错池    │  │   差异报告    │             │
│    │   (Auto Pass)    │  │ (Exception Hub) │  │  (Daily Report)│             │
│    └──────────────────┘  └───────┬────────┘  └──────────────┘             │
│                                  │                                          │
│                    ┌─────────────▼─────────────┐                           │
│                    │    财务后台工单处理 UI      │                           │
│                    │  长款补单 / 短款冻结 / 平账 │                           │
│                    └───────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 三、 核心数据源接入规范 (Data Ingestion)

### 3.1 业务系统账（本地数据库）

**提取范围：** T-1 日 00:00:00 至 23:59:59 内所有产生现金流动的记录。

**提取规则：**
- **必须包含：** 微信/支付宝直付订单（`Order.payMethod IN ['WECHAT', 'ALIPAY']`）、会员充值（`RechargeRecord.status = 'PAID'`）、退款（`Order.status = 'REFUNDED'`）。
- **必须剔除：** 赠送钱包（`bonusBalance`）的虚拟额度变动、积分抵扣（`pointsDeduction`）的非现金部分。只提取 `principalBalance` 的现金变动及直连支付的现金额度。
- **金额口径：** 使用 `Order.amount`（应收现金金额 = 折扣后 - 积分抵扣），而非 `Order.originalAmount`（散客原价）。

**SQL 示例（供后续开发参考）：**
```sql
-- T-1 日业务现金流水
SELECT 
  'ORDER' as bizType,
  o.orderNo as bizOrderNo,
  o.amount as cashAmount,        -- 纯现金应收
  o.payMethod as payChannel,
  o.paidAt as transTime,
  o.status as bizStatus,
  o.venueName as venue
FROM "Order" o
WHERE o.paidAt >= '2026-05-28T00:00:00+08:00'
  AND o.paidAt <  '2026-05-29T00:00:00+08:00'
  AND o.status IN ('PAID', 'COMPLETED', 'REFUNDED')
  AND o.payMethod IN ('WECHAT', 'ALIPAY')

UNION ALL

SELECT 
  'RECHARGE' as bizType,
  r.id::text as bizOrderNo,
  r.amount as cashAmount,        -- 充值本金（纯现金）
  r.payMethod as payChannel,
  r.paidAt as transTime,
  'PAID' as bizStatus,
  '全平台' as venue
FROM "RechargeRecord" r
WHERE r.paidAt >= '2026-05-28T00:00:00+08:00'
  AND r.paidAt <  '2026-05-29T00:00:00+08:00'
  AND r.status = 'PAID';
```

### 3.2 支付渠道账（第三方 API）

**拉取机制：** 每日凌晨 **02:00**（避开营业高峰），Cron Job 自动调用微信/支付宝/聚合支付的账单下载接口，拉取 T-1 日全量账单。

**数据清洗要求：**

| 原始字段（微信示例） | 标准化后字段 | 说明 |
|---------------------|-------------|------|
| 微信支付单号 | `channelTransactionId` | 渠道流水号 |
| 商户订单号 | `merchantOrderNo` | 对应系统 `orderNo` 或 `rechargeId` |
| 用户标识 | `payerOpenId` | 用于反查用户 |
| 交易类型 | `channelTransType` | `PAY` / `REFUND` |
| 交易状态 | `channelStatus` | `SUCCESS` / `REFUND` / `CLOSED` |
| 付款金额（元） | `buyerPaidAmount` | 买家实付总额（分转元后） |
| 退款金额（元） | `refundAmount` | 如有退款 |
| 费率 | `feeRate` | 如 0.006（千分之六） |
| 手续费（元） | `channelFee` | = 实付金额 × 费率 |
| 结算金额（元） | `settlementAmount` | = 实付金额 - 手续费 |
| 交易完成时间 | `channelPaidAt` | 时间戳 |

**关键注意：** 必须将手续费从实付金额中拆出。系统现有 `Payment.amount` 记录的是买家实付总额，**不含手续费扣除**。真正的净现金流 = `实付总额 - 渠道手续费`。

### 3.3 银行资金账（最终真金白银）

**接入方式：** 对公账户开通银企直联（或通过银行提供的 SFTP/API）自动获取入账流水。

**核心字段：**

| 字段 | 说明 |
|------|------|
| `bankSerialNo` | 银行交易流水号 |
| `counterpartyName` | 对方户名（如"财付通支付科技有限公司"、"支付宝（中国）网络技术有限公司"） |
| `creditAmount` | 入账金额（贷方发生额） |
| `debitAmount` | 出账金额（借方发生额，如提现） |
| `transactionTime` | 银行记账时间（通常 T+1，与支付完成时间有延迟） |
| `abstract` | 摘要备注 |

**对账难点：** 银行入账通常是 T+1 批量结算，一笔银行流水可能对应多笔支付订单（微信/支付宝的合并结算）。初期可只做"日汇总核对"（当日总入账 ≈ 当日净现金流），待系统成熟后再做"明细勾兑"。

### 3.4 物理硬件账（防舞弊核对）

**数据来源：** 门店所有 PICO 4 Ultra Enterprise 头显的系统运行日志。

**提取指标：**

| 指标 | 说明 |
|------|------|
| `deviceId` | 头显设备唯一标识（SN 码或系统 ID） |
| `appPackageName` | 运行的游戏包名（如 `com.vrspace.starexpedition`） |
| `sessionStartAt` | 游戏启动时间 |
| `sessionEndAt` | 游戏结束时间 |
| `sessionDurationSec` | 实际运行秒数 |
| `isCompleted` | 是否完整运行一局（排除中途退出） |

**防舞弊核算公式：**

```
核销差异率 = (业务系统确权人次 - 硬件日志实际播控人次) / 硬件日志实际播控人次 × 100%

其中：
  业务系统确权人次 = SUM(Booking.personCount) WHERE Booking.status = 'COMPLETED' AND date = T-1
  硬件日志实际播控人次 = SUM(头显日志完整局数) × 单局核载人数
```

**判定逻辑：**
- 若 `核销差异率 > 5%`（排除正常设备联调测试后），触发"门店异常放客"告警，标记存在"私收现金未入系统"风险。
- 系统需为每个门店建立"测试时段白名单"（如每日 09:00-10:00 为设备调试时间，该时段头显启动不计入播控局数）。

---

## 四、 数据库表结构设计

> **原则：** 对账模块独立成表，避免拖垮主库。建议使用独立 schema 或表前缀 `recon_`。所有对账查询应指向只读从库（Read Replica）。

### 4.1 渠道对账单原始表 (`ReconChannelBill`)

存储从微信/支付宝拉取的原始对账单，保留原始数据便于追溯。

```prisma
model ReconChannelBill {
  id                    String   @id @default(uuid())
  batchId               String                    // 关联对账批次
  channel               String                    // WECHAT / ALIPAY / UNIONPAY
  channelTransactionId  String   @unique           // 渠道流水号
  merchantOrderNo       String                    // 商户订单号（对应系统 orderNo）
  transactionType       String                    // PAY / REFUND
  transactionStatus     String                    // SUCCESS / CLOSED / REFUNDED
  buyerPaidAmount       Int                       // 买家实付金额（分）
  refundAmount          Int      @default(0)      // 退款金额（分）
  channelFee            Int      @default(0)      // 渠道手续费（分）
  settlementAmount      Int                       // 结算金额（分）= 实付 - 手续费 - 退款
  feeRate               Decimal  @default(0.006)  // 费率
  channelPaidAt         DateTime                  // 渠道支付完成时间
  rawData               String?                   // 原始 JSON/CSV 行数据（便于追溯）
  createdAt             DateTime @default(now())
  
  @@index([batchId])
  @@index([merchantOrderNo])
  @@index([channelPaidAt])
  @@index([channelTransactionId])
}
```

### 4.2 银行流水表 (`ReconBankStatement`)

```prisma
model ReconBankStatement {
  id                String   @id @default(uuid())
  batchId           String
  bankSerialNo      String   @unique           // 银行流水号
  bankName          String                    // 开户行名称
  accountNo         String                    // 对公账户号（脱敏后4位）
  transactionDate   DateTime  @db.Date         // 银行记账日期
  counterpartyName  String                    // 对方户名（财付通/支付宝）
  creditAmount      Int      @default(0)      // 入账金额（分）
  debitAmount       Int      @default(0)      // 出账金额（分）
  balance           Int                       // 账户余额（分）
  abstract          String?                   // 摘要
  rawData           String?                   // 原始数据
  createdAt         DateTime @default(now())
  
  @@index([batchId])
  @@index([transactionDate])
  @@index([counterpartyName])
}
```

### 4.3 对账批次表 (`ReconBatch`)

记录每一次对账任务的执行状态。

```prisma
model ReconBatch {
  id                    String   @id @default(uuid())
  reconDate             String   @unique  @db.VarChar(10)  // 对账日期 YYYY-MM-DD
  status                String            // PENDING / RUNNING / SUCCESS / FAILED / PARTIAL
  bizTotalCount         Int      @default(0)   // 业务系统总笔数
  channelTotalCount     Int      @default(0)   // 渠道账单总笔数
  bankTotalCount        Int      @default(0)   // 银行流水总笔数（T+1 可能为0）
  matchedCount          Int      @default(0)   // 匹配成功笔数
  exceptionCount        Int      @default(0)   // 异常笔数
  matchedAmount         Int      @default(0)   // 匹配成功总金额（分）
  exceptionAmount       Int      @default(0)   // 异常总金额（分）
  startedAt             DateTime?
  completedAt           DateTime?
  errorMessage          String?
  createdAt             DateTime @default(now())
  
  exceptions            ReconException[]
  
  @@index([reconDate])
  @@index([status])
}
```

### 4.4 对账差错明细表 (`ReconException`)

**核心表。** 所有匹配失败的流水都会进入此表，由财务人员在后台处理。

```prisma
enum ExceptionType {
  LONG                    // 长款：渠道有钱，系统没单
  SHORT                   // 短款：系统有单，渠道没钱
  AMOUNT_MISMATCH         // 金额不符
  STATUS_MISMATCH         // 状态不符（如系统显示已支付，渠道显示失败）
  FEE_MISMATCH            // 手续费差异
  DUPLICATE               // 重复流水
  HARDWARE_MISMATCH       // 硬件播控与系统核销差异
  UNKNOWN                 // 未知异常
}

enum ExceptionStatus {
  PENDING                 // 待处理
  MANUAL_FIXED            // 已人工平账
  AUTO_FIXED              // 已自动修复
  FROZEN                  // 已冻结权益
  REFUNDED                // 已原路退回
  IGNORED                 // 已忽略（测试数据等）
}

model ReconException {
  id                    String        @id @default(uuid())
  batchId               String
  batch                 ReconBatch    @relation(fields: [batchId], references: [id])
  
  exceptionType         ExceptionType
  exceptionStatus       ExceptionStatus @default(PENDING)
  
  // 业务侧数据
  bizType               String?       // ORDER / RECHARGE
  bizOrderNo            String?       // 系统订单号
  bizAmount             Int?          // 系统记录金额（分）
  bizStatus             String?       // 系统状态
  
  // 渠道侧数据
  channel               String?       // WECHAT / ALIPAY
  channelTransactionId  String?       // 渠道流水号
  channelAmount         Int?          // 渠道金额（分）
  channelFee            Int?          // 渠道手续费（分）
  channelStatus         String?       // 渠道状态
  
  // 银行侧数据（如有）
  bankSerialNo          String?
  bankAmount            Int?
  
  // 硬件侧数据（如有）
  venueId               String?
  deviceId              String?
  hardwareSessions      Int?          // 硬件实际播控局数
  systemSessions        Int?          // 系统确权局数
  
  // 差异金额
  diffAmount            Int           // 差异金额（分）
  
  // 处理记录
  handlerId             String?       // 处理人ID
  handlerName           String?       // 处理人姓名
  handledAt             DateTime?
  handleRemark          String?       // 处理备注
  handleAction          String?       // FIX / FREEZE / REFUND / IGNORE
  
  // 关联修复流水
  fixTransactionId      String?       // 修复后创建的 BalanceTransaction ID
  
  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt
  
  @@index([batchId])
  @@index([exceptionType])
  @@index([exceptionStatus])
  @@index([bizOrderNo])
  @@index([channelTransactionId])
  @@index([createdAt])
}
```

### 4.5 头显设备运行日志表 (`DeviceSessionLog`)

```prisma
model DeviceSessionLog {
  id                String   @id @default(uuid())
  deviceId          String                    // 头显设备 SN 码
  venueId           String                    // 所属门店
  appPackageName    String                    // 游戏包名
  appName           String?                   // 游戏名称（冗余）
  sessionStartAt    DateTime
  sessionEndAt      DateTime?
  sessionDurationSec Int                     // 运行秒数
  isCompleted       Boolean  @default(false) // 是否完整一局
  isTestSession     Boolean  @default(false) // 是否为测试（白名单时段内）
  playerCount       Int      @default(1)     // 本局实际游玩人数
  rawLog            String?                   // 原始日志行
  createdAt         DateTime @default(now())
  
  @@index([venueId])
  @@index([appPackageName])
  @@index([sessionStartAt])
  @@index([isTestSession])
}
```

### 4.6 对账配置表 (`ReconConfig`)

存储渠道 API 配置、费率、测试白名单等。

```prisma
model ReconConfig {
  id                String   @id @default(uuid())
  key               String   @unique
  value             String
  description       String?
  updatedAt         DateTime @updatedAt
}

// 示例配置项：
// key: "WECHAT_MCH_ID"           value: "1234567890"
// key: "WECHAT_API_V3_KEY"       value: "***"
// key: "ALIPAY_APP_ID"           value: "***"
// key: "ALIPAY_PRIVATE_KEY"      value: "***"
// key: "CHANNEL_FEE_RATE"        value: "0.006"
// key: "DAILY_RECON_CRON"        value: "0 2 * * *"   (凌晨2点)
// key: "HARDWARE_TEST_START"     value: "09:00"
// key: "HARDWARE_TEST_END"       value: "10:00"
// key: "HARDWARE_MISMATCH_THRESHOLD" value: "0.05"  (5%差异率阈值)
```

---

## 五、 对账引擎设计 (Matching Engine)

### 5.1 阶段一：数据拉取与清洗 (Data Ingestion)

**定时任务：** `node-cron` 或系统级 `crontab`，每日 02:00 执行。

```typescript
// server/src/jobs/reconciliationJob.ts
import { CronJob } from 'cron'

export const reconJob = new CronJob('0 2 * * *', async () => {
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  
  // 1. 创建批次
  const batch = await prisma.reconBatch.create({
    data: { reconDate: yesterday, status: 'RUNNING', startedAt: new Date() }
  })
  
  try {
    // 2. 拉取渠道账单（预留接口，待接入真实支付后实现）
    // await fetchWechatBill(yesterday)
    // await fetchAlipayBill(yesterday)
    
    // 3. 拉取银行流水（预留接口）
    // await fetchBankStatement(yesterday)
    
    // 4. 拉取头显日志
    // await fetchDeviceLogs(yesterday)
    
    // 5. 执行对账引擎
    await runMatchingEngine(batch.id, yesterday)
    
    // 6. 更新批次状态
    await prisma.reconBatch.update({
      where: { id: batch.id },
      data: { status: 'SUCCESS', completedAt: new Date() }
    })
  } catch (err) {
    await prisma.reconBatch.update({
      where: { id: batch.id },
      data: { status: 'FAILED', errorMessage: (err as Error).message, completedAt: new Date() }
    })
  }
})
```

**幂等性保障：** 脚本必须保证同一天的对账单重复执行不会导致 `ReconException` 重复数据。实现方式：
- `ReconChannelBill.channelTransactionId` 设 `@unique`
- `ReconException` 创建前先做 `upsert`（以 `batchId + bizOrderNo + channelTransactionId` 为复合唯一键）

### 5.2 阶段二：十字交叉匹配算法

#### 5.2.1 资金核对（系统账 vs 渠道账）

**主键：** `merchantOrderNo`（渠道账单中的商户订单号）↔ `Order.orderNo` / `RechargeRecord.id`

**匹配成功条件（必须同时满足）：**
1. `bizOrderNo` 在业务系统中存在
2. 业务侧状态为 `PAID` / `COMPLETED` / `REFUNDED`（非 `PENDING` / `CANCELLED`）
3. `bizAmount == channelAmount`（系统金额 == 渠道实付金额）

**异常分类：**

| 场景 | 判定逻辑 | exceptionType |
|------|---------|---------------|
| 长款 | `channelAmount > 0` 但 `bizOrderNo` 不存在或 `bizStatus = 'PENDING'` | `LONG` |
| 短款 | `bizOrderNo` 存在且 `bizStatus = 'PAID'` 但渠道无记录 | `SHORT` |
| 金额不符 | `abs(bizAmount - channelAmount) > 0` | `AMOUNT_MISMATCH` |
| 状态不符 | `bizStatus = 'PAID'` 但 `channelStatus = 'FAILED'` | `STATUS_MISMATCH` |
| 手续费差异 | `abs(系统预估手续费 - channelFee) > 1分` | `FEE_MISMATCH` |

#### 5.2.2 银行资金核对（渠道账 vs 银行账）

由于银行 T+1 结算的批量特性，初期采用**日汇总核对**：

```
当日渠道净结算 = SUM(channelBill.settlementAmount) WHERE channelPaidAt IN [T-1]
当日银行入账   = SUM(bankStatement.creditAmount) WHERE counterpartyName IN ['财付通','支付宝'] AND transactionDate = T

允许差异：|当日渠道净结算 - 当日银行入账| ≤ 1元（抹零差异）
```

若差异超过阈值，标记为 `BANK_RECONCILE_MISMATCH`，进入异常池由财务跟进。

#### 5.2.3 硬件核销核对（系统账 vs 物理账）

```typescript
async function checkHardwareMismatch(venueId: string, date: string) {
  // 1. 业务系统确权人次
  const bizSessions = await prisma.booking.aggregate({
    where: {
      venueId,
      date: new Date(date),
      status: 'COMPLETED',
    },
    _sum: { personCount: true },
  })
  
  // 2. 硬件实际播控人次
  const [start, end] = [startOfDay(new Date(date)), endOfDay(new Date(date))]
  const hardwareSessions = await prisma.deviceSessionLog.aggregate({
    where: {
      venueId,
      sessionStartAt: { gte: start, lte: end },
      isCompleted: true,
      isTestSession: false,
    },
    _sum: { playerCount: true },
  })
  
  const bizCount = bizSessions._sum?.personCount || 0
  const hwCount = hardwareSessions._sum?.playerCount || 0
  
  if (hwCount > 0) {
    const diffRate = (bizCount - hwCount) / hwCount
    if (diffRate < -0.05) {  // 业务确权少于硬件播控 5% 以上
      return {
        type: 'HARDWARE_MISMATCH',
        bizCount,
        hwCount,
        diffRate,
        risk: '门店可能存在私收现金未入系统'
      }
    }
  }
}
```

---

## 六、 差错池处理机制 (Exception Handling)

### 6.1 长款单处理（渠道有钱，系统没单）

**典型场景：** 客户钱扣了，但系统由于网络超时未收到支付回调，导致订单仍为 `PENDING`，客户未获得权益。

**后台 UI 操作：**

| 按钮 | 动作 | 系统调用 |
|------|------|---------|
| **强制补发权益** | 为用户补发对应的游戏场次或充值本金 | 调用 `OrderService.forceFulfill(orderNo)` → 创建 `Order` + `Payment` + `BalanceTransaction` 流水，状态设为 `PAID` |
| **原路退回** | 将款项退回客户微信/支付宝 | 调用微信/支付宝退款 API，创建退款流水，标记异常为 `REFUNDED` |

**注意：** 强制补发前必须人工核实该笔渠道流水确实未被其他订单关联，避免重复发权益。

### 6.2 短款单处理（系统有单，渠道没钱）

**典型场景：** 系统显示充值成功，但微信/支付宝账单里查无此单。这可能是前端伪造请求或严重的系统漏洞。

**后台 UI 操作：**

| 按钮 | 动作 | 系统调用 |
|------|------|---------|
| **立即冻结权益** | 冻结该订单关联用户的 `principalBalance` 对应金额 | `User.principalBalance` 扣减，创建冻结记录，禁止该用户扫码核销 |
| **标记高危** | 发送企业微信/钉钉告警给财务总监和 CTO | 触发告警通知 |

**注意：** 短款属于最高风险级别，处理前必须冻结相关权益，防止资金进一步流失。

### 6.3 金额不符处理（手续费或退款错漏）

**典型场景：** 实付金额与系统记录差了几分钱（常见于退款分账错误、四舍五入差异）。

**后台 UI 操作：**

| 按钮 | 动作 | 系统调用 |
|------|------|---------|
| **生成财务平账凭证** | 允许财务手动输入备注，将零头计入"营业外支出"或"财务费用" | 创建一条 `BalanceTransaction`（type: `ADJUSTMENT`），金额 = diffAmount，remark = 财务备注 |

---

## 七、 接口预留清单（未接入微信/支付宝前的空壳实现）

当前系统尚未接入真实支付渠道，以下接口需预留空壳或 Mock 实现，确保后续接入时只需填充业务逻辑，无需改动架构。

### 7.1 渠道账单拉取接口

```typescript
// server/src/services/channelBillService.ts

/**
 * 拉取微信支付账单
 * @param date YYYY-MM-DD
 * @returns 解析后的标准化账单数组
 */
export async function fetchWechatBill(date: string): Promise<ChannelBillItem[]> {
  // TODO: 接入微信支付 v3 账单下载接口
  // 参考文档: https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_1_10.shtml
  // 
  // 1. 调用 GET /v3/billdownload/file?token=xxx 下载账单文件
  // 2. 解压 gzip，解析 CSV
  // 3. 将原始数据写入 ReconChannelBill
  
  console.warn(`[ChannelBill] 微信支付账单拉取未实现，日期: ${date}`)
  return []
}

/**
 * 拉取支付宝账单
 * @param date YYYY-MM-DD
 */
export async function fetchAlipayBill(date: string): Promise<ChannelBillItem[]> {
  // TODO: 接入支付宝账单查询接口
  // 参考文档: https://opendocs.alipay.com/open/02n4vg
  //
  // 1. 调用 alipay.data.bill.downloadurl.query
  // 2. 下载 CSV/zip 账单
  // 3. 解析并写入 ReconChannelBill
  
  console.warn(`[ChannelBill] 支付宝账单拉取未实现，日期: ${date}`)
  return []
}

interface ChannelBillItem {
  channelTransactionId: string
  merchantOrderNo: string
  transactionType: 'PAY' | 'REFUND'
  transactionStatus: string
  buyerPaidAmount: number
  refundAmount: number
  channelFee: number
  settlementAmount: number
  channelPaidAt: Date
}
```

### 7.2 银行流水拉取接口

```typescript
// server/src/services/bankStatementService.ts

/**
 * 拉取银行对公账户流水
 * @param date YYYY-MM-DD
 */
export async function fetchBankStatement(date: string): Promise<BankStatementItem[]> {
  // TODO: 接入银企直联或银行 SFTP
  // 常见方案:
  // 1. 招商银行 CMB SDK
  // 2. 工商银行 ICBC 企业网银 API
  // 3. 银行提供的 SFTP 定时推送对账单
  
  console.warn(`[BankStatement] 银行流水拉取未实现，日期: ${date}`)
  return []
}

interface BankStatementItem {
  bankSerialNo: string
  transactionDate: Date
  counterpartyName: string
  creditAmount: number
  debitAmount: number
  balance: number
  abstract: string
}
```

### 7.3 头显设备日志拉取接口

```typescript
// server/src/services/deviceLogService.ts

/**
 * 拉取门店头显设备运行日志
 * @param venueId 门店ID
 * @param date YYYY-MM-DD
 */
export async function fetchDeviceLogs(venueId: string, date: string): Promise<DeviceLogItem[]> {
  // TODO: 接入 PICO 企业版 MDM 或自定义 ADB 日志采集
  // 方案 A: PICO 企业 MDM API 获取应用使用统计
  // 方案 B: 门店局域网内的日志采集服务，通过 MQTT/HTTP 上报到总部
  // 方案 C: 头显端 SDK 埋点，游戏退出时上报 session 数据
  
  console.warn(`[DeviceLog] 头显日志拉取未实现，门店: ${venueId}, 日期: ${date}`)
  return []
}

interface DeviceLogItem {
  deviceId: string
  appPackageName: string
  sessionStartAt: Date
  sessionEndAt: Date
  sessionDurationSec: number
  isCompleted: boolean
  playerCount: number
}
```

### 7.4 渠道退款接口（用于长款原路退回）

```typescript
// server/src/services/channelRefundService.ts

/**
 * 微信原路退款
 * @param orderNo 商户订单号
 * @param refundAmount 退款金额（分）
 * @param reason 退款原因
 */
export async function refundWechat(orderNo: string, refundAmount: number, reason: string) {
  // TODO: 接入微信支付退款 API
  // 参考文档: https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_1_9.shtml
  throw new Error('微信支付退款接口未实现')
}

/**
 * 支付宝原路退款
 */
export async function refundAlipay(orderNo: string, refundAmount: number, reason: string) {
  // TODO: 接入支付宝退款 API
  // 参考文档: https://opendocs.alipay.com/open/02n4vh
  throw new Error('支付宝退款接口未实现')
}
```

---

## 八、 阶段性实施路线 (Roadmap)

### Phase 1：基础对账（立即实施，0 外部依赖）
**目标：** 先把数据库内部的"业务系统账"做对。

- [x] 修复积分收回流水缺失 bug
- [x] 修复按日对账口径偏差
- [x] 实现 `/finance/reconcile` 总对账 + 按日对账
- [x] 实现 `/finance/reconcile-details` 差异明细查询
- [ ] 新建 `ReconBatch`、`ReconException` 表（空表待命）
- [ ] 在财务后台新增"对账异常"菜单入口（可先展示空状态）

### Phase 2：渠道对账（接入真实支付后 1 周内）
**前提：** 已申请微信/支付宝商户号，完成支付接入。

- [ ] 实现 `fetchWechatBill()` 和 `fetchAlipayBill()`
- [ ] 实现 `ReconChannelBill` 数据写入
- [ ] 实现对账引擎资金十字交叉匹配
- [ ] 财务后台异常池 UI 上线（长款补单、短款冻结、金额平账）
- [ ] 配置每日 02:00 Cron Job 自动跑对账

### Phase 3：银行资金对账（开业后 1 个月内）
**前提：** 已开通对公账户，接入银企直联或银行 API/SFTP。

- [ ] 实现 `fetchBankStatement()`
- [ ] 实现日汇总核对（渠道净结算 vs 银行入账）
- [ ] 增加"银行资金差异"异常类型

### Phase 4：硬件防舞弊对账（设备部署后 2 周内）
**前提：** 头显已部署，日志采集方案确定。

- [ ] 实现 `fetchDeviceLogs()`
- [ ] 建立门店测试时段白名单
- [ ] 实现核销差异率计算与告警
- [ ] 增加"硬件播控差异"异常类型

### Phase 5：智能化与风控（持续优化）
- [ ] 异常池数据训练简单的风控模型（如某门店连续 3 天出现长款则自动告警）
- [ ] 对接企业微信/钉钉机器人，实时推送异常通知
- [ ] 对账查询接入只读从库，分离读写压力

---

## 九、 关键设计建议与风险提示

### 9.1 费率与手续费必须显性化

**现状：** `Payment` 表只记录 `amount`（买家实付总额），不记录手续费。  
**建议：** 接入真实支付后，在 `Payment` 表中增加 `channelFee` 字段，或在 `ReconChannelBill` 中保留手续费明细。净利润计算必须用 `实付金额 - 手续费`，否则财务利润会虚高。

### 9.2 对账查询必须走只读从库

对账涉及大量全表扫库（`Order`、`Payment`、`BalanceTransaction` 的全历史聚合），直接在主库执行会导致锁表，影响前台门店正常的办卡和结算。**所有对账相关查询必须通过只读从库（Read Replica）执行。**

在 Prisma 中可通过配置 `datasource` 的 `url` 和 `shadowDatabaseUrl` 实现读写分离，或在对账服务中单独初始化一个指向从库的 `PrismaClient` 实例。

### 9.3 长款补单必须人工审核

自动补单虽然便捷，但存在被恶意利用的风险（如伪造渠道流水触发补单）。建议：
- 长款补单必须要求财务人员人工点击确认
- 补单前系统自动校验该渠道流水号是否已关联其他订单
- 补单操作记录审计日志（`OperationLog`），保留 forever

### 9.4 短款冻结必须实时生效

短款是高危异常，可能涉及伪造支付请求。系统必须在发现短款的**瞬间**冻结相关权益：
- 如果是充值订单：冻结该用户的 `principalBalance` 中对应金额
- 如果是游戏订单：禁止该 `Booking` 对应的头显扫码核销
- 同时触发即时告警（短信/企业微信）给财务负责人

### 9.5 头显日志采集方案选型建议

针对 PICO 4 Ultra Enterprise 设备，推荐以下三种日志采集方案，按优先级排序：

| 方案 | 实现难度 | 数据精度 | 推荐度 |
|------|---------|---------|--------|
| **A. PICO 企业 MDM API** | 中 | 应用级使用时长 | ⭐⭐⭐ |
| **B. 头显端 SDK 埋点** | 低 | 游戏启动/结束事件 | ⭐⭐⭐⭐ |
| **C. ADB + 局域网采集** | 高 | 最细粒度系统日志 | ⭐⭐ |

**建议采用方案 B（头显端 SDK 埋点）**：在游戏内容启动和正常退出时，通过 HTTP/MQTT 将 `sessionStartAt`、`sessionEndAt`、`isCompleted` 上报到总部服务器。实现简单、侵入性低、数据足够用于防舞弊核对。

### 9.6 聚合支付 vs 直连商户的选择建议

| 对比维度 | 微信支付直连 | 支付宝直连 | 聚合支付（收钱吧/拉卡拉） |
|---------|-------------|-----------|------------------------|
| 费率 | 0.6% | 0.6% | 0.38% ~ 0.6% |
| 对账单获取 | API 官方标准 | API 官方标准 | 各平台不统一，需单独适配 |
| 结算速度 | T+1 | T+1 | D+1 或 T+1 |
| 接入复杂度 | 中 | 中 | 低 |
| 对账难度 | 低（标准文档） | 低（标准文档） | 高（每家格式不同） |

**建议：** 初期若技术人力有限，可先用聚合支付快速上线；但**对账系统必须按直连标准设计**，预留微信/支付宝的字段映射。待交易量稳定后，建议切回微信/支付宝直连，降低对账复杂度和费率。

---

## 十、 附录：对账系统与现有模块的集成点

| 现有模块 | 集成方式 | 影响 |
|---------|---------|------|
| `OrderController` | 支付回调成功后写入 `Payment`；退款时增加渠道退款 API 调用 | 中 |
| `RechargeRecord` | 充值成功后需记录渠道流水号；退款时增加渠道退款 API 调用 | 中 |
| `BalanceTransaction` | 新增 `POINTS_REVOKE` 类型（已实施）；后续可能需新增 `ADJUSTMENT` 类型用于平账 | 低 |
| `DailyFinancialReport` | 对账差异数据可作为日报表的补充校验维度 | 低 |
| `Booking` | 完成状态的 `Booking` 需参与硬件对账核对 | 低 |
| `Venue` | 门店维度是硬件对账和异常告警的分组维度 | 低 |
| `User` | 短款冻结需操作 `User.principalBalance`；长款补单需为用户发权益 | 高 |

---

> **文档维护人：** 技术负责人 + 财务负责人  
> **下次评审日期：** 接入真实支付渠道前一周  
> **关联文档：** `prisma/schema.prisma`（数据模型）、`server/src/controllers/financialController.ts`（对账接口）
