import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield,
  Plus,
  ChevronDown,
  ChevronUp,
  Trash2,
  Save,
  RotateCcw,
  Lock,
  Pencil,
  AlertTriangle,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
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
import { getRoles, getPermissions, createRole, updateRole, updateRolePermissions, deleteRole } from '@/api/role'
import type { Role, Permission } from '@/api/role'

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: '超级管理员',
  ADMIN: '管理员',
  MANAGER: '店长',
  OPERATOR: '运营',
  FINANCE: '财务',
}

const moduleLabels: Record<string, string> = {
  account: '账号',
  approval: '审批',
  audit: '审计',
  booking: '排场',
  content: '内容',
  finance: '财务',
  'group-buy': '团购',
  marketing: '营销',
  member: '会员营销',
  monitor: '实时监控',
  order: '订单',
  points: '积分商城',
  recharge: '充值',
  role: '角色',
  setting: '系统设置',
  upload: '上传',
  user: '会员与用户',
  venue: '场地',
}

const permissionHints: Record<string, string> = {
  'approval:approve': '审批通过后会直接影响退款、赠送等业务结果',
  'finance:adjust': '可进行对账平账、日报确认和财务调整',
  'marketing:campaign': '可创建、暂停、复制和发放营销活动',
  'marketing:rule': '可调整自动触发营销规则',
  'member:marketing': '可修改会员等级、积分比例和赠送上限',
  'points:mall': '可管理积分商城商品、兑换、发货和退回',
  'recharge:staff': '可由后台为会员办理代充值',
  'upload:content': '可上传门店、游戏、页面和营销素材',
  'monitor:read': '可查看实时运营监控数据',
  'user:gift': '可发起积分或优惠券赠送，是否审批由策略决定',
}

const highRiskPermissionCodes = new Set([
  'setting:write',
  'account:manage',
  'role:manage',
  'finance:adjust',
  'approval:approve',
  'audit:read',
  'user:edit',
  'user:gift',
  'member:marketing',
  'points:mall',
  'recharge:staff',
  'marketing:campaign',
  'marketing:rule',
  'upload:content',
  'monitor:read',
])

function summarizePermissions(permissions: Permission[]) {
  const moduleCounts = permissions.reduce<Record<string, number>>((acc, permission) => {
    acc[permission.module] = (acc[permission.module] || 0) + 1
    return acc
  }, {})

  return Object.entries(moduleCounts)
    .sort(([a], [b]) => (moduleLabels[a] || a).localeCompare(moduleLabels[b] || b, 'zh-Hans-CN'))
    .slice(0, 5)
    .map(([module, count]) => `${moduleLabels[module] || module} ${count}`)
}

function countHighRiskPermissions(permissions: Permission[]) {
  return permissions.filter((permission) => highRiskPermissionCodes.has(permission.code)).length
}

