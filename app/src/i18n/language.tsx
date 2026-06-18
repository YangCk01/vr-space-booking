import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type Language = 'zh-CN' | 'en-US' | 'ja-JP'

const STORAGE_KEY = 'vr-language'

const languageLabels: Record<Language, { short: string; label: string }> = {
  'zh-CN': { short: '中', label: '中文' },
  'en-US': { short: 'EN', label: 'English' },
  'ja-JP': { short: '日', label: '日本語' },
}

const en: Record<string, string> = {
  '首页': 'Home',
  '概览': 'Overview',
  '体验': 'Experiences',
  '订单': 'Orders',
  '我的': 'Me',
  '工作台': 'Workspace',
  '首页概览': 'Dashboard',
  '预约与订单': 'Bookings & Orders',
  '预约排场': 'Scheduling',
  '订单管理': 'Order Management',
  '审批中心': 'Approval Center',
  '门店与内容': 'Stores & Content',
  '场地管理': 'Venue Management',
  '内容管理': 'Content Management',
  '会员与营销': 'Members & Marketing',
  '会员管理': 'Member Management',
  '营销活动': 'Campaigns',
  '会员营销': 'Member Marketing',
  '财务与数据': 'Finance & Data',
  '财务管理': 'Finance',
  '数据统计': 'Analytics',
  '数据报表': 'Reports',
  '营销效果': 'Campaign Performance',
  '场地运营': 'Venue Analytics',
  '系统治理': 'System',
  '账号管理': 'Accounts',
  '审计日志': 'Audit Logs',
  '系统设置': 'Settings',
  '版本': 'Version',
  '预约排场系统': 'Booking & Scheduling System',
  '搜索场地、订单、用户': 'Search venues, orders, users',
  '搜索场地、订单、用户...': 'Search venues, orders, users...',
  '刷新数据': 'Refresh data',
  '切换亮色': 'Switch to light mode',
  '切换暗色': 'Switch to dark mode',
  '系统动态': 'System Updates',
  '全部已读': 'Mark all read',
  '清除': 'Clear',
  '暂无新动态': 'No updates',
  '管理员': 'Admin',
  '系统管理员': 'System Admin',
  '个人设置': 'Profile Settings',
  '修改密码': 'Change Password',
  '退出登录': 'Log Out',
  '原密码': 'Current Password',
  '新密码': 'New Password',
  '确认新密码': 'Confirm New Password',
  '取消': 'Cancel',
  '确认修改': 'Confirm',
  '修改中': 'Updating',
  '保存': 'Save',
  '保存中': 'Saving',
  '创建': 'Create',
  '新增': 'Add',
  '编辑': 'Edit',
  '删除': 'Delete',
  '操作': 'Actions',
  '状态': 'Status',
  '全部': 'All',
  '营业中': 'Open',
  '维护中': 'Maintenance',
  '暂停营业': 'Closed',
  '新增场地': 'Add Venue',
  '场地信息、设备状态、可视化管理': 'Venue info, device status and visual management',
  '搜索场地名称': 'Search venue name',
  '搜索场地名称...': 'Search venue name...',
  '场地': 'Venue',
  '面积': 'Area',
  '容量': 'Capacity',
  '设备数': 'Devices',
  '营业时间': 'Business Hours',
  '标题': 'Title',
  '副标题': 'Subtitle',
  '介绍': 'Description',
  '描述': 'Description',
  '须知': 'Notice',
  '介绍图片': 'Intro Images',
  '介绍视频': 'Intro Video',
  '上传图片': 'Upload Image',
  '上传视频': 'Upload Video',
  '替换视频': 'Replace Video',
  '移除': 'Remove',
  '价格': 'Price',
  '时长': 'Duration',
  '标签': 'Tags',
  '排序': 'Sort',
  '上架': 'Active',
  '下架': 'Inactive',
  '封面图': 'Cover Image',
  '上传封面': 'Upload Cover',
  '新增游戏': 'Add Game',
  '编辑游戏': 'Edit Game',
  '游戏内容的增删改查，同步到C端首页': 'Manage game content and sync it to the customer app',
  '搜索游戏标题、标签': 'Search title or tags',
  '暂无游戏内容': 'No games',
  '游戏画面': 'Game Media',
  '选择场次并预订': 'Select Slot & Book',
  '发起拼场': 'Start Group Booking',
  '可拼场': 'Group booking available',
  '拼场规则': 'Rules',
  '热门体验': 'Popular Experiences',
  '查看全部': 'View All',
  '搜索结果': 'Search Results',
  '预约': 'Book',
  '未定位': 'Not Located',
  '消息通知': 'Notifications',
  '暂无通知': 'No notifications',
  '限时特惠': 'Limited Offer',
  'VIP 专属权益': 'VIP Benefits',
  '开通会员，享受每月免费体验名额': 'Become a member and get monthly free experiences',
  '立即开通': 'Join Now',
  '查看详情': 'View Details',
  '选择门店': 'Select Store',
  '获取当前位置': 'Use Current Location',
  '授权定位': 'Allow Location',
  '搜索门店名称或地址': 'Search store name or address',
  '暂无可选门店': 'No stores available',
  '当前': 'Current',
  '可选': 'Available',
  '当前门店': 'Current Store',
  '暂无门店地址': 'No store address',
  '待体验': 'To Experience',
  '待核销': 'To Verify',
  '待支付': 'To Pay',
  '已完成': 'Completed',
  '已取消': 'Cancelled',
  '退款': 'Refund',
  '待使用': 'To Use',
  '会员储值': 'Member Recharge',
  '会员权益': 'Member Benefits',
  '账户明细': 'Account Details',
  '积分商城': 'Points Mall',
  '优惠券': 'Coupons',
  '帮助与反馈': 'Help & Feedback',
  '联系门店': 'Contact Store',
  '首页运营公告': 'Homepage Operations Notice',
  '最新订单': 'Latest Orders',
  '查看订单': 'View Order',
  '安全提示': 'Security Notice',
  '常见问题': 'FAQ',
  '加载中': 'Loading',
  '成功': 'Success',
  '失败': 'Failed',
  '处理中': 'Processing',
  '待处理': 'Pending',
  '待审批': 'Pending Approval',
  '待我审批': 'My Approvals',
  '待发货': 'To Ship',
  '已退款': 'Refunded',
  '已作废': 'Voided',
  '已核销': 'Verified',
  '退款中': 'Refunding',
  '退款失败': 'Refund Failed',
  '申请退款': 'Request Refund',
  '撤销作废': 'Undo Void',
  '标记爽约': 'Mark No-show',
  '核销': 'Verify',
  '收款': 'Collect',
  '催付': 'Payment Reminder',
  '导出': 'Export',
  '导出订单': 'Export Orders',
  '查询': 'Search',
  '按日对账': 'Daily Reconciliation',
  '总对账': 'Overall Reconciliation',
  '对账校验': 'Reconciliation Check',
  '生成报表': 'Generate Report',
  '差异定位': 'Locate Difference',
  '处理完成': 'Completed',
  '浩拓科技': 'Haotuo Tech',
  'VR大空间体验馆': 'VR Space Experience Center',
  '今日运营提醒': 'Today Operations Reminder',
  '重点关注待核销订单、设备状态与退款审批，异常请及时处理。': 'Focus on pending verification orders, device status and refund approvals. Handle exceptions promptly.',
  '核心指标': 'Core Metrics',
  '今日': 'Today',
  '近7天': 'Last 7 Days',
  '近30天': 'Last 30 Days',
  '近90天': 'Last 90 Days',
  '今日预约场次': 'Bookings Today',
  '今日核销场次': 'Verified Today',
  '今日营业额': 'Revenue Today',
  '今日到场人次': 'Arrivals Today',
  '较昨日': 'vs yesterday',
  '营业额按付款时间统计 · 预约/核销按到场日期统计': 'Revenue by payment time · Bookings/verifications by visit date',
  '线上 vs 线下': 'Online vs Offline',
  '线上预约': 'Online Bookings',
  '线下排场': 'Offline Scheduling',
  '今日排场': 'Today Schedule',
  '订单号': 'Order No.',
  '金额': 'Amount',
  '详情': 'Details',
  '未到场': 'No-show',
  '不可预约': 'Unavailable',
  '使用中': 'In Use',
  '实时预约、时段管理、冲突检测': 'Real-time bookings, slot management and conflict detection',
  '日': 'Day',
  '周': 'Week',
  '月': 'Month',
  '新建预约': 'New Booking',
  '今天': 'Today',
  '全部场地': 'All Venues',
  '点击新建': 'Click to create',
  '预约类型': 'Booking Type',
  '团队预约': 'Team Booking',
  '散客预约': 'Individual Booking',
  '企业活动': 'Corporate Event',
  '日期': 'Date',
  '选择场次': 'Select Slot',
  '游戏': 'Game',
  '请选择游戏': 'Select a game',
  '预计金额': 'Estimated Amount',
  '预约人': 'Booker',
  '人数': 'People',
  '联系电话': 'Phone',
  '备注': 'Notes',
  '请输入预约人姓名': 'Enter booker name',
  '请输入手机号': 'Enter phone number',
  '请输入备注信息...': 'Enter notes...',
  '确定预约': 'Confirm Booking',
  '手机号': 'Phone Number',
  '密码': 'Password',
  '请输入密码': 'Enter password',
  '隐藏密码': 'Hide password',
  '显示密码': 'Show password',
  '公司简介': 'Company Profile',
  '运营后台': 'Operations Console',
  '沉浸式门店运营中枢': 'Immersive Store Operations Hub',
  '统一管理预约排场、订单核销、会员权益与财务对账。': 'Manage scheduling, order verification, member benefits and financial reconciliation in one place.',
  '登录管理后台': 'Log in to Admin Console',
  '处理预约、排场、财务与门店运营': 'Handle bookings, scheduling, finance and store operations',
  '测试账号: 13800000000 / admin123': 'Demo account: 13800000000 / admin123',
  '遇到登录问题请联系系统管理员': 'Contact the system admin if you cannot log in',
  '登录后将记录操作审计日志': 'Operations are recorded in audit logs after login',
  '登录': 'Log In',
  '登录中...': 'Logging in...',
  '登录失败': 'Login failed',
  '按场次、门店与状态快速处理订单': 'Process orders by slot, store and status',
  '会员财务': 'Member Finance',
  '余额、积分、退款与对账统一管理': 'Manage balance, points, refunds and reconciliation together',
  '审计留痕': 'Audit Trail',
  '关键操作记录可追溯': 'Key operations are traceable',
}

