import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import {
  Search,
  Plus,
  Users,
  User,
  Crown,
  Diamond,
  Medal,
  Sparkles,
  Star,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  Calendar,
  Activity,
  Wallet,
  Pencil,
  Trash2,
  Eye,
  Loader2,
  Receipt,
  TicketCheck,
  Gift,
  Coins,
  Ticket,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { getUsers, createUser, updateUser, deleteUser, batchGiftPoints, batchGiftCoupon } from '@/api/users'
import type { User as ApiUser } from '@/api/users'
import { getSettings } from '@/api/settings'
import { giftPoints, giftCoupon, getPointsGiftRecords, getCouponGiftRecords } from '@/api/gift'
import { getUserRechargeRecords } from '@/api/finance'

function useDynamicLevelTabs(levels: Array<{ key: string; name: string }>) {
  return [
    { key: 'all', label: '全部' },
    ...levels.map((l) => ({ key: l.name, label: l.name })),
  ]
}

const fallbackLevelMap: Record<string, string> = {
  NORMAL: '普通用户',
  MEMBER: '会员用户',
  VIP: 'VIP用户',
  VIP_PLUS: 'VIP+',
}

const fallbackReverseMap: Record<string, string> = {
  '普通用户': 'NORMAL',
  '会员用户': 'MEMBER',
  'VIP用户': 'VIP',
  'VIP+': 'VIP_PLUS',
}

// 配置 key 与 Prisma enum 值的映射（用于兼容）
const enumToConfigKey: Record<string, string> = {
  VIP_PLUS: 'VIP+',
}
const configKeyToEnum: Record<string, string> = {
  'VIP+': 'VIP_PLUS',
}

function useMemberLevels() {
  const { data: settings } = useQuery({
    queryKey: ['settings', 'member'],
    queryFn: () => getSettings('member'),
    staleTime: 60000,
  })
  const levels = (settings?.member_levels?.value || []) as Array<{ key: string; name: string; discount: number }>

  const levelMap: Record<string, string> = {}
  const reverseMap: Record<string, string> = {}

  if (levels.length > 0) {
    for (const l of levels) {
      levelMap[l.key] = l.name
      reverseMap[l.name] = l.key
      // 兼容 Prisma enum 值（如 VIP_PLUS）
      const enumKey = configKeyToEnum[l.key]
      if (enumKey) {
        levelMap[enumKey] = l.name
      }
    }
  } else {
    Object.assign(levelMap, fallbackLevelMap)
    Object.assign(reverseMap, fallbackReverseMap)
  }

  return { levels, levelMap, reverseMap }
}

function LevelBadge({ level, levelsConfig }: { level: string; levelsConfig?: Array<{ key: string; name: string; discount: number }> }) {
  const displayName = levelsConfig?.find((l) => l.key === level || l.name === level)?.name || fallbackLevelMap[level] || level
  const idx = levelsConfig?.findIndex((l) => l.key === level || l.name === level) ?? -1

  const badgeConfigs = [
    { Icon: User, bg: 'bg-slate-500/15', text: 'text-slate-400', iconColor: 'text-slate-400' },
    { Icon: Medal, bg: 'bg-cyan-500/15', text: 'text-cyan-400', iconColor: 'text-cyan-400' },
    { Icon: Crown, bg: 'bg-amber-500/15', text: 'text-amber-400', iconColor: 'text-amber-400' },
    { Icon: Sparkles, bg: 'bg-purple-500/15', text: 'text-purple-400', iconColor: 'text-purple-400' },
    { Icon: Star, bg: 'bg-pink-500/15', text: 'text-pink-400', iconColor: 'text-pink-400' },
  ]
  const cfg = badgeConfigs[idx] || badgeConfigs[0]
  const IconComp = cfg.Icon

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-vr-caption font-medium whitespace-nowrap', cfg.bg, cfg.text)}>
      <IconComp className={cn('w-3 h-3 shrink-0', cfg.iconColor)} />
      {displayName}
    </span>
  )
}

function getInitials(name: string) {
  return name.charAt(0)
}

function getAvatarColor(name: string) {
  const colors = ['#3B82F6', '#06B6D4', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#F97316']
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

function StatCard({ icon, value, label, color, delay }: { icon: React.ReactNode; value: number; label: string; color: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="bg-vrbg-card rounded-xl p-5 border border-vrborder-subtle hover:shadow-vr-md hover:-translate-y-0.5 transition-all"
    >
      <div className="flex items-center gap-4">
        <div className={cn('w-12 h-12 rounded-full flex items-center justify-center', color)}>
          {icon}
        </div>
        <div>
          <p className="text-vr-h2 text-vrtext-primary font-semibold">{value}</p>
          <p className="text-vr-caption text-vrtext-tertiary mt-0.5">{label}</p>
        </div>
      </div>
    </motion.div>
  )
}

function formatDateTime(dateStr: string | null | Date) {
  if (!dateStr) return '-'
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd HH:mm')
  } catch {
    return String(dateStr)
  }
}

function formatDate(dateStr: string | null | Date) {
  if (!dateStr) return '-'
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd')
  } catch {
    return String(dateStr)
  }
}