function PermissionMatrix({
  allPermissions,
  selectedIds,
  onToggle,
  onToggleAll,
  readOnly,
}: {
  allPermissions: Permission[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onToggleAll: (module: string) => void
  readOnly?: boolean
}) {
  const modules = useMemo(() => {
    const map = new Map<string, Permission[]>()
    allPermissions.forEach((p) => {
      if (!map.has(p.module)) map.set(p.module, [])
      map.get(p.module)!.push(p)
    })
    return Array.from(map.entries())
  }, [allPermissions])

  return (
    <div className="space-y-4">
      {modules.map(([module, perms]) => {
        const moduleSelected = perms.every((p) => selectedIds.includes(p.id))
        const modulePartial = perms.some((p) => selectedIds.includes(p.id)) && !moduleSelected
        return (
          <div key={module} className="border border-vrborder-subtle rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-vrbg-elevated/50 border-b border-vrborder-subtle">
              <div className="flex items-center gap-2">
                <span className="text-vr-body-sm text-vrtext-primary font-medium">{moduleLabels[module] || module}</span>
                <span className="text-vr-caption text-vrtext-tertiary">({perms.length} 项权限)</span>
                <span className="text-[11px] text-vrtext-muted">{module}</span>
              </div>
              {readOnly ? (
                <span className="inline-flex items-center gap-1 text-vr-caption text-vrtext-tertiary">
                  <Lock className="w-3 h-3" />
                  只读
                </span>
              ) : (
                <label className="flex items-center gap-1.5 text-vr-caption text-vrtext-secondary cursor-pointer hover:text-vrtext-primary transition-colors">
                  <input
                    type="checkbox"
                    checked={moduleSelected}
                    ref={(el) => { if (el) el.indeterminate = modulePartial }}
                    onChange={() => onToggleAll(module)}
                    className="w-3.5 h-3.5 rounded border-vrborder-subtle text-vraccent-primary focus:ring-vraccent-primary bg-vrbg-elevated cursor-pointer"
                  />
                  全选
                </label>
              )}
            </div>
            <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {perms.map((p) => {
                const selected = selectedIds.includes(p.id)
                const highRisk = highRiskPermissionCodes.has(p.code)
                return (
                  <label
                    key={p.id}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors',
                      readOnly ? 'cursor-not-allowed opacity-75' : 'cursor-pointer',
                      selected
                        ? 'bg-vraccent-primary/10 border-vraccent-primary/30'
                        : cn('bg-vrbg-surface border-vrborder-subtle', !readOnly && 'hover:border-vrborder-hover')
                    )}
                    title={readOnly ? '当前角色不可编辑' : p.code}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => !readOnly && onToggle(p.id)}
                      disabled={readOnly}
                      className="w-4 h-4 rounded border-vrborder-subtle text-vraccent-primary focus:ring-vraccent-primary focus:ring-offset-0 bg-vrbg-elevated cursor-pointer disabled:cursor-not-allowed"
                    />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-vr-body-sm', selected ? 'text-vrtext-primary' : 'text-vrtext-secondary')}>
                          {p.name}
                        </span>
                        <span className="block text-[11px] text-vrtext-muted truncate">{p.code}</span>
                        {permissionHints[p.code] && (
                          <span className="block text-[11px] text-vrtext-tertiary leading-snug mt-0.5">
                            {permissionHints[p.code]}
                          </span>
                        )}
                      </span>
                    {highRisk && !readOnly && (
                      <span className="shrink-0 rounded bg-vrwarning/15 px-1.5 py-0.5 text-[11px] text-vrwarning">高风险</span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function RolePermissionPanel() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null)
  const [newRoleForm, setNewRoleForm] = useState({ name: '', description: '' })
  const [createPerms, setCreatePerms] = useState<string[]>([])
  const [editPerms, setEditPerms] = useState<Record<string, string[]>>({})
  const [editRoleOpen, setEditRoleOpen] = useState(false)
  const [editRoleForm, setEditRoleForm] = useState<{ id: string; name: string; description: string } | null>(null)
  const canViewRoles = Boolean(
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.permissions?.includes('role:read')
  )
  const canManageRoles = Boolean(
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.permissions?.includes('role:manage')
  )

  const { data: roles, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => getRoles(),
    enabled: canViewRoles,
  })

  const { data: allPermissions } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => getPermissions(),
    enabled: canViewRoles,
  })

  const selectedCreateHighRisk = useMemo(() => {
    if (!allPermissions) return []
    return allPermissions.filter((p) => createPerms.includes(p.id) && highRiskPermissionCodes.has(p.code))
  }, [allPermissions, createPerms])

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string; permissionIds?: string[] }) => createRole(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setCreateOpen(false)
      setNewRoleForm({ name: '', description: '' })
      setCreatePerms([])
    },
    onError: (err: any) => {
      alert('创建失败: ' + (err?.response?.data?.message || err?.message || '未知错误'))
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; description?: string } }) => updateRole(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setEditRoleOpen(false)
      setEditRoleForm(null)
    },
    onError: (err: any) => {
      alert('保存失败: ' + (err?.response?.data?.message || err?.message || '未知错误'))
    },
  })

  const updatePermsMutation = useMutation({
    mutationFn: ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) =>
      updateRolePermissions(roleId, permissionIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
    onError: (err: any) => {
      alert('保存失败: ' + (err?.response?.data?.message || err?.message || '未知错误'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setDeleteRoleId(null)
    },
    onError: (err: any) => {
      alert('删除失败: ' + (err?.response?.data?.message || err?.message || '未知错误'))
    },
  })

  const handleTogglePerm = (roleId: string, permId: string) => {
    if (!canManageRoles) return
    setEditPerms((prev) => {
      const current = prev[roleId] || []
      const next = current.includes(permId)
        ? current.filter((id) => id !== permId)
        : [...current, permId]
      return { ...prev, [roleId]: next }
    })
  }

  const handleToggleAll = (roleId: string, module: string, perms: Permission[]) => {
    if (!canManageRoles) return
    setEditPerms((prev) => {
      const current = prev[roleId] || []
      const moduleIds = perms.map((p) => p.id)
      const allSelected = moduleIds.every((id) => current.includes(id))
      const next = allSelected
        ? current.filter((id) => !moduleIds.includes(id))
        : [...new Set([...current, ...moduleIds])]
      return { ...prev, [roleId]: next }
    })
  }

  const handleExpand = (role: Role) => {
    if (expandedRoleId === role.id) {
      setExpandedRoleId(null)
    } else {
      setExpandedRoleId(role.id)
      setEditPerms((prev) => ({
        ...prev,
        [role.id]: role.permissions.map((p) => p.id),
      }))
    }
  }

  const handleSavePerms = (roleId: string) => {
    if (!canManageRoles) {
      alert('当前账号没有权限修改角色权限')
      return
    }
    const permissionIds = editPerms[roleId] || []
    updatePermsMutation.mutate({ roleId, permissionIds })
  }

  const roleList: Role[] = roles || []

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-vrtext-primary">角色权限管理</h1>
            <p className="text-vr-body-sm text-vrtext-tertiary mt-1">配置系统角色及其功能权限</p>
          </div>
          <button
            onClick={() => canManageRoles && setCreateOpen(true)}
            disabled={!canManageRoles}
            title={canManageRoles ? '新增自定义角色' : '当前账号没有角色管理权限'}
            className={cn(
              'inline-flex items-center gap-2 h-10 px-5 rounded-lg text-vr-body-sm font-medium transition-colors',
              canManageRoles
                ? 'bg-vraccent-primary text-white hover:bg-vraccent-primary-hover'
                : 'bg-vrbg-elevated text-vrtext-muted cursor-not-allowed'
            )}
          >
            <Plus className="w-4 h-4" />
            新增角色
          </button>
        </div>

        {!canViewRoles && (
          <div className="rounded-lg border border-vrwarning/30 bg-vrwarning/10 px-4 py-3 text-vr-body-sm text-vrtext-secondary">
            当前账号无权查看角色权限配置。如需查看或调整角色，请使用管理员账号登录。
          </div>
        )}

        <div className="rounded-lg border border-vrborder-subtle bg-vrbg-card px-4 py-3 text-vr-body-sm text-vrtext-secondary">
          {!canViewRoles
            ? '角色权限配置仅对管理员开放。'
            : canManageRoles
            ? '系统内置角色由系统维护，不能直接修改；如需差异化授权，请新增自定义角色。包含系统设置、财务调整、审批处理等权限时会标记为高风险。'
            : '当前账号仅可查看角色权限配置，不能新增、编辑、删除角色或调整权限。'}
        </div>

        {/* Role Cards */}
        {!canViewRoles ? null : isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RotateCcw className="w-5 h-5 animate-spin text-vrtext-muted" />
            <span className="text-vr-body text-vrtext-muted ml-2">加载中...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {roleList.map((role) => {
              const isExpanded = expandedRoleId === role.id
              const moduleSummary = summarizePermissions(role.permissions)
              const highRiskCount = countHighRiskPermissions(role.permissions)
              const hasChanges = editPerms[role.id] !== undefined &&
                JSON.stringify((editPerms[role.id] || []).sort()) !==
                JSON.stringify(role.permissions.map((p) => p.id).sort())

              return (
                <motion.div
                  key={role.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-vrbg-card rounded-xl border border-vrborder-subtle overflow-hidden"
                >
                  <div
                    className={cn(
                      'flex items-center justify-between px-5 py-4 cursor-pointer transition-colors',
                      isExpanded ? 'bg-vrbg-elevated/50' : 'hover:bg-vrbg-elevated/30'
                    )}
                    onClick={() => handleExpand(role)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-vraccent-primary/15 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-vraccent-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-vr-body text-vrtext-primary font-semibold">
                            {roleLabels[role.name] || role.name}
                          </h3>
                          {roleLabels[role.name] && (
                            <span className="text-[11px] text-vrtext-muted">{role.name}</span>
                          )}
                          {role.isSystem && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-vrwarning/15 text-vrwarning">
                              <Lock className="w-3 h-3 mr-1" />
                              系统角色
                            </span>
                          )}
                        </div>
                        <p className="text-vr-caption text-vrtext-tertiary mt-0.5">
                          {role.description || '暂无描述'} · {role.permissions.length} 项权限 · {role.userCount || 0} 位账号
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {moduleSummary.map((item) => (
                            <span
                              key={item}
                              className="inline-flex items-center rounded-full bg-vrbg-elevated px-2 py-0.5 text-[11px] text-vrtext-secondary"
                            >
                              {item}
                            </span>
                          ))}
                          {role.permissions.length > moduleSummary.reduce((sum, item) => sum + Number(item.split(' ').pop() || 0), 0) && (
                            <span className="inline-flex items-center rounded-full bg-vrbg-elevated px-2 py-0.5 text-[11px] text-vrtext-muted">
                              更多
                            </span>
                          )}
                          {highRiskCount > 0 && (
                            <span className="inline-flex items-center rounded-full bg-vrwarning/15 px-2 py-0.5 text-[11px] text-vrwarning">
                              高风险 {highRiskCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/accounts?roleId=${role.id}`)
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-vr-caption text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary transition-colors"
                        title="查看已绑定账号"
                      >
                        <Users className="w-3.5 h-3.5" />
                        查看账号
                      </button>
                      {canManageRoles && !role.isSystem && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditRoleForm({ id: role.id, name: role.name, description: role.description || '' })
                              setEditRoleOpen(true)
                            }}
                            className="p-2 rounded-lg text-vrtext-secondary hover:text-vraccent-primary hover:bg-vraccent-primary/10 transition-colors"
                            title="编辑角色"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteRoleId(role.id)
                            }}
                            className="p-2 rounded-lg text-vrerror hover:bg-vrerror/10 transition-colors"
                            title="删除角色"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-vrtext-muted" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-vrtext-muted" />
                      )}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && allPermissions && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="border-t border-vrborder-subtle"
                      >
                        <div className="p-5 space-y-4">
                          <PermissionMatrix
                            allPermissions={allPermissions}
                            selectedIds={editPerms[role.id] || role.permissions.map((p) => p.id)}
                            onToggle={(permId) => handleTogglePerm(role.id, permId)}
                            onToggleAll={(module) => {
                              const perms = allPermissions.filter((p) => p.module === module)
                              handleToggleAll(role.id, module, perms)
                            }}
                            readOnly={role.isSystem || !canManageRoles}
                          />
                          {hasChanges && canManageRoles && !role.isSystem && (
                            <div className="flex justify-end gap-3 pt-2">
                              <button
                                onClick={() =>
                                  setEditPerms((prev) => ({
                                    ...prev,
                                    [role.id]: role.permissions.map((p) => p.id),
                                  }))
                                }
                                className="h-9 px-4 rounded-lg border border-vrborder-subtle text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors"
                              >
                                重置
                              </button>
                              <button
                                onClick={() => handleSavePerms(role.id)}
                                disabled={updatePermsMutation.isPending}
                                className={cn(
                                  'inline-flex items-center gap-2 h-9 px-5 rounded-lg text-vr-body-sm font-medium transition-all',
                                  updatePermsMutation.isPending
                                    ? 'bg-vraccent-primary/50 text-white cursor-not-allowed'
                                    : 'bg-vraccent-primary text-white hover:bg-vraccent-primary-hover'
                                )}
                              >
                                {updatePermsMutation.isPending ? (
                                  <><RotateCcw className="w-4 h-4 animate-spin" />保存中...</>
                                ) : (
                                  <><Save className="w-4 h-4" />保存权限</>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>
        )}
      </motion.div>

      {/* Create Role Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-vrbg-card border-vrborder-subtle sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="text-vr-h3 text-vrtext-primary font-semibold">新增角色</DialogTitle>
            <DialogDescription className="text-vr-caption text-vrtext-tertiary">
              创建新的系统角色并配置权限
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2 max-h-[60vh] overflow-y-auto pr-1">
            <div>
              <label className="block text-vr-caption text-vrtext-secondary mb-1">角色名称</label>
              <input
                type="text"
                value={newRoleForm.name}
                onChange={(e) => setNewRoleForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="如：运营专员"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-caption text-vrtext-secondary mb-1">描述</label>
              <input
                type="text"
                value={newRoleForm.description}
                onChange={(e) => setNewRoleForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="角色职责描述..."
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            {allPermissions && (
              <div>
                <label className="block text-vr-caption text-vrtext-secondary mb-2">权限配置</label>
                <PermissionMatrix
                  allPermissions={allPermissions}
                  selectedIds={createPerms}
                  onToggle={(id) => {
                    setCreatePerms((prev) =>
                      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
                    )
                  }}
                  onToggleAll={(module) => {
                    const moduleIds = allPermissions.filter((p) => p.module === module).map((p) => p.id)
                    const hasAll = moduleIds.every((id) => createPerms.includes(id))
                    setCreatePerms((prev) =>
                      hasAll ? prev.filter((id) => !moduleIds.includes(id)) : Array.from(new Set([...prev, ...moduleIds]))
                    )
                  }}
                />
                {selectedCreateHighRisk.length > 0 && (
                  <div className="mt-3 rounded-lg border border-vrwarning/30 bg-vrwarning/10 px-3 py-2 text-vr-caption text-vrwarning">
                    <div className="flex items-center gap-2 font-medium">
                      <AlertTriangle className="w-4 h-4" />
                      已选择 {selectedCreateHighRisk.length} 项高风险权限
                    </div>
                    <p className="mt-1 text-vrtext-secondary">
                      建议仅授予可信角色，并保留审批、财务、系统设置类权限的最小范围。
                    </p>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setCreateOpen(false)}
                className="h-9 px-4 rounded-lg border border-vrborder-subtle text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (!canManageRoles) {
                    alert('当前账号没有权限新增角色')
                    return
                  }
                  if (!newRoleForm.name.trim()) {
                    alert('请输入角色名称')
                    return
                  }
                  createMutation.mutate({
                    name: newRoleForm.name.trim(),
                    description: newRoleForm.description.trim(),
                    permissionIds: createPerms,
                  })
                }}
                disabled={createMutation.isPending}
                className={cn(
                  'inline-flex items-center gap-2 h-9 px-5 rounded-lg text-vr-body-sm font-medium transition-all',
                  createMutation.isPending
                    ? 'bg-vraccent-primary/50 text-white cursor-not-allowed'
                    : 'bg-vraccent-primary text-white hover:bg-vraccent-primary-hover'
                )}
              >
                {createMutation.isPending ? (
                  <><RotateCcw className="w-4 h-4 animate-spin" />创建中...</>
                ) : (
                  <><Plus className="w-4 h-4" />创建角色</>
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={editRoleOpen} onOpenChange={setEditRoleOpen}>
        <DialogContent className="bg-vrbg-card border-vrborder-subtle sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-vr-h3 text-vrtext-primary font-semibold">编辑角色</DialogTitle>
            <DialogDescription className="text-vr-caption text-vrtext-tertiary">
              修改角色名称和描述
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-vr-caption text-vrtext-secondary mb-1">角色名称</label>
              <input
                type="text"
                value={editRoleForm?.name || ''}
                onChange={(e) => setEditRoleForm((p) => p ? { ...p, name: e.target.value } : null)}
                placeholder="角色名称"
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div>
              <label className="block text-vr-caption text-vrtext-secondary mb-1">描述</label>
              <input
                type="text"
                value={editRoleForm?.description || ''}
                onChange={(e) => setEditRoleForm((p) => p ? { ...p, description: e.target.value } : null)}
                placeholder="角色职责描述..."
                className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setEditRoleOpen(false)}
                className="h-9 px-4 rounded-lg border border-vrborder-subtle text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (!canManageRoles) {
                    alert('当前账号没有权限编辑角色')
                    return
                  }
                  if (!editRoleForm?.name.trim()) {
                    alert('请输入角色名称')
                    return
                  }
                  updateRoleMutation.mutate({
                    id: editRoleForm.id,
                    data: {
                      name: editRoleForm.name.trim(),
                      description: editRoleForm.description.trim(),
                    },
                  })
                }}
                disabled={updateRoleMutation.isPending}
                className={cn(
                  'inline-flex items-center gap-2 h-9 px-5 rounded-lg text-vr-body-sm font-medium transition-all',
                  updateRoleMutation.isPending
                    ? 'bg-vraccent-primary/50 text-white cursor-not-allowed'
                    : 'bg-vraccent-primary text-white hover:bg-vraccent-primary-hover'
                )}
              >
                {updateRoleMutation.isPending ? (
                  <><RotateCcw className="w-4 h-4 animate-spin" />保存中...</>
                ) : (
                  <><Save className="w-4 h-4" />保存</>
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteRoleId} onOpenChange={() => setDeleteRoleId(null)}>
        <AlertDialogContent className="bg-vrbg-card border-vrborder-subtle">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-vr-h3 text-vrtext-primary font-semibold">确认删除角色？</AlertDialogTitle>
            <AlertDialogDescription className="text-vr-body-sm text-vrtext-tertiary">
              此操作不可撤销，删除后关联用户将失去该角色权限。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 px-4 rounded-lg border border-vrborder-subtle text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors bg-transparent">
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!canManageRoles) {
                  alert('当前账号没有权限删除角色')
                  return
                }
                deleteRoleId && deleteMutation.mutate(deleteRoleId)
              }}
              disabled={deleteMutation.isPending}
              className="h-9 px-5 rounded-lg bg-vrerror text-white text-vr-body-sm font-medium hover:bg-vrerror/90 transition-colors"
            >
              {deleteMutation.isPending ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
