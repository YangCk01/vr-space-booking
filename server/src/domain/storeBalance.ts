import { Prisma } from '@prisma/client'
import { calculateRefundSplitFromDeduction } from './walletLedger'

export const UNASSIGNED_STORE_BALANCE_VENUE_ID = 'UNASSIGNED'

function isPhysicalVenueId(venueId: string): boolean {
  return venueId !== 'PLATFORM' && venueId !== UNASSIGNED_STORE_BALANCE_VENUE_ID
}

export interface BalanceDeductionItem {
  venueId: string
  principal: number
  bonus: number
}

export interface BalanceDeductionSnapshot {
  totalPrincipal: number
  totalBonus: number
  deductions: BalanceDeductionItem[]
}

export function buildBalanceDeductionSnapshot(
  venueId: string,
  principal: number,
  bonus: number,
): BalanceDeductionSnapshot {
  const sourceVenueId = venueId && isPhysicalVenueId(venueId)
    ? venueId
    : UNASSIGNED_STORE_BALANCE_VENUE_ID

  return {
    totalPrincipal: principal,
    totalBonus: bonus,
    deductions: [
      {
        venueId: sourceVenueId,
        principal,
        bonus,
      },
    ],
  }
}

export interface StoreBalanceRow {
  venueId: string
  principalBalance: number
  bonusBalance: number
}

export interface StoreBalanceClient {
  userStoreBalance: {
    findMany?: (args: any) => Promise<StoreBalanceRow[]>
    update?: (args: any) => Promise<any>
    updateMany?: (args: any) => Promise<{ count: number }>
    upsert: (args: any) => Promise<any>
  }
}

export interface DebitStoreBalanceInput {
  userId: string
  venueId?: string | null
  principal: number
  bonus: number
}

export interface AllocateStoreBalanceDebitInput {
  preferredVenueId?: string | null
  principal: number
  bonus: number
  storeBalances: StoreBalanceRow[]
}

export function allocateStoreBalanceDebit(input: AllocateStoreBalanceDebitInput): BalanceDeductionSnapshot {
  const principal = Math.max(0, input.principal)
  const bonus = Math.max(0, input.bonus)
  const preferredVenueId = input.preferredVenueId || undefined
  let remainingPrincipal = principal
  let remainingBonus = bonus
  const deductions: BalanceDeductionItem[] = []

  const candidates = input.storeBalances
    .filter(row => isPhysicalVenueId(row.venueId))
    .map((row, index) => ({ ...row, index }))
    .sort((a, b) => {
      if (preferredVenueId) {
        if (a.venueId === preferredVenueId && b.venueId !== preferredVenueId) return -1
        if (b.venueId === preferredVenueId && a.venueId !== preferredVenueId) return 1
      }
      return a.index - b.index
    })

  for (const row of candidates) {
    if (remainingPrincipal <= 0 && remainingBonus <= 0) break

    const principalFromVenue = Math.min(Math.max(row.principalBalance, 0), remainingPrincipal)
    const bonusFromVenue = Math.min(Math.max(row.bonusBalance, 0), remainingBonus)
    if (principalFromVenue <= 0 && bonusFromVenue <= 0) continue

    deductions.push({
      venueId: row.venueId,
      principal: principalFromVenue,
      bonus: bonusFromVenue,
    })
    remainingPrincipal -= principalFromVenue
    remainingBonus -= bonusFromVenue
  }

  if (remainingPrincipal > 0 || remainingBonus > 0) {
    deductions.push({
      venueId: UNASSIGNED_STORE_BALANCE_VENUE_ID,
      principal: remainingPrincipal,
      bonus: remainingBonus,
    })
  }

  return { totalPrincipal: principal, totalBonus: bonus, deductions }
}

