// Keeps the agent workflows honest: both agents get a wrapper for every
// workflow, every `mp` command the docs mention exists, and the JSON examples
// the docs show actually pass validation.
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { planInputSchema, recipeInputSchema } from '@menu/shared'
import { COMMANDS } from './mp.js'

const root = join(import.meta.dir, '..')
const workflows = readdirSync(join(root, 'agent-workflows')).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))

function frontmatter(md: string): Record<string, string> {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/)
  if (!m) return {}
  return Object.fromEntries(m[1].split('\n').map(l => l.split(/:\s(.*)/s)).map(([k, v]) => [k.trim(), (v ?? '').trim()]))
}

describe('agent workflows', () => {
  test('there are workflows', () => {
    expect(workflows.sort()).toEqual(['add-recipe', 'plan-week'])
  })

  for (const name of workflows) {
    for (const dir of ['.claude/skills', '.agents/skills']) {
      test(`${dir}/${name} wraps agent-workflows/${name}.md`, () => {
        const path = join(root, dir, name, 'SKILL.md')
        expect(existsSync(path)).toBe(true)
        const md = readFileSync(path, 'utf8')
        const fm = frontmatter(md)
        expect(fm.name).toBe(name)
        expect(fm.description?.length).toBeGreaterThan(40)
        expect(md).toContain(`agent-workflows/${name}.md`)
      })
    }

    test(`${name}: Claude Code and Codex wrappers are identical`, () => {
      const a = readFileSync(join(root, '.claude/skills', name, 'SKILL.md'), 'utf8')
      const b = readFileSync(join(root, '.agents/skills', name, 'SKILL.md'), 'utf8')
      expect(a).toBe(b)
    })

    const doc = readFileSync(join(root, 'agent-workflows', `${name}.md`), 'utf8')

    test(`${name}: every mp command it uses exists`, () => {
      const used = [...doc.matchAll(/bun run mp ([a-z-]+)/g)].map(m => m[1])
      expect(used.length).toBeGreaterThan(0)
      for (const cmd of used) expect(Object.keys(COMMANDS)).toContain(cmd)
    })

    test(`${name}: JSON examples are valid`, () => {
      const blocks = [...doc.matchAll(/```json (plan|recipe)\n([\s\S]*?)```/g)]
      for (const [, kind, body] of blocks) {
        const schema = kind === 'plan' ? planInputSchema : recipeInputSchema
        const res = schema.safeParse(JSON.parse(body))
        if (!res.success) throw new Error(`${name} ${kind} example: ${JSON.stringify(res.error.issues)}`)
      }
    })
  }

  test('AGENTS.md lists every workflow and CLAUDE.md imports it', () => {
    const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8')
    for (const name of workflows) expect(agents).toContain(`agent-workflows/${name}.md`)
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toContain('@AGENTS.md')
  })
})
