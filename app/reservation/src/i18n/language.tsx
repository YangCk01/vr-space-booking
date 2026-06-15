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
  '体验': 'Experiences',
  '订单': 'Orders',
  '我的': 'Me',
  '未定位': 'Not Located',
  '消息通知': 'Notifications',
  '全部已读': 'Mark all read',
  '清除': 'Clear',
  '暂无通知': 'No notifications',
  '暂无游戏内容': 'No games',
  '限时特惠': 'Limited Offer',
  '全场体验项目最高 30% OFF': 'Up to 30% OFF all experiences',
  'VIP 专属权益': 'VIP Benefits',
  '开通会员，享受每月免费体验名额': 'Become a member and get monthly free experiences',
  '立即开通': 'Join Now',
  '热门体验': 'Popular Experiences',
  '查看全部': 'View All',
  '搜索结果': 'Search Results',
  '预约': 'Book',
  '查看详情': 'View Details',
  '选择门店': 'Select Store',
  '选择后会自动保存，下次打开直接使用。': 'Your selection will be saved for next time.',
  '获取当前位置': 'Use Current Location',
  '授权定位': 'Allow Location',
  '搜索门店名称或地址': 'Search store name or address',
  '暂无可选门店': 'No stores available',
  '当前': 'Current',
  '可选': 'Available',
  '当前门店': 'Current Store',
  '暂无门店地址': 'No store address',
  '游戏详情': 'Game Details',
  '游戏画面': 'Game Media',
  '描述': 'Description',
  '须知': 'Notice',
  '暂无须知内容': 'No notice yet',
  '选择场次并预订': 'Select Slot & Book',
  '发起拼场': 'Start Group Booking',
  '可拼场': 'Group booking available',
  '拼场规则': 'Rules',
  '沉浸式 VR 大空间体验': 'Immersive VR large-space experience',
  '我的订单': 'My Orders',
  '待体验': 'To Experience',
  '待核销': 'To Verify',
  '待支付': 'To Pay',
  '已完成': 'Completed',
  '已取消': 'Cancelled',
  '退款': 'Refund',
  '待使用': 'To Use',
  '再次预约': 'Book Again',
  '取消预约': 'Cancel',
  '查看凭证': 'View Voucher',
  '评价': 'Review',
  '会员储值': 'Member Recharge',
  '会员权益': 'Member Benefits',
  '账户明细': 'Account Details',
  '积分商城': 'Points Mall',
  '优惠券': 'Coupons',
  '帮助与反馈': 'Help & Feedback',
  '联系门店': 'Contact Store',
  '退出登录': 'Log Out',
  '余额': 'Balance',
  '积分': 'Points',
  '会员等级': 'Member Level',
  '语言': 'Language',
  '搜索': 'Search',
  '搜索 VR 体验项目...': 'Search VR experiences...',
  '今天': 'Today',
  '明天': 'Tomorrow',
  '后天': 'After Tomorrow',
  '选择日期': 'Select Date',
  '场次状态': 'Slot Status',
  '预订': 'Book',
  '拼场': 'Join',
  '已约': 'Booked',
  '剩': 'Left',
  '支付方式': 'Payment Method',
  '余额支付': 'Balance',
  '微信支付': 'WeChat Pay',
  '支付宝': 'Alipay',
  '确认支付': 'Confirm Payment',
  '取消订单': 'Cancel Order',
  '确认取消': 'Confirm Cancel',
  '保留订单': 'Keep Order',
  '返回订单列表': 'Back to Orders',
  '该订单已过期或已取消': 'This order has expired or been cancelled',
  '该订单已支付': 'This order has been paid',
  '预约改签': 'Reschedule Booking',
  '确认改签': 'Confirm Reschedule',
  '改签说明': 'Reschedule Notes',
  '全部': 'All',
  '已退款': 'Refunded',
  '待评价': 'To Review',
  '充值': 'Recharge',
  '立即充值': 'Recharge Now',
  '当前等级': 'Current Level',
  '等级体系': 'Level System',
  '当前权益': 'Current Benefits',
  '免费改签': 'Free Reschedule',
  '消费折扣': 'Discount',
  '积分回馈': 'Points Reward',
  '返回': 'Back',
  '返回首页': 'Back to Home',
  '返回个人中心': 'Back to Profile',
  '订单信息': 'Order Info',
  '订单金额': 'Order Amount',
  '订单支付': 'Order Payment',
  '订单已过期': 'Order Expired',
  '订单已取消': 'Order Cancelled',
  '订单已退款': 'Order Refunded',
  '订单已作废': 'Order Voided',
  '继续支付': 'Continue Payment',
  '不使用优惠券': 'No Coupon',
  '会员优惠': 'Member Discount',
  '会员优惠金额': 'Member Discount',
  '可用积分': 'Available Points',
  '积分明细': 'Points Details',
  '积分获取': 'Points Earned',
  '积分收回': 'Points Recovered',
  '积分消费': 'Points Spent',
  '充值记录': 'Recharge Records',
  '充值金额': 'Recharge Amount',
  '充值成功': 'Recharge Successful',
  '充值失败': 'Recharge Failed',
  '到账金额': 'Received Amount',
  '当前余额': 'Current Balance',
  '当前积分': 'Current Points',
  '当前手机号': 'Current Phone',
  '旧密码': 'Old Password',
  '新密码': 'New Password',
  '确认新密码': 'Confirm New Password',
  '密码修改成功': 'Password changed successfully',
  '两次输入的新密码不一致': 'The new passwords do not match',
  '密码至少': 'Password must be at least',
  '加载中': 'Loading',
  '操作失败': 'Operation failed',
  '更新失败': 'Update failed',
  '兑换': 'Redeem',
  '立即兑换': 'Redeem Now',
  '兑换成功': 'Redeemed',
  '兑换失败': 'Redeem failed',
  '兑换中': 'Redeeming',
  '库存不足': 'Insufficient stock',
  '联系客服': 'Contact Support',
  '客服电话': 'Service Phone',
  '客服微信': 'Service WeChat',
  '联系我们': 'Contact Us',
  '查看电话': 'View Phone',
  '地址已复制': 'Address copied',
}

