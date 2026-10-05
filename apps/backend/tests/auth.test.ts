import { describe, expect, test } from 'bun:test'
import { BOOTSTRAP_TOKEN, callerFor, makeTestDb, makeUser } from './helpers.js'
import { verifyToken } from '../src/lib/jwt.js'
import { createContext } from '../src/context.js'

function anon(db = makeTestDb(), clientIp: string | null = null) {
  return { db, caller: callerFor({ db, userId: null, clientIp }) }
}

describe('setup', () => {
  test('status reports first-run state', async () => {
    const { db, caller } = anon()
    expect(await caller.auth.status()).toEqual({ needsSetup: true, setupEnabled: true })
    await makeUser(db)
    expect((await caller.auth.status()).needsSetup).toBe(false)
  })

  test('creates the first user as admin with the bootstrap token', async () => {
    const { caller } = anon()
    const res = await caller.auth.setup({ bootstrapToken: BOOTSTRAP_TOKEN, username: 'jeremy', displayName: 'Jeremy', password: 'correct horse' })
    expect(res.user.isAdmin).toBe(true)
    expect((await verifyToken(res.token))?.userId).toBe(res.user.id)
  })

  test('rejects a wrong bootstrap token', async () => {
    const { caller } = anon()
    await expect(caller.auth.setup({ bootstrapToken: 'nope', username: 'x1', displayName: 'X', password: 'password1' }))
      .rejects.toThrow('Invalid setup token')
  })

  test('is closed once a user exists', async () => {
    const { db, caller } = anon()
    await makeUser(db)
    await expect(caller.auth.setup({ bootstrapToken: BOOTSTRAP_TOKEN, username: 'x1', displayName: 'X', password: 'password1' }))
      .rejects.toThrow('already complete')
  })

  test('only one concurrent setup request creates an admin', async () => {
    const { db, caller } = anon()
    const input = (username: string) => ({
      bootstrapToken: BOOTSTRAP_TOKEN, username, displayName: username, password: 'password1',
    })
    const results = await Promise.allSettled([
      caller.auth.setup(input('first')),
      caller.auth.setup(input('second')),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)
    expect(db.$client.query('SELECT id FROM users').all()).toHaveLength(1)
  })

  test('rate-limits failed attempts per IP', async () => {
    const { caller } = anon(makeTestDb(), '203.0.113.5')
    for (let i = 0; i < 10; i++) {
      await expect(caller.auth.setup({ bootstrapToken: 'bad', username: 'x1', displayName: 'X', password: 'password1' })).rejects.toThrow()
    }
    await expect(caller.auth.setup({ bootstrapToken: BOOTSTRAP_TOKEN, username: 'x1', displayName: 'X', password: 'password1' }))
      .rejects.toThrow('Too many')
  })
})

describe('login', () => {
  test('succeeds with the right password, case-insensitive username', async () => {
    const { db, caller } = anon()
    await makeUser(db, { username: 'Mom', password: 'pancakes!' })
    const res = await caller.auth.login({ username: 'mom', password: 'pancakes!' })
    expect(res.user.username).toBe('Mom')
    expect(res.token).toBeString()
  })

  test('fails with the wrong password or unknown user', async () => {
    const { db, caller } = anon()
    await makeUser(db, { username: 'mom', password: 'pancakes!' })
    await expect(caller.auth.login({ username: 'mom', password: 'waffles!' })).rejects.toThrow('Wrong username or password')
    await expect(caller.auth.login({ username: 'ghost', password: 'waffles!' })).rejects.toThrow('Wrong username or password')
  })

  test('locks an account after repeated failures', async () => {
    const { db, caller } = anon()
    await makeUser(db, { username: 'mom', password: 'pancakes!' })
    for (let i = 0; i < 10; i++) {
      await expect(caller.auth.login({ username: 'mom', password: 'nope' })).rejects.toThrow()
    }
    await expect(caller.auth.login({ username: 'mom', password: 'pancakes!' })).rejects.toThrow('Too many')
  })

  test('reserves attempts before concurrent password checks', async () => {
    const { db, caller } = anon()
    await makeUser(db, { username: 'mom', password: 'pancakes!' })
    const attempts = await Promise.allSettled(Array.from({ length: 20 }, () =>
      caller.auth.login({ username: 'mom', password: 'wrong-password' })
    ))
    expect(attempts.filter(r => r.status === 'rejected' && r.reason.message.includes('Too many'))).toHaveLength(10)
    expect(attempts.filter(r => r.status === 'rejected' && r.reason.message.includes('Wrong username'))).toHaveLength(10)
  })
})

describe('sessions', () => {
  async function loggedIn() {
    const db = makeTestDb()
    await makeUser(db, { username: 'dad', password: 'password1' })
    const { token } = await callerFor({ db, userId: null }).auth.login({ username: 'dad', password: 'password1' })
    const ctx = await createContext({ req: new Request('http://x', { headers: { authorization: `Bearer ${token}` } }) }, db)
    return { db, token, ctx }
  }

  test('a valid token resolves to the user', async () => {
    const { ctx } = await loggedIn()
    expect(ctx.userId).toBeString()
  })

  test('logout revokes just that token', async () => {
    const { db, token, ctx } = await loggedIn()
    await callerFor(ctx).auth.logout()
    const after = await createContext({ req: new Request('http://x', { headers: { authorization: `Bearer ${token}` } }) }, db)
    expect(after.userId).toBeNull()
  })

  test('changing password revokes old tokens and returns a working new one', async () => {
    const { db, token, ctx } = await loggedIn()
    const res = await callerFor(ctx).auth.changePassword({ currentPassword: 'password1', newPassword: 'password2' })
    const oldCtx = await createContext({ req: new Request('http://x', { headers: { authorization: `Bearer ${token}` } }) }, db)
    const newCtx = await createContext({ req: new Request('http://x', { headers: { authorization: `Bearer ${res.token}` } }) }, db)
    expect(oldCtx.userId).toBeNull()
    expect(newCtx.userId).toBe(ctx.userId)
  })

  test('changing password requires the current one', async () => {
    const { ctx } = await loggedIn()
    await expect(callerFor(ctx).auth.changePassword({ currentPassword: 'wrong', newPassword: 'password2' }))
      .rejects.toThrow('Current password is incorrect')
  })

  test('garbage tokens are anonymous', async () => {
    const ctx = await createContext({ req: new Request('http://x', { headers: { authorization: 'Bearer abc.def.ghi' } }) }, makeTestDb())
    expect(ctx.userId).toBeNull()
  })
})
