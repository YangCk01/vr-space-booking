import { useState, useMemo } from 'react'
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
import { getVenues, createVenue, updateVenue, deleteVenue } from '@/api/venues'
import type { Venue } from '@/api/venues'
import { uploadFile } from '@/api/upload'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { getImageUrl } from '@/lib/imageUrl'

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

function StatusBadge({ status }: { status: string }) {
  const normalized = normalizeStatus(status)
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

  /* Modal states */
  const [showModal, setShowModal] = useState(false)
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null)
  const [formData, setFormData] = useState<any>({ ...emptyVenue })

  /* Delete dialog state */
  const [showDelete, setShowDelete] = useState(false)
  const [deletingVenue, setDeletingVenue] = useState<Venue | null>(null)

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

  const handleSubmit = () => {
    if (!formData.name || !formData.area || !formData.capacity || !formData.deviceCount) return

    const payload: any = {
      name: formData.name,
      theme: formData.theme || '',
      status: toApiStatus(formData.status),
      area: Number(formData.area),
      capacity: Number(formData.capacity),
      deviceCount: Number(formData.deviceCount) || 1,
      image: formData.image || undefined,
      description: formData.description || undefined,
      address: formData.address,
      phone: formData.phone,
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

        {/* Add button — only SUPER_ADMIN and OPERATOR */}
        {['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(useAuthStore.getState().user?.role || '') && (
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

      {/* ─── Venue table ─── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="bg-vrbg-card rounded-xl border border-vrborder-DEFAULT overflow-hidden"
      >
        {/* Table header */}
        <div className="grid grid-cols-[1fr_80px_80px_80px_100px_120px] items-center h-11 px-4 bg-vrbg-elevated border-b border-vrborder-DEFAULT">
          <span className="text-vr-caption text-vrtext-secondary font-medium">场地</span>
          <span className="text-vr-caption text-vrtext-secondary font-medium text-center">面积</span>
          <span className="text-vr-caption text-vrtext-secondary font-medium text-center">容量</span>
          <span className="text-vr-caption text-vrtext-secondary font-medium text-center">设备数</span>
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
                  className="grid grid-cols-[1fr_80px_80px_80px_100px_120px] items-center h-16 px-4 border-b border-vrborder-DEFAULT/50 hover:bg-vrbg-hover transition-colors duration-150 group"
                >
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

                  {/* Status */}
                  <div className="flex justify-center">
                    <StatusBadge status={venue.status} />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEdit(venue)}
                      className="p-2 rounded-lg text-vrtext-secondary hover:text-vr-blue hover:bg-[rgba(59,130,246,0.1)] transition-all duration-150"
                      title="编辑"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
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
                        value={formData.maintenanceStartDate || ''}
                        onChange={(e) => setFormData((p: any) => ({ ...p, maintenanceStartDate: e.target.value }))}
                        className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vr-blue"
                      />
                    </div>
                    <div>
                      <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                        维护结束日期 <span className="text-vr-red">*</span>
                      </label>
                      <input
                        type="date"
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

                {/* Notes */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.3 }}
                >
                  <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                    备注
                  </label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) => setFormData((p: any) => ({ ...p, description: e.target.value }))}
                    placeholder="请输入场地备注信息..."
                    rows={3}
                    className="w-full px-3 py-2 bg-vrbg-card border border-vrborder-DEFAULT rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vr-blue focus:ring-1 focus:ring-vr-blue/15 transition-all resize-none"
                  />
                </motion.div>
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
    </Layout>
  )
}
