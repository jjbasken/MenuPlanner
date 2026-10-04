# Plan a week

Draft a week of family dinners in MenuPlanner, with a prep schedule, and save
it as a **draft** for the family to review in the app. This doc is shared by
the Claude Code and Codex skills. Run every `mp` command from the repo root.

## 1. Connect

```bash
bun run mp whoami
```

If that fails, tell the user how to configure the connection and stop. Put
`MENUPLANNER_URL` (e.g. `https://menu.example.com`, or `http://localhost:5173`
in development) and `MENUPLANNER_TOKEN` (from **Settings → API tokens** in the
app) in `.mp.env` at the repo root, or export them.

## 2. Read the household

```bash
bun run mp context                      # plans next week (Monday after today)
bun run mp context --week 2026-10-12    # or a specific week (must be a Monday)
```

The JSON contains:
- `week`: the target week.
- `existingPlan`: the plan already there, if any.
- `family`: everyone, with likes, dislikes and allergies.
- `recipes`: the library, with times, tags, kid-friendly, rating and ingredient names.
- `recentMeals`: about four weeks of meals, with each person's 👍/😐/👎 feedback and comments.
- `freezer`: unused items, with what they're already planned for.
- `staples`.
- `cadence`.

If `existingPlan` is present:
- Its `status` is `final` → stop and ask the user before replacing it. Replacing it also discards that week's feedback.
- Its `status` is `draft` → confirm the user wants it replaced, unless they already said so.

If the user hasn't mentioned constraints for the week, ask once, briefly. For example: busy nights, guests, something they're craving, or a night out. Then go ahead.

## 3. Design the week

House rules. The family's own pattern in `recentMeals` overrides these defaults.

- **Rhythm:** about **3 cook nights**, each usually followed by a **leftovers** night (`leftoverOfDate` = the cook night). The rest are **flexible** nights: easy, no-shopping fallbacks such as "Frittata, omelets, tuna salad, or leftovers".
- **Allergies are absolute.** Never include an allergen, even as an optional garnish.
- **Dislikes:**
  - Don't make a disliked ingredient the main component of a meal.
  - If it's a minor part, keep it easy to leave out, and say so in `sideNote` ("Leave mushrooms off Ava's").
- **Kids:**
  - Prefer `kidFriendly` recipes and meals they rated 👍.
  - Allow at most one adventurous meal a week.
  - Avoid recipes the kids mostly rated 👎.
- **Variety:** don't repeat a recipe cooked in the last two weeks, and vary the proteins across the week.
- **Freezer first:**
  - Use unplanned freezer items. Link them with `freezerItemIds`, which makes the app show "Thaw tonight" the evening before.
  - Leave `isBackup` items alone unless a backup is actually needed.
- **Less waste:** reuse perishable ingredients across meals, e.g. one bunch of cilantro for two meals.
- **Time:** weeknight cook nights should take about 45 minutes or less in total, unless the user says otherwise. Long cooks go on the weekend.
- **Side notes:** use `sideNote` for small, useful reminders ("Eggs for breakfast.", "Double the rice for Thursday").

## 4. Add recipes that don't exist yet

Use library recipes by `id` whenever one fits. For a new dish, follow
[add-recipe.md](add-recipe.md) to create it first, then use the returned `id`.
Write quantities as numbers plus units, so the shopping list can combine them.

## 5. Prep schedule

Add `prepTasks` that make cook nights fast. Typical tasks: marinate, chop vegetables, cook grains, make sauces.
- Put batch prep on the **Sunday before** the week (week start − 1 day). Short midweek tasks can go on the day they're needed.
- Give each task an honest `minutes` estimate.

## 6. Save

Write the plan to a temporary file outside the repo (e.g. under `$(mktemp -d)`), then validate it and save it:

```bash
bun run mp validate plan /tmp/plan.json
bun run mp put-plan 2026-10-05 /tmp/plan.json
```

Example plan file:

```json plan
{
  "status": "draft",
  "notes": "Soccer Tue/Thu — quick cooks those nights.",
  "meals": [
    { "date": "2026-10-05", "kind": "flexible", "title": "Frittata, omelets, tuna salad, or leftovers" },
    { "date": "2026-10-06", "kind": "cook", "recipeId": "REPLACE-WITH-RECIPE-ID", "sideNote": "Eggs for breakfast.", "freezerItemIds": [] },
    { "date": "2026-10-07", "kind": "leftovers", "title": "Leftover fajitas", "leftoverOfDate": "2026-10-06" },
    { "date": "2026-10-08", "kind": "cook", "title": "Turkey egg roll in a bowl", "sideNote": "Leave sriracha off the kids' bowls." },
    { "date": "2026-10-09", "kind": "leftovers", "title": "Leftover egg roll bowls", "leftoverOfDate": "2026-10-08" },
    { "date": "2026-10-10", "kind": "cook", "title": "Sheet-pan salmon and potatoes" },
    { "date": "2026-10-11", "kind": "flexible", "title": "Eggs, tuna salad, or leftovers" }
  ],
  "prepTasks": [
    { "date": "2026-10-04", "title": "Slice peppers and onions for fajitas", "minutes": 15 },
    { "date": "2026-10-04", "title": "Cook a big batch of rice", "minutes": 25 }
  ]
}
```

Field rules:
- Every meal needs a `recipeId` or a `title`. The title defaults to the recipe's title.
- Meal dates must fall inside the week.
- `kind` is `cook`, `leftovers` or `flexible`.
- `put-plan` replaces the whole week.

**Don't use `--force`** unless the user has explicitly said to replace a plan that's marked final.

## 7. Report back

Summarize:
- the week, as a short day-by-day list (day, kind, meal, notes)
- any new recipes
- the freezer items linked to meals
- the prep schedule

Then tell the user to:
1. Open **Plan** in the app to review, adjust, and **Mark final**.
2. When they're ready to shop, use **Shopping → Add ingredients from the plan**, then **Send to GroceryList**.

The workflow can't send anything to GroceryList itself. The family does that from the app.
