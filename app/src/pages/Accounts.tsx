import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import {
  Search,
  Plus,
  Users,
  Pencil,
  Trash2,
  Key,
  MapPin,
  Shield,
  ChevronLeft,
  ChevronRight,
  Loader2,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import {
  getStaffList,
  createStaff,
  updateStaff,
  deleteStaff,
  resetStaffPassword,
  assignManagerVenues,
} from '@/api/users'
import { getVenues } from '@/api/venues'
import type { StaffUser } from '@/api/users'
import type { Venue } from '@/api/venues'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

type RoleFilter = 'all' | 'OPERATOR' | 'FINANCE' | 'MANAGER' | 'ADMIN' | 'SUPER_ADMIN'

const roleTabs: { key: RoleFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'OPERATOR', label: '运营' },
  { key: 'FINANCE', label: '财务' },
  { key: 'MANAGER', label: '店长' },
  { key: 'ADMIN', label: '管理员' },
  { key: 'SUPER_ADMIN', label: '主账号' },
]

const roleLabelMap: Record<string, string> = {
  OPERATOR: '运营',
  FINANCE: '财务',
  MANAGER: '店长',
  SUPER_ADMIN: '主账号',
  ADMIN: '管理员',
}

const statusLabelMap: Record<string, string> = {
  ACTIVE: '正常',
  INACTIVE: '禁用',
}

const roleOptions = [
  { value: 'OPERATOR', label: '运营' },
  { value: 'FINANCE', label: '财务' },
  { value: 'MANAGER', label: '店长' },
  { value: 'ADMIN', label: '管理员' },
]

const statusOptions = [
  { value: 'ACTIVE', label: '激活' },
  { value: 'INACTIVE', label: '禁用' },
]

/* ------------------------------------------------------------------ */
/*  Badges                                                             */
/* ------------------------------------------------------------------ */

function RoleBadge({ role }: { role: string }) {
  const label = roleLabelMap[role] || role
  const cfg: Record<string, { bg: string; text: string }> = {
    OPERATOR: { bg: 'bg-vraccent-primary/15', text: 'text-vraccent-primary' },
    FINANCE: { bg: 'bg-vrpurple/15', text: 'text-vrpurple' },
    MANAGER: { bg: 'bg-vrwarning/15', text: 'text-vrwarning' },
    SUPER_ADMIN: { bg: 'bg-vrerror/15', text: 'text-vrerror' },
    ADMIN: { bg: 'bg-vrsuccess/15', text: 'text-vrsuccess' },
  }
  const style = cfg[role] || { bg: 'bg-vrtext-muted/15', text: 'text-vrtext-secondary' }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-vr-caption font-medium', style.bg, style.text)}>
      {role === 'SUPER_ADMIN' && <Shield className="w-3 h-3" />}
      {label}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const label = statusLabelMap[status] || status
  const isActive = status === 'ACTIVE'
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-3 py-1 text-vr-caption font-medium',
      isActive ? 'bg-vrsuccess/15 text-vrsuccess' : 'bg-vrerror/15 text-vrerror'
    )}>
      {label}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Format helpers                                                     */
/* ------------------------------------------------------------------ */

function formatDateTime(dateStr: string | null | Date) {
  if (!dateStr) return '-'
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd HH:mm')
  } catch {
    return String(dateStr)
  }
}

/* ------------------------------------------------------------------ */
/*  Staff Form Sheet (Create / Edit)                                   */
/* ------------------------------------------------------------------ */

interface StaffFormData {
  name: string
  phone: string
  password: string
  role: string
  status: string
  venueIds: string[]
}

