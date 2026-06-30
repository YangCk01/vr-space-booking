# VR 大空间预约系统 · 单元测试用例方案

> 本方案基于对 `server/`、`app/`、`app/reservation/` 三个包的目录与源码扫描结果编写，用于先建立“高 ROI、低风险”的单元测试基线，再逐步扩展到业务服务层。

---

## 1. 现状快照

| 包 | 当前测试框架 | 已有测试脚本/文件 | 说明 |
|---|---|---|---|
| `server/` | 无 | `test:recon`、`test:finance-summary`（Node 直跑脚本，非单元测试） | 纯后端 API，无 Jest/Vitest/Mocha |
| `app/` | 无 | 无 `test` 脚本，无 `*.test|spec.*` 文件 | 管理后台（Vite + React + TypeScript） |
| `app/reservation/` | 无 | 同上 | C 端小程序/H5（Vite + React + TypeScript） |

**结论**：需从零引入测试框架与目录规范。

---

## 2. 测试框架选型

| 位置 | 推荐框架 | 配套工具 | 理由 |
|---|---|---|---|
| `server/` | **Vitest** | `vitest`、`@vitest/coverage-v8` | TypeScript/ESM 原生支持好，mock Prisma 方便，与前端统一技术栈 |
| `app/`、`app/reservation/` | **Vitest** | `@testing-library/react`、`@testing-library/jest-dom`、`jsdom`、`@testing-library/user-event` | 与 Vite 同生态，支持 `import.meta.env` 和 `@/*` alias |

### 2.1 建议安装的依赖（草稿）

