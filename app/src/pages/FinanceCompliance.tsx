import Layout from '@/components/Layout'
import FinanceComplianceConsole from '@/components/finance/FinanceComplianceConsole'

export default function FinanceCompliance() {
  return (
    <Layout breadcrumb={['财务与数据', '业财合规控制台']}>
      <FinanceComplianceConsole />
    </Layout>
  )
}
