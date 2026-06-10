# 版本功能核对清单 v1.5.x

> 版本范围：`c63cd9b` (v1.5.0) → `2afe028` (当前)  
> 生成日期：2026-06-04  
> 用途：逐项核对功能是否正常生效

---

## 一、版本概览

| 项目 | 内容 |
|------|------|
| 起始版本 | v1.5.0 (订单超时 + C端账户安全) |
| 当前版本 | v1.5.2 (系统设置全链路核查) |
| 提交数 | 33 个 commits |
| 功能模块 | 7 大模块 |

---

## 二、No-Show 生命周期（爽约处理）

### 2.1 功能概述

当顾客预约后未按时到场，系统自动或手动将订单标记为「已作废/爽约」(NO_SHOW)，并根据配置扣除一定比例的违约金。

完整状态流转：
```
PAID（已付款）
  ↓ 开场前 verify_advance_minutes 分钟
READY_TO_VERIFY（待核销）
  ↓ 店长核销 / 顾客签到
CHECKED_IN（已签到）
  ↓ 开场时间到达
PLAYING（游戏中）
  ↓ 游戏结束
COMPLETED（已完成）

异常分支：
CONFIRMED / READY →（开场 + noShowDeadlineMinutes 未到场）→ NO_SHOW（已作废）
```

### 2.2 数据库 Schema 变更

**新增字段：**

| 表 | 字段 | 类型 | 说明 |
|---|---|---|---|
| Booking | `checkedInAt` | DateTime? | 顾客签到时间 |
| Booking | `playingStartedAt` | DateTime? | 游戏开始时间 |
| Booking | `playingEndedAt` | DateTime? | 游戏结束时间 |
| Booking | `noShowAt` | DateTime? | 标记爽约时间 |
| Order | `noShowAt` | DateTime? | 标记爽约时间 |
| Order | `noShowReason` | String? | 爽约原因（auto / manual） |
| Order | `penaltyAmount` | Int? | 违约金金额（分） |

### 2.3 生命周期定时任务

**文件：** `server/src/jobs/bookingLifecycleJob.ts`

每分钟执行一次，自动处理以下状态流转：

#### ① PAID → READY_TO_VERIFY（开场前待核销）

| 配置项 | 说明 |
|--------|------|
| `verify_advance_minutes` | 开场前多少分钟订单变为「待核销」 |
| 默认值 | 15 分钟 |

**效果：**
- 顾客在开场前 15 分钟会收到通知，订单状态变为「待核销」
- 店长端此时可以开始核销

**验证方法：**
```bash
# 查看数据库中预约状态
SELECT id, status, date, startTime FROM Booking 
WHERE status = 'READY' AND date >= CURRENT_DATE;
```

#### ② CHECKED_IN → PLAYING（开场时间到达）

| 配置项 | 说明 |
|--------|------|
| `late_buffer_minutes` | 开场后多少分钟内仍可入场 |
| 默认值 | 10 分钟 |

**效果：**
- 顾客签到后（CHECKED_IN），开场时间到达自动变为 PLAYING
- 如果开场后超过 `late_buffer_minutes` 仍未签到，不能再进入 PLAYING 状态

**验证方法：**
1. 创建一个开场时间为「当前时间 + 5 分钟」的预约
2. 店长在后台点击「签到」
3. 等待 5 分钟后，查看 Booking 状态是否变为 PLAYING

#### ③ PLAYING → COMPLETED（游戏结束）

| 配置项 | 说明 |
|--------|------|
| `allowOvertime` | 是否允许延长游戏时间 |
| `overtimeMinutes` | 可延长时长（分钟） |
| `Game.duration` | 游戏标准时长（从内容管理读取） |

**计算公式：**
```
结束时间 = 开场时间 + Game.duration + (allowOvertime ? overtimeMinutes : 0)
```

**效果：**
- 如果 `allowOvertime = false`：游戏达到标准时长后自动结束
- 如果 `allowOvertime = true`：游戏达到标准时长后，还可继续玩 `overtimeMinutes` 分钟
- **无关联游戏的预约不会自动结束**，需店长手动标记完成