```bash
# server
cd server
npm i -D vitest @vitest/coverage-v8

# admin
cd ../app
npm i -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom

# C 端
cd ../app/reservation
npm i -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

### 2.2 建议新增的脚本

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

## 3. 选模块原则

1. **优先纯函数**：输入输出确定、无 I/O、无副作用，测试最稳定。
2. **优先资金/权益/风控相关逻辑**：金额计算错误直接造成资损，测试 ROI 最高。
3. **避免先测控制器/页面**：Express handler 和页面组件耦合请求/响应/路由/表单，先做集成/E2E 更合适。
4. **可 mock 的外部依赖**：Hooks、Zustand Store、localStorage、axios 拦截器等可用官方工具 mock。

---

## 4. 测试实施阶段

### 第一阶段：纯函数快速建立信心（1~2 天）
只测无外部依赖的工具函数，跑通 CI 与覆盖率基线。

### 第二阶段：业务服务层（2~3 天）
用 mock Prisma client 或内存 SQLite 测服务层核心规则。

### 第三阶段：Hooks / Store / 网络层（2 天）
测状态管理、localStorage 同步、axios 拦截器行为。

### 第四阶段：Controller / 页面（后续按需）
先做接口集成测试与 E2E，最后才考虑把 controller 拆出可测逻辑。

---

## 5. 第一阶段详细测试用例

### 5.1 后端：`server/src/utils/wallet.ts`

| 用例编号 | 目标函数 | 用例名称 | 输入 | 期望输出 | 备注 |
|---|---|---|---|---|---|
| WAL-001 | `getPrincipalRatio` | 本金比例为 0 | `{ principal: 0, bonus: 100 }` | `0` | 总额非 0 |
| WAL-002 | `getPrincipalRatio` | 本金比例为 1（余额为 0 兜底） | `{ principal: 0, bonus: 0 }` | `1` | 避免除 0 |
| WAL-003 | `getPrincipalRatio` | 本金比例为 0.33 并四舍五入 | `{ principal: 1, bonus: 2 }` | `0.33` | 保留两位 |
| WAL-004 | `deductProportional` | 正常等比扣款 | `{ principal: 70, bonus: 30 }`, `totalFen=100` | `{ principalDeduction: 70, bonusDeduction: 30 }` | 总额 100，比例 0.7 |
| WAL-005 | `deductProportional` | 小数扣款的精度修正 | `{ principal: 1, bonus: 2 }`, `totalFen=10` | 两者之和严格等于 `10` | 验证 `principal+bonus=totalFen` |
| WAL-006 | `deductProportional` | 本金不足时向赠金借位 | `{ principal: 10, bonus: 100 }`, `totalFen=50` | 本金扣 10，赠金扣 40 | 边界保护 |
| WAL-007 | `deductProportional` | 赠金不足时向本金借位 | `{ principal: 100, bonus: 10 }`, `totalFen=50` | 赠金扣 10，本金扣 40 | 边界保护 |
| WAL-008 | `deductProportional` | 扣款金额 ≤ 0 返回 0 | 任意钱包，`-10` | `{0,0}` | 防御性输入 |
| WAL-009 | `hasEnoughBalance` | 余额充足 | `{ principal: 50, bonus: 50 }`, `80` | `true` | — |
| WAL-010 | `hasEnoughBalance` | 余额不足 | `{ principal: 10, bonus: 10 }`, `30` | `false` | — |

### 5.2 后端：`server/src/utils/memberConfig.ts`

| 用例编号 | 目标函数 | 用例名称 | 输入 | 期望输出 | 备注 |
|---|---|---|---|---|---|
| MCFG-001 | `unwrap` | 读取 `{ value: raw }` 包装值 | `{ value: [1,2] }` | `[1,2]` | 数据库旧格式兼容 |
| MCFG-002 | `unwrap` | 读取原始值 | `[1,2]` | `[1,2]` | — |
| MCFG-003 | `normalizeLevelKey` | VIP+ 转 VIP_PLUS | `'VIP+'` | `'VIP_PLUS'` | key 兼容 |
| MCFG-004 | `normalizeLevelKey` | 未知 key 原样返回 | `'SVIP'` | `'SVIP'` | — |
| MCFG-005 | `compareLevel` | VIP 高于 MEMBER | `'VIP'`, `'MEMBER'` | `> 0` | 等级排序 |
| MCFG-006 | `compareLevel` | 未知等级返回 0 | `'UNKNOWN'`, `'VIP'` | `0` | 安全降级 |
| MCFG-007 | `getMemberLevels`（mock `getConfig`） | 缺失 names 时回退到默认 | `member_level_names` 为空 | 使用 `DEFAULT_LEVEL_NAMES` | — |
| MCFG-008 | `getMemberLevels`（mock `getConfig`） | discount 为字符串 "90" | 配置返回 `['90']` | 输出 `discount=90` | Number 转换 |

### 5.3 前端（admin）：`app/src/lib/compliance.ts`

| 用例编号 | 目标函数 | 用例名称 | 输入 | 期望输出 | 备注 |
|---|---|---|---|---|---|
| COMP-001 | `computeExpectedRecv` | 折扣后应收 | `originalPrice=100`, `discountBreakdown=[{amount:-10}]`, `platformFee=5`, `gatewayFee=2` | `97` | 公式：原价+折扣合计+费用 |
| COMP-002 | `computeExpectedRecv` | 负数折扣（即优惠） | `discountBreakdown=[{amount:-20}]` | 原价格 - 20 + 费用 | 验证符号处理 |
| COMP-003 | `computeInvoiceAmount` | 价税分离 | `expectedRecv=106` | `100` | 税率 6% |
| COMP-004 | `computeTaxAmount` | 税金计算 | `100` | `6` | — |
| COMP-005 | `formatMoney` | null/undefined/NaN | `null`、`undefined`、`NaN` | `'¥ --'` | 兜底显示 |
| COMP-006 | `formatMoney` | 负数金额 | `-12.5` | `'-¥ 12.50'` | — |
| COMP-007 | `generateVouchers` | 充值场景 | `consumeStatus='recharge'`, `expectedRecv=100`, `assetChange={principal:100,gift:10}` | 含“合同负债-会员本金/赠金”贷方 | — |
| COMP-008 | `generateVouchers` | 退款场景 | `consumeStatus='refunded'`, `originalPrice=100` | 含“主营业务收入”借方冲减 | — |
| COMP-009 | `computeRecordStatus` | 差值在 ±0.01 内为 matched | `actualRecv=100`, `expectedRecv=100.005` | `'matched'` | 浮点容差 |
| COMP-010 | `computeRecordStatus` | 差值 < -0.01 为 short | `actualRecv=99.98`, `expectedRecv=100` | `'short'` | — |
| COMP-011 | `addAuditLog` | 新增日志条目 | 任意 record | `auditLog.length + 1`，且最后一条字段完整 | ID 包含 `LOG-` 前缀 |

### 5.4 前端（C 端）：`app/reservation/src/lib/refund.ts`

| 用例编号 | 目标函数 | 用例名称 | 输入 | 期望输出 | 备注 |
|---|---|---|---|---|---|
| REF-001 | `timeToMinutes` | 09:30 转分钟 | `'09:30'` | `570` | — |
| REF-002 | `minutesToTime` | 5 分钟补零 | `5` | `'00:05'` | — |
| REF-003 | `getRefundInfo` | 无 booking 信息 | `order={}`, `tiers=[]`, `cancelHours=2` | `rate=0`、`canCancel=true` | 防御性 |
| REF-004 | `getRefundInfo` | 距开场 48 小时，匹配最高档位 |  tiers `[{hours:48,rate:100},{hours:12,rate:50}]`，当前距 50h | `rate=1`、`canCancel=true` | 按 hours 降序匹配 |
| REF-005 | `getRefundInfo` | 距开场 8 小时，匹配第二档 | 同上，当前距 8h | `rate=0.5` | — |
| REF-006 | `getRefundInfo` | 距开场 1 小时，不可取消 | `cancelHours=2`，当前距 1h | `canCancel=false`、`isExpired=true` | — |
| REF-007 | `getRefundInfo` | 已开场 | 当前时间 > 开场时间 | deadlineText 包含“已开场” | — |
| REF-008 | `canReschedule` | 已开场 10 分钟且允许开场后改签 | `allowAfterStart=true`, `afterStartMinutes=15` | `true` | — |
| REF-009 | `canReschedule` | 已开场 20 分钟 | `afterStartMinutes=15` | `false` | — |
| REF-010 | `canReschedule` | 非 PAID/READY_TO_VERIFY 状态 | `order.status='PENDING'` | `false` | — |
| REF-011 | `formatAmount` | null 金额 | `null` | `'¥0.00'` | — |
| REF-012 | `formatAmount` | 1000 分 | `1000` | `'¥10.00'` | 分转元 |

### 5.5 前端（公共）：`app/src/lib/utils.ts` 与 `app/reservation/src/lib/utils.ts`

| 用例编号 | 目标函数 | 用例名称 | 输入 | 期望输出 |
|---|---|---|---|---|
| UTIL-001 | `cn` | 空输入 | `cn()` | `''` |
| UTIL-002 | `cn` | 合并条件类名 | `cn('a', { 'b': true, 'c': false })` | `'a b'` |
| UTIL-003 | `cn` | 重复类名被 tailwind-merge 覆盖 | `cn('px-2', 'px-4')` | `'px-4'` |
| UTIL-004 | `cn` | 嵌套数组 | `cn(['a', ['b']])` | `'a b'` |

---

## 6. 第二阶段候选模块（概要）

待第一阶段跑通 CI 后，按以下优先级扩展。

### 后端服务层

| 模块 | 关键测试点 | 依赖处理 |
|---|---|---|
| `server/src/utils/orderNo.ts` | 三种前缀、当日自增、并发重试、maxRetries 抛错 | mock `prisma.orderNoCounter` |
| `server/src/services/configService.ts` | NUMBER/JSON/BOOLEAN/STRING 解析、缓存命中、非法 JSON 兜底 | mock `prisma.systemSetting` |
| `server/src/services/userBenefitService.ts` | 各等级免费改签配额、周期边界、已用完拒绝 | mock `prisma.userBenefitUsage` |
| `server/src/services/riskControlService.ts` | 单日/单次上限、1 分钟 5 次频率、批量上限 | mock `prisma.riskControlLog` |
| `server/src/services/campaignRewardService.ts` | 活动状态/预算/人群/互斥/奖励类型/真实成本修正 | mock Prisma + 时间冻结 |
| `server/src/services/equipmentService.ts` | 可用设备足够时分配、不足抛错、释放设备更新 releasedAt | mock `prisma.equipment` |

### 前端 Hooks / Store

| 模块 | 关键测试点 | 依赖处理 |
|---|---|---|
| `app/src/stores/authStore.ts` | setUser、logout 后状态变化 | 直接调用 store actions |
| `app/src/stores/themeStore.ts` | 系统偏好、toggle、localStorage 持久化 | mock `localStorage` + `matchMedia` |
| `app/reservation/src/lib/selectedVenue.ts` | SSR 安全、非法 JSON 回退、字段兼容、订阅/取消订阅 | mock `window`/`localStorage` |
| `app/src/hooks/use-image-upload.ts` | 选择/移除文件、预览 URL、卸载释放 | `@testing-library/react` + mock `URL.createObjectURL` |

---

## 7. 目录与命名规范

```
server/
  src/
    utils/
      wallet.ts
      wallet.test.ts          # 同目录测试