const ja: Record<string, string> = {
  '首页': 'ホーム',
  '概览': '概要',
  '体验': '体験',
  '订单': '注文',
  '我的': 'マイページ',
  '工作台': 'ワークスペース',
  '首页概览': 'ダッシュボード',
  '预约与订单': '予約と注文',
  '预约排场': '予約管理',
  '订单管理': '注文管理',
  '审批中心': '承認センター',
  '门店与内容': '店舗とコンテンツ',
  '场地管理': '会場管理',
  '内容管理': 'コンテンツ管理',
  '会员与营销': '会員とマーケティング',
  '会员管理': '会員管理',
  '营销活动': 'キャンペーン',
  '会员营销': '会員施策',
  '财务与数据': '財務とデータ',
  '财务管理': '財務管理',
  '数据统计': 'データ分析',
  '数据报表': 'レポート',
  '营销效果': '施策効果',
  '场地运营': '会場運営',
  '系统治理': 'システム',
  '账号管理': 'アカウント',
  '审计日志': '監査ログ',
  '系统设置': '設定',
  '版本': 'バージョン',
  '预约排场系统': '予約スケジュールシステム',
  '搜索场地、订单、用户': '会場、注文、ユーザーを検索',
  '搜索场地、订单、用户...': '会場、注文、ユーザーを検索...',
  '刷新数据': '更新',
  '切换亮色': 'ライトモードへ',
  '切换暗色': 'ダークモードへ',
  '系统动态': 'システム通知',
  '全部已读': 'すべて既読',
  '清除': 'クリア',
  '暂无新动态': '新着なし',
  '管理员': '管理者',
  '系统管理员': 'システム管理者',
  '个人设置': '個人設定',
  '修改密码': 'パスワード変更',
  '退出登录': 'ログアウト',
  '原密码': '現在のパスワード',
  '新密码': '新しいパスワード',
  '确认新密码': '新しいパスワード確認',
  '取消': 'キャンセル',
  '确认修改': '確定',
  '修改中': '変更中',
  '保存': '保存',
  '保存中': '保存中',
  '创建': '作成',
  '新增': '追加',
  '编辑': '編集',
  '删除': '削除',
  '操作': '操作',
  '状态': '状態',
  '全部': 'すべて',
  '营业中': '営業中',
  '维护中': 'メンテナンス',
  '暂停营业': '休業中',
  '新增场地': '会場追加',
  '场地信息、设备状态、可视化管理': '会場情報、設備状態、可視化管理',
  '搜索场地名称': '会場名を検索',
  '搜索场地名称...': '会場名を検索...',
  '场地': '会場',
  '面积': '面積',
  '容量': '定員',
  '设备数': '設備数',
  '营业时间': '営業時間',
  '标题': 'タイトル',
  '副标题': 'サブタイトル',
  '介绍': '紹介',
  '描述': '説明',
  '须知': '注意事項',
  '介绍图片': '紹介画像',
  '介绍视频': '紹介動画',
  '上传图片': '画像アップロード',
  '上传视频': '動画アップロード',
  '替换视频': '動画を差し替え',
  '移除': '削除',
  '价格': '価格',
  '时长': '時間',
  '标签': 'タグ',
  '排序': '並び順',
  '上架': '公開',
  '下架': '非公開',
  '封面图': 'カバー画像',
  '上传封面': 'カバーをアップロード',
  '新增游戏': 'ゲーム追加',
  '编辑游戏': 'ゲーム編集',
  '游戏内容的增删改查，同步到C端首页': 'ゲーム内容を管理し、顧客画面へ同期',
  '搜索游戏标题、标签': 'タイトル・タグを検索',
  '暂无游戏内容': 'ゲームなし',
  '游戏画面': 'ゲーム画面',
  '选择场次并预订': '時間を選んで予約',
  '发起拼场': '相席予約を開始',
  '可拼场': '相席可',
  '拼场规则': 'ルール',
  '热门体验': '人気体験',
  '查看全部': 'すべて見る',
  '搜索结果': '検索結果',
  '预约': '予約',
  '未定位': '未測位',
  '消息通知': '通知',
  '暂无通知': '通知なし',
  '限时特惠': '期間限定',
  'VIP 专属权益': 'VIP特典',
  '开通会员，享受每月免费体验名额': '会員登録で毎月無料体験枠を利用',
  '立即开通': '今すぐ登録',
  '查看详情': '詳細を見る',
  '选择门店': '店舗を選択',
  '获取当前位置': '現在地を取得',
  '授权定位': '位置情報を許可',
  '搜索门店名称或地址': '店舗名または住所を検索',
  '暂无可选门店': '選択可能な店舗なし',
  '当前': '現在',
  '可选': '選択可',
  '当前门店': '現在の店舗',
  '暂无门店地址': '店舗住所なし',
  '待体验': '体験待ち',
  '待核销': '確認待ち',
  '待支付': '支払い待ち',
  '已完成': '完了',
  '已取消': 'キャンセル済み',
  '退款': '返金',
  '待使用': '使用待ち',
  '会员储值': '会員チャージ',
  '会员权益': '会員特典',
  '账户明细': 'アカウント明細',
  '积分商城': 'ポイント交換',
  '优惠券': 'クーポン',
  '帮助与反馈': 'ヘルプ・フィードバック',
  '联系门店': '店舗へ連絡',
  '首页运营公告': 'ホーム運営公告',
  '最新订单': '最新注文',
  '查看订单': '注文を見る',
  '安全提示': 'セキュリティ通知',
  '常见问题': 'よくある質問',
  '加载中': '読み込み中',
  '成功': '成功',
  '失败': '失敗',
  '处理中': '処理中',
  '待处理': '処理待ち',
  '待审批': '承認待ち',
  '待我审批': '自分の承認待ち',
  '待发货': '発送待ち',
  '已退款': '返金済み',
  '已作废': '無効化済み',
  '已核销': '確認済み',
  '退款中': '返金中',
  '退款失败': '返金失敗',
  '申请退款': '返金申請',
  '撤销作废': '無効化取消',
  '标记爽约': '無断キャンセルにする',
  '核销': '確認',
  '收款': '入金',
  '催付': '支払催促',
  '导出': 'エクスポート',
  '导出订单': '注文エクスポート',
  '查询': '検索',
  '按日对账': '日次照合',
  '总对账': '総合照合',
  '对账校验': '照合チェック',
  '生成报表': 'レポート生成',
  '差异定位': '差異特定',
  '处理完成': '処理完了',
  '浩拓科技': '浩拓科技',
  'VR大空间体验馆': 'VR大空間体験館',
  '今日运营提醒': '本日の運営リマインド',
  '重点关注待核销订单、设备状态与退款审批，异常请及时处理。': '確認待ち注文、設備状態、返金承認を重点確認し、異常は速やかに処理してください。',
  '核心指标': '主要指標',
  '今日': '今日',
  '近7天': '直近7日',
  '近30天': '直近30日',
  '近90天': '直近90日',
  '今日预约场次': '本日の予約枠',
  '今日核销场次': '本日の確認数',
  '今日营业额': '本日の売上',
  '今日到场人次': '本日の来場者数',
  '较昨日': '前日比',
  '营业额按付款时间统计 · 预约/核销按到场日期统计': '売上は支払時刻で集計 · 予約/確認は来場日で集計',
  '线上 vs 线下': 'オンライン vs オフライン',
  '线上预约': 'オンライン予約',
  '线下排场': 'オフライン枠',
  '今日排场': '本日のスケジュール',
  '订单号': '注文番号',
  '金额': '金額',
  '详情': '詳細',
  '未到场': '未来場',
  '不可预约': '予約不可',
  '使用中': '使用中',
  '实时预约、时段管理、冲突检测': 'リアルタイム予約、時間帯管理、競合検知',
  '日': '日',
  '周': '週',
  '月': '月',
  '新建预约': '新規予約',
  '今天': '今日',
  '全部场地': 'すべての会場',
  '点击新建': 'クリックして作成',
  '预约类型': '予約タイプ',
  '团队预约': '団体予約',
  '散客预约': '個人予約',
  '企业活动': '企業イベント',
  '日期': '日付',
  '选择场次': '時間枠を選択',
  '游戏': 'ゲーム',
  '请选择游戏': 'ゲームを選択',
  '预计金额': '見積金額',
  '预约人': '予約者',
  '人数': '人数',
  '联系电话': '電話番号',
  '备注': '備考',
  '请输入预约人姓名': '予約者名を入力',
  '请输入手机号': '電話番号を入力',
  '请输入备注信息...': '備考を入力...',
  '确定预约': '予約を確定',
  '手机号': '電話番号',
  '密码': 'パスワード',
  '请输入密码': 'パスワードを入力',
  '隐藏密码': 'パスワードを隠す',
  '显示密码': 'パスワードを表示',
  '公司简介': '会社概要',
  '运营后台': '運営管理',
  '沉浸式门店运营中枢': '没入型店舗運営ハブ',
  '统一管理预约排场、订单核销、会员权益与财务对账。': '予約枠、注文確認、会員特典、財務照合を一元管理します。',
  '登录管理后台': '管理画面にログイン',
  '处理预约、排场、财务与门店运营': '予約、枠管理、財務、店舗運営を処理',
  '测试账号: 13800000000 / admin123': 'テストアカウント: 13800000000 / admin123',
  '遇到登录问题请联系系统管理员': 'ログインできない場合はシステム管理者へ連絡してください',
  '登录后将记录操作审计日志': 'ログイン後の操作は監査ログに記録されます',
  '登录': 'ログイン',
  '登录中...': 'ログイン中...',
  '登录失败': 'ログイン失敗',
  '按场次、门店与状态快速处理订单': '時間枠、店舗、状態別に注文を素早く処理',
  '会员财务': '会員財務',
  '余额、积分、退款与对账统一管理': '残高、ポイント、返金、照合を一元管理',
  '审计留痕': '監査証跡',
  '关键操作记录可追溯': '重要操作を追跡可能',
}

