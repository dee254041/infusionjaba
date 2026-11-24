'use client'

import { useParams } from 'next/navigation'
import { RecordScreen } from '@/components/station/record-screen'

export default function StationClientsPage() {
  const slug = useParams<{ slug: string }>().slug
  return <RecordScreen slug={slug} kind="clients" title="Clients" />
}
