'use client'

export type ShopChoice = { id: string; name: string }
export type ShopRole = '' | 'ADMIN' | 'STAFF'

export function ShopAssignmentPicker({
  shops,
  value,
  onChange,
}: {
  shops: ShopChoice[]
  value: Record<string, ShopRole>
  onChange: (value: Record<string, ShopRole>) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Shops</p>
      <p className="text-xs text-muted-foreground">
        This person only sees the shops you choose. Admin can run that shop. Staff can sell and view orders. Leave a shop blank to keep them out.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {shops.map((shop) => (
          <label key={shop.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
            <span>{shop.name}</span>
            <select
              className="rounded-md border bg-background px-2 py-1"
              value={value[shop.id] || ''}
              onChange={(event) => onChange({ ...value, [shop.id]: event.target.value as ShopRole })}
            >
              <option value="">Not on this shop</option>
              <option value="ADMIN">Admin</option>
              <option value="STAFF">Staff</option>
            </select>
          </label>
        ))}
      </div>
    </div>
  )
}

export function assignmentsFromRoles(value: Record<string, ShopRole>) {
  return Object.entries(value)
    .filter((entry): entry is [string, 'ADMIN' | 'STAFF'] => entry[1] === 'ADMIN' || entry[1] === 'STAFF')
    .map(([shopId, role]) => ({ shopId, role }))
}
