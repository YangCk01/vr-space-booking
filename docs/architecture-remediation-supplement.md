# VR Space 架构治理补充方案：多门店资金隔离 Phase 1

## 概览

本方案作为现有架构治理报告的补充，聚焦**多门店资金隔离的数据底座建设**。在不改变当前用户体验、不开放跨店消费的前提下，把现有预置但未使用的 `UserStoreBalance` 模型真正接入充值/消费/退款链路，为后续加盟/联营模式下的门店结算、分账、对账打好基础。

本方案不依赖真实第三方支付接入，也不改变现有扣款策略（仍按全局余额扣），因此可以在当前阶段独立落地。

本次没有接入真实支付渠道，不修改财务对账算法，不生成结算单。

---

## 竞品和线下业务参照

线下 VR 场馆、健身房、游乐场等预付费场景普遍存在“充值归属门店”的需求：

- **健身房/瑜伽馆**（三体云动、青橙会）：会员充值必须归属到办卡门店，跨店消费需要门店间结算或品牌统一调配。
- **游乐场/儿童乐园**（美团收银、有赞零售）：储值卡金额与门店绑定，总部通过结算周期与门店分账。
- **影院/剧院**：储值余额通常归属购票影院，跨影院消费按实际消费影院结算。

对应到本系统，当前 `User.principalBalance / bonusBalance` 是全局资金池，用户在深圳店充值可在成都店消费。如果是加盟模式，会导致：

- A 店收了充值款，B 店承担了服务成本，A/B 店之间无资金边界。
- 退款时无法追溯资金应退回哪家门店。
- 平台与门店结算时无准确的分账依据。

因此必须在数据层把余额归属到门店。

---

## 修改内容

### 1. 数据模型改造

新增/修改文件：

- `server/prisma/schema.prisma`
- `server/prisma/migrations/20260701_add_store_balance_isolation/migration.sql`

具体变更：

- `UserStoreBalance` 增加 `user`、`venue` 关联关系，真正启用。
- `RechargeRecord` 增加 `venueId`（充值门店）。
- `BalanceTransaction` 增加 `venueId`（发生门店）和 `sourceVenueId`（资金来源门店，跨店时）。
- `Order` 增加 `balanceDeductionSnapshot`（JSON），记录该订单余额扣减来源，用于退款追溯。

效果：

- 每笔充值都有门店归属。
- 每笔余额消费/退款都带门店维度。
- 用户全局余额与各门店余额之间可校验恒等关系。

---

### 2. 充值链路改造

新增文件：

- `server/src/domain/storeBalance.ts`
- `server/src/domain/storeBalance.test.ts`

接入位置：

- `server/src/controllers/rechargeController.ts`
- `server/src/utils/wallet.ts`

效果：

- 创建充值订单时携带 `venueId`（C 端默认当前选中门店，B 端默认订单关联门店）。
- 充值确认时同时写入 `UserStoreBalance` 和 `User` 全局余额。
- 会员累计充值金额改为 `SUM(UserStoreBalance.totalRecharged)`。
- 充值记录返回增加 `venueId`、`venueName`。

---

### 3. 消费链路记录改造

接入位置：

- `server/src/controllers/orderController.ts`
- `server/src/utils/wallet.ts`

效果：

- 消费扣款逻辑保持不变（仍按 `User` 全局余额扣）。
- 新增 `Order.balanceDeductionSnapshot` 字段，记录本次扣减来自哪些门店的本金/赠金。
- 在 `LOOSE` / `STRICT` 模式未开启时，`balanceDeductionSnapshot` 默认只包含消费门店本身，保证历史一致性。
- `BalanceTransaction` 写入时记录 `venueId`（消费门店）。

---

### 4. 退款/取消链路改造

接入位置：

- `server/src/controllers/orderController.ts`
- `server/src/controllers/refundController.ts`

效果：