const dictionaries: Record<Exclude<Language, 'zh-CN'>, Record<string, string>> = {
  'en-US': en,
  'ja-JP': ja,
}

Object.assign(en, {
  'VR大空间': 'VR Space',
  '预约排场管理系统': 'Booking & Scheduling System',
  '查看公司简介': 'View Company Profile',
  '查看Company Profile': 'View Company Profile',
  'Scheduling管理系统': 'Booking & Scheduling System',
  '总预约场次': 'Total Bookings',
  '总核销场次': 'Total Verifications',
  '总营业额': 'Total Revenue',
  '总到场人次': 'Total Arrivals',
  '较上期': 'vs previous period',
  '较上期 —': 'vs previous period —',
  '可预约': 'Bookable',
  '总预约': 'Total Bookings',
  '总核销': 'Total Verifications',
  '今日排场 0 场': 'Today Schedule 0 sessions',
  '订单处理、支付管理、退款处理': 'Order processing, payment and refunds',
  '搜索订单号、预约人': 'Search order no. or booker',
  '搜索订单号、预约人...': 'Search order no. or booker...',
  '未付款': 'Unpaid',
  '已付款': 'Paid',
  '游戏中': 'In Game',
  '线上': 'Online',
  '线下': 'Offline',
  '实付': 'Paid',
  '优惠': 'Discount',
  '创建时间': 'Created',
  '预约时间': 'Booking Time',
  '申请处置': 'Request Disposition',
  '撤销作废': 'Undo Void',
  '每页': 'Per Page',
  '条': 'items',
  '记录': 'records',
  '异常退款、资金调整、批量操作审批': 'Exception refunds, fund adjustments and batch approvals',
  '我发起的': 'Created by Me',
  '全部审批': 'All Approvals',
  '已通过': 'Approved',
  '已拒绝': 'Rejected',
  '执行失败': 'Execution Failed',
  '审批类型': 'Approval Type',
  '对象': 'Target',
  '申请人': 'Applicant',
  '时间': 'Time',
  '暂无审批记录': 'No approval records',
  '用户：': 'User:',
  '支付成功': 'Payment Success',
  '预约成功': 'Booking Success',
  '预约目标记为爽约': 'Booking marked no-show',
  '系统自动标记为爽约': 'automatically marked as no-show',
  '已扣除违约金': 'penalty deducted',
  '您的订单': 'Your order',
  '支付': 'Payment',
  '场地名称': 'Venue Name',
  '场地图片': 'Venue Image',
  '设备数量': 'Devices',
  '地址': 'Address',
  '电话': 'Phone',
  '门店微信二维码': 'Store WeChat QR',
  '客服微信二维码': 'Support WeChat QR',
  '地图导航链接': 'Map Navigation Link',
  '暂无导航链接': 'No navigation link',
  '添加导航': 'Add Navigation',
  '点击上传': 'Click to upload',
  '确定': 'Confirm',
  '营业': 'Open',
  '关闭': 'Close',
  '编辑场地': 'Edit Venue',
  '新增场地': 'Add Venue',
  '请输入场地名称': 'Enter venue name',
  '管理游戏内容并同步到C端': 'Manage game content and sync to the customer app',
  '封面': 'Cover',
  '元/人': 'CNY/person',
  '科幻': 'Sci-Fi',
  '射击': 'Shooting',
  '多人': 'Multiplayer',
  '赛车': 'Racing',
  '太空冒险': 'Space Adventure',
  '非洲之旅': 'African Adventure',
  '赛车之旅': 'Racing Adventure',
  '星际远征': 'Star Expedition',
  '未知疆域': 'Unknown Realm',
  '星际远征-未知疆域': 'Star Expedition - Unknown Realm',
  '蛮荒险踪': 'Wildlands Adventure',
  '测试Game': 'Test Game',
  '支持多选上传，图片将展示在C端游戏介绍页面': 'Multiple images can be uploaded and will appear on the customer game detail page',
  '请输入游戏介绍文字，展示在C端【描述】标签页': 'Enter the game description shown in the customer Description tab',
  '请输入游戏须知（如：适合人群、禁忌症、注意事项等），展示在C端【须知】标签页': 'Enter game notices, such as suitable audience, contraindications and precautions, shown in the customer Notice tab',
  '当前视频：': 'Current video:',
  '支持 MP4、WebM、MOV、M4V，最大 300MB；C端详情页会优先展示视频，图片作为补充内容。': 'Supports MP4, WebM, MOV and M4V, up to 300MB. The customer detail page shows video first and images as supplementary media.',
  '用户信息、会员等级、权限管理': 'User info, member levels and permissions',
  '用户总数': 'Total Users',
  '普通会员': 'Regular Member',
  '银卡会员': 'Silver Member',
  '金卡会员': 'Gold Member',
  '钻石会员': 'Diamond Member',
  '会员用户': 'Member Users',
  '搜索用户名、手机号': 'Search user name or phone',
  '搜索用户名、手机号...': 'Search user name or phone...',
  '新增用户': 'Add User',
  '姓名': 'Name',
  '生日': 'Birthday',
  '邮箱': 'Email',
  '不填则默认 123456': 'Leave blank for default 123456',
  '请选择赠送类型': 'Select reward type',
  '赠送积分': 'Gift Points',
  '手动赠送积分到会员账户中': 'Manually add points to the member account',
  '赠送优惠券': 'Gift Coupons',
  '创建体验券或折扣券赠送给会员': 'Create experience coupons or discount coupons for the member',
  '创建和管理营销活动、发放权益': 'Create and manage campaigns and issue rewards',
  '批量发放奖励': 'Batch Issue Rewards',
  '新建活动': 'New Campaign',
  '草稿': 'Draft',
  '进行中': 'In Progress',
  '已暂停': 'Paused',
  '已结束': 'Ended',
  '活动名称': 'Campaign Name',
  '活动类型': 'Campaign Type',
  '类型': 'Type',
  '时间范围': 'Time Range',
  '预算': 'Budget',
  '已消耗': 'Spent',
  '发放/核销': 'Issued/Verified',
  '效果': 'Result',
  '暂停': 'Pause',
  '结束': 'End',
  '复制': 'Copy',
  '注册送体验券': 'Registration Experience Coupon',
  '条件触发': 'Conditional Trigger',
  '开始时间': 'Start Time',
  '结束时间': 'End Time',
  '触发事件': 'Trigger Event',
  '用户注册': 'User Registration',
  '每个用户仅执行一次': 'Run once per user',
  '触发条件': 'Trigger Conditions',
  '执行动作': 'Action',
  '赠送体验券': 'Gift Experience Coupon',
  '积分数': 'Points',
  '发放上限': 'Issue Limit',
  '配置会员等级权益、积分规则、赠送风控和积分商城': 'Configure member benefits, points rules, reward controls and points mall',
  '等级与权益': 'Levels & Benefits',
  '积分规则': 'Points Rules',
  '积分与赠送风控': 'Points & Reward Controls',
  '控制消费积分、积分抵扣和人工赠送上限。赠送上限用于防止误操作或异常批量发放。': 'Control earning points, point deductions and manual reward limits. Reward limits prevent mistakes or abnormal batch issuing.',
  '消费积分比例（每消费1元得X积分）': 'Earning Ratio (X points per CNY 1)',
  '积分抵扣比例（X积分抵扣1元）': 'Deduction Ratio (X points = CNY 1)',
  '单日积分赠送上限': 'Daily Points Gift Limit',
  '单日优惠券赠送上限': 'Daily Coupon Gift Limit',
  '积分商城管理': 'Points Mall Management',
  '商城订单': 'Mall Orders',
  '新增商品': 'Add Product',
  '商品图片': 'Product Image',
  '商品名称': 'Product Name',
  '商品类型': 'Product Type',
  '体验券': 'Experience Coupon',
  '小商品': 'Merchandise',
  '所需积分': 'Points Required',
  '有效期（天）': 'Validity (days)',
  '留空表示永久有效': 'Leave blank for never expires',
  '库存数量（-1表示不限）': 'Stock (-1 for unlimited)',
  '商品描述': 'Product Description',
  '排序权重（数字越小越靠前）': 'Sort Weight (smaller first)',
  '收支概览': 'Finance Overview',
  '收支明细': 'Transactions',
  '退款记录': 'Refund Records',
  '设备日志': 'Device Logs',
  '收支Overview': 'Finance Overview',
  'Refund记录': 'Refund Records',
  '设备Day志': 'Device Logs',
  '近7天营收': 'Last 7 Days Revenue',
  '近7天退款': 'Last 7 Days Refunds',
  '近7天充值': 'Last 7 Days Recharge',
  '近7天营业外收入': 'Last 7 Days Other Income',
  '会员储值概览': 'Member Recharge Overview',
  '近7天储值消费': 'Last 7 Days Stored-value Spending',
  '用户储值总余额': 'Total Stored-value Balance',
  '营收趋势': 'Revenue Trend',
  '收支构成': 'Revenue Composition',
  '全部门店': 'All Stores',
  '成都': 'Chengdu',
  '北京': 'Beijing',
  '未来城市': 'Future City',
  '门店': 'Store',
  '场馆': 'Venue',
})

