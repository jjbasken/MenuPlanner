#!/usr/bin/env bun
// mp — command-line access to MenuPlanner's agent API (/api/v1), used by the
// Claude Code and Codex workflows in agent-workflows/. Prints JSON on stdout,
// errors on stderr, and exits non-zero on failure.
//
// Configuration: MENUPLANNER_URL and MENUPLANNER_TOKEN, from the environment or
// a gitignored `.mp.env` file in the repo root.
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { planInputSchema, recipeInputSchema, todayISO, weekStart } from '@menu/shared'
import type { ZodError, ZodTypeAny } from 'zod'

export const COMMANDS = {
  whoami: 'Check the connection and token',
  context: 'Everything needed to plan a week: family, recipes, recent meals + feedback, freezer, staples  [--week YYYY-MM-DD] [--today YYYY-MM-DD]',
  recipes: 'List recipes  [search text]',
  recipe: 'Show one recipe with ingredients  <id>',
  'add-recipe': 'Create a recipe from a JSON file (or - for stdin)  <file> [--allow-duplicate]',
  'update-recipe': 'Replace a recipe from a JSON file  <id> <file>',
  plan: 'Show a week\'s plan  <week-monday>',
  'put-plan': 'Write a week\'s plan from a JSON file (replaces it)  <week-monday> <file> [--force]',
  validate: 'Check a JSON file against the schema without sending it  <recipe|plan> <file>',
} as const

type Command = keyof typeof COMMANDS

function loadConfig() {
  const envFile = join(import.meta.dir, '..', '.mp.env')
  const fromFile: Record<string, string> = {}
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
      if (m) fromFile[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  }
  const url = process.env.MENUPLANNER_URL ?? fromFile.MENUPLANNER_URL
  const token = process.env.MENUPLANNER_TOKEN ?? fromFile.MENUPLANNER_TOKEN
  if (!url || !token) {
    fail('Set MENUPLANNER_URL and MENUPLANNER_TOKEN (environment or .mp.env in the repo root). Create a token in MenuPlanner → Settings → API tokens.')
  }
  return { url: url.replace(/\/+$/, ''), token }
}

class CliError extends Error {}
function fail(msg: string): never {
  throw new CliError(msg)
}

function readJson(file: string | undefined): unknown {
  if (!file) fail('Missing JSON file argument (use - for stdin)')
  const text = file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8')
  try {
    return JSON.parse(text)
  } catch (e) {
    fail(`${file} is not valid JSON: ${(e as Error).message}`)
  }
}

function check<T extends ZodTypeAny>(schema: T, data: unknown, what: string) {
  const res = schema.safeParse(data)
  if (!res.success) {
    const issues = (res.error as ZodError).issues.map(i => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')
    fail(`Invalid ${what}:\n${issues}`)
  }
  return res.data
}

function monday(s: string | undefined): string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) fail('Expected a week as YYYY-MM-DD (the Monday)')
  if (weekStart(s) !== s) fail(`${s} is not a Monday — use ${weekStart(s)}`)
  return s
}

async function api(method: string, path: string, body?: unknown) {
  const { url, token } = loadConfig()
  let res: Response
  try {
    res = await fetch(`${url}/api/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    })
  } catch (e) {
    fail(`Cannot reach ${url}: ${(e as Error).message}`)
  }
  if (res.status >= 300 && res.status < 400) fail(`${url} redirected (${res.status}) — use the exact https:// address`)
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status} with a non-JSON body — is MENUPLANNER_URL right?` }))
  if (!res.ok) {
    const issues = Array.isArray(data.issues) ? '\n' + data.issues.map((i: { path: string; message: string }) => `  ${i.path}: ${i.message}`).join('\n') : ''
    fail(`${data.error ?? `HTTP ${res.status}`}${data.id ? ` (id ${data.id})` : ''}${issues}`)
  }
  return data
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  const v = args[i + 1]
  args.splice(i, 2)
  return v
}

function bool(args: string[], name: string): boolean {
  const i = args.indexOf(name)
  if (i === -1) return false
  args.splice(i, 1)
  return true
}

export async function run(argv: string[]): Promise<unknown> {
  const [cmd, ...args] = argv
  switch (cmd as Command) {
    case 'whoami':
      return api('GET', '/whoami')
    case 'context': {
      const week = flag(args, '--week')
      const today = flag(args, '--today') ?? todayISO()
      const q = new URLSearchParams({ today, ...(week ? { week: monday(week) } : {}) })
      return api('GET', `/context?${q}`)
    }
    case 'recipes':
      return api('GET', `/recipes${args[0] ? `?q=${encodeURIComponent(args.join(' '))}` : ''}`)
    case 'recipe':
      if (!args[0]) fail('Usage: mp recipe <id>')
      return api('GET', `/recipes/${encodeURIComponent(args[0])}`)
    case 'add-recipe': {
      const dup = bool(args, '--allow-duplicate')
      const recipe = check(recipeInputSchema, readJson(args[0]), 'recipe')
      return api('POST', `/recipes${dup ? '?allowDuplicate=true' : ''}`, recipe)
    }
    case 'update-recipe': {
      if (!args[0]) fail('Usage: mp update-recipe <id> <file>')
      const recipe = check(recipeInputSchema, readJson(args[1]), 'recipe')
      return api('PUT', `/recipes/${encodeURIComponent(args[0])}`, recipe)
    }
    case 'plan':
      return api('GET', `/plans/${monday(args[0])}`)
    case 'put-plan': {
      const force = bool(args, '--force')
      const week = monday(args[0])
      const plan = check(planInputSchema, readJson(args[1]), 'plan')
      return api('PUT', `/plans/${week}${force ? '?force=true' : ''}`, plan)
    }
    case 'validate': {
      const [kind, file] = args
      if (kind === 'recipe') check(recipeInputSchema, readJson(file), 'recipe')
      else if (kind === 'plan') check(planInputSchema, readJson(file), 'plan')
      else fail('Usage: mp validate <recipe|plan> <file>')
      return { ok: true }
    }
    default:
      fail(`Usage: bun run mp <command>\n\n${Object.entries(COMMANDS).map(([c, d]) => `  ${c.padEnd(14)} ${d}`).join('\n')}`)
  }
}

if (import.meta.main) {
  try {
    const out = await run(process.argv.slice(2))
    console.log(JSON.stringify(out, null, 2))
  } catch (e) {
    console.error(e instanceof CliError ? e.message : e)
    process.exit(1)
  }
}