- 读取 `Order.balanceDeductionSnapshot` 按原扣减门店退回本金/赠金。
- 在线支付退款不触碰门店余额，只记录退款流水。
- 退款审计逻辑按门店维度分别校验可退本金（为后续 STRICT/LOOSE 模式做准备）。

---

### 5. 余额一致性校验

新增文件：

- `server/src/jobs/dataConsistencyJob.ts`（增强）
- `server/src/domain/storeBalance.ts` 中的校验函数

效果：

- 新增校验规则：`SUM(UserStoreBalance.principalBalance)` 必须等于 `SUM(User.principalBalance)`。
- 新增校验规则：`SUM(UserStoreBalance.bonusBalance)` 必须等于 `SUM(User.bonusBalance)`。
- 新增校验规则：每笔 `BalanceTransaction` 的 `venueId` 必须有效。
- 异常时输出可定位的用户 ID 和门店 ID。

---

### 6. 配置开关

接入位置：

- `server/src/controllers/systemConfigController.ts`（读取配置）
- `server/src/domain/storeBalance.ts`（读取模式）

新增配置项：

- `balance_isolation_mode`：`NONE`（默认） / `LOOSE` / `STRICT`
- `default_recharge_venue_id`：历史数据回填时使用的默认门店

效果：

- `NONE` 模式下业务逻辑与现在完全一致，仅数据层记录门店归属。
- 后续可通过切换 `LOOSE` / `STRICT` 逐步开放门店隔离消费策略。

---

### 7. 迁移脚本

新增文件：

- `server/scripts/migrateStoreBalance.ts`

效果：

- 把现有 `User.principalBalance / bonusBalance` 复制到 `UserStoreBalance`，归属到默认门店或 `PLATFORM`。
- 对历史 `RechargeRecord` 按最早关联订单的 `venueId` 回填 `RechargeRecord.venueId`。
- 对历史 `BalanceTransaction` 按关联订单的 `venueId` 回填 `BalanceTransaction.venueId`。
- 运行后输出迁移报告：受影响用户数、门店数、异常记录数。

---

### 8. CI 增强

修改文件：

- `.github/workflows/ci.yml`

效果：

- CI 中增加 `prisma migrate deploy --preview-feature` 语法检查（或 `prisma validate`），确保 schema 与 migration 文件一致。
- CI 中运行迁移脚本 dry-run（可选）。

---

## 测试覆盖

新增测试覆盖：

- 门店余额写入与更新：6 条。
- 充值门店归属：4 条。
- 消费扣减快照生成：4 条。
- 退款按门店原路退回：6 条。
- 余额恒等式校验：4 条。
- 配置开关读取：2 条。

预计新增后端单元测试：26 条。

---

## 业务效果

- 用户充值、消费、退款在数据层带上门店维度，为后续加盟结算提供依据。
- 当前用户体验不变，`balance_isolation_mode = NONE` 时业务逻辑与现在完全一致。
- 全局余额与门店余额总和保持恒等，降低财务数据不一致风险。
- 历史数据通过迁移脚本平滑过渡，不产生脏数据。
- 后续切换到 `LOOSE` / `STRICT` 模式时，只需改消费扣减策略和前端展示，无需再次重构数据层。

---

## 后续建议

- 完成 Phase 1 后，再推进 Phase 2：切到 `LOOSE` 模式，允许跨店消费并记录门店间往来。
- 完成 Phase 2 后，再推进 Phase 3：生成 `SettlementBatch` / `SettlementItem`，实现平台与门店的结算单、付款流程。
- 在真实支付接入后，把渠道实收金额接入结算单，实现“业务账 → 资金账 → 门店分账”三账一致。
- 管理端增加“用户门店余额分布”查询页。
- 管理端增加“门店结算单”查询、确认、付款页面。

---

## 不做的范围

- 不改当前消费扣减策略（仍按全局余额）。
- 不在 C 端展示“本店余额/他店余额”。
- 不生成门店结算单/不执行分账。
- 不接入真实支付渠道。
- 不改变会员等级计算规则（仍按累计充值总额）。
