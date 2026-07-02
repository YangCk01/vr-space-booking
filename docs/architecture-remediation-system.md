# VR Space 架构治理补充方案：API 标准化与系统层基座

## 概览

本方案作为现有架构治理报告的系统层补充，聚焦**API 接口标准化、请求校验规范化、错误处理统一化和 OpenAPI 文档自动化**。不改动任何业务规则，只建立统一的接口契约和基础设施，为后续前端类型生成、集成测试、监控告警、限流防刷打好基础。

本方案不依赖第三方支付接入，不影响现有业务逻辑，可以在当前阶段独立落地。

---

## 现状问题

当前系统后端接口存在以下工程化问题：

1. **响应格式不统一**：部分接口返回 `{ data, message }`，部分直接返回数组或对象，前端需要针对每个接口单独处理。
2. **错误响应不规范**：`error(res, message, status)` 和 `throw new Error` 混用，前端无法稳定解析错误码和错误详情。
3. **输入校验覆盖不全**：只有订单相关请求接入了 `orderContracts.ts`，大量接口仍在 controller 中裸读 `req.query` / `req.body`。
4. **分页格式各自实现**：不同列表接口的返回结构不同，前端分页组件难以复用。
5. **没有 API 版本规划**：所有接口都是 `/api/xxx`，后续破坏性变更难以平滑升级。
6. **没有 API 文档**：34 个 route 没有 OpenAPI/Swagger 文档，新前端或第三方对接成本高。
7. **请求无全局追踪 ID**：日志和错误难以串联到具体请求。

---

## 修改内容

### 1. 统一响应格式

新增文件：

- `server/src/utils/apiResponse.ts`
- `server/src/utils/apiResponse.test.ts`

接入位置：

- `server/src/utils/response.ts`（替换或包装现有 `success` / `error`）
- 所有 controller（逐步迁移）

统一响应结构：

```json
{
  "code": 0,
  "message": "OK",
  "data": {},
  "meta": {
    "requestId": "req_xxx"
  }
}
```

