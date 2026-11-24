'use client'

import { useParams } from 'next/navigation'
import { RecordScreen } from '@/components/station/record-screen'

export function StationExpenses({ shopId }: { shopId: string }) {
  return <RecordScreen slug={shopId} kind="expenses" title="Expenses" amountLabel="Amount" />
}

export default function Page() {
  return <StationExpenses shopId={useParams<{ slug: string }>().slug} />
}
