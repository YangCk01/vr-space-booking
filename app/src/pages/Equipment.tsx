import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Headphones,
  Radio,
  Gamepad2,
  Monitor,
  Search,
  Plus,
  Pencil,
  Wrench,
  X,
  Clock,
  AlertTriangle,
  Trash2,
} from 'lucide-react'
import Layout from '@/components/Layout'
import {
  getEquipment,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  getMaintenanceRecords,
} from '@/api/equipment'
import type { MaintenanceRecord } from '@/api/equipment'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type EquipmentType = 'all' | 'headset' | 'tracker' | 'controller' | 'computer'
type EquipmentStatus = 'normal' | 'warning' | 'error' | 'maintenance'

interface EquipmentItem {
  id: string
  name: string
  model: string
  code: string
  type: EquipmentTypeExcludeAll
  typeText: string
  status: EquipmentStatus
  statusText: string
  venue: string
  venueId?: string
  lastMaint: string
  buyDate: string
  warranty: string
}

type EquipmentTypeExcludeAll = 'headset' | 'tracker' | 'controller' | 'computer'

interface MaintRecord {
  date: string
  type: string
  desc: string
}

const typeTabs: { key: EquipmentType; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'headset', label: 'VR头盔' },
  { key: 'tracker', label: '定位基站' },
  { key: 'controller', label: '体感手柄' },
  { key: 'computer', label: '主机设备' },
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function getTypeIcon(type: EquipmentTypeExcludeAll) {
  switch (type) {
    case 'headset': return <Headphones className="w-5 h-5 text-vraccent-primary" />
    case 'tracker': return <Radio className="w-5 h-5 text-vrpurple" />
    case 'controller': return <Gamepad2 className="w-5 h-5 text-vraccent-secondary" />
    case 'computer': return <Monitor className="w-5 h-5 text-vrwarning" />
  }
}

function getStatusColor(status: EquipmentStatus): { bg: string; text: string; dot: string } {
  switch (status) {
    case 'normal':
      return { bg: 'rgba(16,185,129,0.15)', text: '#10B981', dot: '#10B981' }
    case 'warning':
      return { bg: 'rgba(245,158,11,0.15)', text: '#F59E0B', dot: '#F59E0B' }
    case 'error':
      return { bg: 'rgba(239,68,68,0.15)', text: '#EF4444', dot: '#EF4444' }
    case 'maintenance':
      return { bg: 'rgba(249,115,22,0.15)', text: '#F97316', dot: '#F97316' }
  }
}

