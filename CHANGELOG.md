# VR Space 预约排场系统 - 更新日志

## v1.4.0 (2026-06-03)

### 📊 营销效果报表增强

- **活动积分发放统计**：`CouponEffects` 页面 KPI 卡片新增「活动积分发放数」和「活动积分发放人次」
  - 统计范围：`BalanceTransaction.type = 'POINTS_GIFT'` 且排除 `remark` 以 `手动赠送积分` 开头的记录
  - 即包含：批量赠送积分 + 营销活动自动赠送积分
  - 排除：管理员手动单个赠送的积分（视为体验/客诉性质的赠送）
- 后端 `couponEffectController.summary()` 同步查询积分发放数据并返回 `pointsTotal` / `pointsRecipients`

---

### ⚡ 批量操作功能

全平台关键列表页统一支持批量操作，大幅提升运营效率：

| 页面 | 批量操作 |
|------|----------|
| **订单管理** (`Orders.tsx`) | 批量核销 / 批量退款 / 批量取消 |
| **场地管理** (`Venues.tsx`) | 批量删除 / 批量状态变更 |
| **内容管理** (`Games.tsx`) | 批量删除 / 批量状态变更 |
| **会员管理** (`Users.tsx`) | 批量赠送积分 / 批量赠送优惠券 |
| **营销活动** (`Campaigns.tsx`) | 按手机号批量发放奖励 |

- 批量操作后端限制：订单最多 50 条，赠送最多 100 人
- 浮动操作栏设计：选中后底部弹出操作栏，防止误触

---

### 💳 收款与核销体验升级

#### 收款弹窗 (`PaymentModal.tsx`)
- 4 种支付方式选择：微信 / 支付宝 / 现金 / 扫码盒
- **扫码盒模拟器**：`ScanBoxSimulator` 组件实现完整支付流程动画
  - 等待扫码 → 扫码成功 → 处理中 → 支付成功（自动状态流转，带动画效果）

#### 核销扫码 (`VerifyModal.tsx`)
- B 端订单管理新增「扫码核销」入口
- `VerifyScanModal` 组件模拟扫码流程：扫描中 → 已识别 → 核销中 → 核销成功
- C 端订单详情展示入场券二维码

#### C 端二维码 (`SimpleQRCode.tsx`)
- 零依赖 SVG 二维码生成器，基于订单 ID 生成确定性伪随机图案
- 包含 3 个定位角 + 定时图案 + 数据区域

---

### 🎁 批量发放奖励优化

- **用户选择方式**：手机号手动输入 → 用户列表多选（支持全选/清空）
- **赠送原因**：手写备注 → 8 个预设选项下拉选择
  - 会员回馈 / 活动补偿 / 生日福利 / 新用户奖励 / 邀请奖励 / 客服补偿 / 节日活动 / 其他
- 修复 `batchGiftPointsMut.mutationFn` 未传 `reason` 参数的问题
- 发放成功弹窗正确关闭：`reset(); onClose()`

---

### 🎯 营销活动优化

#### 高级设置
- `targetTags` / `excludeTags` 从手动输入改为 6 个标签按钮多选：
  - 新用户 / 首单用户 / 活跃用户 / 沉睡用户 / 流失风险 / VIP 用户

#### 触发规则
- 新增 `TriggerRules` 页面，支持查看和管理营销活动触发规则

---

### 🔧 预约流程优化

- **预约人和电话改为非必填**
  - 前端：去掉 `*` 标记和 `disabled` 校验
  - 后端：`bookingController.ts` 中 `personName` / `personPhone` 从 `notEmpty()` 改为 `optional().isString()`

---

### 🐛 C 端修复

#### 会员显示
- 根因：`enumToConfigKey: { VIP_PLUS: 'VIP+' }` 导致配置匹配失败
- 修复：`Profile.tsx` / `Recharge.tsx` / `MemberBenefits.tsx` 统一使用 `normalizeLevelKey()` 或直接匹配

#### 积分明细
- `AccountRecords.tsx` 新增 `POINTS_REVOKE`（积分收回）类型展示

#### 入场券
- 订单列表点击打开入场券弹窗（显示二维码）

---

### 📈 首页 KPI 修复

- **客单价计算错误**：`avgOrderValue` 后端返回单位为"分"且分母错误
- 改为前端实时计算：`todayRevenue / todayUsed / 100`
- 三个卡片的 `subLabel` 与主指标正确关联

---

### 🌐 局域网多设备访问

- 管理后台 `.env.local` API 地址改为 `192.168.2.200:4000`
- C 端预约已配置局域网 IP
- 支持同局域网内多设备同时访问管理后台和 C 端

---

### 🗄️ 数据清理

- 清理重复积分记录：删除杨文博的 1 笔重复积分记录，扣减 1000 分

---

### 📁 新增文件

| 文件 | 说明 |
|------|------|
| `app/src/components/PaymentModal.tsx` | 收款弹窗 + 扫码盒模拟器 |
| `app/src/components/VerifyModal.tsx` | 核销扫码弹窗 |
| `app/reservation/src/components/SimpleQRCode.tsx` | SVG 二维码生成器 |
| `app/src/pages/CouponEffects.tsx` | 营销效果报表（券效果 + 积分统计） |
| `app/src/pages/Campaigns.tsx` | 营销活动管理（含批量发放） |
| `app/src/pages/TriggerRules.tsx` | 触发规则管理 |
| `app/src/pages/VenueAnalytics.tsx` | 场地分析 |
| `app/src/api/couponEffect.ts` | 券效果报表 API |
| `app/src/api/campaign.ts` | 营销活动 API |
| `app/src/api/triggerRules.ts` | 触发规则 API |
| `app/src/api/venueAnalytics.ts` | 场地分析 API |
| `app/src/components/RolePermissionPanel.tsx` | 角色权限面板 |
| `server/src/services/campaignRewardService.ts` | 营销活动奖励发放服务 |