const ja: Record<string, string> = {
  '首页': 'ホーム',
  '体验': '体験',
  '订单': '注文',
  '我的': 'マイページ',
  '未定位': '未測位',
  '消息通知': '通知',
  '全部已读': 'すべて既読',
  '清除': 'クリア',
  '暂无通知': '通知なし',
  '暂无游戏内容': 'ゲームなし',
  '限时特惠': '期間限定',
  '全场体验项目最高 30% OFF': '全体験 最大30%OFF',
  'VIP 专属权益': 'VIP特典',
  '开通会员，享受每月免费体验名额': '会員登録で毎月無料体験枠を利用',
  '立即开通': '今すぐ登録',
  '热门体验': '人気体験',
  '查看全部': 'すべて見る',
  '搜索结果': '検索結果',
  '预约': '予約',
  '查看详情': '詳細を見る',
  '选择门店': '店舗を選択',
  '选择后会自动保存，下次打开直接使用。': '選択内容は保存され、次回も使用されます。',
  '获取当前位置': '現在地を取得',
  '授权定位': '位置情報を許可',
  '搜索门店名称或地址': '店舗名または住所を検索',
  '暂无可选门店': '選択可能な店舗なし',
  '当前': '現在',
  '可选': '選択可',
  '当前门店': '現在の店舗',
  '暂无门店地址': '店舗住所なし',
  '游戏详情': 'ゲーム詳細',
  '游戏画面': 'ゲーム画面',
  '描述': '説明',
  '须知': '注意事項',
  '暂无须知内容': '注意事項はありません',
  '选择场次并预订': '時間を選んで予約',
  '发起拼场': '相席予約を開始',
  '可拼场': '相席可',
  '拼场规则': 'ルール',
  '沉浸式 VR 大空间体验': '没入型VR大空間体験',
  '我的订单': '注文履歴',
  '待体验': '体験待ち',
  '待核销': '確認待ち',
  '待支付': '支払い待ち',
  '已完成': '完了',
  '已取消': 'キャンセル済み',
  '退款': '返金',
  '待使用': '使用待ち',
  '再次预约': '再予約',
  '取消预约': 'キャンセル',
  '查看凭证': 'チケット表示',
  '评价': '評価',
  '会员储值': '会員チャージ',
  '会员权益': '会員特典',
  '账户明细': 'アカウント明細',
  '积分商城': 'ポイント交換',
  '优惠券': 'クーポン',
  '帮助与反馈': 'ヘルプ・フィードバック',
  '联系门店': '店舗へ連絡',
  '退出登录': 'ログアウト',
  '余额': '残高',
  '积分': 'ポイント',
  '会员等级': '会員ランク',
  '语言': '言語',
  '搜索': '検索',
  '搜索 VR 体验项目...': 'VR体験を検索...',
  '今天': '今日',
  '明天': '明日',
  '后天': '明後日',
  '选择日期': '日付を選択',
  '场次状态': '時間枠状態',
  '预订': '予約',
  '拼场': '相席',
  '已约': '予約済み',
  '剩': '残り',
  '支付方式': '支払方法',
  '余额支付': '残高払い',
  '微信支付': 'WeChat Pay',
  '支付宝': 'Alipay',
  '确认支付': '支払い確定',
  '取消订单': '注文キャンセル',
  '确认取消': 'キャンセル確定',
  '保留订单': '注文を保持',
  '返回订单列表': '注文一覧へ戻る',
  '该订单已过期或已取消': 'この注文は期限切れまたはキャンセル済みです',
  '该订单已支付': 'この注文は支払い済みです',
  '预约改签': '予約変更',
  '确认改签': '変更確定',
  '改签说明': '変更説明',
  '全部': 'すべて',
  '已退款': '返金済み',
  '待评价': '評価待ち',
  '充值': 'チャージ',
  '立即充值': '今すぐチャージ',
  '当前等级': '現在ランク',
  '等级体系': 'ランク体系',
  '当前权益': '現在の特典',
  '免费改签': '無料変更',
  '消费折扣': '割引',
  '积分回馈': 'ポイント還元',
  '返回': '戻る',
  '返回首页': 'ホームへ戻る',
  '返回个人中心': 'マイページへ戻る',
  '订单信息': '注文情報',
  '订单金额': '注文金額',
  '订单支付': '注文支払い',
  '订单已过期': '注文期限切れ',
  '订单已取消': '注文キャンセル済み',
  '订单已退款': '注文返金済み',
  '订单已作废': '注文無効化済み',
  '继续支付': '支払いを続ける',
  '不使用优惠券': 'クーポンを使わない',
  '会员优惠': '会員割引',
  '会员优惠金额': '会員割引額',
  '可用积分': '利用可能ポイント',
  '积分明细': 'ポイント明細',
  '积分获取': 'ポイント獲得',
  '积分收回': 'ポイント回収',
  '积分消费': 'ポイント消費',
  '充值记录': 'チャージ記録',
  '充值金额': 'チャージ金額',
  '充值成功': 'チャージ成功',
  '充值失败': 'チャージ失敗',
  '到账金额': '入金額',
  '当前余额': '現在残高',
  '当前积分': '現在ポイント',
  '当前手机号': '現在の電話番号',
  '旧密码': '旧パスワード',
  '新密码': '新パスワード',
  '确认新密码': '新パスワード確認',
  '密码修改成功': 'パスワード変更成功',
  '两次输入的新密码不一致': '新しいパスワードが一致しません',
  '密码至少': 'パスワードは最低',
  '加载中': '読み込み中',
  '操作失败': '操作失敗',
  '更新失败': '更新失敗',
  '兑换': '交換',
  '立即兑换': '今すぐ交換',
  '兑换成功': '交換成功',
  '兑换失败': '交換失敗',
  '兑换中': '交換中',
  '库存不足': '在庫不足',
  '联系客服': 'サポートへ連絡',
  '客服电话': 'サポート電話',
  '客服微信': 'サポートWeChat',
  '联系我们': 'お問い合わせ',
  '查看电话': '電話を見る',
  '地址已复制': '住所をコピーしました',
}

