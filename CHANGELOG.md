# VR Space 预约排场系统 - 更新日志

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
