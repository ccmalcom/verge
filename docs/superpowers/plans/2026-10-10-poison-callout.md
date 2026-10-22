# Answer Card Poison Callout Implementation Plan

> **For agentic workers:** Execute with the saved workflow `.claude/workflows/execute-plan.js`,
> passing this plan and its ledger as args:
> `Workflow({ name: 'execute-plan', args: { plan: 'docs/superpowers/plans/2026-10-10-poison-callout.md', ledger: 'docs/superpowers/plans/2026-10-10-poison-callout-ledger.md' } })`.
> It runs one fresh agent per batch and a review gate after each. Inside a batch, follow
> superpowers:executing-plans for your batch's tasks only. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Poisonous finds get a safety block that names the poison specifically (which parts,
how it harms) instead of the generic edible caution, and prompt p2 widens what counts as edible.

**Architecture:** Two new model fields (`poisonous`, `poison_line`) join the flat tier-1 schema.
`enforce.ts` chooses the block: poisonous wins (fixed `POISON_*` copy around the model's
`poison_line`), else edible (unchanged copy), else none; the confidence cap stays edible-only.
`checkCardRules` rejects a poisonous card without its sentence, so the existing single retry
covers it. The harness renderer shows the poison line first in the block and still renders p1 runs.

**Tech Stack:** unchanged from the answer-card plan: Node ≥ 22.12, TypeScript ^6 (NodeNext),
`ai` 7, `zod` 4, `vitest` 5, `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-10-poison-callout-design.md` (amends
`docs/superpowers/specs/2026-10-10-answer-card-design.md`).

**Ledger:** `docs/superpowers/plans/2026-10-10-poison-callout-ledger.md`. Update it after every task.

## Execution

- **Branch:** `feat/poison-callout`. If it does not exist on origin, create it:
  ```bash
  git fetch origin
  if git merge-base --is-ancestor origin/docs/poison-callout-spec origin/main; then base=origin/main; else base=origin/docs/poison-callout-spec; fi
  git switch -c feat/poison-callout "$base" && git push -u origin feat/poison-callout
  ```
  If it exists: `git switch feat/poison-callout && git pull --ff-only`.
- **Batches** (one fresh session/agent each; stop after your batch):

  | Batch | Tasks | Theme |
  |---|---|---|
  | A | 1, 2 | card contract + guardrails, prompt p2 |
  | B | 3, 4 | renderer + review label, real flow + docs + PR |

- After each task: `cd proxy && npm test && npm run typecheck` must pass, then commit (explicit
  paths), push, and update the ledger (what was done, how it was verified, anything deferred and
  why, next task). Commit and push the ledger with the task.
- Anything only Chase can supply (judging cards, copy sign-off) goes under "Needs Chase" in the
  ledger; finish everything else and report `needs_chase`.

## Global Constraints

- All code changes are in `proxy/`. Docs changes are the two spec files and `docs/product-spec.md`
  named in Task 4, nothing else.
- TypeScript `module`/`moduleResolution` are `NodeNext`: relative imports end in `.js`.
- Model-facing Zod schemas are flat, every key required, `.nullable()` instead of `.optional()`,
  no unions (OpenAI strict mode).
- Confidence vocabulary is exactly `confident | likely | unsure | cant_tell`. Never a number.
- The confidence cap fires only on `edible_or_medicinal`. `poisonous` alone never caps.
- Fixed copy, verbatim:
  - `POISON_HEADING` = `This one is poisonous`
  - `POISON_LEAD` = `Don't eat, taste or handle it on the strength of an app.`
  - `POISON_REST` = `Keep children and pets away from it. If someone may have swallowed some, call Poison Control (1-800-222-1222 in the US) right away.`
  - The existing `SAFETY_HEADING`, `SAFETY_LEAD`, `SAFETY_REST` do not change.
- `PROMPT_VERSION` becomes `p2`.
- Secrets: never read, print or log values from the proxy's local env file. Never write that
  file's name in a shell command: the secrets hook rejects any command whose text names it, which
  stopped Batch B of the answer-card run. Write the ledger with the Edit tool, not a shell heredoc.
- Never commit `proxy/eval/photos/`, `proxy/eval/manifest.json` or `proxy/eval/runs/`.
- Google is cut for now (its project is over its spending cap): never pass `google` to `eval:run`.
- Git: plain commit messages, no `Co-Authored-By` trailer; stage explicit paths; push after
  every commit.