app/
  src/
    lib/
      compliance.ts
      __tests__/
        compliance.test.ts    # 或同目录 compliance.test.ts

app/reservation/
  src/
    lib/
      refund.ts
      refund.test.ts
```

- 测试文件命名：`{模块名}.test.ts`（或 `.spec.ts`），React 组件/Hook 用 `.test.tsx`。
- 测试函数命名：`describe('目标函数/模块')` + `it('应当...')`。
- 金额测试统一使用“分”作为单位，避免浮点比较。

---

## 8. CI 建议

在根目录或各包目录增加 GitHub Actions workflow：

```yaml
name: Unit Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: cd server && npm ci && npm test
      - run: cd app && npm ci && npm test
      - run: cd app/reservation && npm ci && npm test
```

---

## 9. 下一步行动

1. **确认方案**：确认测试框架（Vitest）与第一阶段模块清单。
2. **安装依赖**：按第 2.1 节在三包中安装 Vitest 及相关工具。
3. **配置 alias/env**：确保 `vite.config.ts`/`vitest.config.ts` 中 `@/*` alias 与 `import.meta.env` 可用。
4. **先写第一批测试**：建议从 `server/src/utils/wallet.test.ts` 和 `app/src/lib/compliance.test.ts` 开始。
5. **跑通 CI**：合并第一批测试后接入 GitHub Actions，设定覆盖率门禁（建议首版 ≥70%）。

---

## 10. 风险与注意点

| 风险 | 说明 | 缓解措施 |
|---|---|---|
| 测试依赖真实数据库 | 服务层测试若连真实 PostgreSQL 会变慢且不稳定 | 使用 Prisma 测试数据库或 mock `prisma` client |
| 时间敏感用例 | `refund.ts`、`campaignRewardService.ts` 依赖 `Date.now()` | 测试中用 `vi.useFakeTimers()` 冻结时间 |
| 浮点金额比较 | 分转元、税率计算易产生 0.01 差值 | 与代码保持一致使用 `toFixed(2)`，或断言差值 `< 0.001` |
| 前端组件渲染成本高 | UI 组件多依赖 Radix/Tailwind，渲染价值低 | 优先测纯函数与 Hooks，UI 留给 E2E |
