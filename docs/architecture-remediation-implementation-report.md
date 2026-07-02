# VR Space 架构治理与未接支付上线收口报告

更新时间：2026-07-01

## 1. 本轮目标

本轮目标不是继续堆功能，而是把系统推进到“未接入真实微信/支付宝支付，也能按线下门店业务上线试运营”的标准：

- 不在 C 端或 B 端展示会误导用户/员工的微信、支付宝真实支付入口。
- 充值、余额支付、退款、改签费、核销、对账的资金口径可追踪。
- 门店储值开始具备资金来源门店维度，避免后续加盟/多店扩张时账务混乱。
- Controller 继续瘦身，核心规则沉到 domain/contracts/middleware。
- 增加单元测试、OpenAPI 基础文档、请求校验、统一响应、CI 门禁。

本轮没有推送 GitHub。

## 2. 竞品与线下业务参照

### 2.1 储值和门店归属

有赞的会员储值方案强调“在线储值、到店消费”和充值赠送、优惠券联动，说明储值是会员运营核心能力，但必须保证到账、赠送和后续消费可追踪。

银豹连锁门店方案强调会员共享、储值跨店消费、总部按月结算。这类模式对 VR 连锁/加盟很关键：即使当前先全局可用余额，也必须记录资金来自哪个门店，后面才能做门店结算。

本轮对应落地：

- 新增 `UserStoreBalance`。
- 充值必须显式指定 `venueId`。
- 余额消费时按“消费门店优先，其次其他资金来源门店，最后历史未归属余额”生成扣款快照。
- 退款按原扣款快照返还，不再简单按消费门店写回。

### 2.2 未接真实支付前的产品边界

微盟分门店储值卡说明中，分门店储值卡不支持在线退款，这类产品会明确区分线上能力和门店处理能力。对本系统而言，真实微信/支付宝尚未接入时，不能让用户看到“微信支付/支付宝支付”并模拟成功，否则财务与投诉风险很高。

本轮对应落地：

- C 端订单支付页只保留余额支付。
- C 端充值页改成“到店办理”引导，不再模拟线上充值成功。
- B 端订单收款只保留现金、刷卡人工确认。
- 后端 `payOrderSchema` 拒绝 `WECHAT/ALIPAY`。
- 顾客角色只能余额支付，现金/刷卡必须是员工角色操作。

### 2.3 权益、退款和门店适用范围

微盟权益设置支持参与门店、退款/取消后权益回收等规则。这说明优惠、积分、券和退款不是孤立功能，必须绑定订单状态、门店范围、资金流水。

本轮对应落地：

- 退款必须有原因。
- 余额退款按原本金/赠送扣减比例返回。
- 爽约退款处置、普通退款、批量退款统一调用退款策略。
- 门店查询接入 `venueScope`，店长/操作员默认只看管理门店。

## 3. 已完成的主要改造

### 3.1 支付边界收口：未接支付也能上线

#### 后端

- `server/src/contracts/order.ts`
  - `payOrderSchema` 只允许 `BALANCE/CASH/CARD`。
  - 继续兼容旧字段 `payMethod`，但统一转换为 `method`。
  - `WECHAT/ALIPAY` 返回明确错误：真实支付暂未接入。

- `server/src/domain/paymentPolicy.ts`
  - 顾客只能使用 `BALANCE`。
  - `CASH/CARD` 只允许 `SUPER_ADMIN/ADMIN/OPERATOR/FINANCE/MANAGER`。

- `server/src/controllers/orderController.ts`
  - 创建订单时拒绝未接入支付方式。
  - 订单收款不再有 `method || WECHAT` 默认值。
  - 改签费支付只允许 `BALANCE/CASH/CARD`，并复用角色策略。

- `server/src/controllers/bookingController.ts`
  - C 端收费改签只允许生成余额支付的待支付改签费订单。
  - 不再允许生成微信/支付宝改签费待支付单。

- `server/src/controllers/rechargeController.ts`
  - 充值创建默认 `CASH`，不再默认 `WECHAT`。
  - 充值必须提供真实门店 `venueId`，不再自动猜最近预约或第一个门店。