**验证方法：**
1. 在内容管理中设置某游戏的 `duration = 30`（分钟）
2. 创建该游戏的预约，开场时间设为当前时间
3. 等待 30 分钟后，查看订单是否自动变为 COMPLETED

#### ④ 自动标记爽约（NO_SHOW）

| 配置项 | 说明 |
|--------|------|
| `enable_auto_no_show` | 是否开启自动标记爽约 |
| `no_show_deadline_minutes` | 开场后多久未到场自动标记为爽约 |
| `no_show_penalty_rate` | 爽约违约金比例（%） |
| 默认值 | true / 15 分钟 / 100% |

**效果：**
- 开场后超过 `no_show_deadline_minutes` 仍未签到，系统自动标记为 NO_SHOW
- 根据 `no_show_penalty_rate` 计算违约金（100% = 不退款）
- 生成财务流水记录（类型：NO_SHOW_PENALTY）

**验证方法：**
```bash
# 查看自动标记的爽约订单
SELECT id, status, noShowAt, penaltyAmount FROM "Order" 
WHERE status = 'NO_SHOW' AND noShowReason = 'auto';
```

### 2.4 预约提醒定时任务

**文件：** `server/src/jobs/bookingReminderJob.ts`

每 5 分钟执行一次，自动发送提醒通知：

| 提醒类型 | 触发条件 | 效果 |
|---------|---------|------|
| 开场前 2 小时 | `开场时间 - 2小时 ≤ 当前时间 < 开场时间 - 1小时55分` | 推送「您的预约即将开始」通知 |
| 开场前 15 分钟 | `开场时间 - 15分钟 ≤ 当前时间 < 开场时间 - 10分钟` | 推送「请尽快到场」通知 |
| 紧急提醒 | `开场时间 - 5分钟 ≤ 当前时间 < 开场时间` | 推送「您的预约马上开始」通知 |

**验证方法：**
1. 创建一个开场时间为「当前时间 + 2 小时 3 分钟」的预约
2. 等待 3 分钟后，查看推送通知是否发送
3. 检查 `sentReminders` 去重逻辑（同一预约同一类型只提醒一次）

### 2.5 管理后台订单状态支持

**文件：** `app/src/pages/Orders.tsx` 及相关组件

新增订单状态：

| 状态 | 标签 | 颜色 | 操作 |
|------|------|------|------|
| PAID | 已付款 | 蓝色 | 核销、标记爽约 |
| READY_TO_VERIFY | 待核销 | 紫色 | 核销、签到、标记爽约 |
| PLAYING | 游戏中 | 绿色 | 标记完成、标记爽约 |
| NO_SHOW | 已作废 | 灰色 | 手动激活（恢复为已完成） |

**新增操作按钮：**
- **签到**：将 PAID/READY_TO_VERIFY 订单标记为 CHECKED_IN
- **标记爽约**：将 PAID/READY_TO_VERIFY/PLAYING 订单标记为 NO_SHOW
- **手动激活**：将 NO_SHOW 订单恢复为 COMPLETED（仅限店长操作）

**使用方法：**
1. 进入管理后台 → 订单管理
2. 找到目标订单，点击「更多操作」下拉菜单
3. 根据订单状态选择对应操作

### 2.6 C端订单状态展示

**文件：** `app/reservation/src/pages/Orders.tsx`

C端订单列表和详情页适配新状态：

| 状态 | C端显示 | 说明 |
|------|---------|------|
| READY_TO_VERIFY | 待核销 | 可出示二维码核销 |
| PLAYING | 游戏中 | 游戏进行中 |
| NO_SHOW | 已作废 | 超时未到场，订单已作废 |

**效果：**
- 订单状态标签颜色与后台保持一致
- NO_SHOW 订单显示违约金信息（如"违约金 ¥100.00"）

### 2.7 排场日历适配

**文件：** `app/src/pages/Schedule.tsx`

