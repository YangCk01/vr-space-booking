const baseUrl = process.env.RECON_BASE_URL || 'http://localhost:4001/api'
const reconDate = process.env.RECON_DATE || '2026-06-10'
const adminPhone = process.env.RECON_ADMIN_PHONE || '13800000000'
const adminPassword = process.env.RECON_ADMIN_PASSWORD || 'admin123'

const detailTypeMap = {
  '本金余额': 'BALANCE_PRINCIPAL',
  '赠送余额': 'BALANCE_BONUS',
  '积分余额': 'BALANCE_POINTS',
  '充值本金': 'RECHARGE_PRINCIPAL',
  '充值赠送': 'RECHARGE_BONUS',
  '在线支付金额': 'DIRECT_PAY',
  '消费本金': 'CONSUME_PRINCIPAL',
  '消费赠送': 'CONSUME_BONUS',
  '退款总额': 'REFUND',
  '积分兑换消耗': 'POINTS_EXCHANGE',
}

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
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed: ${res.status} ${JSON.stringify(body)}`)
  }
  return body
}

function unwrapArray(payload) {
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.data?.items)) return payload.data.items
  if (Array.isArray(payload?.data?.list)) return payload.data.list
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const login = await request('/auth/admin-login', {
    method: 'POST',
    body: JSON.stringify({ phone: adminPhone, password: adminPassword }),
  })
  const token = login?.data?.accessToken || login?.accessToken
  assert(token, '管理员登录成功但未返回 accessToken')

  const beforeBatches = unwrapArray(await request('/recon/batches?page=1&pageSize=5', {}, token))
  const run = await request('/recon/run', {
    method: 'POST',
    body: JSON.stringify({ date: reconDate, force: true }),
  }, token)
  assert(run?.success !== false, `手动对账返回失败: ${JSON.stringify(run)}`)
  assert(!String(run?.message || '').includes('跳过'), '强制手动对账不应被跳过')

  const [batchesPayload, exceptionsPayload, summaryPayload, configsPayload, financePayload] = await Promise.all([
    request('/recon/batches?page=1&pageSize=5', {}, token),
    request(`/recon/exceptions?dateFrom=${reconDate}&dateTo=${reconDate}`, {}, token),
    request('/recon/summary', {}, token),
    request('/recon/configs', {}, token),
    request(`/finance/reconcile?date=${reconDate}`, {}, token),
  ])

  const batches = unwrapArray(batchesPayload)
  const exceptions = unwrapArray(exceptionsPayload)
  const configs = unwrapArray(configsPayload)
  const financeData = financePayload?.data || financePayload
  const financeItems = financeData?.items || []
  const fundExceptions = exceptions.filter((e) =>
    e.exceptionType !== 'HARDWARE_MISMATCH' &&
    !(e.exceptionType === 'STATUS_MISMATCH' && e.bizType === 'USER')
  )
  const hardwareExceptions = exceptions.filter((e) => e.exceptionType === 'HARDWARE_MISMATCH')
  const pendingExceptions = exceptions.filter((e) => e.exceptionStatus === 'PENDING')
  const systemExceptions = exceptions.length - fundExceptions.length

  assert(Array.isArray(batches), '批次接口返回结构异常')
  assert(Array.isArray(exceptions), '异常接口返回结构异常')
  assert(summaryPayload?.success !== false, '对账汇总接口返回失败')
  assert(Array.isArray(configs), '对账配置接口返回结构异常')
  assert(Array.isArray(financeItems), '财务核对接口返回结构异常')

  const missingDetails = []
  for (const item of financeItems) {
    const diff = Number(item.diff || 0)
    const type = detailTypeMap[item.name]
    if (!type || diff === 0) continue
    const detailPayload = await request(`/finance/reconcile-details?type=${type}&date=${reconDate}`, {}, token)
    const detailItems = detailPayload?.data?.items || []
    if (detailItems.length === 0) {
      missingDetails.push(`${item.name}(${type}) 差异 ${diff} 但定位明细为空`)
    }
  }
  assert(missingDetails.length === 0, missingDetails.join('; '))
  if (financeData?.isBalanced === true) {
    assert(fundExceptions.length === 0, `财务核对已平，但处理台仍存在资金类异常 ${fundExceptions.length} 条`)
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    reconDate,
    runMessage: run?.message,
    batchCountBefore: beforeBatches.length,
    batchCountAfter: batches.length,
    exceptionCount: exceptions.length,
    pendingExceptionCount: pendingExceptions.length,
    fundExceptionCount: fundExceptions.length,
    hardwareExceptionCount: hardwareExceptions.length,
    systemExceptionCount: systemExceptions,
    financeBalanced: financeData?.isBalanced,
    abnormalCount: Array.isArray(financeData?.abnormal) ? financeData.abnormal.length : 0,
  }, null, 2))
}

main().catch((err) => {
  console.error('[recon-smoke-test] failed')
  console.error(err.message || err)
  process.exit(1)
})
