import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Plus, Edit2, Trash2, X, Package, Users, User, UsersRound, Crown, MapPin,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { getGroupBuys, createGroupBuy, updateGroupBuy, deleteGroupBuy, batchDeleteGroupBuys, batchUpdateGroupBuyStatus, type GroupBuyPackage, type GroupBuyInput } from '@/api/groupBuys'
import { getGames } from '@/api/games'
import { getVenues } from '@/api/venues'
import { uploadFile } from '@/api/upload'
import { getImageUrl } from '@/lib/imageUrl'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { hasPermission } from '@/lib/permissions'

const easeOut = [0, 0, 0.2, 1] as [number, number, number, number]

const typeOptions = [
  { value: 'DOUBLE', label: '双人团', icon: Users },
  { value: 'THREE', label: '三人团', icon: UsersRound },
  { value: 'PRIVATE', label: '包场团', icon: Crown },
]

const emptyPackage: Partial<GroupBuyPackage> = {
  gameId: '',
  venues: [],
  title: '',
  subtitle: '',
  type: 'DOUBLE',
  label: '双人团',
  minPeople: 2,
  maxPeople: 2,
  originalPricePerPerson: 0,
  groupPricePerPerson: 0,
  totalGroupPrice: 0,
  coverImage: '',
  tags: [],
  status: 'ACTIVE',
  sortOrder: 0,
  description: '',
  soldText: '近期售 200+',
  refundTags: ['随时退', '过期自动退'],
  packageItems: [],
  processSteps: ['购买团购券', '选择门店与场次', '到店核销入场'],
  notice: '',
  refundNotice: '',
  buyButtonText: '立即抢购',
}

function toYuan(fen: number): number {
  return Math.round(fen / 100)
}
function toFen(yuan: number): number {
  return Math.round(yuan * 100)
}

