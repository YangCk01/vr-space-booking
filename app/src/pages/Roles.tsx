import Layout from '@/components/Layout'
import { RolePermissionPanel } from '@/components/RolePermissionPanel'

export default function Roles() {
  return (
    <Layout breadcrumb={['角色权限']}>
      <RolePermissionPanel />
    </Layout>
  )
}
