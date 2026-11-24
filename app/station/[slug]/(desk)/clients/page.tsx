'use client'

import { useParams } from 'next/navigation'
import { RecordScreen } from '@/components/station/record-screen'

export function StationClients({ shopId }: { shopId: string }) {
  return <RecordScreen slug={shopId} kind="clients" title="Clients" />
}

export default function Page() {
  return <StationClients shopId={useParams<{ slug: string }>().slug} />
}