## Review Focus

Inputs the spec implies but no happy-path test exercises; each has a test in its owning task.

1. **The model flags `poisonous` but leaves `poison_line` empty or null:** the attempt fails the card rules, the one retry runs, and a generic poison block is never shown (Task 1 `requires a poison_line when poisonous`, `retries a poisonous card that lacks its poison_line`).
2. **A find that is both eaten and poisonous (pokeweed):** it gets the poison block, keeps its lookalike line, and is still capped at likely through the edible flag (Task 1 `gives a find that is both edible and poisonous…`).
3. **Reopening a p1 run in the review page:** its stored safety blocks have no `kind` or `poison_line` and must still render as the edible block (Task 3 `still renders a p1 safety block`).
4. **Model text in `poison_line` containing HTML:** escaped like every other model field (Task 3 `escapes model text in the poison line`).
5. **A deeper question on a poisonous card ("can I eat the berries?"):** the deeper prompt is told the card is poisonous and forbids implying any part is safe (Task 2 `tells the model when the card is poisonous`, `keeps poisonous cards out of safe-to-eat talk`).

---

## Batch A

### Task 1: Card contract and guardrails

**Files:**
- Modify: `proxy/src/card/schema.ts` (TierOneOutput, Safety)
- Modify: `proxy/src/card/enforce.ts`
- Modify: `proxy/test/fixtures.ts`
- Modify: `proxy/test/enforce.test.ts`
- Modify: `proxy/test/ask.test.ts` (one new test)

**Interfaces:**
- Consumes: the existing `TierOneOutput`, `EnforcedCard`, `enforceCard`, `checkCardRules`, `runAsk`.
- Produces (from `proxy/src/card/schema.ts`):
  - `TierOneOutput` gains `poisonous: boolean` and `poison_line: string | null` (placed right after `lookalike_line`).
  - `SAFETY_KINDS = ['edible', 'poisonous'] as const` and `type SafetyKind`.
  - `Safety` = `{ kind: SafetyKind; heading: string; poison_line: string | null; lead: string; rest: string; lookalike_line: string | null }`.
- Produces (from `proxy/src/card/enforce.ts`): `POISON_HEADING`, `POISON_LEAD`, `POISON_REST` (strings);
  `checkCardRules` returns `'poisonous requires a poison_line'` for a poisonous card with an empty or null line;
  `enforceCard` signature unchanged.
- Produces (from `proxy/test/fixtures.ts`): `validTierOne()` now includes `poisonous: false, poison_line: null`.

- [ ] **Step 1: Add the fields to the fixture**

In `proxy/test/fixtures.ts`, replace:
```ts
    lookalike_line: null,
    follow_ups: ['Why does it grow in gravel?', 'What used to use these leaves?'],
```
with:
```ts
    lookalike_line: null,
    poisonous: false,
    poison_line: null,
    follow_ups: ['Why does it grow in gravel?', 'What used to use these leaves?'],
```

- [ ] **Step 2: Write the failing guardrail tests**

In `proxy/test/enforce.test.ts`, replace the import line with:
```ts
import {
  checkCardRules,
  enforceCard,
  enforceDeeper,
  POISON_HEADING,
  POISON_LEAD,
  POISON_REST,
  SAFETY_HEADING,
  SAFETY_LEAD,
  SAFETY_REST,
} from '../src/card/enforce.js';
```

In the first test (`caps an edible confident find…`), replace its `toEqual` object with:
```ts
    expect(card.safety).toEqual({
      kind: 'edible',
      heading: SAFETY_HEADING,
      poison_line: null,
      lead: SAFETY_LEAD,
      rest: SAFETY_REST,
      lookalike_line: 'Moonseed looks similar and is poisonous.',
    });
```

