import { getCathaSession } from '@/lib/catha-auth'
import { NetworkOverview } from '@/components/station/network-overview'
import BarDashboardContent from './dashboard-content'

export default async function CathaDashboardPage() {
  const session = await getCathaSession()
  const userName = session?.user?.name ?? session?.user?.email ?? 'User'
  const role = String((session?.user as { role?: string } | undefined)?.role || '').toUpperCase()
  const canSeeStores = role === 'SUPER_ADMIN'
  return (
    <>
      {canSeeStores ? (
        <div className="px-4 pt-4 sm:px-6">
          <NetworkOverview title="All stores" />
        </div>
      ) : null}
      <BarDashboardContent userName={userName} />
    </>
  )
}