#### 前端

- `app/reservation/src/pages/Pay.tsx`
  - C 端订单支付只显示余额支付。
  - 余额不足时提示“未接入微信/支付宝在线支付，请联系门店或到店处理”。

- `app/reservation/src/pages/Recharge.tsx`
  - 删除微信/支付宝充值选择。
  - 删除模拟充值成功逻辑。
  - 用户选择充值档位后，引导到 `/store-contact` 到店办理。

- `app/src/components/PaymentModal.tsx`
  - B 端收款弹窗只显示现金收款、刷卡收款。
  - 删除可点击的微信/支付宝扫码支付方式。

- `app/src/pages/Orders.tsx`
  - 员工选择现金/刷卡后直接调用后端人工收款接口。
  - 删除扫码盒模拟器在订单收款页的调用。

- `app/src/pages/Reservation.tsx`
  - 管理端代客预约从微信/支付宝改成现金/刷卡预收款方式。
  - 按“提交预约”表达，避免让员工误解为线上支付已完成。

呈现效果：

- 顾客端：没有微信/支付宝付款按钮；余额不足时只能联系门店或到店处理。
- 顾客端充值：展示充值档位和赠送金额，但明确线上储值未开放，点击后进入门店联系方式页。
- 管理端订单：员工收款只看到现金、刷卡，操作结果由员工确认，不会出现模拟扫码成功。
- 后端：即使有人绕过前端传 `WECHAT/ALIPAY`，接口也会拒绝。

### 3.2 多门店余额隔离 Phase 1

#### 数据结构

- `UserStoreBalance`
  - 记录用户在各门店的本金余额、赠送余额、累计充值、累计消费。
  - 唯一约束：`userId + venueId`。

- `RechargeRecord.venueId`
  - 充值必须落到具体门店。

- `BalanceTransaction.venueId/sourceVenueId`
  - `venueId` 表示消费/退款发生门店。
  - `sourceVenueId` 表示资金来源门店。

- `Order.balanceDeductionSnapshot`
  - 记录余额消费时各资金来源门店的本金/赠送扣减明细。

#### 业务规则

- 充值：员工确认到店收款后，增加用户全局余额，同时增加该门店 `UserStoreBalance`。
- 消费：先扣消费门店余额，不足时扣其他门店来源余额。
- 历史未归属余额：记入快照的 `UNASSIGNED`，不写负数门店余额。
- 退款：按原扣款快照退回来源门店；`UNASSIGNED` 只恢复全局余额，不生成虚拟门店行。
- 四舍五入：退款拆分采用最大余数分配，分分钱保留在原钱包口袋，避免本金/赠送错位。

呈现效果：

- 现在可以解释“这笔余额消费从哪个门店充值余额扣的”。
- 后续做加盟店结算时，有数据基础计算跨店消费与总部轧差。
- 历史数据还没归属时，不会为了凑门店余额而写负数。

### 3.3 退款、爽约、改签和生命周期规则下沉

新增/强化 domain：

- `server/src/domain/orderLifecycle.ts`
  - 统一预约待核销窗口、爽约恢复、改签后状态判断。

- `server/src/domain/walletLedger.ts`
  - 统一余额扣减、本金/赠送拆分、退款拆分。

- `server/src/domain/refundPolicy.ts`
  - 普通退款、爽约退款处置、退款金额合法性。

- `server/src/domain/storeBalance.ts`
  - 门店余额扣减、退款、历史未归属余额处理。

接入位置：

- `orderController.ts`
- `bookingController.ts`
- `bookingLifecycleJob.ts`
- 批量退款、取消订单、爽约处置、改签费支付

呈现效果：

- 退款和取消不再各写一套本金/赠送算法。
- 改签后订单/预约状态与定时任务口径一致。
- 单元测试可以覆盖资金算法，不需要靠 E2E 才能发现财务错误。

### 3.4 请求合同、统一响应和 OpenAPI

新增/强化：

- `server/src/middleware/validateRequest.ts`
  - Zod 校验 `body/query/params`。

- `server/src/contracts/order.ts`
  - 支付、退款请求合同。