After the test `has no safety block and drops a stray lookalike line on a non-edible find`, add:
```ts
  it('attaches the poison block to a poisonous find without capping it', () => {
    const { card, capped } = enforceCard(
      validTierOne({ headline: 'Poison ivy', confidence: 'confident', poisonous: true, poison_line: 'Every part carries an oil that blisters skin.' }),
    );
    expect(capped).toBe(false);
    expect(card.confidence).toBe('confident');
    expect(card.safety).toEqual({
      kind: 'poisonous',
      heading: POISON_HEADING,
      poison_line: 'Every part carries an oil that blisters skin.',
      lead: POISON_LEAD,
      rest: POISON_REST,
      lookalike_line: null,
    });
  });

  it('gives a find that is both edible and poisonous the poison block, the cap and its lookalike line', () => {
    const { card, capped } = enforceCard(
      validTierOne({
        headline: 'American pokeweed',
        confidence: 'confident',
        edible_or_medicinal: true,
        poisonous: true,
        poison_line: 'The root and berries are poisonous.',
        lookalike_line: 'Elderberry clusters can look similar.',
      }),
    );
    expect(capped).toBe(true);
    expect(card.confidence).toBe('likely');
    expect(card.safety?.kind).toBe('poisonous');
    expect(card.safety?.heading).toBe(POISON_HEADING);
    expect(card.safety?.poison_line).toBe('The root and berries are poisonous.');
    expect(card.safety?.lookalike_line).toBe('Elderberry clusters can look similar.');
  });

  it('drops a stray poison_line on a non-poisonous find', () => {
    const { card } = enforceCard(validTierOne({ poison_line: 'stray' }));
    expect(card.poison_line).toBeNull();
    expect(card.safety).toBeNull();
  });
```

In the `checkCardRules` describe block, add:
```ts
  it('requires a poison_line when poisonous', () => {
    expect(checkCardRules(validTierOne({ poisonous: true, poison_line: null }))).toMatch(/poison_line/);
    expect(checkCardRules(validTierOne({ poisonous: true, poison_line: '  ' }))).toMatch(/poison_line/);
    expect(checkCardRules(validTierOne({ poisonous: true, poison_line: 'The berries are poisonous.' }))).toBeNull();
  });
```

In `proxy/test/ask.test.ts`, inside `describe('runAsk: card', …)` after the test `retries once when card rules fail, then returns 422`, add:
```ts
  it('retries a poisonous card that lacks its poison_line', async () => {
    const d = deps([
      validTierOne({ poisonous: true, poison_line: null }),
      validTierOne({ poisonous: true, poison_line: 'The root and berries are poisonous.' }),
    ]);
    const out = await runAsk({ kind: 'card', note: 'tall plant, purple berries', context: validContext() }, d);
    expect(d.generate.calls).toHaveLength(2);
    if (out.status !== 200 || !('card' in out.body)) throw new Error('expected card');
    expect(out.body.card.safety?.poison_line).toBe('The root and berries are poisonous.');
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd proxy && npx vitest run test/enforce.test.ts test/schema.test.ts test/ask.test.ts`
Expected: FAIL. `POISON_HEADING` etc. are not exported; `produces a JSON schema with every key required`
fails because the schema lacks `poisonous` and `poison_line`; the safety `toEqual` lacks `kind`.

- [ ] **Step 4: Extend the schema**

In `proxy/src/card/schema.ts`, replace:
```ts
  edible_or_medicinal: z.boolean(),
  lookalike_line: z.string().nullable(),
  follow_ups: z.array(z.string()),
});
export type TierOneOutput = z.infer<typeof TierOneOutput>;
```
with:
```ts
  edible_or_medicinal: z.boolean(),
  lookalike_line: z.string().nullable(),
  poisonous: z.boolean(),
  poison_line: z.string().nullable(),
  follow_ups: z.array(z.string()),
});
export type TierOneOutput = z.infer<typeof TierOneOutput>;
```

and replace:
```ts
const SafetySchema = z.object({
  heading: z.string(),
  lead: z.string(),
  rest: z.string(),
  lookalike_line: z.string().nullable(),
});
export type Safety = z.infer<typeof SafetySchema>;
```
with:
```ts
// Which fixed copy the block carries. A poisonous find gets the poison copy even when it is also eaten.
export const SAFETY_KINDS = ['edible', 'poisonous'] as const;
export type SafetyKind = (typeof SAFETY_KINDS)[number];

const SafetySchema = z.object({
  kind: z.enum(SAFETY_KINDS),
  heading: z.string(),
  poison_line: z.string().nullable(),
  lead: z.string(),
  rest: z.string(),
  lookalike_line: z.string().nullable(),
});
export type Safety = z.infer<typeof SafetySchema>;
```

- [ ] **Step 5: Implement the guardrails**

