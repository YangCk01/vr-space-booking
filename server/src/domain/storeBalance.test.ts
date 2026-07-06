import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  UNASSIGNED_STORE_BALANCE_VENUE_ID,
  allocateStoreBalanceDebit,
  buildBalanceDeductionSnapshot,
  debitStoreBalance,
  refundStoreBalanceFromSnapshot,
  validateBalanceConsistency,
} from './storeBalance'

describe('buildBalanceDeductionSnapshot', () => {
  it('returns a single-venue snapshot for principal and bonus', () => {
    const snapshot = buildBalanceDeductionSnapshot('venue-1', 100, 20)
    assert.strictEqual(snapshot.totalPrincipal, 100)
    assert.strictEqual(snapshot.totalBonus, 20)
    assert.strictEqual(snapshot.deductions.length, 1)
    assert.strictEqual(snapshot.deductions[0].venueId, 'venue-1')
    assert.strictEqual(snapshot.deductions[0].principal, 100)
    assert.strictEqual(snapshot.deductions[0].bonus, 20)
  })
})

describe('refundStoreBalanceFromSnapshot', () => {
  it('returns empty array when refund amount is 0', async () => {
    const result = await refundStoreBalanceFromSnapshot({
      userId: 'user-1',
      refundAmount: 0,
      snapshot: buildBalanceDeductionSnapshot('venue-1', 100, 20),
      principalDeduction: 100,
      bonusDeduction: 20,
    } as any)
    assert.deepStrictEqual(result, [])
  })

  it('calculates refund split proportionally from snapshot', async () => {
    const fakeClient = {
      userStoreBalance: {
        upsert: async () => null,
      },
    } as any

    const snapshot = buildBalanceDeductionSnapshot('venue-1', 100, 20)
    const result = await refundStoreBalanceFromSnapshot(fakeClient, {
      userId: 'user-1',
      refundAmount: 60,
      snapshot,
      principalDeduction: 100,
      bonusDeduction: 20,
    })

    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].venueId, 'venue-1')
    assert.strictEqual(result[0].principal + result[0].bonus, 60)
  })

  it('refunds across multiple venues when snapshot has multiple deductions', async () => {
    const fakeClient = {
      userStoreBalance: {
        upsert: async () => null,
      },
    } as any

    const snapshot = {
      deductions: [
        { venueId: 'venue-1', principal: 100, bonus: 0 },
        { venueId: 'venue-2', principal: 0, bonus: 50 },
      ],
      totalPrincipal: 100,
      totalBonus: 50,
    }

    const result = await refundStoreBalanceFromSnapshot(fakeClient, {
      userId: 'user-1',
      refundAmount: 120,
      snapshot,
      principalDeduction: 100,
      bonusDeduction: 50,
    })

    assert.strictEqual(result.length, 2)
    assert.strictEqual(result[0].venueId, 'venue-1')
    assert.strictEqual(result[1].venueId, 'venue-2')
    assert.strictEqual(result[0].principal + result[0].bonus + result[1].principal + result[1].bonus, 120)
  })

  it('does not write virtual unassigned balance rows during refund', async () => {
    const upserts: any[] = []
    const fakeClient = {
      userStoreBalance: {
        upsert: async (args: any) => {
          upserts.push(args)
          return null
        },
      },
    } as any

    const result = await refundStoreBalanceFromSnapshot(fakeClient, {
      userId: 'user-1',
      refundAmount: 100,
      snapshot: {
        totalPrincipal: 100,
        totalBonus: 0,
        deductions: [
          { venueId: UNASSIGNED_STORE_BALANCE_VENUE_ID, principal: 100, bonus: 0 },
        ],
      },
      principalDeduction: 100,
      bonusDeduction: 0,
    })

    assert.deepStrictEqual(result, [])
    assert.deepStrictEqual(upserts, [])
  })

  it('keeps rounding cents in the original wallet pocket', async () => {
    const snapshot = {
      deductions: [
        { venueId: 'venue-principal', principal: 1, bonus: 0 },
        { venueId: 'venue-bonus', principal: 0, bonus: 2 },
      ],
      totalPrincipal: 1,
      totalBonus: 2,
    }

    const result = await refundStoreBalanceFromSnapshot({
      userId: 'user-1',
      refundAmount: 2,
      snapshot,
      principalDeduction: 1,
      bonusDeduction: 2,
    })

    assert.strictEqual(result.length, 2)
    assert.deepStrictEqual(result[0], { venueId: 'venue-principal', principal: 1, bonus: 0 })
    assert.deepStrictEqual(result[1], { venueId: 'venue-bonus', principal: 0, bonus: 1 })
  })
})

