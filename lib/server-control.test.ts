import { describe, expect, it } from 'vitest'
import { isServerControlEmail, signServerControlSession, readServerControlSession } from '@/lib/server-control'
import { RESTORE_PHRASE, hashControlPassword, passwordChangeError, verifyControlPassword } from '@/lib/server-control-password'

describe('server control access', () => {
  it('allows only the control email', () => {
    expect(isServerControlEmail('dee254041@gmail.com')).toBe(true)
    expect(isServerControlEmail('  Dee254041@gmail.com ')).toBe(true)
    expect(isServerControlEmail('someone@gmail.com')).toBe(false)
    expect(isServerControlEmail('dee254041@gmail.com.attacker.com')).toBe(false)
  })

  it('rejects a session that was not signed for that email', async () => {
    process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'test-secret-at-least-16'
    const token = await signServerControlSession('other@gmail.com')
    expect(token).toBeNull()
    const good = await signServerControlSession('dee254041@gmail.com')
    expect(good).toBeTruthy()
    const session = await readServerControlSession(good)
    expect(session?.email).toBe('dee254041@gmail.com')
    expect(session?.version).toBe(0)
    expect(await readServerControlSession(`${good}x`)).toBeNull()
  })

  it('keeps a changed password as a hash and rejects the email as the new password', async () => {
    expect(passwordChangeError('dee254041@gmail.com')).toMatch(/not the email/)
    expect(passwordChangeError('short')).toMatch(/12/)
    expect(passwordChangeError('a-long-unique-passphrase')).toBeNull()
    expect(RESTORE_PHRASE).toBe('RESET-TO-EMAIL')
    const hash = await hashControlPassword('a-long-unique-passphrase')
    expect(hash.startsWith('scrypt$')).toBe(true)
    expect(hash.includes('a-long-unique-passphrase')).toBe(false)
    expect(await verifyControlPassword('a-long-unique-passphrase', hash)).toBe(true)
    expect(await verifyControlPassword('dee254041@gmail.com', hash)).toBe(false)
    const next = await signServerControlSession('dee254041@gmail.com', 2)
    expect((await readServerControlSession(next))?.version).toBe(2)
  })
})