Replace the whole of `proxy/src/card/enforce.ts` with:
```ts
import { TIER2_LABELS, type DeeperOutput, type EnforcedCard, type Safety, type TierOneOutput } from './schema.js';

// Fixed copy. The model cannot alter or suppress it. The model's lookalike_line
// renders between SAFETY_LEAD and SAFETY_REST (design board: wild grape).
export const SAFETY_HEADING = 'Before you taste anything';
export const SAFETY_LEAD = "Don't eat or use anything on the strength of an app.";
export const SAFETY_REST =
  "This is a starting point, not a safe-to-eat verdict. A photo can't tell ripe from unripe or sprayed from unsprayed. If foraging interests you, a local guide or the county extension office is the next step.";

// Fixed copy for poisonous finds. The model's poison_line renders first, under the heading.
export const POISON_HEADING = 'This one is poisonous';
export const POISON_LEAD = "Don't eat, taste or handle it on the strength of an app.";
export const POISON_REST =
  'Keep children and pets away from it. If someone may have swallowed some, call Poison Control (1-800-222-1222 in the US) right away.';

const MAX_FOLLOW_UPS = 3;

// Rules the JSON schema cannot express. A non-null result fails the attempt.
export function checkCardRules(raw: TierOneOutput): string | null {
  if (raw.confidence === 'cant_tell' && (!raw.help_asks || raw.help_asks.length !== 2)) {
    return 'cant_tell requires exactly two help_asks';
  }
  if (raw.poisonous && !raw.poison_line?.trim()) {
    return 'poisonous requires a poison_line';
  }
  return null;
}

// Poisonous wins the block; the edible block is unchanged; anything else gets none.
function safetyBlock(poisonous: boolean, edible: boolean, poisonLine: string | null, lookalike: string | null): Safety | null {
  if (poisonous) {
    return { kind: 'poisonous', heading: POISON_HEADING, poison_line: poisonLine, lead: POISON_LEAD, rest: POISON_REST, lookalike_line: lookalike };
  }
  if (edible) {
    return { kind: 'edible', heading: SAFETY_HEADING, poison_line: null, lead: SAFETY_LEAD, rest: SAFETY_REST, lookalike_line: lookalike };
  }
  return null;
}

export function enforceCard(raw: TierOneOutput): { card: EnforcedCard; capped: boolean } {
  // The cap is edible-only: "Poison ivy" stated confidently is a stronger warning than "Likely poison ivy".
  const capped = raw.edible_or_medicinal && raw.confidence === 'confident';
  const confidence = capped ? 'likely' : raw.confidence;
  const lookalike = raw.edible_or_medicinal ? raw.lookalike_line : null;
  const poisonLine = raw.poisonous ? raw.poison_line : null;
  return {
    capped,
    card: {
      ...raw,
      confidence,
      help_asks: confidence === 'cant_tell' ? raw.help_asks : null,
      lookalike_line: lookalike,
      poison_line: poisonLine,
      follow_ups: raw.follow_ups.slice(0, MAX_FOLLOW_UPS),
      tier2_label: TIER2_LABELS[confidence],
      safety: safetyBlock(raw.poisonous, raw.edible_or_medicinal, poisonLine, lookalike),
    },
  };
}

export function enforceDeeper(raw: DeeperOutput): DeeperOutput {
  return { answer: raw.answer, follow_ups: raw.follow_ups.slice(0, MAX_FOLLOW_UPS) };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd proxy && npm test && npm run typecheck`
Expected: all tests pass (any other test that builds a card through `validTierOne()` or
`enforceCard` picks up the new fields), tsc exits 0. If a test elsewhere hand-builds a `safety`
object or a full tier-1 card without `validTierOne()`, add the new fields to it and record that in
the ledger as a deviation.

- [ ] **Step 7: Commit**

Update the ledger (Edit tool), then:
```bash
git add proxy/src/card/schema.ts proxy/src/card/enforce.ts proxy/test/fixtures.ts proxy/test/enforce.test.ts proxy/test/ask.test.ts docs/superpowers/plans/2026-10-10-poison-callout-ledger.md
git commit -m "feat(card): add poisonous and poison_line with a poison safety block"
git push
```

### Task 2: Prompt p2

**Files:**
- Modify: `proxy/src/card/prompt.ts`
- Modify: `proxy/test/prompt.test.ts`
- Modify: `proxy/test/ask.test.ts` (the `prompt_version` assertion)

**Interfaces:**
- Consumes: `TierOneOutput` with `poisonous`/`poison_line` (Task 1); `EnforcedCard.poisonous`.
- Produces: `PROMPT_VERSION = 'p2'`; `TIER1_INSTRUCTIONS` and `DEEPER_INSTRUCTIONS` with the text
  below; `deeperUserText` signature unchanged, its card JSON now includes `poisonous`.