function StaffFormSheet({
  mode,
  staff,
  open,
  onOpenChange,
  onSubmit,
  isPending,
  venues,
}: {
  mode: 'create' | 'edit'
  staff: StaffUser | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onSubmit: (data: StaffFormData) => void
  isPending: boolean
  venues: Venue[]
}) {
  const [form, setForm] = useState<StaffFormData>({
    name: '',
    phone: '',
    password: '',
    role: 'OPERATOR',
    status: 'ACTIVE',
    venueIds: [],
  })
  const [error, setError] = useState('')

  const isSuperAdmin = mode === 'edit' && staff?.role === 'SUPER_ADMIN'

  useEffect(() => {
    if (mode === 'edit' && staff) {
      setForm({
        name: staff.name,
        phone: staff.phone,
        password: '',
        role: staff.role,
        status: staff.status,
        venueIds: staff.managedVenues?.map((v) => v.id) || [],
      })
      setError('')
    } else if (mode === 'create') {
      setForm({
        name: '',
        phone: '',
        password: '',
        role: 'OPERATOR',
        status: 'ACTIVE',
        venueIds: [],
      })
      setError('')
    }
  }, [staff, mode, open])

  const handleSubmit = () => {
    if (!form.name.trim() || !form.phone.trim()) {
      setError('姓名和手机号不能为空')
      return
    }
    if (!/^\d{11}$/.test(form.phone.trim())) {
      setError('手机号必须为 11 位数字')
      return
    }
    setError('')
    onSubmit(form)
  }

  const toggleVenue = (venueId: string) => {
    setForm((prev) => ({
      ...prev,
      venueIds: prev.venueIds.includes(venueId)
        ? prev.venueIds.filter((id) => id !== venueId)
        : [...prev.venueIds, venueId],
    }))
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] bg-vrbg-card border-l border-vrborder-subtle p-0 sm:max-w-[480px]">
        <SheetHeader className="p-6 border-b border-vrborder-subtle">
          <SheetTitle className="text-vr-h3 text-vrtext-primary font-semibold">
            {mode === 'create' ? '新增员工账号' : '编辑员工账号'}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4" style={{ maxHeight: 'calc(100vh - 80px)' }}>
          {error && (
            <div className="p-3 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-vr-body-sm text-vrerror">
              {error}
            </div>
          )}

          <div>
            <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
              姓名 <span className="text-vrerror">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="请输入姓名"
              className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
            />
          </div>

          <div>
            <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
              手机号 <span className="text-vrerror">*</span>
            </label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="请输入手机号"
              className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
            />
          </div>

          <div>
            <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">
              密码 {mode === 'create' && <span className="text-vrtext-muted text-vr-caption">（不填则默认 123456）</span>}
            </label>
            <input
              type="text"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder={mode === 'edit' ? '不修改请留空' : '请输入密码'}
              className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
            />
          </div>

          <div>
            <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">角色</label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
            >
              {roleOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">状态</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {form.role === 'MANAGER' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              <label className="block text-vr-body-sm text-vrtext-secondary mb-1.5">分配场地</label>
              <div className="bg-vrbg-surface border border-vrborder-subtle rounded-lg p-3 space-y-2 max-h-[200px] overflow-y-auto">
                {venues.length === 0 && (
                  <p className="text-vr-caption text-vrtext-muted">暂无场地数据</p>
                )}
                {venues.map((venue) => (
                  <label
                    key={venue.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-vrbg-elevated rounded-md px-2 py-1.5 transition-colors"
                  >
                    <Checkbox
                      checked={form.venueIds.includes(venue.id)}
                      onCheckedChange={() => toggleVenue(venue.id)}
                    />
                    <span className="text-vr-body-sm text-vrtext-primary">{venue.name}</span>
                  </label>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {isSuperAdmin && (
          <div className="px-6 py-3 bg-vrerror/10 border-t border-vrerror/20 text-vrerror text-vr-body-sm">
            主账号（SUPER_ADMIN）不可编辑
          </div>
        )}
        <div className="p-6 border-t border-vrborder-subtle flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={isPending || isSuperAdmin}
            className="flex-1 h-10 bg-vraccent-primary text-white rounded-lg text-vr-body-sm font-medium hover:bg-vraccent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'create' ? '创建' : '保存'}
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

/* ------------------------------------------------------------------ */
/*  Delete Confirm Dialog                                              */
/* ------------------------------------------------------------------ */

function DeleteConfirmDialog({
  staff,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  staff: StaffUser | null
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
            确定要删除账号 <span className="text-vrtext-primary font-medium">{staff?.name}</span> 吗？此操作不可撤销。
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

/* ------------------------------------------------------------------ */
/*  Venue Assignment Dialog                                            */
/* ------------------------------------------------------------------ */

function VenueAssignDialog({
  staff,
  open,
  onOpenChange,
  venues,
  onSubmit,
  isPending,
}: {
  staff: StaffUser | null
  open: boolean
  onOpenChange: (v: boolean) => void
  venues: Venue[]
  onSubmit: (venueIds: string[]) => void
  isPending: boolean
}) {
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    if (staff) {
      setSelected(staff.managedVenues?.map((v) => v.id) || [])
    } else {
      setSelected([])
    }
  }, [staff, open])

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-vrbg-card border-vrborder-subtle sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-vrtext-primary">分配场地</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <p className="text-vr-body-sm text-vrtext-secondary mb-3">
            为 <span className="text-vrtext-primary font-medium">{staff?.name}</span> 分配管理的场地
          </p>
          <div className="bg-vrbg-surface border border-vrborder-subtle rounded-lg p-3 space-y-2 max-h-[280px] overflow-y-auto">
            {venues.length === 0 && (
              <p className="text-vr-caption text-vrtext-muted">暂无场地数据</p>
            )}
            {venues.map((venue) => (
              <label
                key={venue.id}
                className="flex items-center gap-2 cursor-pointer hover:bg-vrbg-elevated rounded-md px-2 py-1.5 transition-colors"
              >
                <Checkbox
                  checked={selected.includes(venue.id)}
                  onCheckedChange={() => toggle(venue.id)}
                />
                <span className="text-vr-body-sm text-vrtext-primary">{venue.name}</span>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="h-9 px-4 rounded-lg border border-vrborder-subtle text-vrtext-secondary text-vr-body-sm font-medium hover:bg-vrbg-elevated transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => onSubmit(selected)}
            disabled={isPending}
            className="h-9 px-4 rounded-lg bg-vraccent-primary text-white text-vr-body-sm font-medium hover:bg-vraccent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            保存
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function AccountsPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<RoleFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState<'create' | 'edit'>('create')
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingStaff, setDeletingStaff] = useState<StaffUser | null>(null)

  const [venueDialogOpen, setVenueDialogOpen] = useState(false)
  const [venueAssignStaff, setVenueAssignStaff] = useState<StaffUser | null>(null)

  const roleParam = activeTab === 'all' ? undefined : activeTab

  const { data: staffData, isFetching } = useQuery({
    queryKey: ['staff', roleParam, searchQuery, currentPage, pageSize],
    queryFn: () =>
      getStaffList({
        role: roleParam,
        search: searchQuery || undefined,
        page: currentPage,
        pageSize,
      }),
  })

  const { data: venuesData } = useQuery({
    queryKey: ['venues', 'all'],
    queryFn: () => getVenues({ pageSize: 999 }),
  })

  const staffList: StaffUser[] = staffData?.data || []
  const totalStaff = staffData?.meta?.total || 0
  const totalPages = Math.max(1, Math.ceil(totalStaff / pageSize))
  const safePage = Math.min(currentPage, totalPages)

  const venues: Venue[] = venuesData?.data || []

  // Sync page when total shrinks
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(totalPages)
  }

  /* ------------------ Mutations ------------------ */

  const createMutation = useMutation({
    mutationFn: createStaff,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      setSheetOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateStaff>[1] }) =>
      updateStaff(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      setSheetOpen(false)
      setEditingStaff(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteStaff,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      setDeleteDialogOpen(false)
      setDeletingStaff(null)
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password?: string }) =>
      resetStaffPassword(id, password),
    onSuccess: () => {
      alert('密码重置成功，新密码为 123456')
    },
  })

  const assignVenuesMutation = useMutation({
    mutationFn: ({ id, venueIds }: { id: string; venueIds: string[] }) =>
      assignManagerVenues(id, venueIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      setVenueDialogOpen(false)
      setVenueAssignStaff(null)
    },
  })

  /* ------------------ Handlers ------------------ */

  const handleOpenCreate = () => {
    setSheetMode('create')
    setEditingStaff(null)
    setSheetOpen(true)
  }

  const handleOpenEdit = (staff: StaffUser) => {
    setSheetMode('edit')
    setEditingStaff(staff)
    setSheetOpen(true)
  }

  const handleOpenDelete = (staff: StaffUser) => {
    setDeletingStaff(staff)
    setDeleteDialogOpen(true)
  }

  const handleOpenVenueAssign = (staff: StaffUser) => {
    setVenueAssignStaff(staff)
    setVenueDialogOpen(true)
  }

  const handleSheetSubmit = (formData: StaffFormData) => {
    if (sheetMode === 'create') {
      createMutation.mutate({
        name: formData.name,
        phone: formData.phone,
        password: formData.password || undefined,
        role: formData.role,
        status: formData.status,
        venueIds: formData.role === 'MANAGER' ? formData.venueIds : undefined,
      })
    } else if (editingStaff) {
      const payload: Parameters<typeof updateStaff>[1] = {
        name: formData.name,
        phone: formData.phone,
        role: formData.role as StaffUser['role'],
        status: formData.status as StaffUser['status'],
        venueIds: formData.role === 'MANAGER' ? formData.venueIds : undefined,
      }
      if (formData.password) {
        payload.password = formData.password
      }
      updateMutation.mutate({ id: editingStaff.id, data: payload })
    }
  }

  const handleDeleteConfirm = () => {
    if (!deletingStaff) return
    deleteMutation.mutate(deletingStaff.id)
  }

  const handleResetPassword = (staff: StaffUser) => {
    if (window.confirm(`确定要重置 ${staff.name} 的密码吗？默认密码为 123456`)) {
      resetPasswordMutation.mutate({ id: staff.id })
    }
  }

  const handleVenueAssignSubmit = (venueIds: string[]) => {
    if (!venueAssignStaff) return
    assignVenuesMutation.mutate({ id: venueAssignStaff.id, venueIds })
  }

  /* ------------------ Render ------------------ */

  return (
    <Layout breadcrumb={['账号管理']}>
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
            <h1 className="text-vr-h1 text-vrtext-primary font-semibold">账号管理</h1>
            <p className="text-vr-body-sm text-vrtext-tertiary mt-1">创建和管理系统运营账号</p>
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
                placeholder="搜索姓名、手机号..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                className="w-[280px] h-9 pl-9 pr-4 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </motion.div>

            <motion.button
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              onClick={handleOpenCreate}
              className="h-9 px-4 bg-vraccent-primary text-white rounded-lg text-vr-body-sm font-medium hover:bg-vraccent-primary/90 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              新增账号
            </motion.button>
          </div>
        </div>

        {/* Role Tabs */}
        <div className="flex items-center justify-between border-b border-vrborder-subtle">
          <div className="flex gap-6">
            {roleTabs.map((tab, idx) => (
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
                    layoutId="accounts-active-tab"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-vraccent-primary"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </motion.button>
            ))}
          </div>
          <span className="text-vr-caption text-vrtext-tertiary">
            {totalStaff} 位账号
          </span>
        </div>

        {/* Table */}
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
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">姓名</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[140px]">手机号</th>
                  <th className="text-center px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[120px]">角色</th>
                  <th className="text-center px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[110px]">状态</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[160px]">分配场地</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[140px]">创建时间</th>
                  <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[180px]">操作</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((staff, idx) => (
                  <motion.tr
                    key={staff.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(idx * 0.04, 0.2) }}
                    className="h-[60px] border-t border-vrborder-subtle hover:bg-vrbg-elevated/60 transition-colors"
                  >
                      <td className="px-4 py-3">
                        <span className="text-vr-body-sm text-vrtext-primary font-medium">{staff.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-vr-body-sm text-vrtext-primary font-mono">{staff.phone}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <RoleBadge role={staff.role} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={staff.status} />
                      </td>
                      <td className="px-4 py-3">
                        {staff.role === 'MANAGER' ? (
                          <div className="flex flex-wrap gap-1">
                            {staff.managedVenues && staff.managedVenues.length > 0 ? (
                              staff.managedVenues.map((v) => (
                                <span
                                  key={v.id}
                                  className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-vr-caption bg-vrbg-elevated text-vrtext-secondary border border-vrborder-subtle"
                                >
                                  <MapPin className="w-3 h-3" />
                                  {v.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-vr-caption text-vrtext-muted">未分配</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-vr-caption text-vrtext-muted">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-vr-body-sm text-vrtext-secondary">{formatDateTime(staff.createdAt)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(staff)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-vrtext-tertiary hover:text-vraccent-primary hover:bg-vraccent-primary/10 transition-colors"
                            title="编辑"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleResetPassword(staff)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-vrtext-tertiary hover:text-vrwarning hover:bg-vrwarning/10 transition-colors"
                            title="重置密码"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>
                          {staff.role === 'MANAGER' && (
                            <button
                              onClick={() => handleOpenVenueAssign(staff)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-vrtext-tertiary hover:text-vrsuccess hover:bg-vrsuccess/10 transition-colors"
                              title="分配场地"
                            >
                              <MapPin className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenDelete(staff)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-vrtext-tertiary hover:text-vrerror hover:bg-vrerror/10 transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {staffList.length === 0 && !isFetching && (
            <div className="flex flex-col items-center justify-center py-16">
              <Users className="w-12 h-12 text-vrtext-muted mb-3" />
              <p className="text-vr-body text-vrtext-secondary">暂无账号数据</p>
            </div>
          )}

          {isFetching && staffList.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-vraccent-primary animate-spin mb-3" />
              <p className="text-vr-body text-vrtext-secondary">加载中...</p>
            </div>
          )}

          {/* Pagination */}
          {totalStaff > 0 && (
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
                <span className="text-vr-caption text-vrtext-tertiary ml-2">共 {totalStaff} 条</span>
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

      {/* Create / Edit Sheet */}
      <StaffFormSheet
        mode={sheetMode}
        staff={editingStaff}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSubmit={handleSheetSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
        venues={venues}
      />

      {/* Delete Confirm */}
      <DeleteConfirmDialog
        staff={deletingStaff}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        isPending={deleteMutation.isPending}
      />

      {/* Venue Assignment */}
      <VenueAssignDialog
        staff={venueAssignStaff}
        open={venueDialogOpen}
        onOpenChange={setVenueDialogOpen}
        venues={venues}
        onSubmit={handleVenueAssignSubmit}
        isPending={assignVenuesMutation.isPending}
      />
    </Layout>
  )
}
