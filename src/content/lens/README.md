# Lens content

The reasoning model reads a lens pack before it scores a transcript (see `docs/DECISIONS.md`, "The transcript decides. No rep approval."). The pack is assembled by `defaultLensPack()` in `src/domain/lens.ts` from four parts:

1. Ego archetypes, from `src/content/lenses.ts` (SOS-07). Already in the pack.
2. Sales frameworks, from `frameworks.ts` in this folder. Empty until the owner adds theirs.
3. Offer facts, from the fixture offer. Facts only, never a price the model may move.
4. Do-nots, from the adaptation boundaries in `src/content/lenses.ts` (SOS-08).

`buildSystemPrompt(pack)` turns the pack into one compact instruction. The prompt is deterministic: the same pack always yields the same bytes.

## Adding a framework

Add one object to the `frameworks` array in `frameworks.ts`. The shape is `SalesFramework` from `src/domain/lens.ts`:

| Field | What goes there |
|---|---|
| `name` | The framework's name as the owner calls it |
| `source` | Where it comes from: a book, a course, or "owner notes" |
| `principles` | One principle per line, in the owner's words. The model ties each feedback angle to one principle by name |
| `doNots` | One boundary per line. These join the pack's do-nots and are printed under DO NOT in the prompt |

A framework file may also be kept as Markdown with frontmatter (`name`, `source`, `principles`, `doNots`) for the owner to edit; the TypeScript array is the only thing the code reads, so copy the frontmatter values into `frameworks.ts` when the content is final.

## What never goes in a framework

- Prices, discounts, or payment terms. The model never establishes money facts.
- Consent or attendance claims. Those come from providers and the ledger.
- Instructions that override the schema, the span-citation rule, or the do-nots.

## Verifying

`src/domain/__tests__/lens.test.ts` checks that every archetype, every do-not, and every framework principle appears in the prompt, and that the prompt is deterministic. Run `npm test` after editing.
