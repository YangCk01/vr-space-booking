# VR Space 架构治理修改报告

## 概览

本次修改把系统中最容易产生线上风险的规则从 controller 中抽离出来，形成一批可测试的业务 Module。重点覆盖线下 VR 场馆的真实履约链路：预约、到店核销、改签差价、退款、爽约处置、门店数据范围、定时任务追踪和 CI 门禁。

本次没有推送 GitHub，没有改测试服启动脚本，没有同步测试服。

## 竞品和线下业务参照

线下 VR 场馆更接近“本地生活预约 + 到店履约 + 卡券核销 + 账务退款”，不是普通商城下单。

- 微盟本地服务/智慧生活方案强调预约管理、约付一体、代客预约、智能排班、会员运营，以及可管控、可核对、可追溯的标准化流程：https://www.weimob.com/
- Xola 的体验/活动预约系统在修改预约时会处理差价，形成待收余额或多收退款；退款支持全额、部分、原支付方式和多支付方式：https://support.xola.com/modifying-purchases 与 https://support.xola.com/refunding-returning-payments-change-guest-quantity
- 抖音生活服务预售券/预约链路区分预约、核销、取消/退款等履约节点：https://developer.open-douyin.com/docs/resource/zh-CN/dop/ability/life-service-ability/life.capacity/ticketbooking.introduce

对应到本系统，订单状态、预约状态、场地排程、核销、爽约、钱包、积分、券和对账必须通过统一规则协作，不能散落在多个 controller 中各算一遍。

## 修改内容

### 1. 订单与预约生命周期

新增文件：

- `server/src/domain/orderLifecycle.ts`
- `server/src/domain/orderLifecycle.test.ts`

接入位置：

- `server/src/controllers/orderController.ts`
- `server/src/controllers/bookingController.ts`
- `server/src/jobs/bookingLifecycleJob.ts`

呈现效果：

- 待核销窗口从一处计算：开场前 `verify_advance_minutes` 到爽约截止前。
- 爽约撤销时不再由 controller 手写状态判断，而是统一恢复到 `PAID/CONFIRMED` 或 `READY_TO_VERIFY/READY`。
- 改签后新场次是否进入待核销窗口，由同一 Module 计算。
- 预约生命周期 job 与人工操作使用同一套时间窗口，降低“job 改一套、controller 改另一套”的风险。

### 2. 钱包账务与退款策略

新增文件：

- `server/src/domain/walletLedger.ts`
- `server/src/domain/walletLedger.test.ts`
- `server/src/domain/refundPolicy.ts`
- `server/src/domain/refundPolicy.test.ts`

接入位置：

- `server/src/utils/wallet.ts`
- `server/src/controllers/orderController.ts`
- `server/src/controllers/bookingController.ts`

呈现效果：

- 余额扣款统一按本金/赠金比例拆分。
- 改签补差价和退差价使用统一账务计算。
- 普通退款、取消退款、爽约退款处置、批量退款使用统一退款策略。
- 余额退款不会超过原本金/赠金扣款口袋，避免赠金、本金错退。
- 在线支付退款不会错误增加本地钱包余额，只记录退款流水。

### 3. 请求合同与业务错误

新增文件：

- `server/src/domain/errors.ts`
- `server/src/domain/errors.test.ts`
- `server/src/domain/orderContracts.ts`
- `server/src/domain/orderContracts.test.ts`

接入位置：

- `server/src/middleware/errorHandler.ts`
- `server/src/utils/response.ts`
- `server/src/controllers/orderController.ts`

呈现效果：

- 新增 `BusinessError`、`ValidationError`、`NotFoundError`、`ForbiddenError`。
- 统一错误中间件可以输出稳定错误码。
- 退款请求和爽约退款处置请求不再直接在 controller 中裸读 `req.body`，而是先经过合同解析。
- 后续可以把更多订单、预约、财务请求逐步迁移到合同解析。

### 4. 门店数据范围

新增文件：

- `server/src/domain/venueScope.ts`
- `server/src/domain/venueScope.test.ts`

接入位置：

- `server/src/controllers/orderController.ts`
- `server/src/controllers/bookingController.ts`

呈现效果：

- `SUPER_ADMIN`、`ADMIN`、`FINANCE` 可看全局数据。
- `MANAGER`、`OPERATOR` 只能看 `managedVenueIds` 内的门店数据。
- `CUSTOMER` 只能看自己的订单/预约数据。
- 订单列表、预约列表、预约日历已接入该规则。
- 如果门店角色请求非授权门店，直接返回空列表，不继续查库。

### 5. 定时任务执行记录

新增文件：

- `server/src/jobs/jobRunner.ts`
- `server/src/jobs/jobRunner.test.ts`
- `server/prisma/migrations/20260701093000_add_job_execution_log/migration.sql`

修改文件：

- `server/prisma/schema.prisma`
- `server/src/jobs/orderTimeoutJob.ts`
- `server/src/jobs/bookingLifecycleJob.ts`
- `server/src/jobs/reconciliationJob.ts`
- `server/src/jobs/dataConsistencyJob.ts`

呈现效果：

- 新增 `JobExecutionLog` 表，记录 job 名称、状态、开始时间、结束时间、耗时、错误信息。
- 订单超时、预约生命周期、对账、数据一致性 job 已接入记录。
- job 自身失败仍会抛出并保留原有日志；记录写入失败不会阻断 job 主流程。

### 6. CI 门禁

新增文件：

- `.github/workflows/ci.yml`

呈现效果：

- PR 和 main push 会运行后端安装、Prisma generate、typecheck、单元测试和 build。
- 管理端和预约端会分别安装依赖并 build。
- schema 变更会通过 CI 的 Prisma generate 暴露问题，减少“改 schema 忘记 generate”的人工提醒风险。

## 测试覆盖

新增测试覆盖：

- 订单生命周期：7 条。
- 钱包账务：6 条。
- 退款策略：8 条。
- 业务错误：4 条。
- 请求合同：4 条。
- 门店数据范围：6 条。
- job 执行记录纯逻辑：4 条。

当前后端单元测试共 39 条。

## 业务效果

- 店员/店长在多门店场景下不会默认看到其他门店数据。
- 到店核销窗口、改签后的状态恢复、爽约撤销状态更一致。
- 退款和改签差价更贴近真实线下经营：多退、错退、本金/赠金错拆的风险降低。
- 退款原因和爽约处置原因更明确，适合后续审批、审计、对账。
- 定时任务失败可以从数据库查执行记录，不只依赖 console。
- 新增代码有单元测试和 CI 门禁，后续重构 controller 的风险下降。

## 后续建议

- 继续把 `orderController.ts` 中支付、退款、核销、团购券预约拆到更深的业务 Module。
- 把 `venueScope` 继续接入财务、设备、对账、会员查询。
- 把 `BusinessError` 推广到更多 controller，减少 `return error(...)` 分支。
- 给 `JobExecutionLog` 增加后台查询页和失败告警。
- 在生产部署流程加入 `prisma migrate deploy`。