export async function debitStoreBalance(
  tx: StoreBalanceClient,
  input: DebitStoreBalanceInput,
): Promise<BalanceDeductionSnapshot> {
  const { userId, venueId, principal, bonus } = input
  if (principal === 0 && bonus === 0) {
    return { totalPrincipal: 0, totalBonus: 0, deductions: [] }
  }

  const storeBalances = tx.userStoreBalance.findMany
    ? await tx.userStoreBalance.findMany({
      where: { userId },
      select: { venueId: true, principalBalance: true, bonusBalance: true },
      orderBy: { createdAt: 'asc' },
    })
    : []

  const snapshot = allocateStoreBalanceDebit({
    preferredVenueId: venueId,
    principal,
    bonus,
    storeBalances,
  })

  for (const deduction of snapshot.deductions) {
    if (!isPhysicalVenueId(deduction.venueId)) continue
    if (deduction.principal === 0 && deduction.bonus === 0) continue

    if (tx.userStoreBalance.updateMany) {
      const result = await tx.userStoreBalance.updateMany({
        where: {
          userId,
          venueId: deduction.venueId,
          principalBalance: { gte: deduction.principal },
          bonusBalance: { gte: deduction.bonus },
        },
        data: {
          principalBalance: { decrement: deduction.principal },
          bonusBalance: { decrement: deduction.bonus },
        },
      })
      if (result.count !== 1) {
        throw new Error('门店余额不足或已被并发扣减，请重试')
      }
    } else if (tx.userStoreBalance.update) {
      await tx.userStoreBalance.update({
        where: { userId_venueId: { userId, venueId: deduction.venueId } },
        data: {
          principalBalance: { decrement: deduction.principal },
          bonusBalance: { decrement: deduction.bonus },
        },
      })
    }
  }

  return snapshot
}

export interface RefundStoreBalanceInput {
  userId: string
  refundAmount: number
  snapshot?: BalanceDeductionSnapshot | Prisma.JsonValue | null
  principalDeduction: number
  bonusDeduction: number
}

export interface RefundAllocation {
  venueId: string
  principal: number
  bonus: number
}

export async function refundStoreBalanceFromSnapshot(
  input: RefundStoreBalanceInput,
): Promise<RefundAllocation[]>
export async function refundStoreBalanceFromSnapshot(
  client: StoreBalanceClient,
  input: RefundStoreBalanceInput,
): Promise<RefundAllocation[]>
export async function refundStoreBalanceFromSnapshot(
  clientOrInput: StoreBalanceClient | RefundStoreBalanceInput,
  input?: RefundStoreBalanceInput,
): Promise<RefundAllocation[]> {
  const hasClient = input !== undefined && 'userStoreBalance' in (clientOrInput as StoreBalanceClient)
  const client = hasClient ? (clientOrInput as StoreBalanceClient) : null
  const actualInput = hasClient ? input! : (clientOrInput as RefundStoreBalanceInput)

  const { userId, refundAmount, snapshot, principalDeduction, bonusDeduction } = actualInput
  if (refundAmount <= 0 || (principalDeduction === 0 && bonusDeduction === 0)) {
    return []
  }

  const normalized = normalizeSnapshot(snapshot)
  if (!normalized || normalized.deductions.length === 0) {
    return []
  }

  const allocations = calculateRefundAllocations({
    refundAmount,
    snapshot: normalized,
    principalDeduction,
    bonusDeduction,
  })

  const storeAllocations = allocations.filter(allocation => isPhysicalVenueId(allocation.venueId))

  if (client) {
    for (const allocation of storeAllocations) {
      if (allocation.principal === 0 && allocation.bonus === 0) continue
      await client.userStoreBalance.upsert({
        where: { userId_venueId: { userId, venueId: allocation.venueId } },
        update: {
          principalBalance: { increment: allocation.principal },
          bonusBalance: { increment: allocation.bonus },
        },
        create: {
          userId,
          venueId: allocation.venueId,
          principalBalance: allocation.principal,
          bonusBalance: allocation.bonus,
          totalRecharged: 0,
        },
      })
    }
  }

  return storeAllocations
}