Object.assign(ja, {
  'VR大空间': 'VR大空間',
  '预约排场管理系统': '予約スケジューリング管理システム',
  '查看公司简介': '会社概要を見る',
  '查看Company Profile': '会社概要を見る',
  'Scheduling管理系统': '予約スケジューリング管理システム',
  '总预约场次': '予約枠合計',
  '总核销场次': '確認済み枠合計',
  '总营业额': '総売上',
  '总到场人次': '来場者合計',
  '较上期': '前期間比',
  '较上期 —': '前期間比 —',
  '可预约': '予約可能',
  '总预约': '予約合計',
  '总核销': '確認合計',
  '今日排场 0 场': '本日の枠 0件',
  '订单处理、支付管理、退款处理': '注文処理、支払管理、返金処理',
  '搜索订单号、预约人': '注文番号・予約者を検索',
  '搜索订单号、预约人...': '注文番号・予約者を検索...',
  '未付款': '未払い',
  '已付款': '支払済み',
  '游戏中': 'プレイ中',
  '线上': 'オンライン',
  '线下': 'オフライン',
  '实付': '実支払',
  '优惠': '割引',
  '创建时间': '作成日時',
  '预约时间': '予約時間',
  '申请处置': '処理申請',
  '每页': '1ページ',
  '条': '件',
  '记录': '記録',
  '异常退款、资金调整、批量操作审批': '例外返金、資金調整、一括操作承認',
  '我发起的': '自分が作成',
  '全部审批': 'すべての承認',
  '已通过': '承認済み',
  '已拒绝': '却下済み',
  '执行失败': '実行失敗',
  '审批类型': '承認タイプ',
  '对象': '対象',
  '申请人': '申請者',
  '时间': '時間',
  '暂无审批记录': '承認記録なし',
  '用户：': 'ユーザー:',
  '支付成功': '支払成功',
  '预约成功': '予約成功',
  '预约目标记为爽约': '予約を無断キャンセルに設定',
  '系统自动标记为爽约': 'システムが無断キャンセルに自動設定',
  '已扣除违约金': '違約金を差し引き済み',
  '您的订单': 'ご注文',
  '场地名称': '会場名',
  '场地图片': '会場画像',
  '设备数量': '設備数',
  '地址': '住所',
  '电话': '電話',
  '门店微信二维码': '店舗WeChat QR',
  '客服微信二维码': 'サポートWeChat QR',
  '地图导航链接': '地図ナビリンク',
  '暂无导航链接': 'ナビリンクなし',
  '添加导航': 'ナビ追加',
  '点击上传': 'クリックしてアップロード',
  '确定': '確定',
  '营业': '営業',
  '关闭': '閉じる',
  '编辑场地': '会場編集',
  '新增场地': '会場追加',
  '请输入场地名称': '会場名を入力',
  '管理游戏内容并同步到C端': 'ゲーム内容を管理し顧客画面へ同期',
  '封面': 'カバー',
  '元/人': '元/人',
  '科幻': 'SF',
  '射击': 'シューティング',
  '多人': 'マルチプレイ',
  '赛车': 'レース',
  '太空冒险': '宇宙冒険',
  '非洲之旅': 'アフリカの旅',
  '赛车之旅': 'レースの旅',
  '星际远征': 'スター遠征',
  '未知疆域': '未知領域',
  '星际远征-未知疆域': 'スター遠征 - 未知領域',
  '蛮荒险踪': '荒野アドベンチャー',
  '测试Game': 'テストゲーム',
  '支持多选上传，图片将展示在C端游戏介绍页面': '複数画像をアップロードでき、顧客側ゲーム詳細に表示されます',
  '请输入游戏介绍文字，展示在C端【描述】标签页': '顧客側「説明」タブに表示するゲーム説明を入力してください',
  '请输入游戏须知（如：适合人群、禁忌症、注意事项等），展示在C端【须知】标签页': '対象者、禁忌、注意事項など、顧客側「注意」タブに表示する内容を入力してください',
  '当前视频：': '現在の動画:',
  '支持 MP4、WebM、MOV、M4V，最大 300MB；C端详情页会优先展示视频，图片作为补充内容。': 'MP4、WebM、MOV、M4V対応、最大300MB。顧客詳細では動画を優先表示し画像は補足として表示します。',
  '用户信息、会员等级、权限管理': 'ユーザー情報、会員ランク、権限管理',
  '用户总数': 'ユーザー合計',
  '普通会员': '通常会員',
  '银卡会员': 'シルバー会員',
  '金卡会员': 'ゴールド会員',
  '钻石会员': 'ダイヤ会員',
  '会员用户': '会員ユーザー',
  '搜索用户名、手机号': 'ユーザー名・電話番号を検索',
  '搜索用户名、手机号...': 'ユーザー名・電話番号を検索...',
  '新增用户': 'ユーザー追加',
  '姓名': '氏名',
  '生日': '誕生日',
  '邮箱': 'メール',
  '不填则默认 123456': '未入力なら既定値 123456',
  '请选择赠送类型': '付与タイプを選択',
  '赠送积分': 'ポイント付与',
  '手动赠送积分到会员账户中': '会員アカウントへ手動でポイント付与',
  '赠送优惠券': 'クーポン付与',
  '创建体验券或折扣券赠送给会员': '体験券または割引券を作成し会員へ付与',
  '创建和管理营销活动、发放权益': 'キャンペーンを作成・管理し特典を配布',
  '批量发放奖励': '一括特典配布',
  '新建活动': 'キャンペーン作成',
  '草稿': '下書き',
  '进行中': '進行中',
  '已暂停': '一時停止',
  '已结束': '終了',
  '活动名称': 'キャンペーン名',
  '活动类型': 'キャンペーンタイプ',
  '类型': 'タイプ',
  '时间范围': '期間',
  '预算': '予算',
  '已消耗': '消費済み',
  '发放/核销': '配布/確認',
  '效果': '効果',
  '暂停': '停止',
  '结束': '終了',
  '复制': 'コピー',
  '注册送体验券': '登録特典体験券',
  '条件触发': '条件トリガー',
  '开始时间': '開始時刻',
  '结束时间': '終了時刻',
  '触发事件': 'トリガーイベント',
  '用户注册': 'ユーザー登録',
  '每个用户仅执行一次': 'ユーザーごとに1回のみ',
  '触发条件': 'トリガー条件',
  '执行动作': '実行アクション',
  '赠送体验券': '体験券付与',
  '积分数': 'ポイント数',
  '发放上限': '配布上限',
  '配置会员等级权益、积分规则、赠送风控和积分商城': '会員特典、ポイントルール、付与制御、ポイント交換を設定',
  '等级与权益': 'ランクと特典',
  '积分规则': 'ポイントルール',
  '积分与赠送风控': 'ポイントと付与制御',
  '控制消费积分、积分抵扣和人工赠送上限。赠送上限用于防止误操作或异常批量发放。': 'ポイント獲得、控除、手動付与上限を制御します。上限は誤操作や異常な一括配布を防ぎます。',
  '消费积分比例（每消费1元得X积分）': '獲得比率（1元消費ごとにXポイント）',
  '积分抵扣比例（X积分抵扣1元）': '控除比率（Xポイント=1元）',
  '单日积分赠送上限': '1日ポイント付与上限',
  '单日优惠券赠送上限': '1日クーポン付与上限',
  '积分商城管理': 'ポイントモール管理',
  '商城订单': 'モール注文',
  '新增商品': '商品追加',
  '商品图片': '商品画像',
  '商品名称': '商品名',
  '商品类型': '商品タイプ',
  '体验券': '体験券',
  '小商品': 'グッズ',
  '所需积分': '必要ポイント',
  '有效期（天）': '有効期間（日）',
  '留空表示永久有效': '空欄なら無期限',
  '库存数量（-1表示不限）': '在庫数（-1は無制限）',
  '商品描述': '商品説明',
  '排序权重（数字越小越靠前）': '並び順（小さいほど前）',
  '收支概览': '収支概要',
  '收支明细': '収支明細',
  '退款记录': '返金記録',
  '设备日志': '設備ログ',
  '收支Overview': '収支概要',
  'Refund记录': '返金記録',
  '设备Day志': '設備ログ',
  '近7天营收': '直近7日売上',
  '近7天退款': '直近7日返金',
  '近7天充值': '直近7日チャージ',
  '近7天营业外收入': '直近7日営業外収入',
  '会员储值概览': '会員チャージ概要',
  '近7天储值消费': '直近7日チャージ消費',
  '用户储值总余额': 'ユーザー残高合計',
  '营收趋势': '売上推移',
  '收支构成': '収支構成',
  '全部门店': '全店舗',
  '成都': '成都',
  '北京': '北京',
  '未来城市': '未来都市',
  '门店': '店舗',
  '场馆': '会場',
})