describe('allocateStoreBalanceDebit', () => {
  it('debits the consuming venue first and then other source venues', () => {
    const snapshot = allocateStoreBalanceDebit({
      preferredVenueId: 'venue-b',
      principal: 120,
      bonus: 30,
      storeBalances: [
        { venueId: 'venue-a', principalBalance: 100, bonusBalance: 20 },
        { venueId: 'venue-b', principalBalance: 50, bonusBalance: 25 },
      ],
    })

    assert.deepStrictEqual(snapshot.deductions, [
      { venueId: 'venue-b', principal: 50, bonus: 25 },
      { venueId: 'venue-a', principal: 70, bonus: 5 },
    ])
    assert.strictEqual(snapshot.totalPrincipal, 120)
    assert.strictEqual(snapshot.totalBonus, 30)
  })

  it('records historical global balance as unassigned instead of making a store negative', () => {
    const snapshot = allocateStoreBalanceDebit({
      preferredVenueId: 'venue-b',
      principal: 90,
      bonus: 10,
      storeBalances: [
        { venueId: 'venue-a', principalBalance: 40, bonusBalance: 5 },
      ],
    })

    assert.deepStrictEqual(snapshot.deductions, [
      { venueId: 'venue-a', principal: 40, bonus: 5 },
      { venueId: UNASSIGNED_STORE_BALANCE_VENUE_ID, principal: 50, bonus: 5 },
    ])
  })
})

describe('debitStoreBalance', () => {
  it('updates existing source rows without creating negative balances', async () => {
    const upserts: any[] = []
    const updates: any[] = []
    const fakeClient = {
      userStoreBalance: {
        findMany: async () => [
          { venueId: 'venue-a', principalBalance: 40, bonusBalance: 10 },
        ],
        update: async (args: any) => {
          updates.push(args)
          return null
        },
        upsert: async (args: any) => {
          upserts.push(args)
          return null
        },
      },
    } as any

    const snapshot = await debitStoreBalance(fakeClient, {
      userId: 'user-1',
      venueId: 'venue-b',
      principal: 90,
      bonus: 10,
    })

    assert.deepStrictEqual(upserts, [])
    assert.deepStrictEqual(updates, [
      {
        where: { userId_venueId: { userId: 'user-1', venueId: 'venue-a' } },
        data: {
          principalBalance: { decrement: 40 },
          bonusBalance: { decrement: 10 },
        },
      },
    ])
    assert.deepStrictEqual(snapshot.deductions, [
      { venueId: 'venue-a', principal: 40, bonus: 10 },
      { venueId: UNASSIGNED_STORE_BALANCE_VENUE_ID, principal: 50, bonus: 0 },
    ])
  })

  it('rejects when a concurrent debit has already consumed the source balance', async () => {
    const fakeClient = {
      userStoreBalance: {
        findMany: async () => [
          { venueId: 'venue-a', principalBalance: 40, bonusBalance: 10 },
        ],
        updateMany: async () => ({ count: 0 }),
        upsert: async () => null,
      },
    } as any

    await assert.rejects(
      () => debitStoreBalance(fakeClient, {
        userId: 'user-1',
        venueId: 'venue-a',
        principal: 40,
        bonus: 10,
      }),
      /门店余额不足或已被并发扣减/,
    )
  })
})

describe('validateBalanceConsistency', () => {
  it('returns valid when global balances match store sums', async () => {
    const fakeClient = {
      user: {
        findMany: async () => [
          { id: 'user-1', principalBalance: 100, bonusBalance: 50 },
        ],
      },
      userStoreBalance: {
        aggregate: async () => ({
          _sum: { principalBalance: 100, bonusBalance: 50 },
        }),
      },
    } as any

    const result = await validateBalanceConsistency(fakeClient)
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.inconsistencies.length, 0)
  })

  it('detects principal mismatch', async () => {
    const fakeClient = {
      user: {
        findMany: async () => [
          { id: 'user-1', principalBalance: 100, bonusBalance: 50 },
        ],
      },
      userStoreBalance: {
        aggregate: async () => ({
          _sum: { principalBalance: 80, bonusBalance: 50 },
        }),
      },
    } as any

    const result = await validateBalanceConsistency(fakeClient)
    assert.strictEqual(result.valid, false)
    assert.strictEqual(result.inconsistencies.length, 1)
    assert.strictEqual(result.inconsistencies[0].field, 'principal')
    assert.strictEqual(result.inconsistencies[0].diff, 20)
  })
})
