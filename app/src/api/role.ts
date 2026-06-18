import { apiClient } from './client'

export interface Permission {
  id: string
  module: string
  code: string
  name: string
}

export interface Role {
  id: string
  name: string
  description?: string
  isSystem: boolean
  permissions: Permission[]
  userCount?: number
  createdAt?: string
}

export async function getRoles() {
  const res = await apiClient.get('/roles')
  return res.data.data as Role[]
}

export async function getPermissions() {
  const res = await apiClient.get('/roles/permissions')
  return res.data.data as Permission[]
}

export async function createRole(data: {
  name: string
  description?: string
  permissionIds?: string[]
}) {
  const res = await apiClient.post('/roles', data)
  return res.data.data
}

export async function updateRole(roleId: string, data: { name?: string; description?: string }) {
  const res = await apiClient.put(`/roles/${roleId}`, data)
  return res.data.data
}

export async function updateRolePermissions(roleId: string, permissionIds: string[]) {
  const res = await apiClient.put(`/roles/${roleId}/permissions`, { permissionIds })
  return res.data.data
}

export async function deleteRole(roleId: string) {
  const res = await apiClient.delete(`/roles/${roleId}`)
  return res.data.data
}
