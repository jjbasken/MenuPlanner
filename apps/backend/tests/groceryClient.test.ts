import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createGroceryClient, GroceryListError, groceryClientFromEnv } from '../src/lib/groceryClient.js'

// A stand-in for GroceryList's external API, speaking real HTTP.
let server: ReturnType<typeof Bun.serve>
let lastBody: any = null
let lastAuth: string | null = null

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      lastAuth = req.headers.get('authorization')
      if (lastAuth !== 'Bearer good') return Response.json({ error: 'unauthorized' }, { status: 401 })
      if (url.pathname === '/redirect/api/external/lists') return new Response(null, { status: 308, headers: { location: 'https://x/' } })
      if (url.pathname === '/api/external/lists') return Response.json([{ id: 1, name: 'Groceries' }, { id: 2, name: 'Costco' }])
      if (url.pathname === '/api/external/items' && req.method === 'POST') {
        lastBody = await req.json()
        if (lastBody.list_id === 999) return Response.json({ error: 'List not found' }, { status: 400 })
        return Response.json({ added: lastBody.items.slice(1), merged: lastBody.items.slice(0, 1) }, { status: 201 })
      }
      return Response.json({ error: 'not found' }, { status: 404 })
    },
  })
})
afterAll(() => server.stop(true))

const url = () => `http://localhost:${server.port}`

describe('groceryClient', () => {
  test('lists lists with the bearer token', async () => {
    const c = createGroceryClient({ url: url() + '/', token: 'good' })
    expect(await c.listLists()).toEqual([{ id: 1, name: 'Groceries' }, { id: 2, name: 'Costco' }])
    expect(lastAuth).toBe('Bearer good')
  })

  test('pushes items and counts added vs merged', async () => {
    const c = createGroceryClient({ url: url(), token: 'good' })
    const res = await c.pushItems(2, [{ name: 'Milk' }, { name: 'Eggs', quantity: '12' }], true)
    expect(res).toEqual({ added: 1, merged: 1 })
    expect(lastBody).toEqual({ list_id: 2, merge: true, items: [{ name: 'Milk' }, { name: 'Eggs', quantity: '12' }] })
  })

  test('omits list_id to use the default list', async () => {
    await createGroceryClient({ url: url(), token: 'good' }).pushItems(null, [{ name: 'Milk' }])
    expect('list_id' in lastBody).toBe(false)
  })

  test('explains common failures', async () => {
    await expect(createGroceryClient({ url: url(), token: 'bad' }).listLists()).rejects.toThrow('rejected the token')
    await expect(createGroceryClient({ url: url() + '/nope', token: 'good' }).listLists()).rejects.toThrow('no external API enabled')
    await expect(createGroceryClient({ url: url() + '/redirect', token: 'good' }).listLists()).rejects.toThrow('redirected')
    await expect(createGroceryClient({ url: url(), token: 'good' }).pushItems(999, [{ name: 'x' }])).rejects.toThrow('List not found')
    await expect(createGroceryClient({ url: 'http://127.0.0.1:9', token: 'good' }).listLists()).rejects.toBeInstanceOf(GroceryListError)
  })

  test('is only configured when both env vars are set', () => {
    expect(groceryClientFromEnv({})).toBeNull()
    expect(groceryClientFromEnv({ GROCERYLIST_URL: 'http://web:5000' })).toBeNull()
    expect(groceryClientFromEnv({ GROCERYLIST_URL: 'http://web:5000', GROCERYLIST_TOKEN: 't' })).not.toBeNull()
  })
})
