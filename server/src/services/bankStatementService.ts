/**
 * 银行流水拉取服务（空壳预留）
 * Phase 3 接入银企直联时填充实现
 */

export interface BankStatementItem {
  bankSerialNo: string
  transactionDate: Date
  counterpartyName: string
  creditAmount: number // 分
  debitAmount: number  // 分
  balance: number      // 分
  abstract?: string
}

/**
 * 拉取银行对公账户流水
 * @param date YYYY-MM-DD
 * @returns 银行流水明细
 *
 * TODO: Phase 3 接入银企直联或银行 SFTP
 * 常见方案:
 *   1. 招商银行 CMB SDK
 *   2. 工商银行 ICBC 企业网银 API
 *   3. 银行提供的 SFTP 定时推送对账单
 */
export async function fetchBankStatement(date: string): Promise<BankStatementItem[]> {
  console.warn(`[BankStatement] 银行流水拉取未实现，日期: ${date}`)
  return []
}

/**
 * 将银行流水写入 ReconBankStatement 表
 * TODO: Phase 3 实现
 */
export async function saveBankStatements(
  _batchId: string,
  _items: BankStatementItem[]
): Promise<number> {
  console.warn(`[BankStatement] 流水写入未实现`)
  return 0
}
