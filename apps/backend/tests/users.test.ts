import { describe, expect, test } from 'bun:test'
import { adminSetup, callerFor, makeUser } from './helpers.js'

describe('users', () => {
  test('admin can create and list users', async () => {
    const { caller } = await adminSetup()
    await caller.users.create({ username: 'mom', displayName: 'Mom', password: 'password1' })
    const list = await caller.users.list()
    expect(list.map(u => u.username)).toEqual(['admin', 'mom'])
  })

  test('usernames are unique case-insensitively', async () => {
    const { caller } = await adminSetup()
    await caller.users.create({ username: 'mom', displayName: 'Mom', password: 'password1' })
    await expect(caller.users.create({ username: 'MOM', displayName: 'Mom', password: 'password1' })).rejects.toThrow('Username taken')
  })

  test('non-admins cannot manage users', async () => {
    const { db } = await adminSetup()
    const userId = await makeUser(db)
    const caller = callerFor({ db, userId })
    await expect(caller.users.list()).rejects.toThrow('Admin access required')
    await expect(caller.users.create({ username: 'kid', displayName: 'Kid', password: 'password1' })).rejects.toThrow('Admin access required')
  })

  test('anonymous callers are rejected', async () => {
    const { db } = await adminSetup()
    await expect(callerFor({ db, userId: null }).users.me()).rejects.toThrow('UNAUTHORIZED')
  })

  test('me and updateMe', async () => {
    const { caller } = await adminSetup()
    await caller.users.updateMe({ displayName: 'Jeremy' })
    expect((await caller.users.me()).displayName).toBe('Jeremy')
  })

  test('admin cannot demote or delete themselves', async () => {
    const { caller, userId } = await adminSetup()
    await expect(caller.users.setAdmin({ userId, isAdmin: false })).rejects.toThrow()
    await expect(caller.users.delete({ userId })).rejects.toThrow()
  })

  test('cannot delete the last admin', async () => {
    const { db, userId } = await adminSetup()
    const other = await makeUser(db, { isAdmin: true })
    const otherCaller = callerFor({ db, userId: other })
    await callerFor({ db, userId }).users.delete({ userId: other })
    await expect(otherCaller.users.list()).rejects.toThrow()
  })

  test('revokeSessions and resetPassword bump the token version', async () => {
    const { db, caller } = await adminSetup()
    const id = await makeUser(db)
    await caller.users.revokeSessions({ userId: id })
    await caller.users.resetPassword({ userId: id, password: 'newpassword' })
    const row = db.$client.query('SELECT token_version FROM users WHERE id = ?').get(id) as { token_version: number }
    expect(row.token_version).toBe(2)
  })
})
