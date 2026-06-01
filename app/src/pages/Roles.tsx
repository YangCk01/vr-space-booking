import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield,
  Plus,
  ChevronDown,
  ChevronUp,
  Trash2,
  Save,
  Check,
  RotateCcw,
  X,
  Lock,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { cn } from '@/lib/utils'
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
import { getRoles, getPermissions, createRole, updateRolePermissions, deleteRole } from '@/api/role'
import type { Role, Permission } from '@/api/role'

function PermissionMatrix({
  role,
  allPermissions,
  selectedIds,
  onToggle,
  onToggleAll,
  readOnly,
}: {
  role: Role
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
                <span className="text-vr-body-sm text-vrtext-primary font-medium">{module}</span>
                <span className="text-vr-caption text-vrtext-tertiary">({perms.length} 项权限)</span>
              </div>
              {!readOnly && (
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
              {perms.map((p) => (
                <label
                  key={p.id}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors cursor-pointer',
                    selectedIds.includes(p.id)
                      ? 'bg-vraccent-primary/10 border-vraccent-primary/30'
                      : 'bg-vrbg-surface border-vrborder-subtle hover:border-vrborder-hover'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(p.id)}
                    onChange={() => onToggle(p.id)}
                    disabled={readOnly}
                    className="w-4 h-4 rounded border-vrborder-subtle text-vraccent-primary focus:ring-vraccent-primary focus:ring-offset-0 bg-vrbg-elevated cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className={cn(
                    'text-vr-body-sm',
                    selectedIds.includes(p.id) ? 'text-vrtext-primary' : 'text-vrtext-secondary'
                  )}>
                    {p.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Roles() {
  const queryClient = useQueryClient()
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null)
  const [newRoleForm, setNewRoleForm] = useState({ name: '', description: '' })
  const [editPerms, setEditPerms] = useState<Record<string, string[]>>({})

  const { data: roles, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => getRoles(),
  })

  const { data: allPermissions } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => getPermissions(),
  })

  const createMutation = useMutation({
    mutationFn: createRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setCreateOpen(false)
      setNewRoleForm({ name: '', description: '' })
    },
    onError: (err: any) => {
      alert('创建失败: ' + (err?.response?.data?.message || err?.message || '未知错误'))
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
    setEditPerms((prev) => {
      const current = prev[roleId] || []
      const next = current.includes(permId)
        ? current.filter((id) => id !== permId)
        : [...current, permId]
      return { ...prev, [roleId]: next }
    })
  }

  const handleToggleAll = (roleId: string, module: string, perms: Permission[]) => {
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
    const permissionIds = editPerms[roleId] || []
    updatePermsMutation.mutate({ roleId, permissionIds })
  }

  const roleList: Role[] = roles || []

  return (
    <Layout breadcrumb={['角色权限']}>
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
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-vraccent-primary text-white text-vr-body-sm font-medium hover:bg-vraccent-primary-hover transition-colors"
          >
            <Plus className="w-4 h-4" />
            新增角色
          </button>
        </div>

        {/* Role Cards */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RotateCcw className="w-5 h-5 animate-spin text-vrtext-muted" />
            <span className="text-vr-body text-vrtext-muted ml-2">加载中...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {roleList.map((role) => {
              const isExpanded = expandedRoleId === role.id
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
                          <h3 className="text-vr-body text-vrtext-primary font-semibold">{role.name}</h3>
                          {role.isSystem && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-vrwarning/15 text-vrwarning">
                              <Lock className="w-3 h-3 mr-1" />
                              系统角色
                            </span>
                          )}
                        </div>
                        <p className="text-vr-caption text-vrtext-tertiary mt-0.5">
                          {role.description || '暂无描述'} · {role.permissions.length} 项权限
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {!role.isSystem && (
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
                            role={role}
                            allPermissions={allPermissions}
                            selectedIds={editPerms[role.id] || role.permissions.map((p) => p.id)}
                            onToggle={(permId) => handleTogglePerm(role.id, permId)}
                            onToggleAll={(module) => {
                              const perms = allPermissions.filter((p) => p.module === module)
                              handleToggleAll(role.id, module, perms)
                            }}
                            readOnly={role.isSystem}
                          />
                          {hasChanges && !role.isSystem && (
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
        <DialogContent className="bg-vrbg-card border-vrborder-subtle sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-vr-h3 text-vrtext-primary font-semibold">新增角色</DialogTitle>
            <DialogDescription className="text-vr-caption text-vrtext-tertiary">
              创建新的系统角色并配置权限
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
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
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setCreateOpen(false)}
                className="h-9 px-4 rounded-lg border border-vrborder-subtle text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (!newRoleForm.name.trim()) {
                    alert('请输入角色名称')
                    return
                  }
                  createMutation.mutate({
                    name: newRoleForm.name.trim(),
                    description: newRoleForm.description.trim(),
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
              onClick={() => deleteRoleId && deleteMutation.mutate(deleteRoleId)}
              disabled={deleteMutation.isPending}
              className="h-9 px-5 rounded-lg bg-vrerror text-white text-vr-body-sm font-medium hover:bg-vrerror/90 transition-colors"
            >
              {deleteMutation.isPending ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  )
}