- `server/src/contracts/recharge.ts`
  - 充值创建、充值确认请求合同。

- `server/src/utils/apiResponse.ts`
  - 统一 `{ code, message, data, meta }` 响应。

- `server/src/utils/response.ts`
  - 兼容旧 controller 调用方式。
  - 分页响应保留 `meta.total/page/pageSize/totalPages`，并兼容额外统计字段。

- `server/src/openapi/coreRoutes.ts`
  - 注册核心财务路径：
    - `POST /recharges`
    - `POST /recharges/confirm`
    - `PUT /orders/{id}/pay`
    - `PUT /orders/{id}/refund`

- `server/src/routes/docs.ts`
  - `/api/openapi.json`
  - `/api/docs`

呈现效果：

- 核心资金接口有运行时校验。
- 前端/第三方对接可以从 OpenAPI 看出当前只支持余额、现金、刷卡。
- 老前端通过 axios 拦截器兼容统一响应格式。

### 3.5 权限、Job、CI 和工程门禁

已落地：

- `server/src/domain/venueScope.ts`
  - 订单列表、预约列表、预约日历接入门店数据范围。

- `JobExecutionLog`
  - 新增 Prisma model 和 migration。
  - 订单超时、预约生命周期、对账、数据一致性 job 通过 `jobRunner` 记录执行结果。

- `.github/workflows/ci.yml`
  - PR/main push 触发后端单测、后端构建、管理端构建、C 端构建。

呈现效果：

- 店长/操作员不会默认看到所有门店数据。
- 定时任务失败有执行日志可查。
- 后续推送 GitHub 时有基础自动门禁。

## 4. 数据库 migration 状态

已修复本轮新增 migration 的明显问题：

- `20260701093000_add_job_execution_log`
  - 创建 `JobExecutionLog`。

- `20260701_add_store_balance_isolation`
  - 创建 `UserStoreBalance`。
  - 不再重复创建 `JobExecutionLog`。

当前 `npx prisma validate` 通过。

当前 `npx prisma migrate status` 显示开发库仍有 19 个历史 migration 未应用，其中包括本轮新增的两个 migration。这说明当前开发库更像是 `db push` 或非完整 migration 历史环境，不适合直接代表生产迁移状态。

上线要求：

- 生产部署前必须在干净数据库或 staging 数据库跑 `npx prisma migrate deploy`。
- 如果历史 migration 与当前库不一致，需要先做 migration 基线整理。
- schema 变更必须同时提交 migration 文件。

## 5. 验证结果

### 5.1 已通过

```bash
cd server && npm run test:unit
```

结果：

- tests: 75
- suites: 9
- pass: 75
- fail: 0

```bash
cd server && npm run build
```

结果：通过。

```bash
cd server && npx prisma validate
```

结果：Prisma schema valid。

```bash
cd app && npm run build
```

结果：通过。Vite 仅提示 chunk 较大和 Browserslist 数据较旧。

```bash
cd app/reservation && npm run build
```

结果：通过。Vite 仅提示 chunk 较大。

```bash
git diff --check
```

结果：通过。仅有 Windows 行尾提示，不是 whitespace error。

### 5.2 未通过但原因明确

```bash
cd server && npm run db:check-balance
```

结果：

```json
{
  "valid": false,
  "inconsistencies": [
    {
      "field": "principal",
      "globalTotal": 1974978,
      "storeTotal": 500000,
      "diff": 1474978
    },
    {
      "field": "bonus",
      "globalTotal": 201582,
      "storeTotal": 100000,
      "diff": 101582
    }
  ]
}
```

判断：

- 这是历史全局余额尚未完整回填到 `UserStoreBalance` 的数据问题。
- 新交易会写入门店余额，但历史余额差异必须上线前处理，否则门店余额报表不能作为结算依据。

## 6. 上线前必须处理清单

### P0：不处理不建议上线

1. 历史余额回填
   - 目标：让 `SUM(UserStoreBalance)` 与 `User.principalBalance/bonusBalance` 一致。
   - 当前差额：本金 1,474,978 分，赠送 101,582 分。
   - 推荐方案：能识别充值门店的回填到真实门店；无法识别的统一进入“历史未归属余额”策略，不要伪造到某个门店。

