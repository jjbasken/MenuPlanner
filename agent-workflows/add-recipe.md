# Add a recipe

Turn a recipe (a URL, pasted text, or a dish the user describes) into a
structured MenuPlanner recipe. This doc is shared by the Claude Code and Codex
skills, and the plan-week workflow uses it too. Run every `mp` command from the
repo root. See [plan-week.md](plan-week.md) §1 if `bun run mp whoami` fails.

## 1. Check for an existing recipe

```bash
bun run mp recipes "fajitas"
```

If a matching recipe exists, use or update it (`bun run mp recipe <id>`, then
`bun run mp update-recipe <id> <file>`) rather than creating a near-duplicate.

## 2. Get the recipe

- **URL:** fetch the page with your web tools and extract the recipe. Keep the URL as `sourceUrl`.
- **Text or description:** use what the user gave you. For a dish with no recipe ("my mom's chili"), ask for the essentials, or write a sensible family-sized version and say that you did.

## 3. Structure it

- **`servings`:** what the recipe makes. The app scales from this.
- **`ingredients`:** one entry per ingredient, as `{ "name", "qty", "unit", "note" }`.
  - `name` is the thing you buy: "Chicken breast", "Yellow onion". Preparation goes in `note`: "diced", "thinly sliced". Keep names consistent across recipes so the shopping list combines them.
  - `qty` is a number (`1.5`, not "1 1/2"). Leave it out for "to taste" items.
  - `unit` is one of tsp, tbsp, cup, fl oz, pint, quart, gallon, ml, l, oz, lb, g, kg; a count unit such as can, clove, bunch, package, bag or head; or empty for whole items ("3" bell peppers).
- **`instructions`:** numbered steps, one per line, short and practical.
- **`prepAheadNotes`:** what can be done ahead, and how long it keeps.
- **`prepMin` / `cookMin`:** minutes.
- **`tags`:** lowercase, short: cuisine, protein, "quick", "sheet-pan", "slow-cooker".
- **`kidFriendly`:** `true` if it's mild and familiar enough for young kids, or easily made so.

Example recipe file:

```json recipe
{
  "title": "Chicken fajitas",
  "description": "Sheet-pan fajitas — the kids build their own.",
  "servings": 5,
  "prepMin": 10,
  "cookMin": 25,
  "tags": ["mexican", "quick", "sheet-pan"],
  "kidFriendly": true,
  "sourceUrl": null,
  "prepAheadNotes": "Slice the peppers and onion up to two days ahead.",
  "instructions": "1. Heat the oven to 425°F.\n2. Slice the chicken, peppers and onion; toss with oil and fajita seasoning.\n3. Roast 20–25 minutes, stirring once.\n4. Serve with warm tortillas and sour cream.",
  "ingredients": [
    { "name": "Chicken breast", "qty": 2, "unit": "lb", "note": "sliced into strips" },
    { "name": "Bell peppers", "qty": 3, "unit": "", "note": "sliced" },
    { "name": "Yellow onion", "qty": 1, "unit": "", "note": "sliced" },
    { "name": "Olive oil", "qty": 2, "unit": "tbsp" },
    { "name": "Fajita seasoning", "qty": 2, "unit": "tbsp" },
    { "name": "Flour tortillas", "qty": 1, "unit": "package" },
    { "name": "Sour cream", "qty": 8, "unit": "oz" },
    { "name": "Salt" }
  ]
}
```

## 4. Save

Write the JSON to a temporary file outside the repo, then validate it and save it:

```bash
bun run mp validate recipe /tmp/recipe.json
bun run mp add-recipe /tmp/recipe.json
```

`add-recipe` refuses a second recipe with the same title and returns the
existing `id`. Only pass `--allow-duplicate` if the user really wants two.

## 5. Report back

Give the title, the servings, the number of ingredients, and the app path
`/plan/recipes/<id>`. Mention anything you guessed, such as quantities that
weren't given.