分页响应结构：

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "list": [],
    "total": 100,
    "page": 1,
    "pageSize": 20
  },
  "meta": {
    "requestId": "req_xxx"
  }
}
```

效果：

- 前端可以统一封装 `request().then(res => res.data)`。
- 分页组件可以统一处理 `list/total/page/pageSize`。
- 错误时 `code !== 0`，前端按 code 做统一提示。

---

### 2. 统一错误处理

新增文件：

- `server/src/middleware/errorHandler.ts`（已有，增强）
- `server/src/domain/errors.ts`（已有，增强）
- `server/src/utils/errorCodes.ts`

接入位置：

- `server/src/app.ts` 或入口文件
- 所有 controller（逐步替换 `return error(...)` 为 `throw BusinessError`）

错误响应结构：

```json
{
  "code": 1001,
  "message": "订单不存在",
  "details": {
    "orderId": "VRN202607010001"
  },
  "meta": {
    "requestId": "req_xxx"
  }
}
```

效果：

- 所有错误走统一中间件，输出稳定格式。
- 错误码表集中管理，避免前后端约定散落。
- 支持按错误类型自动映射 HTTP 状态码。

---

### 3. 请求参数运行时校验全覆盖

新增文件：

- `server/src/contracts/common.ts`（通用 schema：分页、日期范围、ID 等）
- `server/src/contracts/venueContract.ts`
- `server/src/contracts/bookingContract.ts`
- `server/src/contracts/userContract.ts`
- `server/src/contracts/financeContract.ts`
- `server/src/middleware/validateRequest.ts`

接入位置：

- `server/src/routes/*.ts`

使用方式：

```ts
router.get('/orders',
  validateRequest({ query: listOrdersSchema }),
  orderController.list
)
```

效果：

- 每个接口的 query/body/params 都有 Zod schema 定义。
- 校验失败自动返回 `ValidationError`，错误信息明确到字段。
- 为后续 OpenAPI 文档自动生成提供 schema 来源。

---

### 4. OpenAPI / Swagger 文档自动生成

新增文件：

- `server/src/openapi/generator.ts`
- `server/src/openapi/registry.ts`
- `server/src/routes/docs.ts`

接入位置：

- `server/src/app.ts`

效果：

- 基于 Zod schema 自动生成 `openapi.json`。
- 访问 `/api/docs` 可查看 Swagger UI。
- 新增/修改接口时文档自动更新，避免文档与代码脱节。

推荐工具：`@asteasolutions/zod-to-openapi`。

---

### 5. API 版本控制

新增文件：

- `server/src/routes/index.ts`（路由注册入口改造）

接入位置：

- `server/src/app.ts`

效果：

- 新接口统一挂载到 `/api/v1/`。
- 现有 `/api/` 路由保持兼容，作为 v0/v1 的别名或逐步迁移。
- 路由注册改为版本化：

```ts
app.use('/api/v1', v1Routes())
app.use('/api', legacyRoutes()) // 兼容旧路径
```

- 后续破坏性变更通过新增 `/api/v2/` 实现，不影响老客户端。

---

### 6. 全局请求 ID

新增文件：

- `server/src/middleware/requestId.ts`
- `server/src/utils/logger.ts`（预留，为后续 pino 做准备）

接入位置：

- `server/src/app.ts`（最外层中间件）

效果：

- 每个请求进入时生成或读取 `x-request-id`。
- 请求 ID 注入到响应头 `x-request-id` 和响应体 `meta.requestId`。
- 后续接入结构化日志时，所有日志都可以按 requestId 串联。

---

### 7. 统一分页/排序/筛选输入

新增文件：

- `server/src/contracts/common.ts` 中的 `paginationSchema`、`sortSchema`、`dateRangeSchema`

效果：

- 所有列表接口统一接收：

```ts
{
  page: 1,
  pageSize: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc',
  keyword: 'xxx',
  startDate: '2026-06-01',
  endDate: '2026-06-30'
}
```

- controller 中使用统一的 `parsePagination(query)` 工具函数。
- 分页 SQL 生成统一用 `skip/take/orderBy` 工具。

---

## 测试覆盖

新增测试覆盖：

- 统一响应格式：4 条。
- 分页响应格式：4 条。
- 错误中间件映射：6 条。
- 请求参数校验中间件：6 条。
- 通用 schema 校验：4 条。
- OpenAPI 文档生成：2 条。
- 请求 ID 中间件：2 条。

预计新增后端单元测试：28 条。

---

## 技术效果

- 所有接口响应格式统一，前端 `request` 封装可以大幅简化。
- 错误处理统一，前端提示更稳定，问题定位更高效。
- 输入校验覆盖全部接口，减少因参数类型错误导致的线上问题。
- 自动生成 OpenAPI 文档，降低前后端沟通成本和第三方对接成本。
- API 版本化，后续破坏性变更可以平滑升级。
- 全局请求 ID 为后续日志、监控、链路追踪打下基础。
- 统一分页/排序/筛选降低 controller 重复代码。

---

## 后续建议

- 完成本方案后，继续推进：**日志结构化（pino/winston）** + **基础性能监控（响应时间、慢查询）**。
- 再推进：**限流 / 防刷 / API 安全加固**（rate-limit、请求签名、敏感接口审计）。
- 再推进：**集成测试框架**（supertest + 测试数据库 + seed 数据）。
- 再推进：**生产部署自动化**（CI 增加 deploy stage，支持测试/生产环境一键部署）。

---

## 不做的范围

- 不改任何业务规则（预约、支付、退款、核销等）。
- 不改任何数据库 schema。
- 不接入真实支付渠道。
- 不增加新的业务功能。
- 不替换现有日志库（只预留 requestId 和 logger 接口）。
