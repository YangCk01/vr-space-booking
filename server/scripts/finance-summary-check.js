process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://vruser:vrpass@127.0.0.1:5432/vrspace_dev?schema=public&connection_limit=10'

const { PrismaClient } = require('@prisma/client')

const baseUrl = process.env.FINANCE_BASE_URL || 'http://localhost:4001/api'
const adminPhone = process.env.FINANCE_ADMIN_PHONE || '13800000000'
const adminPassword = process.env.FINANCE_ADMIN_PASSWORD || 'admin123'
const prisma = new PrismaClient()

async function request(path, options = {}, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed: ${res.status} ${JSON.stringify(body)}`)
  }
  return body
}

function same(name, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${name} mismatch: api=${actual}, db=${expected}`)
  }
}

async function main() {
  const login = await request('/auth/admin-login', {
    method: 'POST',
    body: JSON.stringify({ phone: adminPhone, password: adminPassword }),
  })
  const token = login?.data?.accessToken
  if (!token) throw new Error('管理员登录成功但未返回 accessToken')

  const summary = (await request('/finance/total-summary', {}, token)).data

  const [
    recharge,
    directPay,
    cashRefund,
    customerRefund,
    balanceRefund,
    directRevenue,
    memberRevenue,
    users,
    points,
  ] = await Promise.all([
    prisma.rechargeRecord.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { status: 'SUCCESS', method: { in: ['WECHAT', 'ALIPAY'] } }, _sum: { amount: true } }),
    prisma.order.aggregate({ where: { status: { in: ['REFUNDED', 'CANCELLED'] }, payMethod: { in: ['WECHAT', 'ALIPAY'] } }, _sum: { refundAmount: true } }),
    prisma.order.aggregate({ where: { status: { in: ['REFUNDED', 'CANCELLED'] } }, _sum: { refundAmount: true } }),
    prisma.balanceTransaction.aggregate({ where: { type: 'REFUND' }, _sum: { totalAmount: true } }),
    prisma.order.aggregate({ where: { status: { in: ['PAID', 'COMPLETED'] }, payMethod: { in: ['WECHAT', 'ALIPAY'] } }, _sum: { amount: true } }),
    prisma.order.aggregate({ where: { status: { in: ['PAID', 'COMPLETED'] }, principalDeduction: { gt: 0 } }, _sum: { principalDeduction: true } }),
    prisma.user.aggregate({ _sum: { principalBalance: true, bonusBalance: true } }),
    prisma.user.aggregate({ _sum: { points: true } }),
  ])

  const expected = {
    totalRechargePrincipalIn: recharge._sum.amount || 0,
    totalDirectPayIn: directPay._sum.amount || 0,
    totalCashRefundOut: cashRefund._sum.refundAmount || 0,
    totalRefundOut: cashRefund._sum.refundAmount || 0,
    totalCustomerRefundOut: customerRefund._sum.refundAmount || 0,
    totalBalanceRefundOut: balanceRefund._sum.totalAmount || 0,
    totalNetCashFlow: (recharge._sum.amount || 0) + (directPay._sum.amount || 0) - (cashRefund._sum.refundAmount || 0),
    totalDirectRevenue: directRevenue._sum.amount || 0,
    totalMemberPrincipalRevenue: memberRevenue._sum.principalDeduction || 0,
    totalRecognizedRevenue: (directRevenue._sum.amount || 0) + (memberRevenue._sum.principalDeduction || 0),
    totalPrincipalLiability: users._sum.principalBalance || 0,
    totalBonusLiability: users._sum.bonusBalance || 0,
    totalPointsLiability: points._sum.points || 0,
  }

  for (const [key, value] of Object.entries(expected)) {
    same(key, summary[key], value)
  }

  console.log(JSON.stringify({ ok: true, baseUrl, checked: expected }, null, 2))
}

main()
  .catch((err) => {
    console.error('[finance-summary-check] failed')
    console.error(err.message || err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