| 功能 | 说明 |
|------|------|
| 颜色区分 | NO_SHOW 状态使用灰色显示，与 COMPLETED 区分 |
| 不占位释放 | NO_SHOW 预约在日历中不占可用时段，释放给其他顾客预约 |

### 2.8 财务总览

**文件：** `app/src/pages/Finance.tsx`

新增「No-Show 违约金」统计：
- 今日 / 本周 / 本月的爽约违约金总额
- 爽约订单数统计

---

## 三、系统设置（预约配置）

### 3.1 配置项总览

**文件：** `app/src/pages/Settings.tsx`（管理后台 → 系统设置 → 预约设置）

| # | 配置项 | 数据库 Key | 默认值 | 生效位置 |
|---|--------|-----------|--------|---------|
| 1 | 可提前预约天数 | `booking_advance_days` | 7 | 创建预约时校验 |
| 2 | 取消预约时限（小时） | `booking_cancel_hours` | 2 | 后端取消 API + C端展示 |
| 3 | 阶梯式退款规则 | `booking_refund_tiers` | 2档 | 取消时计算退款比例 |
| 4 | 允许延长游戏时间 | `booking_allow_overtime` | false | 游戏结束时间计算 |
| 5 | 可延长时长（分钟） | `booking_overtime_minutes` | 10 | 游戏结束时间计算 |
| 6 | 开场前进入待核销（分钟） | `verify_advance_minutes` | 15 | 生命周期定时任务 |
| 7 | 迟到宽限期（分钟） | `late_buffer_minutes` | 10 | CHECKED_IN→PLAYING |
| 8 | 最大缓冲期/自动作废（分钟） | `no_show_deadline_minutes` | 15 | 自动标记爽约 |
| 9 | 爽约违约金比例（%） | `no_show_penalty_rate` | 100 | 爽约时扣除比例 |
| 10 | 自动标记爽约 | `enable_auto_no_show` | true | 是否执行自动爽约 |

### 3.2 配置保存方式

**管理后台保存：**
- 路径：管理后台 → 系统设置 → 预约设置
- 点击「保存设置」按钮，一次性保存所有配置
- 数据存入 `SystemSetting` 表，category = 'booking'

**数据格式：**
```json
{
  "key": "booking_cancel_hours",
  "value": 2,
  "category": "booking"
}
```

### 3.3 配置读取方式

**后端读取：** 直接从 `SystemSetting` 表读取，兼容两种格式：
- 原始值：`value: 2`
- 包装值：`value: { value: 2 }`

**C端读取：** 通过公开 API：
```bash
GET /api/settings/refund-rules   → { tiers, cancelHours }
GET /api/settings/booking-config  → { advanceDays }
```

### 3.4 阶梯式退款规则

**配置方法：**
1. 进入管理后台 → 系统设置 → 预约设置
2. 在「阶梯式退款规则」区域点击「添加档位」
3. 设置每档的：距开场时间（小时）、退款比例（%）、说明标签

**默认档位：**

| 距开场时间 | 退款比例 | 说明 |
|-----------|---------|------|
| ≥ 24 小时 | 100% | 开场24小时前 |
| ≥ 2 小时 | 50% | 开场2-24小时 |
| < cancelHours | 0% | 不可取消（由取消时限控制） |

**C端展示效果：**
- 用户点击「取消订单」时，弹窗显示当前可退金额
- 根据距离开场时间自动匹配对应档位
- 如果距离开场时间 ≤ cancelHours，显示「不可取消」

### 3.5 取消预约时限校验

**后端校验逻辑：**
```
if (距开场时间 <= cancelHours) {
  return 错误: "开场前X小时内不可取消"
}
```

**C端展示逻辑：**
- 距离开场时间 > cancelHours：显示「确认取消」按钮，计算退款金额
- 距离开场时间 ≤ cancelHours：按钮禁用，显示「不可取消」

---

## 四、审计日志优化

### 4.1 全面中文化

**文件：** `server/src/utils/auditLogger.ts`

