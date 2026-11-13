import { describe, expect, it } from 'vitest'
import { findDistributorsWithoutRecentStock } from '@/lib/jaba-distributor-restock-alerts'

const now = new Date('2026-11-13T12:00:00.000Z')

describe('findDistributorsWithoutRecentStock', () => {
  it('flags a distributor whose last delivery is older than a month', () => {
    const alerts = findDistributorsWithoutRecentStock(
      [{ id: 'd1', name: 'Westlands Wines', region: 'Nairobi', phone: '0712345678', createdAt: '2024-01-01' }],
      [{ distributorId: 'd1', distributorName: 'Westlands Wines', date: '2026-09-01' }],
      now
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0].label).toMatch(/days ago/)
    expect(alerts[0].daysSinceStock).toBeGreaterThanOrEqual(30)
  })

  it('leaves out a distributor stocked within the month', () => {
    const alerts = findDistributorsWithoutRecentStock(
      [{ id: 'd1', name: 'Kilimani Cellar', createdAt: '2024-01-01' }],
      [{ distributorId: 'd1', date: '2026-11-01' }],
      now
    )
    expect(alerts).toHaveLength(0)
  })

  it('flags an older account with no deliveries and skips a brand-new one', () => {
    const alerts = findDistributorsWithoutRecentStock(
      [
        { id: 'old', name: 'Old Route', createdAt: '2025-01-01' },
        { id: 'new', name: 'Just Added', createdAt: '2026-11-10' },
      ],
      [],
      now
    )
    expect(alerts.map((a) => a.name)).toEqual(['Old Route'])
    expect(alerts[0].label).toBe('No delivery on record')
  })
})
