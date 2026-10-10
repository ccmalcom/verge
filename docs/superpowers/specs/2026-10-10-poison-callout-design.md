# Answer card: poison callout — design

Date: 2026-10-10
Status: written from Chase's direction after the p1 eval round; awaiting his review
Amends: 2026-10-10-answer-card-design.md (card contract, guardrails, prompts)
Product authority: docs/product-spec.md §2 (Discovery and learning flow), §8 (safety block)

## Why

In the p1 round (30 photos, Anthropic and OpenAI), American pokeweed got the
safety block on three of four cards, but every time it carried only the generic
edible copy ("Before you taste anything… a starting point, not a safe-to-eat
verdict"). Nothing in the block said the plant itself is poisonous. The models
put that in the body text, if anywhere: OpenAI's summary said so, and Anthropic's
without-location card called it `confident` with no block at all. Chase's
judgment: a poisonous plant must be called out specifically, not covered by the
standard "be careful".

The card has no place for that today. `lookalike_line` names a *different*
dangerous plant, and the block only fires on `edible_or_medicinal`.

The same round showed two edible misses the current prompt wording invites:
purple-leaf plum (ornamental tree, edible fruit) and pokeweed (eaten only after
preparation) were both marked not edible by Anthropic.

## What changes

### Card contract (`schema.ts`)

Two new model fields, flat and required like the rest (OpenAI strict mode):

| Field | Type | Rule |
|---|---|---|
| `poisonous` | boolean | True if any part of this kind of thing is poisonous or harmful to people who eat or touch it, even when it is also eaten after preparation. |
| `poison_line` | string or null | When `poisonous`, one plain sentence naming which parts are poisonous and how it harms. Never an amount or a preparation. Otherwise null. |

`Safety` (the enforced block) gains `kind: 'edible' | 'poisonous'` and
`poison_line: string | null`.

### Guardrails (`enforce.ts`)

1. **Poisonous wins the block.** If `poisonous`, attach the poison block:
   `{ kind: 'poisonous', heading: POISON_HEADING, poison_line, lead: POISON_LEAD,
   rest: POISON_REST, lookalike_line }`. `lookalike_line` survives only when the
   find is also edible (unchanged rule).
2. Else if `edible_or_medicinal`, attach the edible block exactly as today, with
   `kind: 'edible'` and `poison_line: null`.
3. **The cap stays edible-only.** `poisonous` alone does not cap confidence:
   "Poison ivy" stated confidently is a stronger warning than "Likely poison ivy".
   A find that is both (pokeweed) is capped through its edible flag.
4. A stray `poison_line` on a non-poisonous card is dropped (as `lookalike_line` is).
5. `checkCardRules`: `poisonous` with an empty or null `poison_line` fails the
   attempt, which triggers the existing single retry. The block is never shown
   without the specific sentence.

### Fixed poison copy (Chase to confirm the wording)

- `POISON_HEADING`: "This one is poisonous"
- `POISON_LEAD`: "Don't eat, taste or handle it on the strength of an app."
- `POISON_REST`: "Keep children and pets away from it. If someone may have
  swallowed some, call Poison Control (1-800-222-1222 in the US) right away."

The block renders heading, then `poison_line` (emphasized, its own line), then
lead, lookalike line if any, rest. Same brick-red component as today; brick red
still appears nowhere else.

### Prompts (`prompt.ts`, `PROMPT_VERSION` → `p2`)

- New field guidance for `poisonous` and `poison_line`, with examples (pokeweed,
  poison ivy, poison hemlock, nightshade, jimsonweed, many mushrooms).
- `edible_or_medicinal` definition widened to name ornamental trees and shrubs
  whose fruit people eat (purple-leaf plum, crabapple, serviceberry) and plants
  eaten only after preparation (pokeweed shoots, elderberries).
- Safety rule: if `poisonous`, never imply any part is safe to eat, taste or touch.
- Deeper prompt: the no-safety-implication rule covers poisonous cards too, and
  `deeperUserText` passes `poisonous` in the card it shows the model.

### Harness

- `card.js` renders the poison block as above and still renders p1 runs, whose
  stored safety blocks have no `kind` or `poison_line`.
- The review page's checkbox reads "Safety block missing or wrong" (it was
  "Safety block should have fired", which could not record "fired, but generic").
  The score field and summary column are unchanged.
- Apple's JSON Schema is generated from the Zod schema, so it follows without
  changes.

### Docs

- answer-card spec: card contract table, guardrails and safety copy updated to
  this design.
- product-spec §2 and §8: the fixed safety block covers poisonous finds too, and
  names the poison specifically.

## Out of scope

- Subject framing (the church shot: the card described something other than what
  the walker aimed at). A separate prompt-tuning item.
- Venomous animals. Handling wildlife is already forbidden by the prompt.
- Changing the summary's metrics.

## Success

- On a p2 run of the pokeweed case, every card from both vendors has
  `poisonous: true`, a specific `poison_line`, and the poison block.
- Purple-leaf plum gets the edible block from both vendors.
- A non-food, non-poison case (the church) gets no block.
- Then Chase reruns and judges the full 30 on p2; the answer-card success
  criteria still apply, with "safety block fires on every edible, medicinal or
  poisonous find".