所有审计内容翻译为中文：

| 类型 | 英文（旧） | 中文（新） |
|------|-----------|-----------|
| 操作类型 | CREATE | 创建 |
| 操作类型 | UPDATE | 修改 |
| 操作类型 | DELETE | 删除 |
| 操作类型 | LOGIN | 登录 |
| 操作对象 | Order | 订单 |
| 操作对象 | User | 用户 |
| 操作对象 | Venue | 场地 |

### 4.2 易读性优化

**数值转换：**
- 金额（分）→ 元：`10000` → `¥100.00`
- 比例（整数）→ 百分比：`100` → `100%`
- 布尔值 → 是/否：`true` → `是`

**变更摘要格式：**
```
旧: ¥100.00 → 新: ¥80.00
旧: 已付款 → 新: 已完成
旧: 100% → 新: 50%
```

### 4.3 使用方法

1. 进入管理后台 → 审计日志
2. 查看「变更摘要」列，直接看到可读的中文变更内容
3. 支持按操作类型、操作对象、操作人筛选

---

## 五、系统健康检查

### 5.1 功能概述

管理后台可查看系统运行状态，包括定时任务执行情况、异常统计等。

**文件：**
- 后端：`server/src/controllers/healthController.ts`
- 前端：`app/src/pages/HealthCheck.tsx`

### 5.2 修复内容

| 修复项 | 说明 |
|--------|------|
| API 路径错误 | 修复 stats/run 路由 404 |
| 页面中文化 | 所有英文状态翻译为中文 |
| 异常详情 | 展示异常堆栈和原因 |
| 格式兼容 | 兼容旧格式响应，stats 字段默认值 |

### 5.3 使用方法

1. 进入管理后台 → 系统健康
2. 查看「定时任务状态」卡片
3. 点击「查看详情」查看每次执行的异常信息

---

## 六、营销 & 财务

### 6.1 账号管理修复

**文件：** `app/src/pages/Accounts.tsx`

| 修复项 | 说明 |
|--------|------|
| 编辑保存失败 | 修复保存时参数丢失问题 |
| ADMIN 角色支持 | 支持创建/编辑 ADMIN 角色账号 |
| SUPER_ADMIN 保护 | 禁止编辑/删除超级管理员账号 |
| 白屏修复 | 补全 useMemo 导入，修复页面白屏 |

### 6.2 营销效果报表

**文件：** `app/src/pages/CampaignEffects.tsx`

- KPI 卡片改为两排展示，适配小屏幕

### 6.3 券折让成本修复

**文件：** `server/src/controllers/orderController.ts`

**问题：** 余额支付订单未记录 `usedOrderId`，导致券折让成本统计为 0。

**修复：** 余额支付时正确记录 `usedOrderId`。

**验证方法：**
```sql
SELECT usedOrderId, couponDiscount FROM "Order" 
WHERE payMethod LIKE 'BALANCE%' AND couponDiscount > 0;
```

### 6.4 场地运营分析

**文件：** `app/src/pages/VenueAnalytics.tsx`

新增筛选功能：
- 「当天」快捷按钮：一键查看今日数据
- 自定义日期范围：选择任意起始和结束日期

---

## 七、C端体验优化

### 7.1 注册页

**文件：** `app/reservation/src/pages/Register.tsx`

- 生日字段位置调整，更合理的表单布局

### 7.2 支付弹窗

**文件：** `app/reservation/src/components/PaymentModal.tsx`

- 文案优化，支付流程更清晰的说明

### 7.3 余额显示

**文件：** `app/reservation/src/pages/Profile.tsx`

- 修复余额显示精度问题

### 7.4 订单确认页重要提示

**文件：** `app/reservation/src/pages/BookingConfirm.tsx`

新增「重要提示」模块，展示：
- 开场前可取消时间
- 迟到后果说明
- 退款规则摘要

---

## 八、管理后台体验优化

### 8.1 表格列宽优化

**涉及页面：**
- 订单管理
- 用户管理
- 场地管理
- 财务管理