- [ ] **Step 1: Write the failing prompt tests**

In `proxy/test/prompt.test.ts`, inside `describe('prompts', …)`, add:
```ts
  it('asks for poisonous and poison_line and widens the edible definition (p2)', () => {
    expect(PROMPT_VERSION).toBe('p2');
    expect(TIER1_INSTRUCTIONS).toContain('- poisonous:');
    expect(TIER1_INSTRUCTIONS).toContain('- poison_line:');
    expect(TIER1_INSTRUCTIONS).toMatch(/pokeweed/);
    expect(TIER1_INSTRUCTIONS).toMatch(/purple-leaf plum/);
    expect(TIER1_INSTRUCTIONS).toMatch(/never imply any part is safe to eat, taste or touch/i);
  });

  it('keeps poisonous cards out of safe-to-eat talk in deeper answers', () => {
    expect(DEEPER_INSTRUCTIONS).toMatch(/edible, medicinal or poisonous/);
  });
```

Inside `describe('deeperUserText', …)`, add:
```ts
  it('tells the model when the card is poisonous', () => {
    const { card } = enforceCard(validTierOne({ poisonous: true, poison_line: 'The berries are poisonous.' }));
    expect(deeperUserText(validContext(), card, 'Can birds eat the berries?', undefined, true)).toContain('"poisonous":true');
  });
```

In `proxy/test/ask.test.ts`, in the test `returns an enforced card with meta`, change
`prompt_version: 'p1'` to `prompt_version: 'p2'`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd proxy && npx vitest run test/prompt.test.ts test/ask.test.ts`
Expected: FAIL on `PROMPT_VERSION` (`p1`), the missing field lines, the deeper wording, the missing
`"poisonous":true`, and the `p2` meta assertion.

- [ ] **Step 3: Update the prompt**

In `proxy/src/card/prompt.ts`:

Replace `export const PROMPT_VERSION = 'p1';` with `export const PROMPT_VERSION = 'p2';`.

Replace these two lines:
```
- edible_or_medicinal: true if people eat, forage or use this kind of thing medicinally, including fruit, nuts, seeds, leaves, mushrooms, and anything foraged that has a poisonous lookalike. Otherwise false.
- lookalike_line: when edible_or_medicinal is true and a dangerous lookalike exists, one sentence naming it and how it differs ("Lookalikes exist: for grape, that's moonseed, which is poisonous and grows in the same places."). Otherwise null.
```
with:
```
- edible_or_medicinal: true if people eat, forage or use this kind of thing medicinally, including fruit, nuts, seeds, leaves, mushrooms, ornamental trees and shrubs whose fruit people eat (purple-leaf plum, crabapple, serviceberry), plants eaten only after preparation (pokeweed shoots, elderberries), and anything foraged that has a poisonous lookalike. Otherwise false.
- lookalike_line: when edible_or_medicinal is true and a dangerous lookalike exists, one sentence naming it and how it differs ("Lookalikes exist: for grape, that's moonseed, which is poisonous and grows in the same places."). Otherwise null.
- poisonous: true if any part of this kind of thing is poisonous or harmful to people who eat or touch it (pokeweed, poison ivy, poison hemlock, nightshade, jimsonweed, many mushrooms), even when it is also eaten after preparation. Otherwise false.
- poison_line: when poisonous is true, one plain sentence naming which parts are poisonous and how it harms ("All parts are poisonous, the root and berries most of all; even handling the root can irritate skin."). Never give an amount or a preparation. Otherwise null.
```

Replace:
```
- If edible_or_medicinal is true, confidence is at most likely, even when you are sure. Never imply the find is safe to eat, taste or use. Never give preparation or dosage.
```
with:
```
- If edible_or_medicinal is true, confidence is at most likely, even when you are sure. Never imply the find is safe to eat, taste or use. Never give preparation or dosage.
- If poisonous is true, never imply any part is safe to eat, taste or touch.
```

In `DEEPER_INSTRUCTIONS`, replace:
```
- If the card marked the find edible or medicinal, never say or imply it is safe to eat, taste or use, and never give preparation or dosage. History, ecology and cultural uses are fine.
```
with:
```
- If the card marked the find edible, medicinal or poisonous, never say or imply any part is safe to eat, taste, touch or use, and never give preparation or dosage. History, ecology and cultural uses are fine.
```

In `deeperUserText`, replace:
```ts
    edible_or_medicinal: card.edible_or_medicinal,
  };