function UserDetailSheet({
  user,
  open,
  onOpenChange,
  onUpdateLevel,
  onResetPassword,
  onDisableAccount,
  isUpdating,
  levelsConfig,
}: {
  user: ApiUser | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onUpdateLevel: (level: string) => void
  onResetPassword: () => void
  onDisableAccount: () => void
  isUpdating: boolean
  levelsConfig?: Array<{ key: string; name: string; discount: number }>
}) {
  if (!user) return null

  const avatarColor = getAvatarColor(user.name)
  const [level, setLevel] = useState(user.level)
  const [activeTab, setActiveTab] = useState<'info' | 'finance'>('info')

  const { data: pointsRecords } = useQuery({
    queryKey: ['gift-points-records', user.id],
    queryFn: () => getPointsGiftRecords({ userId: user.id, pageSize: 20 }),
    enabled: open && activeTab === 'finance',
  })

  const { data: couponRecords } = useQuery({
    queryKey: ['gift-coupon-records', user.id],
    queryFn: () => getCouponGiftRecords({ userId: user.id, pageSize: 20 }),
    enabled: open && activeTab === 'finance',
  })

  const { data: rechargeRecords } = useQuery({
    queryKey: ['user-recharge-records', user.id],
    queryFn: () => getUserRechargeRecords(user.id),
    enabled: open && activeTab === 'finance',
  })

  // Sync level when user changes
  useMemo(() => {
    setLevel(user.level)
  }, [user.level])

  const shortId = user.id.length > 12 ? `${user.id.slice(0, 8)}...${user.id.slice(-4)}` : user.id
  const currentLevelInfo = levelsConfig?.find((l) => l.name === user.level || l.key === user.level)
  const discountLabel = currentLevelInfo && currentLevelInfo.discount < 100 ? `（享${currentLevelInfo.discount}折）` : ''

  const infoItems = [
    { label: '用户ID', value: shortId, icon: <User className="w-4 h-4 text-vrtext-muted" />, mono: true },
    { label: '真实姓名', value: user.name, icon: <User className="w-4 h-4 text-vrtext-muted" /> },
    { label: '手机号', value: user.phone, icon: <Phone className="w-4 h-4 text-vrtext-muted" /> },
    { label: '邮箱', value: user.email || '-', icon: <Mail className="w-4 h-4 text-vrtext-muted" /> },
    { label: '生日', value: user.birthday ? formatDate(user.birthday) : '-', icon: <Calendar className="w-4 h-4 text-vrtext-muted" /> },
    { label: '会员等级', value: <LevelBadge level={user.level} levelsConfig={levelsConfig} />, icon: <Crown className="w-4 h-4 text-vrtext-muted" />, isBadge: true },
    { label: '注册时间', value: formatDateTime(user.registerDate), icon: <Calendar className="w-4 h-4 text-vrtext-muted" /> },
    { label: '最近登录', value: formatDateTime(user.lastLogin), icon: <Activity className="w-4 h-4 text-vrtext-muted" /> },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] bg-vrbg-card border-l border-vrborder-subtle p-0 sm:max-w-[480px]">
        <SheetHeader className="p-6 border-b border-vrborder-subtle">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-vr-h3 text-vrtext-primary font-semibold">用户详情</SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* User Header */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-4"
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-semibold"
              style={{ backgroundColor: avatarColor }}
            >
              {getInitials(user.name)}
            </div>
            <div>
              <h3 className="text-vr-h3 text-vrtext-primary font-semibold">{user.name}</h3>
              <p className="text-vr-body-sm text-vrtext-secondary mt-0.5">{user.phone.slice(0, 3)}****{user.phone.slice(-4)}</p>
              <div className="mt-1.5">
                <LevelBadge level={user.level} levelsConfig={levelsConfig} />
                {discountLabel && <span className="ml-2 text-xs text-vraccent-primary">{discountLabel}</span>}
              </div>
            </div>
          </motion.div>

          {/* Stats Cards */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="grid grid-cols-2 gap-3"
          >
            <div className="bg-vrbg-elevated rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-vrwarning/10 flex items-center justify-center shrink-0">
                <Receipt className="w-5 h-5 text-vrwarning" />
              </div>
              <div>
                <p className="text-vr-caption text-vrtext-tertiary">累计消费</p>
                <p className="text-vr-h3 text-vrtext-primary font-bold">¥{(user.totalSpent / 100).toLocaleString()}</p>
              </div>
            </div>
            <div className="bg-vrbg-elevated rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-vraccent-primary/10 flex items-center justify-center shrink-0">
                <TicketCheck className="w-5 h-5 text-vraccent-primary" />
              </div>
              <div>
                <p className="text-vr-caption text-vrtext-tertiary">预约次数</p>
                <p className="text-vr-h3 text-vrtext-primary font-bold">{user.totalVisits}次</p>
              </div>
            </div>
            <div className="bg-vrbg-elevated rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-vrsuccess/10 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 text-vrsuccess" />
              </div>
              <div>
                <p className="text-vr-caption text-vrtext-tertiary">余额</p>
                <p className="text-vr-h3 text-vrtext-primary font-bold">¥{(((user.principalBalance || 0) + (user.bonusBalance || 0)) / 100).toLocaleString()}</p>
              </div>
            </div>
            <div className="bg-vrbg-elevated rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-vrpurple/10 flex items-center justify-center shrink-0">
                <Diamond className="w-5 h-5 text-vrpurple" />
              </div>
              <div>
                <p className="text-vr-caption text-vrtext-tertiary">积分</p>
                <p className="text-vr-h3 text-vrtext-primary font-bold">{user.points || 0}</p>
              </div>
            </div>
          </motion.div>

          {/* Tab Switcher */}
          <div className="flex gap-1 bg-vrbg-elevated rounded-lg p-1">
            <button
              onClick={() => setActiveTab('info')}
              className={`flex-1 h-8 rounded-md text-vr-caption font-medium transition-colors ${
                activeTab === 'info'
                  ? 'bg-vraccent-primary text-white'
                  : 'text-vrtext-secondary hover:text-vrtext-primary'
              }`}
            >
              用户信息
            </button>
            <button
              onClick={() => setActiveTab('finance')}
              className={`flex-1 h-8 rounded-md text-vr-caption font-medium transition-colors ${
                activeTab === 'finance'
                  ? 'bg-vraccent-primary text-white'
                  : 'text-vrtext-secondary hover:text-vrtext-primary'
              }`}
            >
              财务记录
            </button>
          </div>

          {activeTab === 'info' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="bg-vrbg-elevated rounded-xl p-5"
          >
            <h4 className="text-vr-body-sm text-vrtext-secondary font-medium mb-4">用户信息</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              {infoItems.map((item, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + idx * 0.04, duration: 0.2 }}
                  className="flex flex-col gap-1"
                >
                  <div className="flex items-center gap-1.5 text-vrtext-tertiary">
                    {item.icon}
                    <span className="text-vr-caption">{item.label}</span>
                  </div>
                  <span className={cn(
                    'text-vr-body-sm text-vrtext-primary',
                    item.mono && 'font-mono text-xs break-all',
                  )}>
                    {item.value}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
          )}

          {activeTab === 'finance' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="grid grid-cols-2 gap-4"
          >
            {/* Left: 赠送记录 */}
            <div className="space-y-3">
              {/* Points Gift Records */}
              <div className="bg-vrbg-elevated rounded-xl p-4">
                <h4 className="text-vr-caption text-vrtext-secondary font-medium mb-2">积分赠送</h4>
                {(pointsRecords?.data?.data || []).length === 0 ? (
                  <p className="text-vr-caption text-vrtext-muted">暂无记录</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {(pointsRecords?.data?.data || []).map((record: any) => (
                      <div key={record.id} className="flex items-center justify-between py-1.5 border-b border-vrborder-subtle last:border-0">
                        <div className="min-w-0">
                          <p className="text-vr-body-sm text-vrtext-primary truncate">+{record.pointsAmount} 积分</p>
                          <p className="text-[10px] text-vrtext-muted truncate">{record.remark}</p>
                        </div>
                        <span className="text-[10px] text-vrtext-muted shrink-0 ml-2">
                          {new Date(record.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Coupon Gift Records */}
              <div className="bg-vrbg-elevated rounded-xl p-4">
                <h4 className="text-vr-caption text-vrtext-secondary font-medium mb-2">优惠券赠送</h4>
                {(couponRecords?.data?.data || []).length === 0 ? (
                  <p className="text-vr-caption text-vrtext-muted">暂无记录</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {(couponRecords?.data?.data || []).map((record: any) => (
                      <div key={record.id} className="flex items-center justify-between py-1.5 border-b border-vrborder-subtle last:border-0">
                        <div className="min-w-0">
                          <p className="text-vr-body-sm text-vrtext-primary truncate">{record.name}</p>
                          <p className="text-[10px] text-vrtext-muted truncate">
                            {record.source === 'CAMPAIGN'
                              ? (record.giftReason || '活动发放')
                              : record.giftReason === 'COMPLAINT' ? '客诉' :
                                record.giftReason === 'EQUIPMENT_FAILURE' ? '设备故障' :
                                record.giftReason === 'ENTERTAIN_CLIENT' ? '招待客户' : '备注'}
                            {record.giftRemark ? ` - ${record.giftRemark}` : ''}
                          </p>
                        </div>
                        <span className="text-[10px] text-vrtext-muted shrink-0 ml-2">
                          {new Date(record.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: 充值记录 */}
            <div className="bg-vrbg-elevated rounded-xl p-4">
              <h4 className="text-vr-caption text-vrtext-secondary font-medium mb-2">充值记录</h4>
              {(rechargeRecords || []).length === 0 ? (
                <p className="text-vr-caption text-vrtext-muted">暂无记录</p>
              ) : (
                <div className="space-y-1.5 max-h-[340px] overflow-y-auto">
                  {(rechargeRecords || []).map((record: any) => (
                    <div key={record.id} className="flex items-center justify-between py-1.5 border-b border-vrborder-subtle last:border-0">
                      <div className="min-w-0">
                        <p className="text-vr-body-sm text-vrtext-primary">
                          ¥{(record.amount / 100).toFixed(0)}
                          {record.bonus > 0 && <span className="text-vrsuccess text-[10px] ml-1">+赠¥{(record.bonus / 100).toFixed(0)}</span>}
                        </p>
                        <p className="text-[10px] text-vrtext-muted">
                          {record.payMethod === 'WECHAT' ? '微信支付' : record.payMethod === 'ALIPAY' ? '支付宝' : record.payMethod}
                        </p>
                      </div>
                      <span className="text-[10px] text-vrtext-muted shrink-0 ml-2">
                        {record.paidAt ? new Date(record.paidAt).toLocaleDateString() : new Date(record.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
          )}

          {/* Membership Upgrade */}
          {/* 会员等级已改为由充值系统自动计算，禁止手动修改 */}
        </div>

        {/* Bottom Actions */}
        <div className="p-6 border-t border-vrborder-subtle flex gap-3">
          <button
            onClick={onResetPassword}
            disabled={isUpdating}
            className="flex-1 h-10 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-vr-body-sm font-medium hover:bg-vrbg-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            重置密码
          </button>
          <button
            onClick={onDisableAccount}
            disabled={isUpdating}
            className="flex-1 h-10 rounded-lg border border-vrerror text-vrerror text-vr-body-sm font-medium hover:bg-vrerror/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            禁用账户
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function UserEditSheet({
  user,
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  user: ApiUser | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onSubmit: (data: Partial<ApiUser>) => void
  isPending: boolean
}) {
  const [form, setForm] = useState<Partial<ApiUser>>({})

  // Sync form when user changes
  useEffect(() => {
    if (user) {
      setForm({
        name: user.name,
        phone: user.phone,
        email: user.email || '',
        birthday: user.birthday ? user.birthday.slice(0, 10) : '',
      })
    }
  }, [user?.id])

  if (!user) return null

  const handleSubmit = () => {
    onSubmit({
      name: form.name,
      phone: form.phone,
      email: form.email,
      birthday: form.birthday || null,
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] bg-vrbg-card border-l border-vrborder-subtle p-0 sm:max-w-[480px] flex flex-col">
        <SheetHeader className="p-6 border-b border-vrborder-subtle shrink-0">
          <SheetTitle className="text-vr-h3 text-vrtext-primary font-semibold">编辑用户</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
          <div>
            <label className="text-vr-caption text-vrtext-secondary block mb-1.5">姓名</label>
            <input
              type="text"
              value={form.name || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary transition-all"
            />
          </div>
          <div>
            <label className="text-vr-caption text-vrtext-secondary block mb-1.5">手机号</label>
            <input
              type="text"
              value={form.phone || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              className="w-full h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary transition-all"
            />
          </div>
          <div>
            <label className="text-vr-caption text-vrtext-secondary block mb-1.5">邮箱</label>
            <input
              type="text"
              value={form.email || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              className="w-full h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary transition-all"
            />
          </div>
          <div>
            <label className="text-vr-caption text-vrtext-secondary block mb-1.5">生日</label>
            <input
              type="date"
              value={form.birthday || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, birthday: e.target.value }))}
              className="w-full h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary transition-all"
            />
          </div>
          {/* 会员等级由充值系统自动计算，编辑时不允许手动修改 */}
        </div>

        <div className="p-6 border-t border-vrborder-subtle flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex-1 h-10 bg-vraccent-primary text-white rounded-lg text-vr-body-sm font-medium hover:bg-vraccent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            保存
          </button>
          <button
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="flex-1 h-10 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-vr-body-sm font-medium hover:bg-vrbg-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            取消
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DeleteConfirmDialog({
  user,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  user: ApiUser | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onConfirm: () => void
  isPending: boolean
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-vrbg-card border-vrborder-subtle sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-vrtext-primary">确认删除</AlertDialogTitle>
          <AlertDialogDescription className="text-vrtext-secondary">
            确定要删除用户 <span className="text-vrtext-primary font-medium">{user?.name}</span> 吗？此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-transparent border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary">
            取消
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            disabled={isPending}
            className="bg-vrerror text-white hover:bg-vrerror/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default function UsersPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const [selectedUser, setSelectedUser] = useState<ApiUser | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<ApiUser | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingUser, setDeletingUser] = useState<ApiUser | null>(null)
  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    phone: '',
    password: '',
    email: '',
    birthday: '',
    level: 'NORMAL',
    status: 'ACTIVE',
  })
  const [createError, setCreateError] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  /* ─── Gift states ─── */
  const [giftPointsOpen, setGiftPointsOpen] = useState(false)
  const [giftCouponOpen, setGiftCouponOpen] = useState(false)
  const [giftingUser, setGiftingUser] = useState<ApiUser | null>(null)
  const [giftChoiceOpen, setGiftChoiceOpen] = useState(false)
  const [giftChoiceUser, setGiftChoiceUser] = useState<ApiUser | null>(null)
  const [giftPointsForm, setGiftPointsForm] = useState({ points: '', reason: 'COMPLAINT', remark: '' })
  const [giftCouponForm, setGiftCouponForm] = useState({
    name: '', type: 'EXPERIENCE_FREE' as 'EXPERIENCE_FREE' | 'DISCOUNT',
    discountRate: '', validityDays: '30', reason: 'COMPLAINT', remark: '',
  })
  const [giftError, setGiftError] = useState('')
  const [giftLoading, setGiftLoading] = useState(false)

  /* ─── Batch states ─── */
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [batchPointsOpen, setBatchPointsOpen] = useState(false)
  const [batchCouponOpen, setBatchCouponOpen] = useState(false)
  const [batchPointsForm, setBatchPointsForm] = useState({ points: '', remark: '' })
  const [batchCouponForm, setBatchCouponForm] = useState({
    name: '', type: 'EXPERIENCE_FREE' as 'EXPERIENCE_FREE' | 'DISCOUNT',
    discountRate: '', validDays: '30', reason: '', remark: '',
  })
  const [batchGiftError, setBatchGiftError] = useState('')
  const [batchGiftLoading, setBatchGiftLoading] = useState(false)

  const { levels: memberLevels, levelMap, reverseMap } = useMemberLevels()
  const levelTabs = useDynamicLevelTabs(memberLevels)
  const levelParam = activeTab === 'all' ? undefined : reverseMap[activeTab]

  const { data: userData } = useQuery({
    queryKey: ['users', levelParam, searchQuery, currentPage, pageSize],
    queryFn: () => getUsers({
      level: levelParam,
      search: searchQuery || undefined,
      page: currentPage,
      pageSize,
    }),
  })

  const users: ApiUser[] = userData?.data || []
  const totalUsers = userData?.meta?.total || 0

  const filteredUsers = useMemo(() => {
    return users.map((u) => ({ ...u, level: levelMap[u.level] || u.level }))
  }, [users, levelMap])

  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize))
  const safePage = Math.min(currentPage, totalPages)

  // 统计卡片：优先使用后端返回的全量 levelCounts（基于全部用户，不受当前标签/分页影响）
  const stats = useMemo(() => {
    const backendCounts = userData?.meta?.levelCounts as Record<string, number> | undefined
    const result: Record<string, number> = { total: totalUsers }
    if (backendCounts) {
      for (const l of memberLevels) {
        const configKey = l.key.toLowerCase()
        const enumKey = (configKeyToEnum[l.key] || l.key).toLowerCase()
        result[l.name] = (backendCounts as any)[configKey] || (backendCounts as any)[enumKey] || 0
      }
    } else {
      for (const l of memberLevels) {
        const enumVal = configKeyToEnum[l.key] || l.key
        result[l.name] = users.filter((u) => u.level === l.key || u.level === enumVal).length
      }
    }
    return result
  }, [userData?.meta?.levelCounts, users, totalUsers, memberLevels])

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ApiUser> }) => updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const batchGiftPointsMutation = useMutation({
    mutationFn: ({ userIds, points, remark }: { userIds: string[]; points: number; remark?: string }) =>
      batchGiftPoints(userIds, points, '批量赠送积分', remark),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setSelectedIds([])
      setBatchPointsOpen(false)
      setBatchPointsForm({ points: '', remark: '' })
      setBatchGiftError('')
    },
  })

  const batchGiftCouponMutation = useMutation({
    mutationFn: ({ userIds, data }: { userIds: string[]; data: Parameters<typeof batchGiftCoupon>[1] }) =>
      batchGiftCoupon(userIds, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setSelectedIds([])
      setBatchCouponOpen(false)
      setBatchCouponForm({ name: '', type: 'EXPERIENCE_FREE', discountRate: '', validDays: '30', reason: '', remark: '' })
      setBatchGiftError('')
    },
  })

  // Clear selection when data changes
  useEffect(() => {
    setSelectedIds([])
  }, [activeTab, searchQuery, currentPage, pageSize])

  const handleOpenDetail = (user: ApiUser) => {
    setSelectedUser(user)
    setDrawerOpen(true)
  }

  const handleOpenEdit = (user: ApiUser) => {
    setEditingUser(user)
    setEditSheetOpen(true)
  }

  const handleOpenDelete = (user: ApiUser) => {
    setDeletingUser(user)
    setDeleteDialogOpen(true)
  }

  const handleEditSubmit = (data: Partial<ApiUser>) => {
    if (!editingUser) return
    updateMutation.mutate(
      { id: editingUser.id, data },
      {
        onSuccess: () => {
          setEditSheetOpen(false)
          setEditingUser(null)
        },
      }
    )
  }

  const handleDeleteConfirm = () => {
    if (!deletingUser) return
    deleteMutation.mutate(deletingUser.id, {
      onSuccess: () => {
        setDeleteDialogOpen(false)
        setDeletingUser(null)
      },
    })
  }

  const handleUpdateLevel = (level: string) => {
    if (!selectedUser) return
    const apiLevel = fallbackReverseMap[level] || fallbackLevelMap[level] || level
    updateMutation.mutate(
      { id: selectedUser.id, data: { level: apiLevel } },
      {
        onSuccess: () => {
          setDrawerOpen(false)
          setSelectedUser(null)
        },
      }
    )
  }

  const handleResetPassword = () => {
    if (!selectedUser) return
    updateMutation.mutate(
      { id: selectedUser.id, data: { status: selectedUser.status } },
      {
        onSuccess: () => {
          window.alert('密码重置成功，新密码已发送至用户手机')
        },
      }
    )
  }

  const handleDisableAccount = () => {
    if (!selectedUser) return
    updateMutation.mutate(
      { id: selectedUser.id, data: { status: 'DISABLED' } },
      {
        onSuccess: () => {
          window.alert('账户已禁用')
          setDrawerOpen(false)
          setSelectedUser(null)
        },
      }
    )
  }

  return (
    <Layout breadcrumb={['会员管理']}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h1 className="text-vr-h1 text-vrtext-primary font-semibold">会员管理</h1>
            <p className="text-vr-body-sm text-vrtext-tertiary mt-1">用户信息、会员等级、权限管理</p>
          </motion.div>

          <div className="flex items-center gap-3">
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="relative"
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vrtext-muted" />
              <input
                type="text"
                placeholder="搜索用户名、手机号..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                className="w-[280px] h-9 pl-9 pr-4 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </motion.div>

            <motion.button
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              onClick={() => {
                setCreateForm({ name: '', phone: '', password: '', email: '', birthday: '', level: 'NORMAL', status: 'ACTIVE' })
                setCreateError('')
                setCreateSheetOpen(true)
              }}
              className="h-9 px-4 bg-vraccent-primary text-white rounded-lg text-vr-body-sm font-medium hover:bg-vraccent-primary/90 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              新增用户
            </motion.button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-5 gap-4">
          <StatCard
            icon={<Users className="w-6 h-6 text-blue-400" />}
            value={stats.total || 0}
            label="用户总数"
            color="bg-blue-400/10"
            delay={0}
          />
          {memberLevels.map((l, i) => {
            const levelIconConfig = [
              { Icon: User, iconColor: 'text-slate-400', bgColor: 'bg-slate-400/10' },
              { Icon: Medal, iconColor: 'text-cyan-400', bgColor: 'bg-cyan-400/10' },
              { Icon: Crown, iconColor: 'text-amber-400', bgColor: 'bg-amber-400/10' },
              { Icon: Sparkles, iconColor: 'text-purple-400', bgColor: 'bg-purple-400/10' },
              { Icon: Star, iconColor: 'text-pink-400', bgColor: 'bg-pink-400/10' },
            ]
            const cfg = levelIconConfig[i] || levelIconConfig[levelIconConfig.length - 1]
            const IconComp = cfg.Icon
            return (
              <StatCard
                key={l.key}
                icon={<IconComp className={cn('w-6 h-6', cfg.iconColor)} />}
                value={stats[l.name] || 0}
                label={l.name}
                color={cfg.bgColor}
                delay={0.05 * (i + 1)}
              />
            )
          })}
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center justify-between border-b border-vrborder-subtle">
          <div className="flex gap-6">
            {levelTabs.map((tab, idx) => (
              <motion.button
                key={tab.key}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.05 }}
                onClick={() => { setActiveTab(tab.key); setCurrentPage(1) }}
                className={cn(
                  'relative py-3 text-vr-body-sm font-medium transition-colors',
                  activeTab === tab.key ? 'text-vraccent-primary' : 'text-vrtext-secondary hover:text-vrtext-primary'
                )}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <motion.div
                    layoutId="user-active-tab"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-vraccent-primary"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </motion.button>
            ))}
          </div>
          <span className="text-vr-caption text-vrtext-tertiary">
            {totalUsers} 位用户
          </span>
        </div>

        {/* Batch Action Bar */}
        <AnimatePresence>
          {selectedIds.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-between px-4 py-2.5 mb-3 bg-vrbg-elevated border border-vrborder-subtle rounded-xl"
            >
              <span className="text-vr-body-sm text-vrtext-primary font-medium">
                已选择 {selectedIds.length} 项
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setBatchPointsForm({ points: '', remark: '' })
                    setBatchGiftError('')
                    setBatchPointsOpen(true)
                  }}
                  className="h-8 px-3 rounded-lg bg-vrsuccess/10 text-vrsuccess text-vr-caption font-medium hover:bg-vrsuccess/20 transition-colors flex items-center gap-1.5"
                >
                  <Coins className="w-3.5 h-3.5" />
                  批量赠送积分
                </button>
                <button
                  onClick={() => {
                    setBatchCouponForm({ name: '', type: 'EXPERIENCE_FREE', discountRate: '', validDays: '30', reason: '', remark: '' })
                    setBatchGiftError('')
                    setBatchCouponOpen(true)
                  }}
                  className="h-8 px-3 rounded-lg bg-vraccent-primary/10 text-vraccent-primary text-vr-caption font-medium hover:bg-vraccent-primary/20 transition-colors flex items-center gap-1.5"
                >
                  <Ticket className="w-3.5 h-3.5" />
                  批量赠送优惠券
                </button>
                <button
                  onClick={() => setSelectedIds([])}
                  className="h-8 px-3 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-vr-caption font-medium hover:bg-vrbg-surface transition-colors"
                >
                  清空选择
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* User Table */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="bg-vrbg-card rounded-xl border border-vrborder-subtle overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-vrbg-elevated">
                  <th className="px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[40px]">
                    <input
                      type="checkbox"
                      checked={filteredUsers.length > 0 && selectedIds.length === filteredUsers.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(filteredUsers.map((u) => u.id))
                        } else {
                          setSelectedIds([])
                        }
                      }}
                      className="w-4 h-4 accent-vraccent-primary cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">用户</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[120px]">手机号</th>
                  <th className="text-center px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[120px]">会员等级</th>
                  <th className="text-center px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[100px]">积分</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[110px]">注册时间</th>
                  <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[140px]">操作</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filteredUsers.map((user, idx) => (
                    <motion.tr
                      key={user.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(idx * 0.04, 0.2) }}
                      className="h-[60px] border-t border-vrborder-subtle hover:bg-vrbg-elevated/60 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(user.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds((prev) => [...prev, user.id])
                            } else {
                              setSelectedIds((prev) => prev.filter((id) => id !== user.id))
                            }
                          }}
                          className="w-4 h-4 accent-vraccent-primary cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0"
                            style={{ backgroundColor: getAvatarColor(user.name) }}
                          >
                            {getInitials(user.name)}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-vr-body-sm text-vrtext-primary font-medium">{user.name}</span>
                            <span className="text-vr-caption text-vrtext-tertiary">{user.phone.slice(0, 3)}****{user.phone.slice(-4)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-vr-body-sm text-vrtext-primary font-mono">{user.phone}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <LevelBadge level={user.level} levelsConfig={memberLevels} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-vr-body-sm text-vrtext-secondary">{user.points || 0}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-vr-body-sm text-vrtext-secondary">{formatDate(user.registerDate)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(user)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-vrtext-tertiary hover:text-vraccent-primary hover:bg-vraccent-primary/10 transition-colors"
                            title="编辑"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenDetail(user)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-vraccent-primary hover:bg-vraccent-primary/10 transition-colors"
                            title="详情"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenDelete(user)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-vrtext-tertiary hover:text-vrerror hover:bg-vrerror/10 transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setGiftChoiceUser(user)
                              setGiftChoiceOpen(true)
                            }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-vrtext-tertiary hover:text-vrsuccess hover:bg-vrsuccess/10 transition-colors"
                            title="赠送"
                          >
                            <Gift className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <Users className="w-12 h-12 text-vrtext-muted mb-3" />
              <p className="text-vr-body text-vrtext-secondary">暂无用户数据</p>
            </div>
          )}

          {/* Pagination */}
          {filteredUsers.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-vrborder-subtle">
              <div className="flex items-center gap-2">
                <span className="text-vr-caption text-vrtext-tertiary">每页</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1) }}
                  className="h-7 px-2 bg-vrbg-surface border border-vrborder-subtle rounded text-vr-caption text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
                <span className="text-vr-caption text-vrtext-tertiary">条</span>
                <span className="text-vr-caption text-vrtext-tertiary ml-2">共 {totalUsers} 条</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={cn(
                      'w-8 h-8 flex items-center justify-center rounded-lg text-vr-body-sm font-medium transition-colors',
                      page === safePage
                        ? 'bg-vraccent-primary text-white'
                        : 'border border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated'
                    )}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* User Detail Drawer */}
      <UserDetailSheet
        user={selectedUser}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onUpdateLevel={handleUpdateLevel}
        onResetPassword={handleResetPassword}
        onDisableAccount={handleDisableAccount}
        isUpdating={updateMutation.isPending}
        levelsConfig={memberLevels}
      />

      {/* User Edit Sheet */}
      <UserEditSheet
        user={editingUser}
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        onSubmit={handleEditSubmit}
        isPending={updateMutation.isPending}
      />

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        user={deletingUser}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        isPending={deleteMutation.isPending}
      />

      {/* Create User Sheet */}
      <Sheet open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
        <SheetContent side="right" className="w-[420px] bg-vrbg-card border-l border-vrborder-subtle p-0 sm:max-w-[420px]">
          <SheetHeader className="p-6 border-b border-vrborder-subtle">
            <SheetTitle className="text-vr-h3 text-vrtext-primary">新增用户</SheetTitle>
          </SheetHeader>
          <div className="p-6 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 80px)' }}>
            {createError && (
              <div className="p-3 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-vr-body-sm text-vrerror">
                {createError}
              </div>
            )}
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">姓名 <span className="text-vrerror">*</span></label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="请输入用户姓名"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">手机号 <span className="text-vrerror">*</span></label>
              <input
                type="text"
                value={createForm.phone}
                onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="请输入手机号"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">密码</label>
              <input
                type="text"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="不填则默认 123456"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">邮箱</label>
              <input
                type="text"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="请输入邮箱（选填）"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">生日</label>
              <input
                type="date"
                value={createForm.birthday}
                onChange={(e) => setCreateForm((f) => ({ ...f, birthday: e.target.value }))}
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">会员等级</label>
              <select
                value={createForm.level}
                onChange={(e) => setCreateForm((f) => ({ ...f, level: e.target.value }))}
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              >
                {memberLevels.map((l) => (
                  <option key={l.key} value={configKeyToEnum[l.key] || l.key}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">状态</label>
              <select
                value={createForm.status}
                onChange={(e) => setCreateForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              >
                <option value="ACTIVE">正常</option>
                <option value="INACTIVE">禁用</option>
              </select>
            </div>
            <div className="pt-4 flex gap-3">
              <button
                onClick={() => setCreateSheetOpen(false)}
                className="flex-1 h-10 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-vr-body-sm font-medium hover:bg-vrbg-elevated transition-colors"
              >
                取消
              </button>
              <button
                disabled={createLoading || !createForm.name || !createForm.phone}
                onClick={async () => {
                  setCreateLoading(true)
                  setCreateError('')
                  try {
                    await createUser({
                      name: createForm.name,
                      phone: createForm.phone,
                      password: createForm.password || undefined,
                      email: createForm.email || undefined,
                      birthday: createForm.birthday || undefined,
                      level: createForm.level,
                      status: createForm.status,
                    })
                    queryClient.invalidateQueries({ queryKey: ['users'] })
                    setCreateSheetOpen(false)
                  } catch (e: any) {
                    setCreateError(e?.response?.data?.message || '创建失败')
                  } finally {
                    setCreateLoading(false)
                  }
                }}
                className="flex-1 h-10 rounded-lg bg-vraccent-primary text-white text-vr-body-sm font-medium hover:bg-vraccent-primary/90 transition-colors disabled:opacity-50"
              >
                {createLoading ? '创建中...' : '确认创建'}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      {/* ─── Gift Points Sheet ─── */}
      <Sheet open={giftPointsOpen} onOpenChange={setGiftPointsOpen}>
        <SheetContent side="right" className="w-[480px] bg-vrbg-card border-l border-vrborder-subtle p-0 sm:max-w-[480px]">
          <SheetHeader className="p-6 border-b border-vrborder-subtle">
            <SheetTitle className="text-vr-h3 text-vrtext-primary font-semibold">赠送积分</SheetTitle>
          </SheetHeader>
          <div className="p-6 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 80px)' }}>
            {giftingUser && (
              <div className="flex items-center gap-3 p-3 bg-vrbg-elevated rounded-lg">
                <div className="w-10 h-10 rounded-full bg-vraccent-primary/10 flex items-center justify-center text-vraccent-primary font-semibold">
                  {giftingUser.name.charAt(0)}
                </div>
                <div>
                  <p className="text-vr-body-sm text-vrtext-primary font-medium">{giftingUser.name}</p>
                  <p className="text-vr-caption text-vrtext-secondary">当前积分 {giftingUser.points || 0}</p>
                </div>
              </div>
            )}
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">赠送积分 <span className="text-vr-error">*</span></label>
              <input
                type="number"
                min={1}
                value={giftPointsForm.points}
                onChange={(e) => setGiftPointsForm((f) => ({ ...f, points: e.target.value }))}
                placeholder="请输入积分数量"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">赠送原因 <span className="text-vr-error">*</span></label>
              <div className="space-y-2">
                {[
                  { key: 'COMPLAINT', label: '客诉' },
                  { key: 'EQUIPMENT_FAILURE', label: '设备故障' },
                  { key: 'ENTERTAIN_CLIENT', label: '招待客户' },
                  { key: 'OTHER', label: '备注' },
                ].map((r) => (
                  <label key={r.key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="giftReason"
                      checked={giftPointsForm.reason === r.key}
                      onChange={() => setGiftPointsForm((f) => ({ ...f, reason: r.key }))}
                      className="w-4 h-4 accent-vraccent-primary"
                    />
                    <span className="text-vr-body-sm text-vrtext-primary">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">备注说明</label>
              <textarea
                value={giftPointsForm.remark}
                onChange={(e) => setGiftPointsForm((f) => ({ ...f, remark: e.target.value }))}
                placeholder={giftPointsForm.reason === 'OTHER' ? '请输入具体原因（必填）' : '请输入补充说明（选填）'}
                rows={3}
                className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all resize-none"
              />
            </div>
            {giftError && (
              <p className="text-vr-body-sm text-vr-error">{giftError}</p>
            )}
            <div className="pt-4 flex gap-3">
              <button
                onClick={() => setGiftPointsOpen(false)}
                className="flex-1 h-10 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-vr-body-sm font-medium hover:bg-vrbg-elevated transition-colors"
              >
                取消
              </button>
              <button
                disabled={giftLoading || !giftPointsForm.points || parseInt(giftPointsForm.points) < 1 || (giftPointsForm.reason === 'OTHER' && !giftPointsForm.remark.trim())}
                onClick={async () => {
                  if (!giftingUser) return
                  setGiftLoading(true)
                  setGiftError('')
                  try {
                    await giftPoints({
                      userId: giftingUser.id,
                      points: parseInt(giftPointsForm.points),
                      reason: giftPointsForm.reason as any,
                      remark: giftPointsForm.remark || undefined,
                    })
                    setGiftPointsOpen(false)
                    queryClient.invalidateQueries({ queryKey: ['users'] })
                  } catch (err: any) {
                    setGiftError(err?.response?.data?.message || err?.message || '赠送失败')
                  } finally {
                    setGiftLoading(false)
                  }
                }}
                className="flex-1 h-10 rounded-lg bg-vrsuccess text-white text-vr-body-sm font-medium hover:bg-vrsuccess/90 transition-colors disabled:opacity-50"
              >
                {giftLoading ? '赠送中...' : '确认赠送'}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── Gift Coupon Sheet ─── */}
      <Sheet open={giftCouponOpen} onOpenChange={setGiftCouponOpen}>
        <SheetContent side="right" className="w-[480px] bg-vrbg-card border-l border-vrborder-subtle p-0 sm:max-w-[480px]">
          <SheetHeader className="p-6 border-b border-vrborder-subtle">
            <SheetTitle className="text-vr-h3 text-vrtext-primary font-semibold">赠送优惠券</SheetTitle>
          </SheetHeader>
          <div className="p-6 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 80px)' }}>
            {giftingUser && (
              <div className="flex items-center gap-3 p-3 bg-vrbg-elevated rounded-lg">
                <div className="w-10 h-10 rounded-full bg-vraccent-primary/10 flex items-center justify-center text-vraccent-primary font-semibold">
                  {giftingUser.name.charAt(0)}
                </div>
                <div>
                  <p className="text-vr-body-sm text-vrtext-primary font-medium">{giftingUser.name}</p>
                  <p className="text-vr-caption text-vrtext-secondary">{giftingUser.phone}</p>
                </div>
              </div>
            )}
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">优惠券名称 <span className="text-vr-error">*</span></label>
              <input
                type="text"
                value={giftCouponForm.name}
                onChange={(e) => setGiftCouponForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例如：VR体验补偿券"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">优惠券类型 <span className="text-vr-error">*</span></label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="couponType"
                    checked={giftCouponForm.type === 'EXPERIENCE_FREE'}
                    onChange={() => setGiftCouponForm((f) => ({ ...f, type: 'EXPERIENCE_FREE' }))}
                    className="w-4 h-4 accent-vraccent-primary"
                  />
                  <span className="text-vr-body-sm text-vrtext-primary">体验券（免单1人）</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="couponType"
                    checked={giftCouponForm.type === 'DISCOUNT'}
                    onChange={() => setGiftCouponForm((f) => ({ ...f, type: 'DISCOUNT' }))}
                    className="w-4 h-4 accent-vraccent-primary"
                  />
                  <span className="text-vr-body-sm text-vrtext-primary">折扣券</span>
                </label>
              </div>
            </div>
            {giftCouponForm.type === 'DISCOUNT' && (
              <div>
                <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">折扣率（%）<span className="text-vr-error">*</span></label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={giftCouponForm.discountRate}
                  onChange={(e) => setGiftCouponForm((f) => ({ ...f, discountRate: e.target.value }))}
                  placeholder="例如：85 表示85折"
                  className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
                />
              </div>
            )}
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">有效期（天）<span className="text-vr-error">*</span></label>
              <input
                type="number"
                min={1}
                value={giftCouponForm.validityDays}
                onChange={(e) => setGiftCouponForm((f) => ({ ...f, validityDays: e.target.value }))}
                placeholder="默认30天"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">赠送原因 <span className="text-vr-error">*</span></label>
              <div className="space-y-2">
                {[
                  { key: 'COMPLAINT', label: '客诉' },
                  { key: 'EQUIPMENT_FAILURE', label: '设备故障' },
                  { key: 'ENTERTAIN_CLIENT', label: '招待客户' },
                  { key: 'OTHER', label: '备注' },
                ].map((r) => (
                  <label key={r.key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="giftCouponReason"
                      checked={giftCouponForm.reason === r.key}
                      onChange={() => setGiftCouponForm((f) => ({ ...f, reason: r.key }))}
                      className="w-4 h-4 accent-vraccent-primary"
                    />
                    <span className="text-vr-body-sm text-vrtext-primary">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">备注说明</label>
              <textarea
                value={giftCouponForm.remark}
                onChange={(e) => setGiftCouponForm((f) => ({ ...f, remark: e.target.value }))}
                placeholder={giftCouponForm.reason === 'OTHER' ? '请输入具体原因（必填）' : '请输入补充说明（选填）'}
                rows={3}
                className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all resize-none"
              />
            </div>
            {giftError && (
              <p className="text-vr-body-sm text-vr-error">{giftError}</p>
            )}
            <div className="pt-4 flex gap-3">
              <button
                onClick={() => setGiftCouponOpen(false)}
                className="flex-1 h-10 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-vr-body-sm font-medium hover:bg-vrbg-elevated transition-colors"
              >
                取消
              </button>
              <button
                disabled={
                  giftLoading ||
                  !giftCouponForm.name.trim() ||
                  !giftCouponForm.validityDays ||
                  parseInt(giftCouponForm.validityDays) < 1 ||
                  (giftCouponForm.type === 'DISCOUNT' && (!giftCouponForm.discountRate || parseInt(giftCouponForm.discountRate) < 1 || parseInt(giftCouponForm.discountRate) > 99)) ||
                  (giftCouponForm.reason === 'OTHER' && !giftCouponForm.remark.trim())
                }
                onClick={async () => {
                  if (!giftingUser) return
                  setGiftLoading(true)
                  setGiftError('')
                  try {
                    await giftCoupon({
                      userId: giftingUser.id,
                      name: giftCouponForm.name.trim(),
                      type: giftCouponForm.type,
                      discountRate: giftCouponForm.type === 'DISCOUNT' ? parseInt(giftCouponForm.discountRate) : undefined,
                      validityDays: parseInt(giftCouponForm.validityDays),
                      reason: giftCouponForm.reason as any,
                      remark: giftCouponForm.remark || undefined,
                    })
                    setGiftCouponOpen(false)
                    queryClient.invalidateQueries({ queryKey: ['users'] })
                  } catch (err: any) {
                    setGiftError(err?.response?.data?.message || err?.message || '赠送失败')
                  } finally {
                    setGiftLoading(false)
                  }
                }}
                className="flex-1 h-10 rounded-lg bg-vraccent-primary text-white text-vr-body-sm font-medium hover:bg-vraccent-primary-hover transition-colors disabled:opacity-50"
              >
                {giftLoading ? '赠送中...' : '确认赠送'}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── Batch Gift Points Sheet ─── */}
      <Sheet open={batchPointsOpen} onOpenChange={setBatchPointsOpen}>
        <SheetContent side="right" className="w-[480px] bg-vrbg-card border-l border-vrborder-subtle p-0 sm:max-w-[480px]">
          <SheetHeader className="p-6 border-b border-vrborder-subtle">
            <SheetTitle className="text-vr-h3 text-vrtext-primary font-semibold">批量赠送积分</SheetTitle>
          </SheetHeader>
          <div className="p-6 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 80px)' }}>
            <div className="flex items-center gap-3 p-3 bg-vrbg-elevated rounded-lg">
              <div className="w-10 h-10 rounded-full bg-vrsuccess/10 flex items-center justify-center text-vrsuccess font-semibold">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-vr-body-sm text-vrtext-primary font-medium">共选择 {selectedIds.length} 位用户</p>
                <p className="text-vr-caption text-vrtext-secondary">积分将赠送给所有选中用户</p>
              </div>
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">积分数量 <span className="text-vr-error">*</span></label>
              <input
                type="number"
                min={1}
                value={batchPointsForm.points}
                onChange={(e) => setBatchPointsForm((f) => ({ ...f, points: e.target.value }))}
                placeholder="请输入积分数量"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">备注</label>
              <textarea
                value={batchPointsForm.remark}
                onChange={(e) => setBatchPointsForm((f) => ({ ...f, remark: e.target.value }))}
                placeholder="请输入备注（选填）"
                rows={3}
                className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all resize-none"
              />
            </div>
            {batchGiftError && (
              <p className="text-vr-body-sm text-vr-error">{batchGiftError}</p>
            )}
            <div className="pt-4 flex gap-3">
              <button
                onClick={() => setBatchPointsOpen(false)}
                className="flex-1 h-10 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-vr-body-sm font-medium hover:bg-vrbg-elevated transition-colors"
              >
                取消
              </button>
              <button
                disabled={batchGiftLoading || !batchPointsForm.points || parseInt(batchPointsForm.points) < 1}
                onClick={() => {
                  batchGiftPointsMutation.mutate({
                    userIds: selectedIds,
                    points: parseInt(batchPointsForm.points),
                    remark: batchPointsForm.remark || undefined,
                  })
                }}
                className="flex-1 h-10 rounded-lg bg-vrsuccess text-white text-vr-body-sm font-medium hover:bg-vrsuccess/90 transition-colors disabled:opacity-50"
              >
                {batchGiftLoading ? '赠送中...' : '确认赠送'}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── Batch Gift Coupon Sheet ─── */}
      <Sheet open={batchCouponOpen} onOpenChange={setBatchCouponOpen}>
        <SheetContent side="right" className="w-[480px] bg-vrbg-card border-l border-vrborder-subtle p-0 sm:max-w-[480px]">
          <SheetHeader className="p-6 border-b border-vrborder-subtle">
            <SheetTitle className="text-vr-h3 text-vrtext-primary font-semibold">批量赠送优惠券</SheetTitle>
          </SheetHeader>
          <div className="p-6 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 80px)' }}>
            <div className="flex items-center gap-3 p-3 bg-vrbg-elevated rounded-lg">
              <div className="w-10 h-10 rounded-full bg-vraccent-primary/10 flex items-center justify-center text-vraccent-primary font-semibold">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-vr-body-sm text-vrtext-primary font-medium">共选择 {selectedIds.length} 位用户</p>
                <p className="text-vr-caption text-vrtext-secondary">优惠券将分别赠送给所有选中用户</p>
              </div>
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">券类型 <span className="text-vr-error">*</span></label>
              <select
                value={batchCouponForm.type}
                onChange={(e) => setBatchCouponForm((f) => ({ ...f, type: e.target.value as 'EXPERIENCE_FREE' | 'DISCOUNT' }))}
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              >
                <option value="EXPERIENCE_FREE">体验券（免单1人）</option>
                <option value="DISCOUNT">折扣券</option>
              </select>
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">券名称 <span className="text-vr-error">*</span></label>
              <input
                type="text"
                value={batchCouponForm.name}
                onChange={(e) => setBatchCouponForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例如：VR体验补偿券"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            {batchCouponForm.type === 'DISCOUNT' && (
              <div>
                <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">折扣率（%）<span className="text-vr-error">*</span></label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={batchCouponForm.discountRate}
                  onChange={(e) => setBatchCouponForm((f) => ({ ...f, discountRate: e.target.value }))}
                  placeholder="例如：85 表示85折"
                  className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
                />
              </div>
            )}
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">有效天数 <span className="text-vr-error">*</span></label>
              <input
                type="number"
                min={1}
                value={batchCouponForm.validDays}
                onChange={(e) => setBatchCouponForm((f) => ({ ...f, validDays: e.target.value }))}
                placeholder="默认30天"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">赠送原因</label>
              <input
                type="text"
                value={batchCouponForm.reason}
                onChange={(e) => setBatchCouponForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="请输入赠送原因（选填）"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">备注</label>
              <textarea
                value={batchCouponForm.remark}
                onChange={(e) => setBatchCouponForm((f) => ({ ...f, remark: e.target.value }))}
                placeholder="请输入备注（选填）"
                rows={3}
                className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all resize-none"
              />
            </div>
            {batchGiftError && (
              <p className="text-vr-body-sm text-vr-error">{batchGiftError}</p>
            )}
            <div className="pt-4 flex gap-3">
              <button
                onClick={() => setBatchCouponOpen(false)}
                className="flex-1 h-10 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-vr-body-sm font-medium hover:bg-vrbg-elevated transition-colors"
              >
                取消
              </button>
              <button
                disabled={
                  batchGiftLoading ||
                  !batchCouponForm.name.trim() ||
                  !batchCouponForm.validDays ||
                  parseInt(batchCouponForm.validDays) < 1 ||
                  (batchCouponForm.type === 'DISCOUNT' && (!batchCouponForm.discountRate || parseInt(batchCouponForm.discountRate) < 1 || parseInt(batchCouponForm.discountRate) > 99))
                }
                onClick={() => {
                  batchGiftCouponMutation.mutate({
                    userIds: selectedIds,
                    data: {
                      name: batchCouponForm.name.trim(),
                      type: batchCouponForm.type,
                      discountRate: batchCouponForm.type === 'DISCOUNT' ? parseInt(batchCouponForm.discountRate) : undefined,
                      validDays: parseInt(batchCouponForm.validDays),
                      giftReason: batchCouponForm.reason || undefined,
                      giftRemark: batchCouponForm.remark || undefined,
                    },
                  })
                }}
                className="flex-1 h-10 rounded-lg bg-vraccent-primary text-white text-vr-body-sm font-medium hover:bg-vraccent-primary-hover transition-colors disabled:opacity-50"
              >
                {batchGiftLoading ? '赠送中...' : '确认赠送'}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── Gift Choice Dialog ─── */}
      <AlertDialog open={giftChoiceOpen} onOpenChange={setGiftChoiceOpen}>
        <AlertDialogContent className="bg-vrbg-card border-vrborder-subtle sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-vrtext-primary">
              赠送 {giftChoiceUser?.name}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-vrtext-secondary">
              请选择赠送类型
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <button
              onClick={() => {
                setGiftChoiceOpen(false)
                if (giftChoiceUser) {
                  setGiftingUser(giftChoiceUser)
                  setGiftPointsForm({ points: '', reason: 'COMPLAINT', remark: '' })
                  setGiftError('')
                  setGiftPointsOpen(true)
                }
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-vrbg-elevated hover:bg-vrsuccess/10 border border-vrborder-subtle hover:border-vrsuccess/30 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-vrsuccess/10 flex items-center justify-center shrink-0">
                <Coins className="w-5 h-5 text-vrsuccess" />
              </div>
              <div>
                <p className="text-vr-body-sm text-vrtext-primary font-medium">赠送积分</p>
                <p className="text-vr-caption text-vrtext-muted">手动赠送积分到会员账户</p>
              </div>
            </button>
            <button
              onClick={() => {
                setGiftChoiceOpen(false)
                if (giftChoiceUser) {
                  setGiftingUser(giftChoiceUser)
                  setGiftCouponForm({ name: '', type: 'EXPERIENCE_FREE', discountRate: '', validityDays: '30', reason: 'COMPLAINT', remark: '' })
                  setGiftError('')
                  setGiftCouponOpen(true)
                }
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-vrbg-elevated hover:bg-vraccent-primary/10 border border-vrborder-subtle hover:border-vraccent-primary/30 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-vraccent-primary/10 flex items-center justify-center shrink-0">
                <Ticket className="w-5 h-5 text-vraccent-primary" />
              </div>
              <div>
                <p className="text-vr-body-sm text-vrtext-primary font-medium">赠送优惠券</p>
                <p className="text-vr-caption text-vrtext-muted">创建体验券或折扣券赠送给会员</p>
              </div>
            </button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-vrborder-subtle text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary">
              取消
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  )
}