**优化内容：**
- 状态列固定宽度，避免挤压
- 操作列按钮间距调整
- 小屏幕下横向滚动更顺畅

### 8.2 会员等级 Badge

**文件：** `app/src/components/MemberBadge.tsx`

- 强制不换行，避免布局错乱

---

## 九、测试验证清单

### 9.1 No-Show 生命周期验证

- [ ] 创建预约，开场前 `verify_advance_minutes` 分钟自动变为 READY_TO_VERIFY
- [ ] 店长点击「签到」，订单变为 CHECKED_IN
- [ ] 开场时间到达，订单自动变为 PLAYING
- [ ] 游戏达到 `Game.duration` 后自动变为 COMPLETED（无游戏关联的不自动结束）
- [ ] 开场后 `noShowDeadlineMinutes` 未签到，自动变为 NO_SHOW
- [ ] NO_SHOW 订单正确计算违约金
- [ ] 店长可将 NO_SHOW 订单手动激活为 COMPLETED
- [ ] 排场日历中 NO_SHOW 不占位释放

### 9.2 系统设置验证

- [ ] 修改「可提前预约天数」→ C端日期选择限制生效
- [ ] 修改「取消预约时限」→ 距离开场X小时内不可取消
- [ ] 修改「阶梯退款规则」→ 取消时按新规则计算退款
- [ ] 修改「允许延长游戏时间」→ PLAYING 结束时间正确计算
- [ ] 修改「迟到宽限期」→ 开场后X分钟内仍可入场
- [ ] 修改「爽约违约金比例」→ NO_SHOW 扣除比例正确

### 9.3 预约提醒验证

- [ ] 开场前 2 小时收到提醒推送
- [ ] 开场前 15 分钟收到提醒推送
- [ ] 同一预约不重复发送同一类型提醒

### 9.4 审计日志验证

- [ ] 操作类型显示中文（创建/修改/删除）
- [ ] 变更摘要显示可读格式（金额转元、比例转百分比）
- [ ] 变更摘要不为空

---

## 十、已移除功能

| 功能 | 移除原因 | 替代方案 |
|------|---------|---------|
| `playing_duration_minutes` 全局配置 | 每个游戏时长不同，不能统一设置 | 从内容管理 `Game.duration` 读取 |
| `enable_standby_conversion` 候补票开关 | 无后端实现 | 暂不支持候补票功能 |

---

## 附录：涉及文件汇总

### 后端文件

```
server/src/controllers/settingsController.ts
server/src/controllers/orderController.ts
server/src/controllers/bookingController.ts
server/src/controllers/campaignController.ts
server/src/controllers/healthController.ts
server/src/jobs/bookingLifecycleJob.ts
server/src/jobs/bookingReminderJob.ts
server/src/jobs/triggerJob.ts
server/src/routes/settings.ts
server/src/services/authService.ts
server/src/utils/seed.ts
server/src/utils/auditLogger.ts
server/prisma/schema.prisma
```

### 前端文件（管理后台）

```
app/src/pages/Settings.tsx
app/src/pages/Orders.tsx
app/src/pages/Schedule.tsx
app/src/pages/Finance.tsx
app/src/pages/HealthCheck.tsx
app/src/pages/Accounts.tsx
app/src/pages/CampaignEffects.tsx
app/src/pages/VenueAnalytics.tsx
app/src/pages/Campaigns.tsx
app/src/components/MemberBadge.tsx
app/src/api/client.ts
app/src/lib/imageUrl.ts
```

### 前端文件（C端）

```
app/reservation/src/pages/Orders.tsx
app/reservation/src/pages/VenueDetail.tsx
app/reservation/src/pages/BookingConfirm.tsx
app/reservation/src/pages/Register.tsx
app/reservation/src/pages/Profile.tsx
app/reservation/src/api/settings.ts
app/reservation/src/api/client.ts
app/reservation/src/lib/imageUrl.ts
app/reservation/src/components/PaymentModal.tsx
```