const zhExact = new Map<string, string>()
Object.entries(en).forEach(([source, target]) => {
  if (!zhExact.has(target)) zhExact.set(target, source)
})
Object.entries(ja).forEach(([source, target]) => {
  if (!zhExact.has(target)) zhExact.set(target, source)
})

const weekdays: Record<Language, Record<string, string>> = {
  'zh-CN': {
    星期日: '星期日',
    星期一: '星期一',
    星期二: '星期二',
    星期三: '星期三',
    星期四: '星期四',
    星期五: '星期五',
    星期六: '星期六',
  },
  'en-US': {
    星期日: 'Sunday',
    星期一: 'Monday',
    星期二: 'Tuesday',
    星期三: 'Wednesday',
    星期四: 'Thursday',
    星期五: 'Friday',
    星期六: 'Saturday',
  },
  'ja-JP': {
    星期日: '日曜日',
    星期一: '月曜日',
    星期二: '火曜日',
    星期三: '水曜日',
    星期四: '木曜日',
    星期五: '金曜日',
    星期六: '土曜日',
  },
}

const shortWeekdays: Record<Language, Record<string, string>> = {
  'zh-CN': {
    周一: '周一',
    周二: '周二',
    周三: '周三',
    周四: '周四',
    周五: '周五',
    周六: '周六',
    周日: '周日',
  },
  'en-US': {
    周一: 'Mon',
    周二: 'Tue',
    周三: 'Wed',
    周四: 'Thu',
    周五: 'Fri',
    周六: 'Sat',
    周日: 'Sun',
  },
  'ja-JP': {
    周一: '月',
    周二: '火',
    周三: '水',
    周四: '木',
    周五: '金',
    周六: '土',
    周日: '日',
  },
}

