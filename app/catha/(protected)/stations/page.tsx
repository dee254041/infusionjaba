import { requireSuperAdmin } from '@/lib/catha-auth'
import { StationsManager } from './stations-manager'

export default async function StationsPage() {
  await requireSuperAdmin()
  return <StationsManager />
}
