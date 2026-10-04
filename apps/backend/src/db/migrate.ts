import type { Db } from './index.js'

// Idempotent schema setup, run at every boot. Add new tables with
// CREATE TABLE IF NOT EXISTS and new columns with a guarded ALTER TABLE below,
// keeping schema.ts in step.
export function migrate(db: Db) {
  const sqlite = db.$client
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      token_version INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `)
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    )
  `)
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS family_members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_kid INTEGER NOT NULL DEFAULT 0,
      likes TEXT NOT NULL DEFAULT '',
      dislikes TEXT NOT NULL DEFAULT '',
      allergies TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      sort INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `)
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      servings INTEGER NOT NULL DEFAULT 4,
      prep_min INTEGER,
      cook_min INTEGER,
      instructions TEXT NOT NULL DEFAULT '',
      source_url TEXT,
      tags TEXT NOT NULL DEFAULT '',
      kid_friendly INTEGER NOT NULL DEFAULT 0,
      rating INTEGER,
      prep_ahead_notes TEXT NOT NULL DEFAULT '',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id TEXT PRIMARY KEY,
      recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      qty REAL,
      unit TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      sort INTEGER NOT NULL DEFAULT 0
    )
  `)
  sqlite.run(`CREATE INDEX IF NOT EXISTS recipe_ingredients_recipe_idx ON recipe_ingredients (recipe_id)`)
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS meal_plans (
      id TEXT PRIMARY KEY,
      week_start TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS plan_meals (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('cook', 'leftovers', 'flexible')),
      recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      leftover_of TEXT,
      side_note TEXT NOT NULL DEFAULT '',
      servings INTEGER,
      notes TEXT NOT NULL DEFAULT '',
      rating INTEGER
    )
  `)
  sqlite.run(`CREATE INDEX IF NOT EXISTS plan_meals_date_idx ON plan_meals (date)`)
  sqlite.run(`CREATE INDEX IF NOT EXISTS plan_meals_plan_idx ON plan_meals (plan_id)`)
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS prep_tasks (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      minutes INTEGER,
      recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      done INTEGER NOT NULL DEFAULT 0
    )
  `)
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS freezer_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      amount_text TEXT NOT NULL DEFAULT '',
      plan_meal_id TEXT REFERENCES plan_meals(id) ON DELETE SET NULL,
      is_backup INTEGER NOT NULL DEFAULT 0,
      added_at INTEGER NOT NULL,
      used_at INTEGER
    )
  `)
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS staples (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      in_every_order INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    )
  `)
  sqlite.run(`CREATE UNIQUE INDEX IF NOT EXISTS staples_name_idx ON staples (name COLLATE NOCASE)`)
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS shopping_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      quantity_text TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL CHECK (source IN ('manual', 'plan', 'staple')),
      plan_id TEXT REFERENCES meal_plans(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'have', 'removed', 'pushed')),
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      pushed_at INTEGER
    )
  `)
  sqlite.run(`CREATE INDEX IF NOT EXISTS shopping_items_status_idx ON shopping_items (status)`)
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS meal_feedback (
      id TEXT PRIMARY KEY,
      plan_meal_id TEXT NOT NULL REFERENCES plan_meals(id) ON DELETE CASCADE,
      family_member_id TEXT NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
      verdict TEXT NOT NULL CHECK (verdict IN ('up', 'meh', 'down')),
      comment TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    )
  `)
  sqlite.run(`CREATE UNIQUE INDEX IF NOT EXISTS meal_feedback_meal_member_idx ON meal_feedback (plan_meal_id, family_member_id)`)
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      draft_dow INTEGER NOT NULL DEFAULT 2,
      list_dow INTEGER NOT NULL DEFAULT 4,
      pickup_dow INTEGER NOT NULL DEFAULT 0,
      grocery_list_id INTEGER
    )
  `)
  sqlite.run(`INSERT OR IGNORE INTO settings (id) VALUES ('household')`)
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER
    )
  `)
}