const monthNames = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  label: (typeof languageLabels)[Language]
  options: Array<{ value: Language; short: string; label: string }>
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function getInitialLanguage(): Language {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved === 'en-US' || saved === 'ja-JP' || saved === 'zh-CN' ? saved : 'zh-CN'
}

function translateValue(value: string, language: Language) {
  if (language === 'zh-CN') return zhExact.get(value) || value
  const dictionary = dictionaries[language]
  if (dictionary[value]) return dictionary[value]
  const chineseSource = zhExact.get(value)
  if (chineseSource && dictionary[chineseSource]) return dictionary[chineseSource]

  let next = value
  next = next.replace(/(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s+(星期[一二三四五六日]))?/g, (_, y, m, d, w) => {
    if (language === 'en-US') return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}${w ? ` ${weekdays[language][w]}` : ''}`
    return `${y}年${m}月${d}日${w ? ` ${weekdays[language][w]}` : ''}`
  })
  next = next.replace(/(\d{4})年(\d{1,2})月/g, (_, y, m) => {
    if (language === 'en-US') return `${monthNames[Number(m)] || m} ${y}`
    return `${y}年${m}月`
  })
  next = next.replace(/(\d{1,2})月(\d{1,2})日/g, (_, m, d) => {
    if (language === 'en-US') return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`
    return `${m}月${d}日`
  })
  next = next.replace(/星期[一二三四五六日]/g, (match) => weekdays[language][match] || match)
  next = next.replace(/周[一二三四五六日]/g, (match) => shortWeekdays[language][match] || match)
  next = next.replace(/(\d+)\s*条记录/g, language === 'en-US' ? '$1 records' : '$1件の記録')
  next = next.replace(/共\s*(\d+)\s*条/g, language === 'en-US' ? '$1 total' : '合計$1件')
  next = next.replace(/共\s*(\d+)\s*位用户/g, language === 'en-US' ? '$1 users total' : '合計$1人のユーザー')
  next = next.replace(/(\d+)\s*场/g, language === 'en-US' ? '$1 sessions' : '$1枠')
  next = next.replace(/(\d+)\s*台/g, language === 'en-US' ? '$1 devices' : '$1台')
  next = next.replace(/(\d+)\s*人次/g, language === 'en-US' ? '$1 visits' : '$1人回')
  next = next.replace(/(\d+)\s*人/g, language === 'en-US' ? '$1 people' : '$1人')
  next = next.replace(/(\d+)\s*个/g, language === 'en-US' ? '$1 items' : '$1件')
  next = next.replace(/(\d+)\s*分钟/g, language === 'en-US' ? '$1 min' : '$1分')
  next = next.replace(/(\d+)\s*积分/g, language === 'en-US' ? '$1 points' : '$1ポイント')
  next = next.replace(/(\d+)\s*张/g, language === 'en-US' ? '$1 coupons' : '$1枚')
  next = next.replace(/(\d+)\s*天/g, language === 'en-US' ? '$1 days' : '$1日')
  next = next.replace(/(\d+)\s*次/g, language === 'en-US' ? '$1 times' : '$1回')
  next = next.replace(/(\d+)\s*㎡/g, language === 'en-US' ? '$1 m²' : '$1㎡')
  next = next.replace(/容纳\s*(\d+)\s*人/g, language === 'en-US' ? 'Capacity $1 people' : '$1人収容')
  next = next.replace(/(团队预约|散客预约|企业活动|维护中)\s*(\d{1,2}:\d{2}-\d{1,2}:\d{2})/g, (_, type, time) => `${dictionary[type] || type} ${time}`)

  const entries = Object.entries(dictionary).sort((a, b) => b[0].length - a[0].length)
  for (const [source, target] of entries) {
    if (!source || source === value || source.length < 2) continue
    next = next.split(source).join(target)
  }

  if (language === 'en-US') {
    const mixedWeekdays: Record<string, string> = { 一: 'Mon', 二: 'Tue', 三: 'Wed', 四: 'Thu', 五: 'Fri', 六: 'Sat', 日: 'Sun' }
    next = next
      .replace(/(\d{1,2})Month(\d{1,2})Day/g, (_, m, d) => `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`)
      .replace(/Week([一二三四五六日])/g, (_, w) => mixedWeekdays[w] || w)
      .replace(/总Book场次/g, 'Total Bookings')
      .replace(/总Verify场次/g, 'Total Verifications')
      .replace(/今日Book场次/g, 'Bookings Today')
      .replace(/今日Verify场次/g, 'Verified Today')
      .replace(/Game中/g, 'In Game')
      .replace(/预计Amount/g, 'Estimated Amount')
      .replace(/Refund处理/g, 'Refund Processing')
      .replace(/Refund记录/g, 'Refund Records')
      .replace(/收支Overview/g, 'Finance Overview')
      .replace(/设备Day志/g, 'Device Logs')
      .replace(/Experiences券/g, 'Experience Coupon')
      .replace(/Coupons券/g, 'Coupon')
      .replace(/GameDescription/g, 'game description')
      .replace(/GameNotice/g, 'game notice')
      .replace(/Member Benefits/g, 'Member Benefits')
      .replace(/Points Mall/g, 'Points Mall')
  }
  return next
}

