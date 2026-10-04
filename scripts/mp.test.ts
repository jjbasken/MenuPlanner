// Runs the real `mp` CLI as a subprocess against the real HTTP app (in-memory DB).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { adminSetup } from '../apps/backend/tests/helpers.js'
import { createApp } from '../apps/backend/src/app.js'

let server: ReturnType<typeof Bun.serve>
let token = ''
const dir = mkdtempSync(join(tmpdir(), 'mp-test-'))

beforeAll(async () => {
  const { db, caller } = await adminSetup()
  token = (await caller.apiTokens.create({ name: 'test' })).token
  server = Bun.serve({ port: 0, fetch: createApp(db).fetch })
})
afterAll(() => server.stop(true))

async function mp(...args: string[]) {
  const proc = Bun.spawn(['bun', join(import.meta.dir, 'mp.ts'), ...args], {
    env: { ...process.env, MENUPLANNER_URL: `http://localhost:${server.port}`, MENUPLANNER_TOKEN: token },
    stdout: 'pipe', stderr: 'pipe',
  })
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  return { code, out: out ? JSON.parse(out) : null, err }
}

function file(name: string, data: unknown) {
  const p = join(dir, name)
  writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data))
  return p
}

describe('mp CLI', () => {
  test('whoami', async () => {
    expect(await mp('whoami')).toMatchObject({ code: 0, out: { token: 'test', recipes: 0 } })
  })

  test('add a recipe, plan a week, read it back', async () => {
    const r = await mp('add-recipe', file('r.json', { title: 'Tacos', ingredients: [{ name: 'Ground beef', qty: 1, unit: 'lb' }] }))
    expect(r.code).toBe(0)
    const dup = await mp('add-recipe', file('r2.json', { title: 'tacos' }))
    expect(dup.code).toBe(1)
    expect(dup.err).toContain(`already exists (id ${r.out.id})`)

    const plan = file('p.json', { meals: [{ date: '2026-10-06', kind: 'cook', recipeId: r.out.id }], prepTasks: [{ date: '2026-10-04', title: 'Brown the beef', minutes: 15 }] })
    expect((await mp('validate', 'plan', plan)).out).toEqual({ ok: true })
    expect((await mp('put-plan', '2026-10-05', plan)).code).toBe(0)
    const week = await mp('plan', '2026-10-05')
    expect(week.out.meals[0].title).toBe('Tacos')

    const ctx = await mp('context', '--today', '2026-10-04')
    expect(ctx.out.week.start).toBe('2026-10-05')
    expect(ctx.out.existingPlan.meals[0].title).toBe('Tacos')
    expect((await mp('recipes', 'taco')).out.map((x: { title: string }) => x.title)).toEqual(['Tacos'])
  })

  test('validates locally before sending, with readable errors', async () => {
    const bad = await mp('put-plan', '2026-10-05', file('bad.json', { meals: [{ date: '2026-10-06', kind: 'brunch', title: 'x' }] }))
    expect(bad.code).toBe(1)
    expect(bad.err).toContain('meals.0.kind')
    expect((await mp('put-plan', '2026-10-06', file('ok.json', { meals: [] }))).err).toContain('not a Monday — use 2026-10-05')
    expect((await mp('add-recipe', file('nj.json', '{oops'))).err).toContain('not valid JSON')
  })

  test('reports a bad token and unknown commands', async () => {
    const proc = Bun.spawn(['bun', join(import.meta.dir, 'mp.ts'), 'whoami'], {
      env: { ...process.env, MENUPLANNER_URL: `http://localhost:${server.port}`, MENUPLANNER_TOKEN: 'mp_nope' }, stderr: 'pipe', stdout: 'pipe',
    })
    expect(await proc.exited).toBe(1)
    expect(await new Response(proc.stderr).text()).toContain('Settings → API tokens')
    expect((await mp('frobnicate')).err).toContain('Usage: bun run mp')
  })
})