function calculateRefundAllocations(options: {
  refundAmount: number
  snapshot: BalanceDeductionSnapshot
  principalDeduction: number
  bonusDeduction: number
}): RefundAllocation[] {
  const { refundAmount, snapshot, principalDeduction, bonusDeduction } = options
  const refundableTotal = snapshot.totalPrincipal + snapshot.totalBonus
  if (refundableTotal <= 0) return []

  const targetRefund = Math.min(refundAmount, refundableTotal)
  const weighted = snapshot.deductions
    .map((deduction, index) => {
      const venueMax = deduction.principal + deduction.bonus
      const rawShare = venueMax > 0 ? targetRefund * (venueMax / refundableTotal) : 0
      const baseShare = Math.min(Math.floor(rawShare), venueMax)
      return {
        deduction,
        index,
        venueMax,
        refundAmount: baseShare,
        remainder: rawShare - baseShare,
      }
    })
    .filter(item => item.venueMax > 0)

  let allocated = weighted.reduce((sum, item) => sum + item.refundAmount, 0)
  let remaining = targetRefund - allocated
  const byRemainder = [...weighted].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder
    return a.index - b.index
  })

  while (remaining > 0) {
    let changed = false
    for (const item of byRemainder) {
      if (remaining <= 0) break
      if (item.refundAmount >= item.venueMax) continue
      item.refundAmount += 1
      remaining -= 1
      changed = true
    }
    if (!changed) break
  }

  return weighted.flatMap(({ deduction, refundAmount: venueRefund }) => {
    const venueMax = deduction.principal + deduction.bonus
    if (venueMax <= 0 || venueRefund <= 0) return []

    const split = calculateRefundSplitFromDeduction({
      originalPrincipalDeduction: deduction.principal,
      originalBonusDeduction: deduction.bonus,
      refundAmount: venueRefund,
    })

    return [{
      venueId: deduction.venueId,
      principal: split.principalAmount,
      bonus: split.bonusAmount,
    }]
  })
}

function normalizeSnapshot(
  snapshot?: BalanceDeductionSnapshot | Prisma.JsonValue | null,
): BalanceDeductionSnapshot | null {
  if (!snapshot) return null
  if (typeof snapshot !== 'object') return null

  const s = snapshot as any
  if (Array.isArray(s.deductions)) {
    return {
      totalPrincipal: Number(s.totalPrincipal) || 0,
      totalBonus: Number(s.totalBonus) || 0,
      deductions: s.deductions.map((d: any) => ({
        venueId: String(d.venueId || UNASSIGNED_STORE_BALANCE_VENUE_ID),
        principal: Number(d.principal) || 0,
        bonus: Number(d.bonus) || 0,
      })),
    }
  }

  // 兼容早期单门店快照（仅包含 venueId/principal/bonus）
  if (s.venueId !== undefined) {
    const principal = Number(s.principal) || 0
    const bonus = Number(s.bonus) || 0
    return {
      totalPrincipal: principal,
      totalBonus: bonus,
      deductions: [
        {
          venueId: String(s.venueId || UNASSIGNED_STORE_BALANCE_VENUE_ID),
          principal,
          bonus,
        },
      ],
    }
  }

  return null
}

export interface BalanceConsistencyResult {
  valid: boolean
  inconsistencies: Array<{
    field: 'principal' | 'bonus'
    globalTotal: number
    storeTotal: number
    diff: number
  }>
}

export async function validateBalanceConsistency(
  client: {
    user: { findMany: (...args: any[]) => Promise<any[]> }
    userStoreBalance: { aggregate: (...args: any[]) => Promise<any> }
  },
): Promise<BalanceConsistencyResult> {
  const [users, storeSum] = await Promise.all([
    client.user.findMany({ select: { principalBalance: true, bonusBalance: true } }),
    client.userStoreBalance.aggregate({ _sum: { principalBalance: true, bonusBalance: true } }),
  ])

  const globalPrincipal = users.reduce((sum, u) => sum + (u.principalBalance || 0), 0)
  const globalBonus = users.reduce((sum, u) => sum + (u.bonusBalance || 0), 0)
  const storePrincipal = storeSum._sum.principalBalance || 0
  const storeBonus = storeSum._sum.bonusBalance || 0

  const inconsistencies: BalanceConsistencyResult['inconsistencies'] = []
  if (globalPrincipal !== storePrincipal) {
    inconsistencies.push({
      field: 'principal',
      globalTotal: globalPrincipal,
      storeTotal: storePrincipal,
      diff: globalPrincipal - storePrincipal,
    })
  }
  if (globalBonus !== storeBonus) {
    inconsistencies.push({
      field: 'bonus',
      globalTotal: globalBonus,
      storeTotal: storeBonus,
      diff: globalBonus - storeBonus,
    })
  }

  return { valid: inconsistencies.length === 0, inconsistencies }
}
