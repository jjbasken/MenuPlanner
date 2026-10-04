import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

// Column definitions here must stay in step with the CREATE TABLE statements in
// migrate.ts — that file, not drizzle-kit, is what actually builds the database.

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  tokenVersion: integer('token_version').notNull().default(0),
  createdAt: integer('created_at').notNull(),
})

export const revokedTokens = sqliteTable('revoked_tokens', {
  jti: text('jti').primaryKey(),
  expiresAt: integer('expires_at').notNull(),
})

/** Everyone the plan feeds — kids are profiles, not logins. */
export const familyMembers = sqliteTable('family_members', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  isKid: integer('is_kid', { mode: 'boolean' }).notNull().default(false),
  likes: text('likes').notNull().default(''),
  dislikes: text('dislikes').notNull().default(''),
  allergies: text('allergies').notNull().default(''),
  notes: text('notes').notNull().default(''),
  sort: integer('sort').notNull().default(0),
  createdAt: integer('created_at').notNull(),
})

export const recipes = sqliteTable('recipes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  servings: integer('servings').notNull().default(4),
  prepMin: integer('prep_min'),
  cookMin: integer('cook_min'),
  instructions: text('instructions').notNull().default(''),
  sourceUrl: text('source_url'),
  tags: text('tags').notNull().default(''),
  kidFriendly: integer('kid_friendly', { mode: 'boolean' }).notNull().default(false),
  rating: integer('rating'),
  prepAheadNotes: text('prep_ahead_notes').notNull().default(''),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const recipeIngredients = sqliteTable('recipe_ingredients', {
  id: text('id').primaryKey(),
  recipeId: text('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  qty: real('qty'),
  unit: text('unit').notNull().default(''),
  note: text('note').notNull().default(''),
  sort: integer('sort').notNull().default(0),
}, t => [index('recipe_ingredients_recipe_idx').on(t.recipeId)])

/** One plan per week; `weekStart` is the Monday, as YYYY-MM-DD. */
export const mealPlans = sqliteTable('meal_plans', {
  id: text('id').primaryKey(),
  weekStart: text('week_start').notNull().unique(),
  status: text('status', { enum: ['draft', 'final'] }).notNull().default('draft'),
  notes: text('notes').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/**
 * A meal on a specific date. Dates are stored directly (not as a day offset into
 * the plan) so "push back a day" can slide meals past the end of the plan's week.
 */
export const planMeals = sqliteTable('plan_meals', {
  id: text('id').primaryKey(),
  planId: text('plan_id').notNull().references(() => mealPlans.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  kind: text('kind', { enum: ['cook', 'leftovers', 'flexible'] }).notNull(),
  recipeId: text('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  leftoverOf: text('leftover_of'),
  sideNote: text('side_note').notNull().default(''),
  servings: integer('servings'),
  notes: text('notes').notNull().default(''),
  rating: integer('rating'),
}, t => [index('plan_meals_date_idx').on(t.date), index('plan_meals_plan_idx').on(t.planId)])

export const prepTasks = sqliteTable('prep_tasks', {
  id: text('id').primaryKey(),
  planId: text('plan_id').notNull().references(() => mealPlans.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  title: text('title').notNull(),
  minutes: integer('minutes'),
  recipeId: text('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
  sort: integer('sort').notNull().default(0),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
})

/** Freezer inventory. Linking an item to a meal produces a "thaw tonight" reminder the day before. */
export const freezerItems = sqliteTable('freezer_items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  amountText: text('amount_text').notNull().default(''),
  planMealId: text('plan_meal_id').references(() => planMeals.id, { onDelete: 'set null' }),
  isBackup: integer('is_backup', { mode: 'boolean' }).notNull().default(false),
  addedAt: integer('added_at').notNull(),
  usedAt: integer('used_at'),
})

export const staples = sqliteTable('staples', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  inEveryOrder: integer('in_every_order', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('staples_name_idx').on(t.name)])

/** The "next order": everything headed for the grocery list, until it is pushed. */
export const shoppingItems = sqliteTable('shopping_items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  quantityText: text('quantity_text').notNull().default(''),
  note: text('note').notNull().default(''),
  source: text('source', { enum: ['manual', 'plan', 'staple'] }).notNull(),
  planId: text('plan_id').references(() => mealPlans.id, { onDelete: 'set null' }),
  status: text('status', { enum: ['pending', 'have', 'removed', 'pushed'] }).notNull().default('pending'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull(),
  pushedAt: integer('pushed_at'),
}, t => [index('shopping_items_status_idx').on(t.status)])

export const mealFeedback = sqliteTable('meal_feedback', {
  id: text('id').primaryKey(),
  planMealId: text('plan_meal_id').notNull().references(() => planMeals.id, { onDelete: 'cascade' }),
  familyMemberId: text('family_member_id').notNull().references(() => familyMembers.id, { onDelete: 'cascade' }),
  verdict: text('verdict', { enum: ['up', 'meh', 'down'] }).notNull(),
  comment: text('comment').notNull().default(''),
  createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('meal_feedback_meal_member_idx').on(t.planMealId, t.familyMemberId)])

/** Single-row household settings (id is always 'household'). Days of week: 0 = Sunday. */
export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  draftDow: integer('draft_dow').notNull().default(2),
  listDow: integer('list_dow').notNull().default(4),
  pickupDow: integer('pickup_dow').notNull().default(0),
  groceryListId: integer('grocery_list_id'),
})

/** Bearer tokens for the /api/v1 REST API used by Claude Code and Codex. Only the SHA-256 is stored. */
export const apiTokens = sqliteTable('api_tokens', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull(),
  lastUsedAt: integer('last_used_at'),
})