2. Staging 跑 migration
   - 用接近生产的空库或备份库执行 `npx prisma migrate deploy`。
   - 确认 `JobExecutionLog`、`UserStoreBalance`、外键、索引全部正常。

3. 关闭真实支付误导入口
   - 已完成代码收口。
   - 上线前需要产品/运营确认页面文案：当前线上只支持余额，充值到店办理。

4. 配置门店联系方式
   - C 端充值和余额不足都会引导到 `/store-contact`。
   - 必须保证门店电话、地址、营业时间已配置。

### P1：试运营第一周建议补

1. 写历史余额回填脚本，并提供 dry-run。
2. 对 `/api/docs` 的核心财务接口补更多响应示例。
3. 给 `JobExecutionLog` 做管理端查看页或后台查询命令。
4. 对财务对账报表标注“未接支付网关，现金/刷卡为人工确认”。

### P2：成熟期继续推进

1. 真正接入微信/支付宝后，再开放支付按钮和渠道对账 job。
2. 把 `ScanBoxSimulator` 迁移为开发演示工具或删除，不再作为生产收款路径。
3. 继续拆 `orderController.ts` 和 `bookingController.ts`，把支付、退款、改签执行进一步服务化。

## 7. 关键文件清单

### 后端 domain/contracts/middleware

- `server/src/domain/orderLifecycle.ts`
- `server/src/domain/walletLedger.ts`
- `server/src/domain/refundPolicy.ts`
- `server/src/domain/storeBalance.ts`
- `server/src/domain/paymentPolicy.ts`
- `server/src/domain/rechargeVenue.ts`
- `server/src/domain/venueScope.ts`
- `server/src/contracts/order.ts`
- `server/src/contracts/recharge.ts`
- `server/src/middleware/validateRequest.ts`
- `server/src/middleware/requestId.ts`

### 后端 controller/routes/jobs

- `server/src/controllers/orderController.ts`
- `server/src/controllers/bookingController.ts`
- `server/src/controllers/rechargeController.ts`
- `server/src/controllers/financeController.ts`
- `server/src/routes/orders.ts`
- `server/src/routes/recharges.ts`
- `server/src/jobs/jobRunner.ts`

### 前端

- `app/reservation/src/pages/Pay.tsx`
- `app/reservation/src/pages/Recharge.tsx`
- `app/src/components/PaymentModal.tsx`
- `app/src/pages/Orders.tsx`
- `app/src/pages/Reservation.tsx`
- `app/src/api/orders.ts`
- `app/reservation/src/api/recharges.ts`

### 数据库/工程

- `server/prisma/schema.prisma`
- `server/prisma/migrations/20260701093000_add_job_execution_log/migration.sql`
- `server/prisma/migrations/20260701_add_store_balance_isolation/migration.sql`
- `server/scripts/checkStoreBalanceConsistency.ts`
- `.github/workflows/ci.yml`

## 8. 最终判断

从工程角度，本轮已经把系统从“功能能跑，但支付/账务边界容易误导”推进到“未接真实支付也能按线下人工收款试运营”的状态。

从业务角度，当前最适合的上线口径是：

- C 端：预约下单、余额支付、到店核销。
- C 端充值：展示规则，到店办理。
- B 端：员工人工确认现金/刷卡收款。
- 财务：先按人工收款与余额流水核对，不做微信/支付宝网关对账。

上线前最大的剩余阻塞不是代码编译，而是历史余额回填和 migration 基线验证。只要这两项处理干净，系统可以进入小范围门店试运营。

## 9. 参考资料

- 有赞会员储值方案：https://www.youzan.com/intro/ump/prepaid
- 有赞连锁门店解决方案：https://www.youzan.com/guides/solutions/sell-on-chain-store
- 微盟分门店储值卡说明：https://help.weimob.com/os/article/1798
- 微盟权益设置说明：https://help.weimob.com/os/article/6409
- 银豹连锁门店方案：https://pospal.cn/chain.html