export default function GroupBuys() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const canManageGroupBuys = hasPermission(currentUser, 'group-buy:manage')
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<GroupBuyPackage | null>(null)
  const [formData, setFormData] = useState<Partial<GroupBuyPackage>>({ ...emptyPackage })
  const [tagInput, setTagInput] = useState('')
  const [refundTagsInput, setRefundTagsInput] = useState('')
  const [packageItemsInput, setPackageItemsInput] = useState('')
  const [processStepsInput, setProcessStepsInput] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)

  const { data: listRes, isLoading } = useQuery({
    queryKey: ['group-buys'],
    queryFn: () => getGroupBuys({ page: 1, pageSize: 100 }),
  })
  const { data: games } = useQuery({
    queryKey: ['games'],
    queryFn: () => getGames(),
  })
  const { data: venues } = useQuery({
    queryKey: ['venues'],
    queryFn: () => getVenues({ pageSize: 100 }),
  })

  const packages = listRes?.data || []

  const filtered = packages.filter((p) => {
    if (!searchQuery) return true
    const s = searchQuery.toLowerCase()
    return p.title.toLowerCase().includes(s) || (p.subtitle && p.subtitle.toLowerCase().includes(s)) || p.game?.title.toLowerCase().includes(s)
  })

  const createMutation = useMutation({
    mutationFn: (data: GroupBuyInput) => createGroupBuy(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['group-buys'] }); closeModal() },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<GroupBuyInput> }) => updateGroupBuy(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['group-buys'] }); closeModal() },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteGroupBuy,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-buys'] }),
  })
  const batchDeleteMutation = useMutation({
    mutationFn: batchDeleteGroupBuys,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['group-buys'] }); setSelectedIds([]) },
  })
  const batchStatusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) => batchUpdateGroupBuyStatus(ids, status),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['group-buys'] }); setSelectedIds([]) },
  })

  const openAdd = () => {
    setEditing(null)
    setFormData({ ...emptyPackage })
    setTagInput('')
    setRefundTagsInput(emptyPackage.refundTags?.join(', ') || '')
    setPackageItemsInput(emptyPackage.packageItems?.join('\n') || '')
    setProcessStepsInput(emptyPackage.processSteps?.join('\n') || '')
    setSelectedVenueIds([])
    setShowModal(true)
  }
  const openEdit = (p: GroupBuyPackage) => {
    setEditing(p)
    setFormData({
      ...p,
      originalPricePerPerson: toYuan(p.originalPricePerPerson),
      groupPricePerPerson: toYuan(p.groupPricePerPerson),
      totalGroupPrice: toYuan(p.totalGroupPrice),
    })
    setTagInput(p.tags.join(', '))
    setRefundTagsInput(p.refundTags.join(', '))
    setPackageItemsInput(p.packageItems.join('\n'))
    setProcessStepsInput(p.processSteps.join('\n'))
    setSelectedVenueIds(p.venues.map((v) => v.id))
    setShowModal(true)
  }
  const closeModal = () => {
    setShowModal(false)
    setEditing(null)
    setFormData({ ...emptyPackage })
    setTagInput('')
    setRefundTagsInput('')
    setPackageItemsInput('')
    setProcessStepsInput('')
    setSelectedVenueIds([])
  }
  const updateField = <K extends keyof GroupBuyPackage>(field: K, value: GroupBuyPackage[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const result = await uploadFile('group-buys', file)
      updateField('coverImage', result.url)
    } catch (err: any) {
      alert('上传失败: ' + (err?.response?.data?.message || err.message))
    } finally {
      setUploading(false)
    }
  }

  const handleSave = () => {
    if (!formData.gameId) { alert('请选择游戏'); return }
    if (selectedVenueIds.length === 0) { alert('请选择至少一个关联场地'); return }
    if (!formData.title) { alert('请输入套餐标题'); return }
    const typeInfo = typeOptions.find((t) => t.value === formData.type)
    const payload: GroupBuyInput = {
      gameId: formData.gameId!,
      venueIds: selectedVenueIds,
      title: formData.title!,
      subtitle: formData.subtitle || null,
      type: formData.type!,
      label: formData.label || typeInfo?.label || '双人团',
      minPeople: Number(formData.minPeople) || 2,
      maxPeople: Number(formData.maxPeople) || 2,
      originalPricePerPerson: toFen(Number(formData.originalPricePerPerson) || 0),
      groupPricePerPerson: toFen(Number(formData.groupPricePerPerson) || 0),
      totalGroupPrice: toFen(Number(formData.totalGroupPrice) || 0),
      coverImage: formData.coverImage || null,
      tags: tagInput.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
      status: formData.status || 'ACTIVE',
      sortOrder: Number(formData.sortOrder) || 0,
      description: formData.description || null,
      soldText: formData.soldText || '近期售 200+',
      refundTags: refundTagsInput.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
      packageItems: packageItemsInput.split('\n').map((t) => t.trim()).filter(Boolean),
      processSteps: processStepsInput.split('\n').map((t) => t.trim()).filter(Boolean),
      notice: formData.notice || null,
      refundNotice: formData.refundNotice || null,
      buyButtonText: formData.buyButtonText || '立即抢购',
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-vr-h2 text-vrtext-primary font-semibold flex items-center gap-2">
              <Package className="w-6 h-6 text-vraccent-primary" />
              团购套餐
            </h1>
            <p className="text-vr-body-sm text-vrtext-secondary mt-1">管理 C 端首页与团购列表展示的套餐</p>
          </div>
          {canManageGroupBuys && (
            <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-vraccent-primary text-white text-vr-body-sm hover:bg-vraccent-primary-hover transition-colors">
              <Plus className="w-4 h-4" />新增套餐
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vrtext-muted" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索套餐名称或游戏..."
              className="w-full h-10 pl-9 pr-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary"
            />
          </div>
          {selectedIds.length > 0 && canManageGroupBuys && (
            <div className="flex items-center gap-2">
              <button onClick={() => batchStatusMutation.mutate({ ids: selectedIds, status: 'ACTIVE' })} className="px-3 py-1.5 rounded-lg border border-vrsuccess text-vrsuccess text-vr-caption hover:bg-vrsuccess/10">上架</button>
              <button onClick={() => batchStatusMutation.mutate({ ids: selectedIds, status: 'INACTIVE' })} className="px-3 py-1.5 rounded-lg border border-vrwarning text-vrwarning text-vr-caption hover:bg-vrwarning/10">下架</button>
              <button onClick={() => batchDeleteMutation.mutate(selectedIds)} className="px-3 py-1.5 rounded-lg border border-vrerror text-vrerror text-vr-caption hover:bg-vrerror/10">删除</button>
            </div>
          )}
        </div>

        <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-vrbg-surface border-b border-vrborder-subtle text-vr-caption text-vrtext-secondary">
              <tr>
                <th className="px-4 py-3 w-10"><input type="checkbox" checked={selectedIds.length > 0 && selectedIds.length === filtered.length} onChange={(e) => setSelectedIds(e.target.checked ? filtered.map((p) => p.id) : [])} className="rounded" /></th>
                <th className="px-4 py-3">套餐</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">人数</th>
                <th className="px-4 py-3 text-right">团购价</th>
                <th className="px-4 py-3 text-center">状态</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-vrtext-secondary">加载中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-vrtext-secondary">暂无团购套餐</td></tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="border-b border-vrborder-subtle hover:bg-vrbg-surface/50">
                    <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} className="rounded" /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.coverImage ? (
                          <img src={getImageUrl(p.coverImage)} alt="" className="w-12 h-12 rounded-lg object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-vrbg-elevated flex items-center justify-center text-vrtext-muted"><Package className="w-5 h-5" /></div>
                        )}
                        <div>
                          <p className="text-vr-body-sm font-medium text-vrtext-primary">{p.title}</p>
                          <p className="text-vr-caption text-vrtext-tertiary">{p.game?.title}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-vr-body-sm text-vrtext-secondary">{p.label}</td>
                    <td className="px-4 py-3 text-vr-body-sm text-vrtext-secondary">{p.minPeople}-{p.maxPeople}人</td>
                    <td className="px-4 py-3 text-right text-vr-body-sm font-medium text-vrerror">¥{(p.totalGroupPrice / 100).toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-vr-caption', p.status === 'ACTIVE' ? 'bg-vrsuccess/10 text-vrsuccess' : 'bg-vrtext-muted/10 text-vrtext-muted')}>
                        {p.status === 'ACTIVE' ? '上架' : '下架'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManageGroupBuys && (
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => openEdit(p)} className="text-vr-body-sm text-vraccent-primary hover:underline">编辑</button>
                          <button onClick={() => deleteMutation.mutate(p.id)} className="text-vr-body-sm text-vrerror hover:underline">删除</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ ease: easeOut, duration: 0.2 }}
              className="bg-vrbg-card border border-vrborder-subtle rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-vrbg-card border-b border-vrborder-subtle px-6 py-4 flex items-center justify-between z-10">
                <h3 className="text-vr-h4 text-vrtext-primary font-semibold">{editing ? '编辑套餐' : '新增套餐'}</h3>
                <button onClick={closeModal}><X className="w-5 h-5 text-vrtext-muted hover:text-vrtext-primary" /></button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">关联游戏 <span className="text-vrerror">*</span></label>
                    <select value={formData.gameId} onChange={(e) => updateField('gameId', e.target.value)} className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary">
                      <option value="">请选择游戏</option>
                      {games?.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">关联场地 <span className="text-vrerror">*</span></label>
                    <div className="max-h-32 overflow-y-auto bg-vrbg-surface border border-vrborder-subtle rounded-lg p-2 space-y-1">
                      {venues?.data?.map((v) => (
                        <label key={v.id} className="flex items-center gap-2 text-vr-body-sm text-vrtext-primary hover:bg-vrbg-elevated rounded px-2 py-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedVenueIds.includes(v.id)}
                            onChange={(e) => {
                              setSelectedVenueIds((prev) => e.target.checked ? [...prev, v.id] : prev.filter((id) => id !== v.id))
                            }}
                            className="rounded border-vrborder-subtle text-vraccent-primary focus:ring-vraccent-primary"
                          />
                          <span>{v.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">套餐类型</label>
                    <select value={formData.type} onChange={(e) => {
                      const type = e.target.value
                      const info = typeOptions.find((t) => t.value === type)
                      updateField('type', type)
                      updateField('label', info?.label || '双人团')
                      if (type === 'DOUBLE') { updateField('minPeople', 2); updateField('maxPeople', 2) }
                      if (type === 'THREE') { updateField('minPeople', 3); updateField('maxPeople', 3) }
                      if (type === 'PRIVATE') { updateField('minPeople', 4); updateField('maxPeople', 10) }
                    }} className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary">
                      {typeOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">套餐标题 <span className="text-vrerror">*</span></label>
                    <input value={formData.title} onChange={(e) => updateField('title', e.target.value)} className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary" />
                  </div>
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">副标题</label>
                    <input value={formData.subtitle || ''} onChange={(e) => updateField('subtitle', e.target.value)} className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">标签文案</label>
                    <input value={formData.label} onChange={(e) => updateField('label', e.target.value)} className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary" />
                  </div>
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">标签（逗号分隔）</label>
                    <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="科幻射击, 沉浸冒险" className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">最少人数</label>
                    <input type="number" value={formData.minPeople} onChange={(e) => updateField('minPeople', Number(e.target.value))} className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary" />
                  </div>
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">最多人数</label>
                    <input type="number" value={formData.maxPeople} onChange={(e) => updateField('maxPeople', Number(e.target.value))} className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">原价/人（元）</label>
                    <input type="number" value={formData.originalPricePerPerson} onChange={(e) => updateField('originalPricePerPerson', Number(e.target.value))} className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary" />
                  </div>
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">团购价/人（元）</label>
                    <input type="number" value={formData.groupPricePerPerson} onChange={(e) => updateField('groupPricePerPerson', Number(e.target.value))} className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary" />
                  </div>
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">套餐总价（元）</label>
                    <input type="number" value={formData.totalGroupPrice} onChange={(e) => updateField('totalGroupPrice', Number(e.target.value))} className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">排序</label>
                    <input type="number" value={formData.sortOrder} onChange={(e) => updateField('sortOrder', Number(e.target.value))} className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary" />
                  </div>
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">状态</label>
                    <select value={formData.status} onChange={(e) => updateField('status', e.target.value)} className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary">
                      <option value="ACTIVE">上架</option>
                      <option value="INACTIVE">下架</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-vr-caption text-vrtext-secondary mb-1">封面图</label>
                  <div className="flex items-center gap-3">
                    {formData.coverImage ? (
                      <img src={getImageUrl(formData.coverImage)} alt="" className="w-16 h-16 rounded-lg object-cover" />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-vrbg-elevated flex items-center justify-center text-vrtext-muted"><Package className="w-6 h-6" /></div>
                    )}
                    <div className="flex flex-col gap-1">
                      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-vrborder-subtle text-vr-body-sm text-vrtext-secondary hover:border-vraccent-primary hover:text-vraccent-primary cursor-pointer transition-colors">
                        <Plus className="w-4 h-4" />
                        {uploading ? '上传中...' : '上传封面'}
                        <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml" className="hidden" onChange={handleImageUpload} />
                      </label>
                      <p className="text-vr-caption text-vrtext-tertiary">支持 jpg、png、gif、webp、svg，单张 ≤5MB</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">销量文案</label>
                    <input value={formData.soldText || ''} onChange={(e) => updateField('soldText', e.target.value)} placeholder="近期售 200+" className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary" />
                  </div>
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">退款标签（逗号分隔）</label>
                    <input value={refundTagsInput} onChange={(e) => setRefundTagsInput(e.target.value)} placeholder="随时退, 过期自动退" className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary" />
                  </div>
                </div>

                <div>
                  <label className="block text-vr-caption text-vrtext-secondary mb-1">套餐内容（每行一项，为空时按默认生成）</label>
                  <textarea rows={3} value={packageItemsInput} onChange={(e) => setPackageItemsInput(e.target.value)} placeholder={`《游戏名》2人体验 1 场\n含 2 人入场名额、设备调试、场地服务\n体验时长 30 分钟，需提前预约场次`} className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary resize-none" />
                </div>

                <div>
                  <label className="block text-vr-caption text-vrtext-secondary mb-1">预约流程（每行一步）</label>
                  <textarea rows={2} value={processStepsInput} onChange={(e) => setProcessStepsInput(e.target.value)} placeholder={`购买团购券\n选择门店与场次\n到店核销入场`} className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary resize-none" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">使用须知</label>
                    <textarea rows={3} value={formData.notice || ''} onChange={(e) => updateField('notice', e.target.value)} placeholder={`本套餐限 2 人同时使用，不可拆分使用。\n需在有效期内完成预约并到店核销。`} className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary resize-none" />
                  </div>
                  <div>
                    <label className="block text-vr-caption text-vrtext-secondary mb-1">退款规则</label>
                    <textarea rows={3} value={formData.refundNotice || ''} onChange={(e) => updateField('refundNotice', e.target.value)} placeholder={`未预约或预约开始前 2 小时以上，可随时退款。\n已核销或超过预约开始时间后不可退款。`} className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary resize-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-vr-caption text-vrtext-secondary mb-1">购买按钮文案</label>
                  <input value={formData.buyButtonText || ''} onChange={(e) => updateField('buyButtonText', e.target.value)} placeholder="立即抢购" className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary" />
                </div>

                <div>
                  <label className="block text-vr-caption text-vrtext-secondary mb-1">描述</label>
                  <textarea rows={3} value={formData.description || ''} onChange={(e) => updateField('description', e.target.value)} className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary resize-none" />
                </div>
              </div>

              <div className="sticky bottom-0 bg-vrbg-card border-t border-vrborder-subtle px-6 py-4 flex justify-end gap-3">
                <button onClick={closeModal} className="px-4 py-2 rounded-lg border border-vrborder-subtle text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors">取消</button>
                <button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="px-4 py-2 rounded-lg bg-vraccent-primary text-white text-vr-body-sm hover:bg-vraccent-primary-hover transition-colors disabled:opacity-50">
                  {createMutation.isPending || updateMutation.isPending ? '保存中...' : '保存'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  )
}