const textSourceMap = new WeakMap<Text, string>()

function isSkipped(node: Node): boolean {
  if (node instanceof Element) return node.closest('[data-i18n-skip]') !== null
  return node.parentElement?.closest('[data-i18n-skip]') !== null
}

function translateNode(root: Node, language: Language) {
  if (isSkipped(root)) return

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text)

  textNodes.forEach((node) => {
    if (isSkipped(node)) return
    const raw = node.nodeValue || ''
    const trimmed = raw.trim()
    if (!trimmed) return
    const storedSource = textSourceMap.get(node)
    let source = storedSource
    if (!source || trimmed !== translateValue(source, language)) {
      source = trimmed
      textSourceMap.set(node, source)
    }
    const translated = translateValue(source, language)
    const next = raw.replace(trimmed, translated)
    if (node.nodeValue !== next) node.nodeValue = next
  })

  if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) {
    const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll('*'))] : Array.from(root.querySelectorAll('*'))
    elements.forEach((el) => {
      if (el.closest('[data-i18n-skip]')) return
      ;(['placeholder', 'title', 'aria-label'] as const).forEach((attr) => {
        const current = el.getAttribute(attr)
        if (!current) return
        const sourceAttr = `data-i18n-source-${attr}`
        const source = el.getAttribute(sourceAttr) || current
        if (!el.hasAttribute(sourceAttr)) el.setAttribute(sourceAttr, source)
        const translated = translateValue(source, language)
        if (current !== translated) el.setAttribute(attr, translated)
      })
    })
  }
}

