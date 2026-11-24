import { requireCathaNavAccessForRequestPath } from '@/lib/catha-auth'
import { ShopFrame } from '@/components/station/shop-frame'

export default async function CathaProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireCathaNavAccessForRequestPath()
  return <ShopFrame>{children}</ShopFrame>
}
