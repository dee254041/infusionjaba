import { describe, expect, it } from 'vitest'
import { resolvePublicSiteOnline } from '@/lib/public-site-online'

describe('public site switch', () => {
  it('stays on when the control read fails or has not been set', () => {
    expect(resolvePublicSiteOnline(undefined)).toEqual({ online: true, confirmed: false })
    expect(resolvePublicSiteOnline(true)).toEqual({ online: true, confirmed: true })
  })

  it('turns off only when the control document says off', () => {
    expect(resolvePublicSiteOnline(false)).toEqual({ online: false, confirmed: true })
  })
})
