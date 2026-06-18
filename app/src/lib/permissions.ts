import type { User } from '@/stores/authStore'

export function hasPermission(user: User | null | undefined, permission: string) {
  if (!user) return false
  if (user.role === 'SUPER_ADMIN') return true
  return user.permissions?.includes(permission) ?? false
}

export function hasAnyPermission(user: User | null | undefined, permissions: string[]) {
  if (!user) return false
  if (user.role === 'SUPER_ADMIN') return true
  return permissions.some((permission) => user.permissions?.includes(permission))
}
