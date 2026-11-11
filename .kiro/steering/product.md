# FridgeGhost — Product Steering

## Vision

Households throw away roughly a third of the food they buy, and most of it
dies the same quiet way: bought with good intentions, forgotten in the fridge,
found too late. FridgeGhost makes the fridge impossible to forget. It shows
what is in there, when each thing dies, and what to cook with the things about
to become ghosts — then turns the answer into a shopping list.

Tagline: **"Exorcise your fridge before your food becomes a ghost."**

## Who it is for

Anyone with a fridge and a phone or laptop. No account, no setup, no learning
curve: open the page, add what you bought, get warned before it dies.

## What FridgeGhost is

- A **local-first** household tool. Your fridge lives on your machine, in two
  JSON files you can read, copy, and back up yourself.
- A **Frankenstein**: five parts stitched into one body — Open Food Facts
  (barcode lookup), TheMealDB (recipes), an expiry engine, a fridge store,
  and a shopping list. Each part is free and public; the value is the stitching.
- **Honest about urgency.** Four states, no more: `fresh`, `soon`, `today`,
  `expired`. No gamification, no streaks, no guilt-trip notifications.
- **Fast and plain.** One command to run, one page to use, no build step at
  runtime beyond `tsc`.

## What FridgeGhost is NOT

- Not a social app. No sharing, no feeds, no accounts, no followers.
- Not a meal-planning service. It suggests recipes from what is about to
  expire; it does not plan your week.
- Not a cloud service. Nothing syncs, nothing is uploaded, nothing phones
  home. The only network calls are the two public lookups (barcode →
  Open Food Facts, ingredient → TheMealDB), and those carry no identity.
- Not a nutrition or health app. No calorie counts, no diet advice.
- Not a store. No affiliate links, no ads, no paid tier.

## Tone

Playful-haunted, never scary, never preachy. The ghost theme is a joke about
forgotten food, not a horror aesthetic: "hauntings" are items about to expire,
"exorcise" means cook them. Copy should be short, warm, and a little witty.
Error messages say what happened and what to do next — never blame the user
("Barcode not found — type the name in manually" beats "Invalid barcode").

## Product rules

1. **Local first, always.** A feature that requires an account or a paid key
   does not ship.
2. **Graceful failure.** If a public API is down, the fridge still works. Only
   the feature that needs that API reports an error.
3. **No data loss.** A restart never loses the fridge. A corrupt data file
   starts empty with a warning, never a crash.
4. **One-command run.** `npm install && npm run dev` must be the whole setup.
5. **The fridge is the source of truth.** Recipes suggest; the shopping list
   only ever adds what the fridge does not already have.