function useDomTranslation(language: Language) {
  useEffect(() => {
    document.documentElement.lang = language
    const run = () => translateNode(document.body, language)
    run()
    const observer = new MutationObserver((mutations) => {
      window.requestAnimationFrame(() => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
                translateNode(node.nodeType === Node.TEXT_NODE ? node.parentNode || document.body : (node as Element), language)
              }
            })
          }
          if (mutation.type === 'characterData') translateNode(mutation.target.parentNode || document.body, language)
          if (mutation.type === 'attributes') translateNode(mutation.target as Element, language)
        })
      })
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label'],
    })
    return () => observer.disconnect()
  }, [language])
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage)
  useDomTranslation(language)

  const setLanguage = (next: Language) => {
    localStorage.setItem(STORAGE_KEY, next)
    setLanguageState(next)
    window.dispatchEvent(new CustomEvent('vr-language-change', { detail: next }))
  }

  useEffect(() => {
    const handler = (event: Event) => {
      const next = (event as CustomEvent<Language>).detail
      if (next && next !== language) setLanguageState(next)
    }
    window.addEventListener('vr-language-change', handler)
    return () => window.removeEventListener('vr-language-change', handler)
  }, [language])

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    label: languageLabels[language],
    options: Object.entries(languageLabels).map(([value, item]) => ({
      value: value as Language,
      ...item,
    })),
  }), [language])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
