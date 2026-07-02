# VR Space 工程化与架构治理执行计划

## 目标

把当前“功能优先、业务规则散落”的实现，逐步改成围绕订单、预约、账务、对账、会员权益等业务概念组织的可测试后端。第一阶段不追求大重写，先建立高风险业务的深 Module 和自动化门禁。

## 执行原则

- 只做纵向切片，不做一次性全量重构。
- 每次抽离一个业务规则 Module，都补对应单元测试。
- Controller 先瘦身为参数读取、权限校验、调用 Module、返回响应。
- 不改变开发服/测试服隔离约定，不自动同步测试服。
- 本轮只提交本地文件变更，不推送 GitHub。
- 线下业务规则优先匹配“预约、到店核销、爽约、改签差价、退款、门店履约、财务核对”的真实经营流程。

## 线下业务与竞品参照

- 微盟本地服务/智慧生活方案强调预约管理、次卡锁客、约付一体、代客预约、智能排班、会员运营，以及“可管控、可核对、可追溯”的标准化流程。参照来源：https://www.weimob.com/
- Xola 在体验/活动预约中把修改预约后的差价处理成“待收余额”或“退还多收款”，并支持全额/部分退款、按原支付方式退款、多支付方式退款。参照来源：https://support.xola.com/modifying-purchases 和 https://support.xola.com/refunding-returning-payments-change-guest-quantity
- 抖音生活服务预售券/预约链路把“已预约、已核销、退款/取消”作为不同履约节点处理。参照来源：https://developer.open-douyin.com/docs/resource/zh-CN/dop/ability/life-service-ability/life.capacity/ticketbooking.introduce
- 对本系统的约束：VR 线下场馆不是单纯电商订单，订单状态、预约状态、场地排程、钱包余额、积分、券、核销、爽约和对账必须保持一致。

## 阶段 1：订单与预约生命周期

**目标：** 建立订单/预约状态判断的中心 Module，先覆盖待核销窗口、爽约恢复、改签后状态判断。

**改动：**

- 新增 `server/src/domain/orderLifecycle.ts`。
- 新增 `server/src/domain/orderLifecycle.test.ts`。
- 后端新增 `test:unit` 脚本，使用 TypeScript 编译后运行 Node 内置测试。
- 将 `orderController.ts` 中的爽约恢复目标状态计算迁入 Module。
- 将 `bookingController.ts` 中改签后目标状态计算迁入 Module。
- 将 `bookingLifecycleJob.ts` 中核销窗口判断复用同一 Module。

**验收：**

- `cd server && npm run test:unit`
- `cd server && npm run build`

## 阶段 2：账务与钱包 Module

**目标：** 把余额扣减、退款入账、改签差价、流水记录集中到一个账务 Module，降低资金链路重复实现风险。

**候选 Module：**

- `server/src/domain/walletLedger.ts`
- `server/src/domain/refundPolicy.ts`

**优先抽离：**

- 余额支付的本金/赠金等比扣减。
- 改签补差价和退差价。
- 退款时余额返还与流水记录。
- 幂等保护和状态前置条件。

**验收：**

- 余额不足、组合钱包扣款、退差价、重复退款等单元测试。
- 订单支付和改签接口构建通过。

## 阶段 3：统一错误和请求合同

**目标：** 减少 controller 内手写 `req.body` 和 `error(...)` 的分散处理。

**改动方向：**

- 新增业务错误类：`BusinessError`、`ValidationError`、`NotFoundError`。
- 逐步改造 controller 抛出业务错误，由统一错误中间件响应。
- 先从订单、预约、退款接口开始。
- 为核心请求/响应新增 schema 或 DTO，作为前后端合同来源。

## 阶段 4：数据权限与门店隔离

**目标：** 门店管理员默认只能看到自己管理的门店数据。

**改动方向：**

- 建立统一的 `venueScope` 查询辅助 Module。
- 订单、预约、财务、设备、对账查询默认套 `venueId` 范围。
- 管理员/财务/店长权限差异统一在 middleware 或查询 Module 中表达。

## 阶段 5：Job 可观测和幂等

**目标：** 让 cron job 可追踪、可重跑、失败可定位。

**改动方向：**

- 增加 `JobExecutionLog` 数据表和 Prisma migration。
- 包装 job 执行入口，记录开始时间、结束时间、状态、错误信息。
- 对订单超时、预约生命周期、对账、券生效 job 加幂等测试。

## 阶段 6：CI/CD 与质量门禁

**目标：** 把靠人提醒的流程改成自动门禁。

**最小 CI：**

- `server npm run lint`
- `server npm run test:unit`
- `server npm run build`
- `app npm run build`
- `app/reservation npm run build`

**后续：**

- Prettier / ESLint 统一配置。
- migration 检查。
- OpenAPI 文档生成。

## 本轮执行范围

本轮执行阶段 1 的最小纵向切片：建立订单生命周期 Module、补测试、接入三个现有调用点，并跑后端验证。

## 执行状态

### 阶段 1：已完成

**已落地：**

- 新增 `server/src/domain/orderLifecycle.ts`。
- 新增 `server/src/domain/orderLifecycle.test.ts`。
- `orderController.ts`、`bookingController.ts`、`bookingLifecycleJob.ts` 已复用同一套待核销窗口和改签后状态判断。

### 阶段 2：已完成首批核心链路

- 新增 `server/src/domain/walletLedger.ts`。
- 新增 `server/src/domain/refundPolicy.ts`。
- 新增 `server/src/domain/walletLedger.ts`。
- 新增 `server/src/domain/walletLedger.test.ts`。
- 新增 `server/src/domain/refundPolicy.test.ts`。
- `server/src/utils/wallet.ts` 委托到新的钱包账务计算 Module，保持旧调用方兼容。
- `bookingController.ts` 的改签补差价、退差价改为调用钱包账务计算 Module。
- `orderController.ts` 的余额支付、改签费支付、普通退款、爽约退款处置、批量退款改为调用统一账务/退款策略。

### 阶段 3：已完成基础设施和核心请求合同

- 新增 `server/src/domain/errors.ts`。
- 新增 `server/src/domain/orderContracts.ts`。
- `errorHandler.ts` 可识别业务错误类并输出稳定错误码。
- 退款和爽约退款处置请求已通过合同解析。

### 阶段 4：已完成首批查询入口

- 新增 `server/src/domain/venueScope.ts`。
- 订单列表、预约列表、预约日历已接入门店数据范围。
- `SUPER_ADMIN`、`ADMIN`、`FINANCE` 全局可见；`MANAGER`、`OPERATOR` 按 `managedVenueIds` 限制；`CUSTOMER` 按本人数据限制。

### 阶段 5：已完成基础记录

- 新增 Prisma model `JobExecutionLog`。
- 新增 migration `20260701093000_add_job_execution_log`。
- 新增 `server/src/jobs/jobRunner.ts`。
- 订单超时、预约生命周期、对账、数据一致性 job 已接入执行记录。

### 阶段 6：已完成最小 CI

- 新增 `.github/workflows/ci.yml`。
- PR 和 main push 触发 server/admin/reservation 三类构建和后端单元测试。