const dictionaries: Record<Exclude<Language, 'zh-CN'>, Record<string, string>> = {
  'en-US': en,
  'ja-JP': ja,
}

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

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  label: (typeof languageLabels)[Language]
  options: Array<{ value: Language; short: string; label: string }>
}

const LanguageContext = createContext<LanguageContextValue | null>(null)
const textSourceMap = new WeakMap<Text, string>()

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
  next = next.replace(/(\d{1,2})月(\d{1,2})日/g, (_, m, d) => {
    if (language === 'en-US') return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`
    return `${m}月${d}日`
  })
  next = next.replace(/星期[一二三四五六日]/g, (match) => weekdays[language][match] || match)
  next = next.replace(/周[一二三四五六日]/g, (match) => shortWeekdays[language][match] || match)
  next = next.replace(/(\d+)\s*分钟/g, language === 'en-US' ? '$1 min' : '$1分')
  next = next.replace(/(\d+)\s*人订过/g, language === 'en-US' ? '$1 booked' : '$1人が予約済み')
  next = next.replace(/(\d+)\s*人/g, language === 'en-US' ? '$1 people' : '$1人')
  next = next.replace(/(\d+)\s*张/g, language === 'en-US' ? '$1 coupons' : '$1枚')
  next = next.replace(/(\d+)\s*积分/g, language === 'en-US' ? '$1 points' : '$1ポイント')

  const entries = Object.entries(dictionary).sort((a, b) => b[0].length - a[0].length)
  for (const [source, target] of entries) {
    if (!source || source === value || source.length < 2) continue
    next = next.split(source).join(target)
  }
  return next
}

function translateNode(root: Node, language: Language) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text)

  textNodes.forEach((node) => {
    const raw = node.nodeValue || ''
    if (!raw.trim()) return
    const source = textSourceMap.get(node) || raw.trim()
    textSourceMap.set(node, source)
    const translated = translateValue(source, language)
    const next = raw.replace(raw.trim(), translated)
    if (node.nodeValue !== next) node.nodeValue = next
  })

  if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) {
    const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll('*'))] : Array.from(root.querySelectorAll('*'))
    elements.forEach((el) => {
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