```
with:
```ts
    edible_or_medicinal: card.edible_or_medicinal,
    poisonous: card.poisonous,
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd proxy && npm test && npm run typecheck`
Expected: all pass, tsc exits 0.

- [ ] **Step 5: Commit**

Update the ledger (Edit tool), then:
```bash
git add proxy/src/card/prompt.ts proxy/test/prompt.test.ts proxy/test/ask.test.ts docs/superpowers/plans/2026-10-10-poison-callout-ledger.md
git commit -m "feat(card): prompt p2 asks for poisonous and poison_line and widens edible"
git push
```

---

## Batch B

### Task 3: Card renderer and review label

**Files:**
- Modify: `proxy/eval/review/public/card.js` (safety block, lines 32-38)
- Modify: `proxy/eval/review/public/styles.css` (after the `.safety .label` rule)
- Modify: `proxy/eval/review/public/app.js:51` (checkbox label)
- Modify: `proxy/test/eval/card.test.ts`

**Interfaces:**
- Consumes: `EnforcedCard.safety` with `kind` and `poison_line` (Task 1), `POISON_*` copy.
- Produces: `renderCard(view)` unchanged signature; the safety section's class is
  `safety safety--<kind>` (`edible` when a stored block has no `kind`).

- [ ] **Step 1: Write the failing renderer tests**

In `proxy/test/eval/card.test.ts`, in the test `renders the safety block with the lookalike line between lead and rest`,
change `expect(html).toContain('class="safety"');` to `expect(html).toContain('class="safety safety--edible"');`.

Then add after that test:
```ts
  it('renders the poison block with the poison line before the fixed lead', () => {
    const html = renderCard(view({ poisonous: true, poison_line: 'The root and berries are poisonous.' }));
    const heading = html.indexOf('THIS ONE IS POISONOUS');
    const line = html.indexOf('The root and berries are poisonous.');
    const lead = html.indexOf('Don&#39;t eat, taste or handle it');
    const rest = html.indexOf('Poison Control');
    expect(html).toContain('class="safety safety--poisonous"');
    expect(heading).toBeGreaterThan(-1);
    expect(line).toBeGreaterThan(heading);
    expect(lead).toBeGreaterThan(line);
    expect(rest).toBeGreaterThan(lead);
  });

  it('still renders a p1 safety block, which has no kind or poison_line', () => {
    const p1Safety = {
      heading: 'Before you taste anything',
      lead: "Don't eat or use anything on the strength of an app.",
      rest: 'This is a starting point.',
      lookalike_line: null,
    };
    const card = { ...enforceCard(validTierOne()).card, safety: p1Safety };
    const html = renderCard({ status: 200, card, error: null, deeper: null });
    expect(html).toContain('class="safety safety--edible"');
    expect(html).toContain('BEFORE YOU TASTE ANYTHING');
    expect(html).not.toContain('class="body-sm poison"');
  });

  it('escapes model text in the poison line', () => {
    expect(renderCard(view({ poisonous: true, poison_line: '<img src=x onerror=alert(1)>' }))).not.toContain('<img');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd proxy && npx vitest run test/eval/card.test.ts`
Expected: FAIL. The class is still `safety` and no poison line is rendered.

- [ ] **Step 3: Implement the renderer change**

In `proxy/eval/review/public/card.js`, replace:
```js
  if (c.safety) {
    const look = c.safety.lookalike_line ? ` ${esc(c.safety.lookalike_line)}` : '';
    out.push(
      `<section class="safety"><p class="label">${esc(c.safety.heading).toUpperCase()}</p>` +
        `<p class="body-sm">${esc(c.safety.lead)}${look} ${esc(c.safety.rest)}</p></section>`,
    );
  }
```
with:
```js
  if (c.safety) {
    const s = c.safety;
    // p1 runs stored blocks with no kind or poison_line; they are edible blocks.
    const poison = s.poison_line ? `<p class="body-sm poison">${esc(s.poison_line)}</p>` : '';
    const look = s.lookalike_line ? ` ${esc(s.lookalike_line)}` : '';
    out.push(
      `<section class="safety safety--${esc(s.kind ?? 'edible')}"><p class="label">${esc(s.heading).toUpperCase()}</p>` +
        poison +
        `<p class="body-sm">${esc(s.lead)}${look} ${esc(s.rest)}</p></section>`,
    );
  }
```

In `proxy/eval/review/public/styles.css`, after the line `.safety .label { color: var(--brick); }`, add:
```css
.safety .poison { color: var(--ink); font-weight: 700; }
```

In `proxy/eval/review/public/app.js` line 51, change the label text `Safety block should have fired`
to `Safety block missing or wrong`. Change nothing else on that line.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd proxy && npm test && npm run typecheck`
Expected: all pass, tsc exits 0.

- [ ] **Step 5: Commit**

Update the ledger (Edit tool), then:
```bash
git add proxy/eval/review/public/card.js proxy/eval/review/public/styles.css proxy/eval/review/public/app.js proxy/test/eval/card.test.ts docs/superpowers/plans/2026-10-10-poison-callout-ledger.md
git commit -m "feat(eval): render the poison safety block and relabel the safety checkbox"
git push
```

### Task 4: Real flow, docs, PR

**Files:**
- Modify: `docs/superpowers/specs/2026-10-10-answer-card-design.md`
- Modify: `docs/product-spec.md`
- Modify: the ledger

**Interfaces:**
- Consumes: everything above; Chase's photos in `proxy/eval/photos/` (gitignored, already present)
  and the manifest. Case ids: `img-5331` (pokeweed), `img-5326` (purple-leaf plum), `img-5323`
  (a church; no food, no poison).
- Produces: a p2 run folder under `proxy/eval/runs/` (not committed), the doc amendments, a PR.

- [ ] **Step 1: Run p2 on the three cases (real vendor calls, a few cents)**

```bash
cd proxy && npm run eval:run -- --vendors anthropic,openai --cases img-5331,img-5326,img-5323
```
Expected: `12 card request(s), 0 failed` or close to it (3 cases × 2 vendors × with/without location;
each record also carries its one deeper call), and a run folder ending in `-p2`. If `manifest.json` is missing, run
`npm run eval:scaffold` first (it should report 30 cases, 30 with location).

- [ ] **Step 2: Check the cards**

```bash
cd proxy && R=$(ls -td eval/runs/*-p2/ | head -1) && R="$R" node -e '
const r = require("./" + process.env.R + "results.json");
for (const x of r.records) {
  const c = x.card;
  console.log(x.case_id, x.vendor, x.variant, x.status, c ? `poisonous=${c.poisonous} edible=${c.edible_or_medicinal} conf=${c.confidence} block=${c.safety?.kind ?? "none"} | ${c.poison_line ?? ""}` : x.error?.detail);
}'
```
Expected:
- `img-5331`: every card has `poisonous=true`, `block=poisonous` and a specific poison line.
- `img-5326`: every card has a block (`edible`, or `poisonous` if the model flags the pits).
- `img-5323`: every card has `block=none`.

If a model misses one of these, that is an eval finding, not a code defect: record the card's
headline and fields in the ledger under "Needs Chase", and do not change the prompt beyond this plan.

- [ ] **Step 3: Check rendering on real cards, old and new**

```bash
cd proxy && R=$(ls -td eval/runs/*-p2/ | head -1) && R="$R" node --input-type=module -e '
import { readFileSync, readdirSync } from "node:fs";
import { renderCard } from "./eval/review/public/card.js";
const p2 = JSON.parse(readFileSync(process.env.R + "results.json", "utf8"));
const rec = p2.records.find((x) => x.case_id === "img-5331" && x.card?.safety);
console.log(renderCard({ status: 200, card: rec.card, error: null, deeper: null }).match(/<section class="safety[\s\S]*?<\/section>/)[0]);
let n = 0;
for (const d of readdirSync("eval/runs").filter((d) => d.endsWith("-p1") || d.endsWith("-p1-no-google"))) {
  const r = JSON.parse(readFileSync(`eval/runs/${d}/results.json`, "utf8"));
  for (const x of r.records) { renderCard({ status: x.status, card: x.card, error: x.error, deeper: null }); n++; }
}
console.log(`rendered ${n} p1 cards without error`);
'
```
Expected: the printed section has class `safety safety--poisonous`, the heading `THIS ONE IS POISONOUS`,
the poison line, then the fixed lead and rest; and a non-zero count of p1 cards rendered.

Then start the review page on the p2 run (`npm run eval:review`, it opens the newest run), confirm
`GET /api/run` returns 200, and stop it.

- [ ] **Step 4: Amend the answer-card spec**

Use the Edit tool on `docs/superpowers/specs/2026-10-10-answer-card-design.md`:

1. Replace `- The safety block fires on every edible or medicinal find in the set.` with
   `- The safety block fires on every edible, medicinal or poisonous find in the set.`
2. After the table row starting `` | `lookalike_line` | ``, add:
   ```
   | `poisonous` | boolean | Any part poisonous or harmful to people who eat or touch it, even if also eaten after preparation (added by 2026-10-10-poison-callout-design.md). |
   | `poison_line` | string or null | When `poisonous`, one sentence naming which parts are poisonous and how it harms; rendered first in the safety block. Otherwise null. |
   ```
3. Replace
   ```
   2. If `edible_or_medicinal`, attach `safety: { copy: SAFETY_COPY, lookalike_line }`.
      `SAFETY_COPY` is a constant (below); the model cannot alter or suppress it.
   ```
   with
   ```
   2. If `poisonous`, attach the poison block: `kind: 'poisonous'`, the `POISON_*` copy (below),
      `poison_line`, and `lookalike_line` when the find is also edible. Else if
      `edible_or_medicinal`, attach `safety: { kind: 'edible', copy: SAFETY_COPY, lookalike_line }`.
      Both copies are constants; the model cannot alter or suppress them. The cap in rule 1
      stays edible-only.
   ```
4. Replace
   ```
   4. Trim `follow_ups` to 3. If `cant_tell` and `help_asks` is missing or not
      length 2, the output fails validation (triggers the one retry).
   ```
   with
   ```
   4. Trim `follow_ups` to 3. If `cant_tell` and `help_asks` is missing or not
      length 2, or if `poisonous` and `poison_line` is empty, the output fails
      validation (triggers the one retry).
   ```
5. After the paragraph ending `matching the wild-grape board.`, add:
   ```

   Poison copy (heading "This one is poisonous"), rendered as heading, the model's
   `poison_line`, then:

   > Don't eat, taste or handle it on the strength of an app. Keep children and pets
   > away from it. If someone may have swallowed some, call Poison Control
   > (1-800-222-1222 in the US) right away.
   ```
6. After the bullet `- Edible or medicinal: set the flag, never headline above likely, never imply` and its
   continuation line `safety to eat.`, add:
   ```
   - Poisonous (p2): set the flag and name the poisonous parts in `poison_line`; never
     imply any part is safe to eat, taste or touch.
   ```

- [ ] **Step 5: Amend the product spec**

Use the Edit tool on `docs/product-spec.md`:

1. After the sentence ending `note the contamination risks of roadside plants.` (§2, Discovery and
   learning flow), add on the same line: ` For anything poisonous, the same fixed block names the poison specifically: which parts, and how it harms.`
2. After `always carry the safety block.` (§8, the "Edible or medicinal finds are capped" bullet), add
   on the same line: ` Poisonous finds always carry it too, headed "This one is poisonous" with the specific poison named; the cap stays edible-only, so "Poison ivy" can still be stated with confidence.`

- [ ] **Step 6: Final checks**

Run: `cd proxy && npm test && npm run typecheck` and `git status --short`.
Expected: all pass; only the two docs and the ledger are modified; nothing under `proxy/eval/photos/`,
`proxy/eval/runs/` or `proxy/eval/manifest.json` is staged or tracked.

- [ ] **Step 7: Commit, push, open the PR**

Update the ledger (Edit tool): Task 4 entry with the Step 2 table, the Step 3 result, and under
"Needs Chase": confirm the poison copy wording; rerun and judge the full 30 on p2
(`npm run eval:run -- --vendors anthropic,openai`, then `eval:review`, then
`eval:summary -- --compare 2026-10-10T19-46-58-114Z-p1-no-google`). Mark Batch B `needs_chase`.

```bash
git add docs/superpowers/specs/2026-10-10-answer-card-design.md docs/product-spec.md docs/superpowers/plans/2026-10-10-poison-callout-ledger.md
git commit -m "docs: poisonous finds get a specific safety block (answer-card spec, product spec)"
git push
gh pr create --base main --title "feat(card): call out poisonous finds specifically (prompt p2)" --body "<summary of the change, the Step 2 table, and the Needs Chase items>"
```
