import { describe, expect, test } from 'bun:test'
import { makeTestDb } from './helpers.js'
import { createApp } from '../src/app.js'
import { migrate } from '../src/db/migrate.js'

describe('http app', () => {
  test('health check', async () => {
    const res = await createApp(makeTestDb()).request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  test('tRPC is mounted under /api/trpc', async () => {
    const res = await createApp(makeTestDb()).request('/api/trpc/auth.status')
    expect(res.status).toBe(200)
    const body = await res.json() as { result: { data: { needsSetup: boolean } } }
    expect(body.result.data.needsSetup).toBe(true)
  })

  test('migrations are idempotent and seed the settings row', () => {
    const db = makeTestDb()
    migrate(db)
    const rows = db.$client.query('SELECT id FROM settings').all()
    expect(rows).toEqual([{ id: 'household' }])
  })
})