/* ------------------------------------------------------------------ */
/*  Status Badge                                                       */
/* ------------------------------------------------------------------ */
function StatusBadge({ status, statusText }: { status: EquipmentStatus; statusText: string }) {
  const colors = getStatusColor(status)
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-vr-caption font-medium"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${status === 'normal' ? 'animate-pulse-dot' : ''}`}
        style={{ backgroundColor: colors.dot }}
      />
      {statusText}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Detail Modal                                                       */
/* ------------------------------------------------------------------ */
function DetailModal({
  equipment,
  onClose,
}: {
  equipment: EquipmentItem
  onClose: () => void
}) {
  const { data: maintRecords, isLoading: maintLoading } = useQuery({
    queryKey: ['maintenanceRecords', equipment.id],
    queryFn: () => getMaintenanceRecords(equipment.id),
    enabled: !!equipment.id,
  })

  const history: MaintRecord[] = useMemo(() => {
    if (!maintRecords) return []
    return maintRecords.map((r: MaintenanceRecord) => ({
      date: r.date,
      type: r.type,
      desc: r.description,
    }))
  }, [maintRecords])

  const colors = getStatusColor(equipment.status)
  const typeIcon = getTypeIcon(equipment.type)

  const handleMaintenance = () => {
    onClose()
  }

  const handleReportRepair = () => {
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[4px]" />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[560px] bg-vrbg-elevated border border-vrborder-hover rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.6)] overflow-hidden"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-vrtext-muted hover:text-vrtext-primary hover:bg-vrbg-elevated transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-vrborder-hover">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-vrbg-card flex items-center justify-center">
              {typeIcon}
            </div>
            <div>
              <h3 className="text-vr-h3 text-vrtext-primary">{equipment.name}</h3>
              <p className="text-vr-caption text-vrtext-tertiary">{equipment.code}</p>
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div className="px-6 py-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: '设备名称', value: equipment.name },
              { label: '设备型号', value: equipment.model },
              { label: '设备编号', value: equipment.code },
              { label: '设备类型', value: equipment.typeText },
              { label: '所在场地', value: equipment.venue },
              { label: '购买日期', value: equipment.buyDate },
              { label: '保修到期', value: equipment.warranty },
              {
                label: '当前状态',
                value: (
                  <span style={{ color: colors.text }}>{equipment.statusText}</span>
                ),
              },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-vrbg-card rounded-lg px-3 py-2.5 border border-vrborder-subtle"
              >
                <p className="text-vr-caption text-vrtext-tertiary">{item.label}</p>
                <p className="text-vr-body-sm text-vrtext-primary mt-0.5 font-medium">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Maintenance history */}
        <div className="px-6 pb-6">
          <h4 className="text-vr-h4 text-vrtext-primary mb-3 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-vrtext-secondary" />
            维护记录
            {maintLoading && (
              <span className="text-vr-caption text-vrtext-muted ml-2">加载中...</span>
            )}
          </h4>
          <div className="space-y-3">
            {maintLoading ? (
              <div className="text-vr-caption text-vrtext-muted py-4 text-center">
                正在加载维护记录...
              </div>
            ) : history.length === 0 ? (
              <div className="text-vr-caption text-vrtext-muted py-4 text-center">
                暂无维护记录
              </div>
            ) : (
              <AnimatePresence>
                {history.map((record, i) => (
                  <motion.div
                    key={`${record.date}-${i}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.1 }}
                    className="flex items-start gap-3"
                  >
                    <div className="flex flex-col items-center gap-1 pt-0.5">
                      <span className="w-2 h-2 rounded-full bg-vraccent-primary" />
                      {i < history.length - 1 && (
                        <span className="w-px h-8 bg-vrbg-elevated" />
                      )}
                    </div>
                    <div className="flex-1 bg-vrbg-card rounded-lg px-3 py-2 border border-vrborder-subtle">
                      <div className="flex items-center gap-2">
                        <span className="text-vr-caption text-vrtext-tertiary">
                          {record.date}
                        </span>
                        <span className="text-vr-body-sm text-vrtext-primary font-medium">
                          {record.type}
                        </span>
                      </div>
                      <p className="text-vr-caption text-vrtext-tertiary mt-0.5">
                        {record.desc}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-vrborder-hover flex items-center justify-end gap-3">
          <button
            onClick={handleReportRepair}
            className="px-4 py-2 rounded-lg border border-vrerror text-vrerror text-vr-body-sm hover:bg-vrerror/10 transition-colors"
          >
            报修
          </button>
          <button
            onClick={handleMaintenance}
            className="px-4 py-2 rounded-lg bg-vraccent-primary text-white text-vr-body-sm hover:bg-vraccent-primary-hover transition-colors"
          >
            维护登记
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Equipment Page                                                */
/* ------------------------------------------------------------------ */
const emptyForm = {
  name: '',
  code: '',
  model: '',
  type: 'headset' as EquipmentTypeExcludeAll,
  status: 'normal' as EquipmentStatus,
  venueId: '',
  buyDate: '',
  warranty: '',
}

const statusOptions: { key: EquipmentStatus; label: string }[] = [
  { key: 'normal', label: '正常' },
  { key: 'warning', label: '警告' },
  { key: 'error', label: '故障' },
  { key: 'maintenance', label: '维护中' },
]

export default function Equipment() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<EquipmentType>('all')
  const [search, setSearch] = useState('')
  const [selectedEq, setSelectedEq] = useState<EquipmentItem | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [editingEq, setEditingEq] = useState<EquipmentItem | null>(null)
  const [formData, setFormData] = useState({ ...emptyForm })

  const [showDelete, setShowDelete] = useState(false)
  const [deletingEq, setDeletingEq] = useState<EquipmentItem | null>(null)

  const { data: eqData } = useQuery({
    queryKey: ['equipment', activeTab, search],
    queryFn: () => getEquipment({
      type: activeTab === 'all' ? undefined : activeTab,
      search: search || undefined,
      pageSize: 100,
    }),
  })

  const apiEquipment = eqData?.data || []

  const createMutation = useMutation({
    mutationFn: createEquipment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      closeModal()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateEquipment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      closeModal()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteEquipment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      closeDelete()
    },
  })

  const equipmentData: EquipmentItem[] = useMemo(() => {
    const typeMap: Record<string, string> = {
      HEADSET: 'VR头盔',
      TRACKER: '定位设备',
      CONTROLLER: '手柄',
      COMPUTER: '主机',
    }
    const statusMap: Record<string, { status: EquipmentStatus; text: string }> = {
      NORMAL: { status: 'normal', text: '正常' },
      WARNING: { status: 'warning', text: '警告' },
      ERROR: { status: 'error', text: '故障' },
      MAINTENANCE: { status: 'maintenance', text: '维护中' },
    }
    return apiEquipment.map((eq: any) => {
      const sm = statusMap[eq.status] || { status: 'normal' as EquipmentStatus, text: '正常' }
      return {
        id: eq.id,
        name: eq.name,
        model: eq.model || '-',
        code: eq.code,
        type: eq.type.toLowerCase() as EquipmentTypeExcludeAll,
        typeText: typeMap[eq.type] || eq.type,
        status: sm.status,
        statusText: sm.text,
        venue: eq.venue?.name || '未分配',
        venueId: eq.venue?.id || eq.venueId || undefined,
        lastMaint: eq.lastMaint ? new Date(eq.lastMaint).toISOString().split('T')[0] : '-',
        buyDate: eq.buyDate ? new Date(eq.buyDate).toISOString().split('T')[0] : '-',
        warranty: eq.warranty ? new Date(eq.warranty).toISOString().split('T')[0] : '-',
      }
    })
  }, [apiEquipment])

  const filtered = useMemo(() => {
    return equipmentData.filter((eq) => {
      const matchesTab = activeTab === 'all' || eq.type === activeTab
      const matchesSearch =
        search === '' ||
        eq.name.includes(search) ||
        eq.code.toLowerCase().includes(search.toLowerCase()) ||
        eq.model.toLowerCase().includes(search.toLowerCase())
      return matchesTab && matchesSearch
    })
  }, [activeTab, search, equipmentData])

  const statusCounts = useMemo(() => {
    const all = activeTab === 'all' ? equipmentData : equipmentData.filter((e) => e.type === activeTab)
    return {
      normal: all.filter((e) => e.status === 'normal').length,
      warning: all.filter((e) => e.status === 'warning').length,
      error: all.filter((e) => e.status === 'error' || e.status === 'maintenance').length,
    }
  }, [activeTab, equipmentData])

  /* ─── Modal handlers ─── */
  const openAdd = () => {
    setEditingEq(null)
    setFormData({ ...emptyForm })
    setShowModal(true)
  }

  const openEdit = (eq: EquipmentItem) => {
    setEditingEq(eq)
    setFormData({
      name: eq.name,
      code: eq.code,
      model: eq.model === '-' ? '' : eq.model,
      type: eq.type,
      status: eq.status,
      venueId: eq.venueId || '',
      buyDate: eq.buyDate === '-' ? '' : eq.buyDate,
      warranty: eq.warranty === '-' ? '' : eq.warranty,
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingEq(null)
    setFormData({ ...emptyForm })
  }

  const handleSubmit = () => {
    if (!formData.name || !formData.code) return

    const payload = {
      name: formData.name,
      code: formData.code,
      type: formData.type.toUpperCase(),
      model: formData.model || undefined,
      status: formData.status.toUpperCase(),
      venueId: formData.venueId || undefined,
      buyDate: formData.buyDate || undefined,
      warranty: formData.warranty || undefined,
    }

    if (editingEq) {
      updateMutation.mutate({ id: editingEq.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  /* ─── Delete handlers ─── */
  const openDelete = (eq: EquipmentItem) => {
    setDeletingEq(eq)
    setShowDelete(true)
  }

  const closeDelete = () => {
    setShowDelete(false)
    setDeletingEq(null)
  }

  const handleDelete = () => {
    if (!deletingEq) return
    deleteMutation.mutate(deletingEq.id)
  }

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Layout breadcrumb={['设备管理']}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
      >
        <div>
          <h1 className="text-vr-h1 text-vrtext-primary">设备管理</h1>
          <p className="text-vr-body-sm text-vrtext-tertiary mt-1">
            VR设备信息、维护记录、状态监控
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="relative"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vrtext-muted" />
            <input
              type="text"
              placeholder="搜索设备名称、编号..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[260px] h-9 pl-9 pr-4 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
            />
          </motion.div>

          {/* Add button */}
          <motion.button
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            onClick={openAdd}
            className="h-9 px-4 bg-vraccent-primary hover:bg-vraccent-primary-hover text-white text-vr-body-sm font-medium rounded-lg inline-flex items-center gap-1.5 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            新增设备
          </motion.button>
        </div>
      </motion.div>

      {/* Type tabs + status overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="bg-vrbg-elevated rounded-lg p-1 inline-flex"
        >
          {typeTabs.map((tab, i) => (
            <motion.button
              key={tab.key}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: i * 0.05 }}
              onClick={() => setActiveTab(tab.key)}
              className={`relative px-4 py-1.5 rounded-md text-vr-body-sm font-medium transition-all duration-150 ${
                activeTab === tab.key
                  ? 'bg-vrbg-card text-vraccent-primary shadow-[0_1px_2px_rgba(0,0,0,0.3)]'
                  : 'text-vrtext-secondary hover:text-vrtext-primary'
              }`}
            >
              {tab.label}
            </motion.button>
          ))}
        </motion.div>

        {/* Status counts */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="flex items-center gap-4"
        >
          <span className="flex items-center gap-1.5 text-vr-caption text-vrtext-secondary">
            <span className="w-1.5 h-1.5 rounded-full bg-vrsuccess animate-pulse-dot" />
            正常 {statusCounts.normal}
          </span>
          <span className="flex items-center gap-1.5 text-vr-caption text-vrtext-secondary">
            <span className="w-1.5 h-1.5 rounded-full bg-vrwarning animate-pulse-dot" />
            警告 {statusCounts.warning}
          </span>
          <span className="flex items-center gap-1.5 text-vr-caption text-vrtext-secondary">
            <span className="w-1.5 h-1.5 rounded-full bg-vrerror" />
            故障 {statusCounts.error}
          </span>
        </motion.div>
      </div>

      {/* Equipment table */}
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
                <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">
                  设备名称
                </th>
                <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[140px]">
                  编号
                </th>
                <th className="text-center px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[100px]">
                  类型
                </th>
                <th className="text-center px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[110px]">
                  状态
                </th>
                <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[140px]">
                  最后维护时间
                </th>
                <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[100px]">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="wait">
                {filtered.map((eq, i) => (
                  <motion.tr
                    key={eq.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.07 }}
                    className="h-[56px] border-t border-vrborder-subtle hover:bg-vrbg-elevated transition-colors group"
                  >
                    {/* Device name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-vrbg-surface flex items-center justify-center shrink-0">
                          {getTypeIcon(eq.type)}
                        </div>
                        <div>
                          <p className="text-vr-body-sm text-vrtext-primary font-medium">
                            {eq.name}
                          </p>
                          <p className="text-vr-caption text-vrtext-tertiary">{eq.model}</p>
                        </div>
                      </div>
                    </td>

                    {/* Code */}
                    <td className="px-4 py-3">
                      <span className="text-vr-body-sm text-vrtext-primary font-mono">
                        {eq.code}
                      </span>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3 text-center">
                      <span className="text-vr-caption text-vrtext-secondary">{eq.typeText}</span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={eq.status} statusText={eq.statusText} />
                    </td>

                    {/* Last maintenance */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-vrtext-secondary">
                        <Clock className="w-3.5 h-3.5 text-vrtext-muted" />
                        <span className="text-vr-body-sm">{eq.lastMaint}</span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(eq)}
                          className="p-1.5 rounded-md text-vrtext-muted hover:text-vraccent-primary hover:bg-vraccent-primary/10 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setSelectedEq(eq)}
                          className="p-1.5 rounded-md text-vrtext-muted hover:text-vrwarning hover:bg-vrwarning/10 transition-colors"
                        >
                          <Wrench className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openDelete(eq)}
                          className="p-1.5 rounded-md text-vrtext-muted hover:text-vrerror hover:bg-vrerror/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <Search className="w-10 h-10 text-vrtext-muted mx-auto mb-3" />
            <p className="text-vr-body text-vrtext-secondary">未找到匹配的设备</p>
            <p className="text-vr-caption text-vrtext-tertiary mt-1">请尝试其他搜索条件</p>
          </div>
        )}

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-vrborder-subtle">
            <p className="text-vr-caption text-vrtext-tertiary">
              共 {filtered.length} 条记录
            </p>
            <div className="flex items-center gap-1">
              <button className="px-3 py-1.5 rounded-md text-vr-caption text-vrtext-muted hover:text-vrtext-primary hover:bg-vrbg-elevated transition-colors disabled:opacity-50">
                上一页
              </button>
              <button className="px-3 py-1.5 rounded-md bg-vrbg-active text-vraccent-primary text-vr-caption font-medium">
                1
              </button>
              <button className="px-3 py-1.5 rounded-md text-vr-caption text-vrtext-muted hover:text-vrtext-primary hover:bg-vrbg-elevated transition-colors">
                下一页
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedEq && (
          <DetailModal equipment={selectedEq} onClose={() => setSelectedEq(null)} />
        )}
      </AnimatePresence>

      {/* ─── Add/Edit Modal ─── */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-[4px]"
              onClick={closeModal}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.3 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[520px] max-h-[90vh] bg-vrbg-elevated border border-vrborder-hover rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.6)] overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-vrborder-hover">
                <h3 className="text-vr-h3 text-vrtext-primary font-medium">
                  {editingEq ? '编辑设备' : '新增设备'}
                </h3>
                <button
                  onClick={closeModal}
                  className="p-1.5 rounded-lg text-vrtext-muted hover:text-vrtext-primary hover:bg-vrbg-elevated transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                      设备名称 <span className="text-vrerror">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="请输入设备名称"
                      value={formData.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                      设备编号 <span className="text-vrerror">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="请输入设备编号"
                      value={formData.code}
                      onChange={(e) => updateField('code', e.target.value)}
                      className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                      设备型号
                    </label>
                    <input
                      type="text"
                      placeholder="请输入设备型号"
                      value={formData.model}
                      onChange={(e) => updateField('model', e.target.value)}
                      className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                      设备类型
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => updateField('type', e.target.value)}
                      className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all appearance-none cursor-pointer"
                    >
                      <option value="headset">VR头盔</option>
                      <option value="tracker">定位基站</option>
                      <option value="controller">体感手柄</option>
                      <option value="computer">主机设备</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-vr-body-sm text-vrtext-secondary mb-2">
                    当前状态
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
                          className="w-4 h-4 accent-[#3B82F6] cursor-pointer"
                        />
                        <span className={`text-vr-body-sm ${formData.status === opt.key ? 'text-vrtext-primary' : 'text-vrtext-secondary'}`}>
                          {opt.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                      购买日期
                    </label>
                    <input
                      type="date"
                      value={formData.buyDate}
                      onChange={(e) => updateField('buyDate', e.target.value)}
                      className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                      保修到期
                    </label>
                    <input
                      type="date"
                      value={formData.warranty}
                      onChange={(e) => updateField('warranty', e.target.value)}
                      className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
                    场地ID
                  </label>
                  <input
                    type="text"
                    placeholder="请输入场地ID"
                    value={formData.venueId}
                    onChange={(e) => updateField('venueId', e.target.value)}
                    className="w-full h-10 px-3 bg-vrbg-card border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-vrborder-hover">
                <button
                  onClick={closeModal}
                  className="h-10 px-5 border border-vrborder-hover rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="h-10 px-5 bg-vraccent-primary text-white text-vr-body-sm font-medium rounded-lg hover:bg-vraccent-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? '提交中...' : '确定'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Delete confirmation dialog ─── */}
      <AnimatePresence>
        {showDelete && deletingEq && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-[4px]"
              onClick={closeDelete}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.25 }}
              className="relative w-[360px] bg-vrbg-elevated border border-vrborder-hover rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.6)] p-6 text-center"
            >
              <AlertTriangle className="w-12 h-12 text-vrerror mx-auto mb-3" />
              <h4 className="text-vr-h4 text-vrtext-primary font-medium mb-2">确认删除</h4>
              <p className="text-vr-body text-vrtext-secondary mb-6">
                确定要删除设备「{deletingEq.name}」（{deletingEq.code}）吗？删除后不可恢复。
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={closeDelete}
                  className="h-10 px-5 border border-vrborder-hover rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="h-10 px-5 bg-vrerror text-white text-vr-body-sm font-medium rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteMutation.isPending ? '删除中...' : '删除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  )
}
