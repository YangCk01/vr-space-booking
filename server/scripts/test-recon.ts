import { executeReconciliation } from '../src/jobs/reconciliationJob'

async function main() {
  const dateStr = process.argv[2] || new Date().toISOString().slice(0, 10)
  console.log(`[Test] 执行对账: ${dateStr}`)
  try {
    const result = await executeReconciliation(dateStr)
    console.log('[Test] 对账成功:', result)
    process.exit(0)
  } catch (err) {
    console.error('[Test] 对账失败:', err)
    process.exit(1)
  }
}

main()
