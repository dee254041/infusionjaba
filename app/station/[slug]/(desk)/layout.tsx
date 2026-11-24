import { StationShell } from '@/components/station/station-shell'

export default async function StationDeskLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <StationShell slug={slug}>{children}</StationShell>
}
