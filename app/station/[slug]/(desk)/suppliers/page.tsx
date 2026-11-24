'use client'

import { useParams } from 'next/navigation'
import { RecordScreen } from '@/components/station/record-screen'

export function StationSuppliers({ shopId }: { shopId: string }) {
  return <RecordScreen slug={shopId} kind="suppliers" title="Suppliers" />
}

export default function Page() {
  return <StationSuppliers shopId={useParams<{ slug: string }>().slug} />
}