---

### 🗑️ 删除文件

- （本次无删除文件）

---

## v1.3.0 (2026-06-01)

### 🎁 会员赠送系统（Phase 1-4）

#### 管理员端
- **用户列表**新增「赠送积分 / 赠送优惠券」入口（AlertDialog 选择赠送类型）
- **赠送积分**：支持输入积分数、选择赠送原因（生日礼 / 补偿 / 活动奖励 / 其他）、填写备注
- **赠送优惠券**：支持选择折扣券 / 体验券，设置名称、折扣率、有效期、赠送原因及备注
- **用户详情**新增「赠送记录」Tab，展示积分赠送历史与优惠券赠送历史

#### C 端联动
- **账户明细**新增 `POINTS_GIFT` 类型展示（积分赠送），显示绿色 `+` 图标
- **优惠券钱包**显示来源标签：「管理员赠送」或「积分兑换」
- **积分商城**新增积分兑换实物/虚拟商品功能（`PointsMall` / `MyPointsOrders`）
- **通知系统**新增 `scene_points_gift` / `scene_coupon_gift` 开关，赠送后自动推送消息

#### 数据库变更
- `TransactionType` 枚举新增 `POINTS_GIFT`
- `UserCoupon` 新增 `giftReason`、`giftRemark` 字段
- `DailyFinancialReport` 新增 `pointsGiftCost`、`couponGiftCount`、`experienceGiftCount`、`couponUsedCount`、`experienceUsedCount`

---

### 💰 财务对账完善

#### 积分赠送成本
- `reconcile()` / `runDailyReport()` 支持统计 `POINTS_GIFT` 数据
- 按日对账确权营收表新增「积分赠送成本」
- 总对账累计卡片新增「累计积分赠送成本」
- 负债监控台新增「积分负债池」（实时值）

#### 优惠券 / 体验券流转
- 对账中心新增 4 个单边统计维度：
  - 优惠券发放（管理员赠送折扣券）
  - 体验券发放（管理员赠送体验券）
  - 优惠券核销（折扣券已使用）
  - 体验券核销（体验券已使用）
- 按日对账新增「营销凭证流转」卡片（发放 / 核销）
- 总对账新增「累计营销凭证流转」卡片
- 总对账负债监控台新增「在途折扣券」「在途体验券」（累计值）

#### 对账修复
- `fixReconcileDiff()` 使用 `$transaction` 同时创建流水 + 同步更新用户余额，修复 11 分差异
- `reconcileDetails()` / `fixReconcileDiff()` 支持新券类型查询与差异修复

---

### 📊 订单管理优化

#### 来源筛选
- 订单列表新增 **「全部 | 线上 | 线下」** 来源筛选按钮
  - **线上**：C 端用户自主下单（`source: ONLINE`）
  - **线下**：后台管理员预约排场下单（`source: OFFLINE`）
- 筛选与状态 Tab、搜索、日期范围可任意组合使用
- 导出订单同步带上来源筛选条件

#### Tab 角标修复
- 修复状态 Tab 角标随切换而跳变的 bug：`statusCounts` 查询去掉 `status` 过滤条件，确保全量稳定统计
- 统一所有 Tab 角标样式，激活态高亮、未激活态灰色背景，字号加大至 11px 确保可读

---

### 🔧 余额与折扣修复

#### Admin 预约
- 废弃 `user.balance` 字段，余额显示统一改为 `principalBalance + bonusBalance`
- 预约时 `estimatedAmount` 和余额校验按 `user.level` 折扣率计算
- 订单创建时后端自动根据用户等级计算 `discountRate`

#### User API
- `listUsers()` / `getById()` 返回字段补齐 `principalBalance`、`bonusBalance`

---

### 🏠 首页优化

- 无上期数据时趋势显示 `较昨日 —` 而非 `+0%`
- 营业额保留两位小数（`toFixed(2)`）

---

### 📁 新增文件

| 文件 | 说明 |
|------|------|
| `server/src/controllers/giftController.ts` | 赠送积分/优惠券控制器 |
| `server/src/controllers/pointsController.ts` | 积分商城控制器 |
| `server/src/routes/gift.ts` | 赠送 API 路由 |
| `server/src/routes/points.ts` | 积分商城路由 |
| `app/src/api/gift.ts` | 前端赠送 API 封装 |
| `app/src/api/points.ts` | 前端积分商城 API 封装 |
| `app/reservation/src/pages/PointsMall.tsx` | C 端积分商城 |
| `app/reservation/src/pages/MyPointsOrders.tsx` | C 端积分订单 |
| `docs/reconciliation-design.md` | 财务对账设计文档 |

---

### 🗑️ 删除文件

- `financial_membership_prd.md`
- `会员系统整改方案.md`
- `start-all.bat` / `start-all.sh`
- `stop-all.sh`
