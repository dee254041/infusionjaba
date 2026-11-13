import { describe, expect, it } from 'vitest'
import { resolveKenyaCounty } from '@/lib/kenya-counties'
import {
  COUNTY_NOT_SET,
  buildDistributorOrderDirectory,
  formatDistributorOrderWhen,
  groupDistributorsByCounty,
} from '@/lib/jaba-distributor-directory'

describe('resolveKenyaCounty', () => {
  it('maps county names and common Nairobi or Kiambu places', () => {
    expect(resolveKenyaCounty('Nairobi')).toBe('Nairobi')
    expect(resolveKenyaCounty('NRB')).toBe('Nairobi')
    expect(resolveKenyaCounty('Village Market')).toBe('Nairobi')
    expect(resolveKenyaCounty('Kingara Road')).toBe('Nairobi')
    expect(resolveKenyaCounty('Mirema')).toBe('Nairobi')
    expect(resolveKenyaCounty('Ruiru')).toBe('Kiambu')
  })

  it('leaves a blank or unknown place without a county', () => {
    expect(resolveKenyaCounty('')).toBeNull()
    expect(resolveKenyaCounty('No region')).toBeNull()
    expect(resolveKenyaCounty('test street')).toBeNull()
  })
})

describe('buildDistributorOrderDirectory', () => {
  it('keeps every distributor and records the full order history', () => {
    const directory = buildDistributorOrderDirectory(
      [
        { id: 'a', name: 'Chupa Chap', region: 'Nairobi', phone: '+254726507416' },
        { id: 'b', name: 'Quiet Shop', region: 'No region', phone: '0700' },
      ],
      [
        {
          noteId: 'DN-1',
          distributorId: 'a',
          date: '2026-10-21T13:10:00.000Z',
          items: [{ productName: 'Jaba', flavor: 'Mint', size: '500ml', quantity: 12 }],
        },
        {
          noteId: 'DN-2',
          distributorId: 'a',
          date: '2026-06-01T08:00:00.000Z',
          items: [{ productName: 'Jaba', size: '1L', quantity: 4 }],
        },
      ]
    )

    expect(directory.map((row) => row.name)).toEqual(['Chupa Chap', 'Quiet Shop'])
    const chupa = directory[0]
    expect(chupa.county).toBe('Nairobi')
    expect(chupa.history).toHaveLength(2)
    expect(chupa.history[0].noteId).toBe('DN-1')
    expect(chupa.history[0].items[0]).toMatchObject({ name: 'Jaba', size: '500ml', quantity: 12 })
    expect(formatDistributorOrderWhen(chupa.lastOrderedAt)).toMatch(/2026/)
    expect(formatDistributorOrderWhen(directory[1].lastOrderedAt)).toBe('Never ordered')
  })

  it('groups only counties that have a distributor', () => {
    const groups = groupDistributorsByCounty(
      buildDistributorOrderDirectory(
        [
          { id: 'a', name: 'A', region: 'Ruiru' },
          { id: 'b', name: 'B', region: 'Nairobi' },
          { id: 'c', name: 'C', region: '' },
        ],
        []
      )
    )
    expect(groups.map((group) => group.county)).toEqual(['Kiambu', 'Nairobi', COUNTY_NOT_SET])
    expect(groups.find((group) => group.county === 'Mombasa')).toBeUndefined()
  })
})
