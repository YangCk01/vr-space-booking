import { UserRole } from '@prisma/client'

const staffRoles = new Set<string>(['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'FINANCE', 'MANAGER'])

export function assertPaymentMethodAllowedForRole(role: UserRole | string | undefined, method: string): void {
  const normalizedMethod = String(method || '').toUpperCase()
  if ((normalizedMethod === 'CASH' || normalizedMethod === 'CARD') && !staffRoles.has(role || '')) {
    throw new Error('现金/刷卡收款只能由门店员工操作')
  }
}
