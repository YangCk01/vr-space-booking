import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Coins, Gift, Ticket, Package, Tag, MapPin, Store, ClipboardList, X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'

interface PointsProduct {
  id: string
  name: string
  description: string | null
  image: string | null
  type: 'EXPERIENCE_TICKET' | 'COUPON' | 'PHYSICAL_GOOD'
  pointsCost: number
  discountRate: number | null
  validityDays: number | null
  stock: number
  status: string
}

async function getProducts() {
  const res = await apiClient.get('/points/products')
  return (res.data.data || []) as PointsProduct[]
}

async function exchangeProduct(productId: string) {
  const res = await apiClient.post('/points/exchange', { productId })
  return res.data
}

async function createPointsOrder(data: {
  productId: string
  deliveryType: 'PICKUP' | 'DELIVERY'
  recipientName?: string
  recipientPhone?: string
  address?: string
}) {
  const res = await apiClient.post('/points/orders', data)
  return res.data
}

type ConfirmType = 'virtual' | 'physical' | null

export default function PointsMall() {
  const navigate = useNavigate()
  const { user, isLoggedIn, refreshUser } = useAuth()
  const queryClient = useQueryClient()
  const { toast, success: toastSuccess, error: toastError } = useToast()

  const [activeCategory, setActiveCategory] = useState<string>('ALL')
  const [confirmType, setConfirmType] = useState<ConfirmType>(null)
  const [selectedProduct, setSelectedProduct] = useState<PointsProduct | null>(null)
  const [deliveryType, setDeliveryType] = useState<'PICKUP' | 'DELIVERY'>('PICKUP')
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [address, setAddress] = useState('')

  useEffect(() => {
    if (isLoggedIn) refreshUser()
  }, [isLoggedIn, refreshUser])

  const { data: products, isLoading } = useQuery({
    queryKey: ['points-products'],
    queryFn: getProducts,
  })

  const exchangeMutation = useMutation({
    mutationFn: exchangeProduct,
    onSuccess: () => {
      toastSuccess('兑换成功！已发放到优惠券')
      queryClient.invalidateQueries({ queryKey: ['points-products'] })
      queryClient.invalidateQueries({ queryKey: ['points-orders'] })
      refreshUser()
      setConfirmType(null)
      setSelectedProduct(null)
    },
    onError: (err: any) => {
      toastError(err?.response?.data?.message || '兑换失败')
    },
  })

  const orderMutation = useMutation({
    mutationFn: createPointsOrder,
    onSuccess: () => {
      toastSuccess('下单成功！')
      queryClient.invalidateQueries({ queryKey: ['points-products'] })
      queryClient.invalidateQueries({ queryKey: ['points-orders'] })
      refreshUser()
      setConfirmType(null)
      setSelectedProduct(null)
      setDeliveryType('PICKUP')
      setRecipientName('')
      setRecipientPhone('')
      setAddress('')
    },
    onError: (err: any) => {
      toastError(err?.response?.data?.message || '下单失败')
    },
  })

  const filteredProducts = products?.filter((p) => {
    if (activeCategory === 'ALL') return p.status === 'ON_SALE'
    return p.type === activeCategory && p.status === 'ON_SALE'
  }) || []

  const categories = [
    { key: 'ALL', label: '全部', icon: Gift },
    { key: 'EXPERIENCE_TICKET', label: '体验券', icon: Ticket },
    { key: 'COUPON', label: '优惠券', icon: Tag },
    { key: 'PHYSICAL_GOOD', label: '小商品', icon: Package },
  ]

  const openConfirm = (product: PointsProduct) => {
    if (!isLoggedIn) {
      toastError('请先登录')
      navigate('/login')
      return
    }
    if ((user?.points || 0) < product.pointsCost) {
      toastError('积分不足')
      return
    }
    if (product.stock === 0) {
      toastError('库存不足')
      return
    }
    setSelectedProduct(product)
    setConfirmType(product.type === 'PHYSICAL_GOOD' ? 'physical' : 'virtual')
  }

  const handleVirtualExchange = () => {
    if (!selectedProduct) return
    exchangeMutation.mutate(selectedProduct.id)
  }

  const handlePhysicalOrder = () => {
    if (!selectedProduct) return
    if (deliveryType === 'DELIVERY' && (!recipientName.trim() || !recipientPhone.trim() || !address.trim())) {
      toastError('请填写完整的收货信息')
      return
    }
    orderMutation.mutate({
      productId: selectedProduct.id,
      deliveryType,
      recipientName: deliveryType === 'DELIVERY' ? recipientName : undefined,
      recipientPhone: deliveryType === 'DELIVERY' ? recipientPhone : undefined,
      address: deliveryType === 'DELIVERY' ? address : undefined,
    })
  }

  const isProcessing = exchangeMutation.isPending || orderMutation.isPending

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] pb-nav-xl"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center">
            <button onClick={() => navigate(-1)} className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">积分商城</h1>
          </div>
          {isLoggedIn && <div />}
        </div>
      </div>

      {/* 主体：左分类 + 右内容（积分卡片 + 商品） */}
      <div className="flex max-w-lg mx-auto" style={{ minHeight: 'calc(100dvh - 48px)' }}>
        {/* 左侧分类栏 */}
        <div className="w-[72px] shrink-0 pt-4 pb-8 border-r border-[var(--border-subtle)]">
          <div className="flex flex-col gap-1 px-2">
            {categories.map((cat) => {
              const isActive = activeCategory === cat.key
              const Icon = cat.icon
              return (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={cn(
                    'flex flex-col items-center gap-1 py-3 px-1 rounded-xl text-[10px] transition-all',
                    isActive
                      ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  )}
                >
                  <Icon className={cn('w-5 h-5', isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]')} />
                  <span>{cat.label}</span>
                  {isActive && (
                    <span className="w-4 h-0.5 rounded-full bg-[var(--accent-primary)]" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 overflow-y-auto">
          {/* 紧凑积分卡片 */}
          <div className="px-3 pt-3">
            <div className="rounded-2xl bg-gradient-to-r from-[var(--accent-primary)] to-purple-600 p-3.5 flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                  <Coins className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <p className="text-white/70 text-[10px]">可用积分</p>
                  <p className="text-white text-xl font-bold leading-tight">{isLoggedIn ? (user?.points || 0) : 0}</p>
                </div>
              </div>
              <button
                onClick={() => navigate('/points-orders')}
                className="text-xs text-white/90 bg-white/15 hover:bg-white/25 rounded-full px-3 py-1.5 transition-colors"
              >
                我的兑换
              </button>
            </div>
          </div>

          {/* 商品网格 */}
          <div className="px-3 pt-3 pb-8">
            {isLoading && (
              <div className="text-center text-[var(--text-muted)] text-sm pt-8">加载中...</div>
            )}

            {!isLoading && filteredProducts.length === 0 && (
              <div className="text-center text-[var(--text-muted)] pt-12">
                <Gift className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-xs">暂无商品</p>
              </div>
            )}

            {!isLoading && filteredProducts.length > 0 && (
              <div className={cn('grid gap-3', filteredProducts.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    userPoints={user?.points || 0}
                    onExchange={() => openConfirm(product)}
                    isExchanging={isProcessing}
                    isSingle={filteredProducts.length === 1}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== 确认弹窗 ===== */}
      <AnimatePresence>
        {confirmType && selectedProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
            onClick={() => { if (!isProcessing) { setConfirmType(null); setSelectedProduct(null) } }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg bg-[var(--bg-primary)] rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  {confirmType === 'virtual' ? '确认兑换' : '确认下单'}
                </h3>
                <button
                  onClick={() => { if (!isProcessing) { setConfirmType(null); setSelectedProduct(null) } }}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4">
                {/* 商品信息 */}
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-16 h-16 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center shrink-0">
                    {selectedProduct.image ? (
                      <img src={selectedProduct.image} alt="" className="w-full h-full object-cover rounded-lg" />
                    ) : selectedProduct.type === 'EXPERIENCE_TICKET' ? (
                      <Ticket className="w-7 h-7 text-[var(--accent-primary)]" />
                    ) : selectedProduct.type === 'COUPON' ? (
                      <Tag className="w-7 h-7 text-[var(--accent-primary)]" />
                    ) : (
                      <Package className="w-7 h-7 text-[var(--accent-primary)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{selectedProduct.name}</p>
                    {selectedProduct.description && (
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">{selectedProduct.description}</p>
                    )}
                    <div className="flex items-center gap-1 mt-1">
                      <Coins className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-sm font-bold text-amber-500">{selectedProduct.pointsCost}</span>
                      <span className="text-xs text-[var(--text-muted)]">积分</span>
                    </div>
                  </div>
                </div>

                {/* 虚拟商品：提示信息 */}
                {confirmType === 'virtual' && (
                  <div className="bg-[var(--bg-elevated)] rounded-xl p-3 mb-4">
                    <p className="text-xs text-[var(--text-muted)]">
                      兑换后将直接发放到您的优惠券，可在预约游戏时使用。有效期 30 天。
                    </p>
                  </div>
                )}

                {/* 实物商品：收货方式 */}
                {confirmType === 'physical' && (
                  <div className="space-y-3 mb-4">
                    <p className="text-sm font-medium text-[var(--text-primary)]">收货方式</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setDeliveryType('PICKUP')}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm transition-all',
                          deliveryType === 'PICKUP'
                            ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                            : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                        )}
                      >
                        <Store className="w-4 h-4" />
                        线下领取
                      </button>
                      <button
                        onClick={() => setDeliveryType('DELIVERY')}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm transition-all',
                          deliveryType === 'DELIVERY'
                            ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                            : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                        )}
                      >
                        <MapPin className="w-4 h-4" />
                        邮寄
                      </button>
                    </div>

                    {deliveryType === 'DELIVERY' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-2"
                      >
                        <input
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          placeholder="收货人姓名"
                          className="w-full bg-[var(--bg-elevated)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] outline-none"
                        />
                        <input
                          value={recipientPhone}
                          onChange={(e) => setRecipientPhone(e.target.value)}
                          placeholder="联系电话"
                          className="w-full bg-[var(--bg-elevated)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] outline-none"
                        />
                        <textarea
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="详细地址"
                          className="w-full bg-[var(--bg-elevated)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] outline-none resize-none h-20"
                        />
                      </motion.div>
                    )}
                  </div>
                )}

                {/* 积分信息 */}
                <div className="flex items-center justify-between py-3 border-t border-[var(--border-subtle)] mb-4">
                  <span className="text-sm text-[var(--text-muted)]">可用积分</span>
                  <span className="text-sm text-[var(--text-primary)]">{user?.points || 0}</span>
                </div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-[var(--text-muted)]">{confirmType === 'virtual' ? '需消耗' : '订单金额'}</span>
                  <span className="text-sm font-bold text-amber-500">{selectedProduct.pointsCost} 积分</span>
                </div>

                {/* 确认按钮 */}
                <button
                  onClick={confirmType === 'virtual' ? handleVirtualExchange : handlePhysicalOrder}
                  disabled={isProcessing}
                  className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isProcessing
                    ? '处理中...'
                    : confirmType === 'virtual'
                    ? `确认兑换（-${selectedProduct.pointsCost}积分）`
                    : `确认下单（-${selectedProduct.pointsCost}积分）`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      {toast.visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className={cn(
            'fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm text-white shadow-lg',
            toast.type === 'success' ? 'bg-[var(--success)]' : 'bg-[var(--error)]'
          )}
        >
          {toast.message}
        </motion.div>
      )}
    </motion.div>
  )
}

function ProductCard({
  product,
  userPoints,
  onExchange,
  isExchanging,
  isSingle = false,
}: {
  product: PointsProduct
  userPoints: number
  onExchange: () => void
  isExchanging: boolean
  isSingle?: boolean
}) {
  const canExchange = userPoints >= product.pointsCost && product.stock !== 0

  const TypeIcon =
    product.type === 'EXPERIENCE_TICKET'
      ? Ticket
      : product.type === 'COUPON'
      ? Tag
      : Package

  return (
    <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden flex flex-col">
      {/* 上方大图 — 单个时限制高度避免过大 */}
      <div className={cn(
        'relative bg-[var(--bg-elevated)] flex items-center justify-center overflow-hidden',
        isSingle ? 'aspect-[16/9]' : 'aspect-square'
      )}>
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <TypeIcon className="w-12 h-12 text-[var(--accent-primary)] opacity-50" />
        )}
        {/* 折扣角标 */}
        {product.type === 'COUPON' && product.discountRate && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold shadow-sm">
            {(product.discountRate / 10).toFixed(product.discountRate % 10 === 0 ? 0 : 1)}折
          </span>
        )}
        {/* 库存角标 — 右上角小字，不抢眼 */}
        {product.stock !== 0 && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/40 text-white/90 text-[9px]">
            {product.stock === -1 ? '充足' : `剩${product.stock}`}
          </span>
        )}
        {/* 已售罄遮罩 */}
        {product.stock === 0 && (
          <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="px-3 py-1 rounded-full bg-black/60 text-white text-xs font-medium">已售罄</span>
          </span>
        )}
      </div>

      {/* 下方信息区 */}
      <div className="p-3 flex flex-col gap-1">
        <h3 className="text-sm font-medium text-[var(--text-primary)] line-clamp-1 leading-tight">
          {product.name}
        </h3>

        {product.description && (
          <p className="text-[10px] text-[var(--text-muted)] line-clamp-1">
            {product.description}
          </p>
        )}

        {/* 积分价格 + 库存 */}
        <div className="flex items-center justify-between mt-0.5">
          <div className="flex items-baseline gap-0.5">
            <span className="text-base font-bold text-amber-500">{product.pointsCost}</span>
            <span className="text-[10px] text-amber-500/80">积分</span>
          </div>
          {product.stock > 0 && (
            <span className="text-[9px] text-[var(--text-muted)]">剩余{product.stock}件</span>
          )}
        </div>

        {/* 兑换按钮 */}
        <button
          onClick={onExchange}
          disabled={!canExchange || isExchanging}
          className={`w-full h-7 rounded-full text-xs font-medium transition-all mt-0.5 ${
            canExchange && !isExchanging
              ? 'bg-[var(--accent-primary)] text-white hover:opacity-90 active:scale-95'
              : 'bg-[var(--border-hover)] text-[var(--text-muted)] cursor-not-allowed'
          }`}
        >
          {isExchanging ? '...' : '立即兑换'}
        </button>
      </div>
    </div>
  )
}
