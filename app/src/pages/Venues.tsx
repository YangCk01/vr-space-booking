import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Home,
  X,
  AlertTriangle,
  Upload,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { getVenues, createVenue, updateVenue, deleteVenue, batchDeleteVenues, batchUpdateVenueStatus } from '@/api/venues'
import type { Venue } from '@/api/venues'
import { uploadFile } from '@/api/upload'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { getImageUrl } from '@/lib/imageUrl'
import { hasAnyPermission, hasPermission } from '@/lib/permissions'

/* ─── Animation variants ─── */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.2 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1, x: 0,
    transition: { duration: 0.35, ease: [0, 0, 0.2, 1] as [number, number, number, number] },
  },
}

const easeOut = [0, 0, 0.2, 1] as [number, number, number, number]

/* ─── Status badge component ─── */
const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  open: { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess', label: '营业中' },
  maintenance: { bg: 'bg-vrwarning/15', text: 'text-vrwarning', label: '维护中' },
  closed: { bg: 'bg-vrtext-muted/15', text: 'text-vrtext-tertiary', label: '暂停营业' },
}

const apiStatusMap: Record<string, string> = {
  FREE: 'open',
  'IN_USE': 'open',
  MAINTENANCE: 'maintenance',
  DISABLED: 'closed',
}

const reverseStatusMap: Record<string, string> = {
  open: 'FREE',
  maintenance: 'MAINTENANCE',
  closed: 'DISABLED',
}

function normalizeStatus(status: string): string {
  return apiStatusMap[status] || status.toLowerCase()
}

function toApiStatus(status: string): string {
  return reverseStatusMap[status] || status.toUpperCase()
}

function isWithinMaintenanceWindow(venue: Venue): boolean {
  if (venue.status !== 'MAINTENANCE') return false
  if (!venue.maintenanceStartDate || !venue.maintenanceEndDate || !venue.maintenanceStartTime || !venue.maintenanceEndTime) {
    return false
  }
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10)
  const timeStr = now.toTimeString().slice(0, 5)
  const startDate = venue.maintenanceStartDate.slice(0, 10)
  const endDate = venue.maintenanceEndDate.slice(0, 10)
  if (dateStr < startDate || dateStr > endDate) return false
  if (dateStr === startDate && timeStr < venue.maintenanceStartTime) return false
  if (dateStr === endDate && timeStr > venue.maintenanceEndTime) return false
  return true
}

function getEffectiveStatus(venue: Venue): string {
  if (venue.status === 'DISABLED') return 'closed'
  if (isWithinMaintenanceWindow(venue)) return 'maintenance'
  return 'open'
}

function StatusBadge({ venue }: { venue: Venue }) {
  const normalized = getEffectiveStatus(venue)
  const cfg = statusConfig[normalized] || statusConfig.closed
  return (
    <span className={cn('inline-flex items-center px-3 py-1 rounded-full text-vr-caption font-medium', cfg.bg, cfg.text)}>
      {cfg.label}
    </span>
  )
}

/* ─── Filter tabs ─── */
const filterTabs = [
  { key: 'all', label: '全部' },
  { key: 'FREE', label: '营业中' },
  { key: 'MAINTENANCE', label: '维护中' },
  { key: 'DISABLED', label: '暂停营业' },
]

/* ─── Empty venue template ─── */
const emptyVenue = {
  name: '',
  theme: '',
  status: 'open',
  image: '',
  capacity: 0,
  area: 0,
  deviceCount: 1,
  address: '',
  phone: '',
  openTime: '09:00',
  closeTime: '22:00',
  qrCode: '',
  serviceQr: '',
  mapLinks: [],
  maintenanceStartDate: '',
  maintenanceEndDate: '',
  maintenanceStartTime: '',
  maintenanceEndTime: '',
}

const statusOptions = [
  { key: 'open', label: '营业中' },
  { key: 'maintenance', label: '维护中' },
  { key: 'closed', label: '暂停营业' },
]

export default function Venues() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const canManageVenues = hasPermission(currentUser, 'venue:manage')
  const canMaintainVenues = hasAnyPermission(currentUser, ['venue:manage', 'venue:maintenance'])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [uploadingImage, setUploadingImage] = useState(false)

  /* ─── Fetch venues ─── */
  const { data: venueData, isLoading } = useQuery({
    queryKey: ['venues', activeFilter, searchQuery],
    queryFn: () =>
      getVenues({
        status: activeFilter === 'all' ? undefined : activeFilter,
        search: searchQuery || undefined,
      }),
  })

  const venueList = useMemo(() => venueData?.data || [], [venueData])

  /* ─── Clear selection on filter change ─── */
  useEffect(() => {
    setSelectedIds([])
  }, [activeFilter, searchQuery])

  /* ─── Mutations ─── */
  const createMutation = useMutation({
    mutationFn: createVenue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] })
      closeModal()
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || '创建失败')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateVenue(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] })
      closeModal()
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || '更新失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteVenue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] })
      closeDelete()
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || '删除失败，请检查该场地是否有关联的预约或订单'
      alert(msg)
    },
  })

  const batchDeleteMutation = useMutation({
    mutationFn: batchDeleteVenues,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] })
      setSelectedIds([])
      setShowBatchDelete(false)
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || '批量删除失败')
    },
  })

  const batchUpdateStatusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) => batchUpdateVenueStatus(ids, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] })
      setSelectedIds([])
      setShowBatchStatus(false)
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || '批量变更状态失败')
    },
  })

  /* Modal states */
  const [showModal, setShowModal] = useState(false)
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null)
  const [formData, setFormData] = useState<any>({ ...emptyVenue })

  /* Delete dialog state */
  const [showDelete, setShowDelete] = useState(false)
  const [deletingVenue, setDeletingVenue] = useState<Venue | null>(null)

  /* Batch operations state */
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showBatchDelete, setShowBatchDelete] = useState(false)
  const [showBatchStatus, setShowBatchStatus] = useState(false)
  const [batchStatusValue, setBatchStatusValue] = useState('ACTIVE')

  /* ─── Modal handlers ─── */
  const openAdd = () => {
    setEditingVenue(null)
    setFormData({ ...emptyVenue })
    setShowModal(true)
  }

  const openEdit = (venue: Venue) => {
    setEditingVenue(venue)
    const dateStr = (d: string | null) => d ? d.slice(0, 10) : ''
    setFormData({
      ...venue,
      status: normalizeStatus(venue.status),
      openTime: venue.openTime || '09:00',
      closeTime: venue.closeTime || '22:00',
      qrCode: venue.qrCode || '',
      serviceQr: venue.serviceQr || '',
      mapLinks: Array.isArray(venue.mapLinks) ? venue.mapLinks : [],
      maintenanceStartDate: dateStr(venue.maintenanceStartDate),
      maintenanceEndDate: dateStr(venue.maintenanceEndDate),
      maintenanceStartTime: venue.maintenanceStartTime || '',
      maintenanceEndTime: venue.maintenanceEndTime || '',
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingVenue(null)
    setFormData({ ...emptyVenue })
  }

  const todayStr = new Date().toISOString().slice(0, 10)

  const handleSubmit = () => {
    if (!formData.name || !formData.area || !formData.capacity || !formData.deviceCount) return

    if (formData.status === 'maintenance') {
      if (!formData.maintenanceStartDate || !formData.maintenanceEndDate || !formData.maintenanceStartTime || !formData.maintenanceEndTime) {
        alert('维护状态必须填写维护开始/结束日期和时间')
        return
      }
      if (formData.maintenanceStartDate < todayStr) {
        alert('维护开始日期不能早于今天')
        return
      }
      if (formData.maintenanceEndDate < formData.maintenanceStartDate) {
        alert('维护结束日期不能早于维护开始日期')
        return
      }
      const start = new Date(`${formData.maintenanceStartDate}T${formData.maintenanceStartTime}`)
      const end = new Date(`${formData.maintenanceEndDate}T${formData.maintenanceEndTime}`)
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        alert('维护结束时间必须晚于维护开始时间')
        return
      }
    }

    const payload: any = {
      name: formData.name,
      theme: formData.theme || '',
      status: toApiStatus(formData.status),
      area: Number(formData.area),
      capacity: Number(formData.capacity),
      deviceCount: Number(formData.deviceCount) || 1,
      image: formData.image || undefined,
      openTime: formData.openTime || '09:00',
      closeTime: formData.closeTime || '22:00',
      address: formData.address,
      phone: formData.phone,
      qrCode: formData.qrCode || undefined,
      serviceQr: formData.serviceQr || undefined,
      mapLinks: formData.mapLinks || undefined,
    }

    if (formData.status === 'maintenance') {
      payload.maintenanceStartDate = formData.maintenanceStartDate || undefined
      payload.maintenanceEndDate = formData.maintenanceEndDate || undefined
      payload.maintenanceStartTime = formData.maintenanceStartTime || undefined
      payload.maintenanceEndTime = formData.maintenanceEndTime || undefined
    } else {
      payload.maintenanceStartDate = null
      payload.maintenanceEndDate = null
      payload.maintenanceStartTime = null
      payload.maintenanceEndTime = null
    }

    if (editingVenue) {
      updateMutation.mutate({ id: editingVenue.id, data: payload })
    } else {
      createMutation.mutate(payload as any)
    }
  }

  /* ─── Delete handlers ─── */
  const openDelete = (venue: Venue) => {
    setDeletingVenue(venue)
    setShowDelete(true)
  }

  const closeDelete = () => {
    setShowDelete(false)
    setDeletingVenue(null)
  }

  const handleDelete = () => {
    if (!deletingVenue) return
    deleteMutation.mutate(deletingVenue.id)
  }

  /* ─── Form field updater ─── */
  const updateField = (field: keyof Venue, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <Layout breadcrumb={['场地管理']}>
      {/* ─── Top action bar ─── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: easeOut }}
        className="flex items-center justify-between mb-4"
      >
        {/* Title */}
        <div>
          <div className="flex items-center gap-2 text-vrtext-secondary mb-1">
            <Home className="w-4 h-4" />
            <span className="text-vr-body-sm">场地管理</span>
          </div>
          <h1 className="text-vr-h1 text-vrtext-primary font-semibold">场地管理</h1>
          <p className="text-vr-body-sm text-vrtext-tertiary mt-0.5">
            场地信息、设备状态、可视化管理
          </p>
        </div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1, ease: easeOut }}
          className="relative"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vrtext-muted" />
          <input
            type="text"
            placeholder="搜索场地名称..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-[280px] h-10 pl-9 pr-4 bg-vrbg-elevated border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vr-blue focus:ring-1 focus:ring-vr-blue/15 transition-all"
          />
        </motion.div>

        {canManageVenues && (
          <motion.button
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.15, ease: easeOut }}
            whileHover={{ y: -1, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
            whileTap={{ scale: 0.97 }}
            onClick={openAdd}
            className="flex items-center gap-2 h-10 px-5 bg-vraccent-primary text-white text-vr-body-sm font-medium rounded-lg hover:bg-vraccent-primary-hover transition-colors"
          >
            <Plus className="w-4 h-4" />
            新增场地
          </motion.button>
        )}
      </motion.div>

      {/* ─── Filter tabs ─── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="flex items-center gap-2 mb-4"
      >
        {filterTabs.map((tab, index) => (
          <motion.button
            key={tab.key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, delay: index * 0.05 }}
            whileTap={{ scale: 1.02 }}
            onClick={() => setActiveFilter(tab.key)}
            className={cn(
              'px-4 py-1.5 rounded-full text-vr-body-sm font-medium border transition-all duration-200',
              activeFilter === tab.key
                ? 'bg-vraccent-primary/15 text-vr-blue border-[rgba(59,130,246,0.3)]'
                : 'bg-transparent text-vrtext-secondary border-vrborder-DEFAULT hover:bg-vrbg-hover hover:text-vrtext-primary'
            )}
          >
            {tab.label}
          </motion.button>
        ))}
      </motion.div>

      {/* ─── Batch action bar ─── */}
      <AnimatePresence>
        {selectedIds.length > 0 && (canManageVenues || canMaintainVenues) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center justify-between bg-vrbg-elevated rounded-xl border border-vraccent-primary/20 px-4 py-3 mb-4"
          >
            <div className="flex items-center gap-4">
              <span className="text-vr-body-sm text-vrtext-primary font-medium">
                已选择 {selectedIds.length} 项
              </span>
              {canManageVenues && (
                <button
                  onClick={() => setShowBatchDelete(true)}
                  disabled={batchDeleteMutation.isPending}
                  className="h-8 px-3 rounded-lg bg-vrerror text-white text-vr-body-sm font-medium hover:bg-vrerror/90 transition-colors disabled:opacity-50"
                >
                  {batchDeleteMutation.isPending ? '删除中...' : '批量删除'}
                </button>
              )}
              {canMaintainVenues && (
                <button
                  onClick={() => setShowBatchStatus(true)}
                  disabled={batchUpdateStatusMutation.isPending}
                  className="h-8 px-3 rounded-lg bg-vraccent-primary text-white text-vr-body-sm font-medium hover:bg-vraccent-primary/90 transition-colors disabled:opacity-50"
                >
                  {batchUpdateStatusMutation.isPending ? '更新中...' : '批量变更状态'}
                </button>
              )}
            </div>
            <button
              onClick={() => setSelectedIds([])}
              className="text-vr-body-sm text-vrtext-secondary hover:text-vrtext-primary transition-colors"
            >
              清空选择
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Venue table ─── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="bg-vrbg-card rounded-xl border border-vrborder-DEFAULT overflow-hidden"
      >
        {/* Table header */}
        <div className="grid grid-cols-[40px_1fr_80px_80px_80px_100px_100px_120px] items-center h-11 px-4 bg-vrbg-elevated border-b border-vrborder-DEFAULT">
          <span className="text-vr-caption text-vrtext-secondary font-medium text-center">
            <input
              type="checkbox"
              checked={venueList.length > 0 && venueList.every(v => selectedIds.includes(v.id))}
              onChange={() => {
                const allSelected = venueList.every(v => selectedIds.includes(v.id))
                if (allSelected) {
                  setSelectedIds(prev => prev.filter(id => !venueList.some(v => v.id === id)))
                } else {
                  setSelectedIds(prev => [...new Set([...prev, ...venueList.map(v => v.id)])])
                }
              }}
              className="w-4 h-4 rounded cursor-pointer"
            />
          </span>
          <span className="text-vr-caption text-vrtext-secondary font-medium">场地</span>
          <span className="text-vr-caption text-vrtext-secondary font-medium text-center">面积</span>
          <span className="text-vr-caption text-vrtext-secondary font-medium text-center">容量</span>
          <span className="text-vr-caption text-vrtext-secondary font-medium text-center">设备数</span>
          <span className="text-vr-caption text-vrtext-secondary font-medium text-center">营业时间</span>
          <span className="text-vr-caption text-vrtext-secondary font-medium text-center">状态</span>
          <span className="text-vr-caption text-vrtext-secondary font-medium text-right">操作</span>
        </div>

        {/* Table body */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          key={activeFilter + searchQuery}
        >
          <AnimatePresence mode="wait">
            {venueList.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center h-32 text-vrtext-tertiary text-vr-body"
              >
                暂无符合条件的场地
              </motion.div>
            ) : (
              venueList.map((venue) => (
                <motion.div
                  key={venue.id}
                  variants={itemVariants}
                  layout
                  className="grid grid-cols-[40px_1fr_80px_80px_80px_100px_100px_120px] items-center h-16 px-4 border-b border-vrborder-DEFAULT/50 hover:bg-vrbg-hover transition-colors duration-150 group"
                >
                  {/* Checkbox */}
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(venue.id)}
                      onChange={() => {
                        setSelectedIds(prev =>
                          prev.includes(venue.id)
                            ? prev.filter(id => id !== venue.id)
                            : [...prev, venue.id]
                        )
                      }}
                      className="w-4 h-4 rounded cursor-pointer"
                    />
                  </div>

                  {/* Venue info */}
                  <div className="flex items-center gap-3">
                    <img
                      src={venue.image ? getImageUrl(venue.image) : '/venue-a.jpg'}
                      alt={venue.name}
                      className="w-12 h-9 rounded-md object-cover"
                    />
                    <div>
                      <p className="text-vr-body text-vrtext-primary font-medium">{venue.name}</p>
                    </div>
                  </div>

                  {/* Area */}
                  <span className="text-vr-body-sm text-vrtext-primary text-center">{venue.area}㎡</span>

                  {/* Capacity */}
                  <span className="text-vr-body-sm text-vrtext-primary text-center">{venue.capacity}人</span>

                  {/* Device Count */}
                  <span className="text-vr-body-sm text-vrtext-primary text-center">{venue.deviceCount || 1}台</span>

                  {/* Business Hours */}
                  <span className="text-vr-body-sm text-vrtext-primary text-center">
                    {venue.openTime || '09:00'} - {venue.closeTime || '22:00'}
                  </span>

                  {/* Status */}
                  <div className="flex justify-center">
                    <StatusBadge venue={venue} />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2">
                    {canMaintainVenues && (
                      <button
                        onClick={() => openEdit(venue)}
                        className="p-2 rounded-lg text-vrtext-secondary hover:text-vr-blue hover:bg-[rgba(59,130,246,0.1)] transition-all duration-150"
                        title="编辑"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                    {canManageVenues && (
                      <button
                        onClick={() => openDelete(venue)}
                        disabled={venue.status === 'maintenance'}
                        className={cn(
                          'p-2 rounded-lg transition-all duration-150',
                          venue.status === 'maintenance'
                            ? 'text-vrtext-muted cursor-not-allowed'
                            : 'text-vrtext-secondary hover:text-vr-red hover:bg-[rgba(239,68,68,0.1)]'
                        )}
                        title={venue.status === 'maintenance' ? '维护中场地不可删除' : '删除'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      {/* ─── Add/Edit Modal ─── */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center"
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.3, ease: easeOut }}
              className="relative w-[520px] max-h-[90vh] bg-vrbg-elevated rounded-2xl shadow-vr-xl border border-vrborder-DEFAULT overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-vrborder-DEFAULT">
                <h3 className="text-vr-h3 text-vrtext-primary font-medium">
                  {editingVenue ? '编辑场地' : '新增场地'}
                </h3>
                <button
                  onClick={closeModal}
                  className="p-1.5 rounded-lg text-vrtext-secondary hover:text-vrtext-primary hover:bg-vrbg-hover transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
                {/* Venue name */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05, duration: 0.3 }}
                >
                  <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                    场地名称 <span className="text-vr-red">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="请输入场地名称"
                    value={formData.name || ''}
                    onChange={(e) => updateField('name', e.target.value)}
                    className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vr-blue focus:ring-1 focus:ring-vr-blue/15 transition-all"
                  />
                </motion.div>

                {/* Area & Capacity */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.3 }}
                  className="grid grid-cols-3 gap-4"
                >
                  <div>
                    <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                      面积(㎡) <span className="text-vr-red">*</span>
                    </label>
                    <input
                      type="number"
                      placeholder="请输入场地面积"
                      value={formData.area || ''}
                      onChange={(e) => updateField('area', Number(e.target.value))}
                      min={1}
                      className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vr-blue focus:ring-1 focus:ring-vr-blue/15 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                      容量(人) <span className="text-vr-red">*</span>
                    </label>
                    <input
                      type="number"
                      placeholder="请输入容纳人数"
                      value={formData.capacity || ''}
                      onChange={(e) => updateField('capacity', Number(e.target.value))}
                      min={1}
                      className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vr-blue focus:ring-1 focus:ring-vr-blue/15 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                      设备数量(台) <span className="text-vr-red">*</span>
                    </label>
                    <input
                      type="number"
                      placeholder="设备数量"
                      value={formData.deviceCount || ''}
                      onChange={(e) => updateField('deviceCount', Number(e.target.value))}
                      min={1}
                      className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vr-blue focus:ring-1 focus:ring-vr-blue/15 transition-all"
                    />
                  </div>
                </motion.div>

                {/* Image upload (visual) */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                >
                  <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                    场地图片
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="w-[120px] h-[90px] rounded-xl border-2 border-dashed border-vrborder-DEFAULT flex flex-col items-center justify-center gap-1.5 hover:border-vr-blue transition-colors cursor-pointer bg-vrbg-card relative">
                      {uploadingImage ? (
                        <span className="text-vr-caption text-vrtext-muted">上传中...</span>
                      ) : (
                        <>
                          <Upload className="w-5 h-5 text-vrtext-muted" />
                          <span className="text-vr-caption text-vrtext-muted">点击上传</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingImage}
                        className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            setUploadingImage(true)
                            try {
                              const result = await uploadFile('venues', file)
                              setFormData((p: any) => ({ ...p, image: result.url }))
                            } catch (err) {
                              alert('图片上传失败: ' + (err as Error).message)
                            } finally {
                              setUploadingImage(false)
                            }
                          }
                        }}
                      />
                    </label>
                    {formData.image && (
                      <img
                        src={formData.image ? getImageUrl(formData.image) : ''}
                        alt="Preview"
                        className="w-[120px] h-[90px] rounded-xl object-cover"
                      />
                    )}
                  </div>
                </motion.div>

                {/* Status */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.3 }}
                >
                  <label className="block text-vr-body-sm text-vrtext-secondary mb-2">
                    状态
                  </label>
                  <div className="flex items-center gap-3">
                    {statusOptions.map((opt) => (
                      <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="status"
                          value={opt.key}
                          checked={formData.status === opt.key}
                          onChange={(e) => updateField('status', e.target.value)}
                          className="w-4 h-4 accent-vr-blue cursor-pointer"
                        />
                        <span className={cn(
                          'text-vr-body-sm',
                          formData.status === opt.key ? 'text-vrtext-primary' : 'text-vrtext-secondary'
                        )}>
                          {opt.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </motion.div>

                {/* Maintenance window */}
                {formData.status === 'maintenance' && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.28, duration: 0.3 }}
                    className="grid grid-cols-2 gap-4"
                  >
                    <div>
                      <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                        维护开始日期 <span className="text-vr-red">*</span>
                      </label>
                      <input
                        type="date"
                        min={todayStr}
                        value={formData.maintenanceStartDate || ''}
                        onChange={(e) => {
                          const startDate = e.target.value
                          setFormData((p: any) => ({
                            ...p,
                            maintenanceStartDate: startDate,
                            maintenanceEndDate: p.maintenanceEndDate && p.maintenanceEndDate < startDate ? startDate : p.maintenanceEndDate,
                          }))
                        }}
                        className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vr-blue"
                      />
                    </div>
                    <div>
                      <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                        维护结束日期 <span className="text-vr-red">*</span>
                      </label>
                      <input
                        type="date"
                        min={formData.maintenanceStartDate || todayStr}
                        value={formData.maintenanceEndDate || ''}
                        onChange={(e) => setFormData((p: any) => ({ ...p, maintenanceEndDate: e.target.value }))}
                        className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vr-blue"
                      />
                    </div>
                    <div>
                      <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                        维护开始时间 <span className="text-vr-red">*</span>
                      </label>
                      <input
                        type="time"
                        value={formData.maintenanceStartTime || ''}
                        onChange={(e) => setFormData((p: any) => ({ ...p, maintenanceStartTime: e.target.value }))}
                        className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vr-blue"
                      />
                    </div>
                    <div>
                      <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                        维护结束时间 <span className="text-vr-red">*</span>
                      </label>
                      <input
                        type="time"
                        min={formData.maintenanceEndDate === formData.maintenanceStartDate ? formData.maintenanceStartTime : undefined}
                        value={formData.maintenanceEndTime || ''}
                        onChange={(e) => setFormData((p: any) => ({ ...p, maintenanceEndTime: e.target.value }))}
                        className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vr-blue"
                      />
                    </div>
                  </motion.div>
                )}

                {/* Address */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.28, duration: 0.3 }}
                >
                  <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                    地址
                  </label>
                  <input
                    type="text"
                    value={formData.address || ''}
                    onChange={(e) => setFormData((p: any) => ({ ...p, address: e.target.value }))}
                    placeholder="请输入场地地址"
                    className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vr-blue focus:ring-1 focus:ring-vr-blue/15 transition-all"
                  />
                </motion.div>

                {/* Phone */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.29, duration: 0.3 }}
                >
                  <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                    电话
                  </label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData((p: any) => ({ ...p, phone: e.target.value }))}
                    placeholder="请输入联系电话"
                    className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vr-blue focus:ring-1 focus:ring-vr-blue/15 transition-all"
                  />
                </motion.div>

                {/* Business Hours */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.3 }}
                >
                  <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                    营业时间
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="time"
                      value={formData.openTime || '09:00'}
                      onChange={(e) => setFormData((p: any) => ({ ...p, openTime: e.target.value }))}
                      className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vr-blue focus:ring-1 focus:ring-vr-blue/15 transition-all"
                    />
                    <span className="text-vrtext-tertiary text-vr-body-sm shrink-0">至</span>
                    <input
                      type="time"
                      value={formData.closeTime || '22:00'}
                      onChange={(e) => setFormData((p: any) => ({ ...p, closeTime: e.target.value }))}
                      className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vr-blue focus:ring-1 focus:ring-vr-blue/15 transition-all"
                    />
                  </div>
                </motion.div>

                {/* Contact Info */}
                <div className="mt-2 pt-4 border-t border-vrborder-subtle">
                  <h4 className="text-vr-body-sm font-medium text-vrtext-primary mb-3">联系门店</h4>
                  <div className="space-y-4">
                    {/* QR Code */}
                    <div>
                      <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">门店微信二维码</label>
                      <div className="flex items-center gap-3">
                        <div className="w-20 h-20 bg-vrbg-surface border border-vrborder-subtle rounded-lg flex items-center justify-center overflow-hidden">
                          {formData.qrCode ? (
                            <img src={getImageUrl(formData.qrCode)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Upload className="w-4 h-4 text-vrtext-muted" />
                          )}
                        </div>
                        <label className="inline-flex items-center gap-2 px-3 py-2 border border-vrborder-hover rounded-lg text-vr-caption text-vrtext-secondary hover:bg-vrbg-hover transition-colors cursor-pointer relative">
                          <Upload className="w-3.5 h-3.5" />
                          {uploadingImage ? "上传中..." : "上传"}
                          <input
                            type="file"
                            accept="image/*"
                            disabled={uploadingImage}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={async (e) => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              setUploadingImage(true)
                              try {
                                const result = await uploadFile('venues', file)
                                setFormData((p: any) => ({ ...p, qrCode: result.url }))
                              } catch (err) {
                                alert('上传失败: ' + (err as Error).message)
                              } finally {
                                setUploadingImage(false)
                              }
                            }}
                          />
                        </label>
                        {formData.qrCode && (
                          <button onClick={() => setFormData((p: any) => ({ ...p, qrCode: '' }))} className="text-vr-caption text-vrerror hover:underline">移除</button>
                        )}
                      </div>
                    </div>

                    {/* Service QR */}
                    <div>
                      <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">客服微信二维码</label>
                      <div className="flex items-center gap-3">
                        <div className="w-20 h-20 bg-vrbg-surface border border-vrborder-subtle rounded-lg flex items-center justify-center overflow-hidden">
                          {formData.serviceQr ? (
                            <img src={getImageUrl(formData.serviceQr)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Upload className="w-4 h-4 text-vrtext-muted" />
                          )}
                        </div>
                        <label className="inline-flex items-center gap-2 px-3 py-2 border border-vrborder-hover rounded-lg text-vr-caption text-vrtext-secondary hover:bg-vrbg-hover transition-colors cursor-pointer relative">
                          <Upload className="w-3.5 h-3.5" />
                          {uploadingImage ? "上传中..." : "上传"}
                          <input
                            type="file"
                            accept="image/*"
                            disabled={uploadingImage}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={async (e) => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              setUploadingImage(true)
                              try {
                                const result = await uploadFile('venues', file)
                                setFormData((p: any) => ({ ...p, serviceQr: result.url }))
                              } catch (err) {
                                alert('上传失败: ' + (err as Error).message)
                              } finally {
                                setUploadingImage(false)
                              }
                            }}
                          />
                        </label>
                        {formData.serviceQr && (
                          <button onClick={() => setFormData((p: any) => ({ ...p, serviceQr: '' }))} className="text-vr-caption text-vrerror hover:underline">移除</button>
                        )}
                      </div>
                    </div>

                    {/* Map Links */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-vr-body-sm text-vrtext-secondary">地图导航链接</label>
                        <button
                          onClick={() => setFormData((p: any) => ({ ...p, mapLinks: [...(p.mapLinks || []), { label: '', url: '' }] }))}
                          className="text-vr-caption text-vraccent-primary hover:underline"
                        >+ 添加导航</button>
                      </div>
                      <div className="space-y-2">
                        {(formData.mapLinks || []).length === 0 && (
                          <p className="text-vr-caption text-vrtext-tertiary">暂无导航链接</p>
                        )}
                        {(formData.mapLinks || []).map((link: any, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={link.label || ''}
                              onChange={(e) => {
                                const arr = [...(formData.mapLinks || [])]
                                arr[i] = { ...arr[i], label: e.target.value }
                                setFormData((p: any) => ({ ...p, mapLinks: arr }))
                              }}
                              placeholder="高德地图"
                              className="w-28 h-9 px-2 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vr-blue shrink-0"
                            />
                            <input
                              type="text"
                              value={link.url || ''}
                              onChange={(e) => {
                                const arr = [...(formData.mapLinks || [])]
                                arr[i] = { ...arr[i], url: e.target.value }
                                setFormData((p: any) => ({ ...p, mapLinks: arr }))
                              }}
                              placeholder="https://..."
                              className="flex-1 h-9 px-2 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vr-blue"
                            />
                            <button onClick={() => {
                              const arr = (formData.mapLinks || []).filter((_: any, idx: number) => idx !== i)
                              setFormData((p: any) => ({ ...p, mapLinks: arr }))
                            }} className="p-1.5 rounded text-vrerror hover:bg-vrerror/10 shrink-0">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-vrborder-DEFAULT">
                <button
                  onClick={closeModal}
                  className="h-10 px-5 border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-hover transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmit}
                  className="h-10 px-5 bg-vraccent-primary text-white text-vr-body-sm font-medium rounded-lg hover:bg-vraccent-primary-hover transition-colors"
                >
                  确定
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Delete confirmation dialog ─── */}
      <AnimatePresence>
        {showDelete && deletingVenue && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
              className="relative w-[360px] bg-vrbg-elevated rounded-2xl shadow-vr-xl border border-vrborder-DEFAULT p-6 text-center"
            >
              <AlertTriangle className="w-12 h-12 text-vr-red mx-auto mb-3" />
              <h4 className="text-vr-h4 text-vrtext-primary font-medium mb-2">确认删除</h4>
              <p className="text-vr-body text-vrtext-secondary mb-6">
                确定要删除{deletingVenue.name}（{deletingVenue.theme}）吗？删除后不可恢复。
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={closeDelete}
                  className="h-10 px-5 border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-hover transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleDelete}
                  className="h-10 px-5 bg-vrerror text-white text-vr-body-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
                >
                  删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Batch delete confirmation dialog ─── */}
      <AnimatePresence>
        {showBatchDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
              className="relative w-[360px] bg-vrbg-elevated rounded-2xl shadow-vr-xl border border-vrborder-DEFAULT p-6 text-center"
            >
              <AlertTriangle className="w-12 h-12 text-vr-red mx-auto mb-3" />
              <h4 className="text-vr-h4 text-vrtext-primary font-medium mb-2">确认批量删除</h4>
              <p className="text-vr-body text-vrtext-secondary mb-2">
                确定要删除选中的 {selectedIds.length} 个场地吗？删除后不可恢复。
              </p>
              <p className="text-vr-caption text-vrwarning mb-6">
                存在关联预约的场地将被跳过
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setShowBatchDelete(false)}
                  className="h-10 px-5 border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-hover transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => batchDeleteMutation.mutate(selectedIds)}
                  disabled={batchDeleteMutation.isPending}
                  className="h-10 px-5 bg-vrerror text-white text-vr-body-sm font-medium rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {batchDeleteMutation.isPending ? '删除中...' : '删除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Batch status modal ─── */}
      <AnimatePresence>
        {showBatchStatus && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
              className="relative w-[360px] bg-vrbg-elevated rounded-2xl shadow-vr-xl border border-vrborder-DEFAULT p-6"
            >
              <h4 className="text-vr-h4 text-vrtext-primary font-medium mb-4 text-center">批量变更状态</h4>
              <div className="space-y-3 mb-6">
                {[
                  { value: 'ACTIVE', label: '正常运营' },
                  { value: 'MAINTENANCE', label: '维护中' },
                  { value: 'INACTIVE', label: '停用' },
                ].map((opt) => (
                  <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="batchStatus"
                      value={opt.value}
                      checked={batchStatusValue === opt.value}
                      onChange={(e) => setBatchStatusValue(e.target.value)}
                      className="w-4 h-4 accent-vr-blue cursor-pointer"
                    />
                    <span className={cn(
                      'text-vr-body-sm',
                      batchStatusValue === opt.value ? 'text-vrtext-primary' : 'text-vrtext-secondary'
                    )}>
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => { setShowBatchStatus(false); setBatchStatusValue('ACTIVE') }}
                  className="h-10 px-5 border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-hover transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => batchUpdateStatusMutation.mutate({ ids: selectedIds, status: batchStatusValue })}
                  disabled={batchUpdateStatusMutation.isPending}
                  className="h-10 px-5 bg-vraccent-primary text-white text-vr-body-sm font-medium rounded-lg hover:bg-vraccent-primary-hover transition-colors disabled:opacity-50"
                >
                  {batchUpdateStatusMutation.isPending ? '更新中...' : '确定'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  )
}
