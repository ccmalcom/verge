# Answer Card (Sub-project 1) Implementation Plan

> **For agentic workers:** Execute with the saved workflow `.claude/workflows/execute-plan.js`
> (args: this plan's path and the ledger path below). It runs one fresh agent per batch
> and a review gate after each. Inside a batch, follow superpowers:executing-plans for
> your batch's tasks only. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local proxy that turns a photo and/or note into a guarded, schema-valid answer
card from any of three cloud vendors (plus Apple on-device/PCC in the harness), and an eval
harness that runs Chase's photos through every vendor and lets him judge the cards blind.

**Architecture:** `proxy/` is its own Node ESM package. Pure modules (`schema`, `enforce`,
`context`, `prompt`) define and guard the card. A `Generator` seam (`generate.ts`) hides the
vendor: the AI SDK implementation serves the three cloud vendors, and a harness-only `fm` CLI
adapter serves Apple. `runAsk` is the shared pipeline: validate → prompt → generate (one retry)
→ enforce. A Web-standard fetch handler wraps it for Vercel. The harness in `proxy/eval/`
scaffolds a manifest, drives the handler over local HTTP, and serves a review page.

**Tech Stack:** Node ≥ 22.12, TypeScript ^6 (NodeNext), `ai` 7 + `@ai-sdk/{anthropic,openai,google}` 4,
`zod` 4, `vitest` 5 (+ `vite`), `tsx`, `srvx`, `sharp` 0.35, `exifr` 7.

**Spec:** `docs/superpowers/specs/2026-10-10-answer-card-design.md` (roadmap:
`docs/superpowers/specs/2026-10-10-verge-roadmap.md`).

**Ledger:** `docs/superpowers/plans/2026-10-10-answer-card-ledger.md`. Update it after every task.

## Execution

- **Branch:** `feat/answer-card`. If it does not exist on origin, create it:
  ```bash
  git fetch origin
  if git merge-base --is-ancestor origin/docs/answer-card-spec origin/main; then base=origin/main; else base=origin/docs/answer-card-spec; fi
  git switch -c feat/answer-card "$base" && git push -u origin feat/answer-card
  ```
  If it exists: `git switch feat/answer-card && git pull --ff-only`.
- **Batches** (one fresh session/agent each; stop after your batch):

  | Batch | Tasks | Theme |
  |---|---|---|
  | A | 1, 2 | package scaffold, card schema, context, guardrails |
  | B | 3, 4, 5 | prompts, providers + generator, ask pipeline + handler |
  | C | 6, 7 | image prep + manifest scaffold, Apple `fm` adapter |
  | D | 8, 9 | retention + run command, review page |
  | E | 10, 11 | summary + export, live smoke + real flow + PR |

- After each task: `cd proxy && npm test && npm run typecheck` must pass, then commit (explicit
  paths), push, and update the ledger (what was done, how it was verified, anything deferred and
  why, next task). Commit and push the ledger with the task.
- Anything only Chase can supply (API key values, his photos, his Mac) goes under "Needs Chase"
  in the ledger; finish everything else and report `needs_chase`.

## Global Constraints

- All new code lives in `proxy/` (its own package, `"type": "module"`). The Expo app at the repo
  root is untouched except: root `tsconfig.json` gains `"exclude": ["proxy", "node_modules"]`, and
  root `.gitignore` gains the eval data paths.
- Install proxy dependencies with `npm install` inside `proxy/` (not `npx expo install`; that is
  for the app).
- TypeScript `module`/`moduleResolution` are `NodeNext`: relative imports end in `.js`
  (e.g. `import { x } from './card/schema.js'`).
- AI SDK v7 API only: `generateText({ instructions, messages, output: Output.object({ schema, name }) })`,
  read `result.output`; images as `{ type: 'file', mediaType: 'image/jpeg', data }`. Never
  `generateObject`, never `system`, never `{ type: 'image' }`.
- Model-facing Zod schemas are flat, every key required, `.nullable()` instead of `.optional()`,
  no unions (OpenAI strict mode). Length rules are checked in our code, not the schema.
- Confidence vocabulary is exactly `confident | likely | unsure | cant_tell`. Never a number.
- Lens enum is exactly `nature | built | history | light_weather | signs_people | surprise`.
- Class enum is exactly `plant | fungus | animal | insect | building | infrastructure | sign_or_art | geology | other`.
- Edible/medicinal cards are capped at `likely` and carry the fixed safety copy, enforced in
  `enforce.ts` regardless of model output.
- Location is rounded to 3 decimals (~100 m) server-side. The proxy stores nothing and logs no
  image, note, question or location: only vendor, model, status, latency, token counts.
- Secrets: never read, print or log values from `proxy/.env.local`. Check presence with
  `hasKey()` (Task 8) only. Tests use synthetic fixtures (images generated with sharp), never
  Chase's photos. Never commit `proxy/eval/photos/`, `proxy/eval/manifest.json`, `proxy/eval/runs/`.
- Retention: unscored runs pruned when older than 14 days or outside the newest 10 unscored;
  scored runs (with `scores.json`) are never pruned automatically.
- Image limit: 600 KB decoded (`600 * 1024` bytes). Harness resizes to 1000 px long edge, JPEG q80,
  metadata stripped.
- Git: plain commit messages, no `Co-Authored-By` trailer; stage explicit paths; push after
  every commit.

## Review Focus

Inputs the spec implies but no happy-path test exercises; each has a test in its owning task.

1. **iPhone HEIC photos dropped in `photos/`**: scaffold warns with how to export JPEG and skips them; never crashes (Task 6, `warns and skips HEIC`).
2. **A photo with no EXIF date or GPS** (screenshot, AirDrop, edited): `taken_at` falls back to file mtime, location is null, only the without-location variant runs (Task 6 `falls back to mtime`, Task 8 `skips with-variant when no location`).
3. **A vendor rate-limits or fails mid-run**: that record gets a non-200 status with the detail; the run continues and still writes results (Task 5 `vendor error → 502`, Task 8 `records a failed request and keeps going`).
4. **Model returns no follow-ups, or more than three**: trimmed to three; the deeper call is skipped when there are none (Task 2 `trims follow_ups`, Task 8 `skips deeper when no follow-ups`).
5. **Reopening a partially scored run, or changing a verdict**: saved scores come back on reload; a change overwrites rather than duplicates; `null` clears it (Task 9 `persists and overwrites scores`).

---

## Batch A

### Task 1: Proxy package scaffold and card schema

**Files:**
- Create: `proxy/package.json`, `proxy/tsconfig.json`, `proxy/vitest.config.ts`, `proxy/.env.local.example`
- Create: `proxy/src/card/schema.ts`
- Create: `proxy/test/fixtures.ts`, `proxy/test/schema.test.ts`
- Modify: `tsconfig.json` (root), `.gitignore` (root)

**Interfaces:**
- Consumes: nothing.
- Produces (from `proxy/src/card/schema.ts`):
  - `CLASSES`, `LENSES`, `CONFIDENCES`, `CLOUD_VENDORS` (readonly tuples) and types `CardClass`, `Lens`, `Confidence`, `CloudVendor`
  - `TierOneOutput` (Zod) + `type TierOneOutput`; `DeeperOutput` (Zod) + `type DeeperOutput`
  - `TIER2_LABELS: Record<Confidence, string>`
  - `Safety` type `{ heading: string; lead: string; rest: string; lookalike_line: string | null }`
  - `EnforcedCard` (Zod) + `type EnforcedCard` = TierOneOutput + `tier2_label: string` + `safety: Safety | null`
  - `AskContext` (Zod) + `type AskContext`; `AskRequest` (Zod) + `type AskRequest`
  - `type AskMeta`, `type AskError`, `type AskResponse`
- Produces (from `proxy/test/fixtures.ts`): `validTierOne(overrides?)`, `validContext(overrides?)`

- [ ] **Step 1: Create the package and install dependencies**

`proxy/package.json`:
```json
{
  "name": "verge-proxy",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.12" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "smoke": "vitest run --config vitest.smoke.config.ts",
    "eval:scaffold": "tsx eval/scaffold.ts",
    "eval:run": "tsx eval/run.ts",
    "eval:review": "tsx eval/review/server.ts",
    "eval:summary": "tsx eval/summary.ts",
    "eval:export": "tsx eval/export.ts"
  }
}
```

Run:
```bash
cd proxy
npm install ai@^7.0.137 @ai-sdk/anthropic@^4 @ai-sdk/openai@^4 @ai-sdk/google@^4 zod@^4.6.5
npm install -D typescript@^6 vitest@^5.0.3 vite tsx@^4 srvx@^1.0.5 sharp@^0.35.5 exifr@^7.1.3 @types/node@^22
```
Expected: both succeed; `package.json` gains `dependencies` and `devDependencies`; `package-lock.json` created.

`proxy/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowJs": true,
    "checkJs": false,
    "types": ["node"]
  },
  "include": ["api", "src", "eval", "test", "*.ts"]
}
```

`proxy/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/smoke/**'],
  },
});
```

`proxy/.env.local.example`:
```
# Copy to .env.local and fill in the values yourself. .env.local is gitignored.
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
CARD_VENDOR=anthropic
```

Root `tsconfig.json` becomes:
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true
  },
  "exclude": ["proxy", "node_modules"]
}
```

Append to root `.gitignore`:
```
# proxy eval data (private photos, neighborhood GPS, run outputs)
proxy/eval/photos/
proxy/eval/manifest.json
proxy/eval/runs/
```

- [ ] **Step 2: Write the fixtures and the failing schema tests**

`proxy/test/fixtures.ts`:
```ts
import type { AskContext, TierOneOutput } from '../src/card/schema.js';

export function validTierOne(overrides: Partial<TierOneOutput> = {}): TierOneOutput {
  return {
    class: 'plant',
    lens: 'nature',
    confidence: 'confident',
    headline: 'Common mullein',
    summary: 'The felted grey rosette is hard to mistake. It grows in disturbed ground all over the Midwest.',
    tier2_body: 'Feel a leaf: mullein is soft as flannel on both sides.',
    help_asks: null,
    edible_or_medicinal: false,
    lookalike_line: null,
    follow_ups: ['Why does it grow in gravel?', 'What used to use these leaves?'],
    ...overrides,
  };
}

export function validContext(overrides: Partial<AskContext> = {}): AskContext {
  return { date: '2026-10-10', ...overrides };
}
```

`proxy/test/schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AskRequest, TIER2_LABELS, TierOneOutput } from '../src/card/schema.js';
import { validContext, validTierOne } from './fixtures.js';

describe('TierOneOutput', () => {
  it('accepts a valid card', () => {
    expect(TierOneOutput.safeParse(validTierOne()).success).toBe(true);
  });

  it('rejects an unknown class', () => {
    expect(TierOneOutput.safeParse({ ...validTierOne(), class: 'mineral' }).success).toBe(false);
  });

  it('rejects a numeric confidence', () => {
    expect(TierOneOutput.safeParse({ ...validTierOne(), confidence: 0.9 }).success).toBe(false);
  });

  it('requires every key (nullable, never optional)', () => {
    const { help_asks: _omit, ...rest } = validTierOne();
    expect(TierOneOutput.safeParse(rest).success).toBe(false);
  });

  it('produces a JSON schema with every key required', () => {
    const js = z.toJSONSchema(TierOneOutput) as { required: string[] };
    expect([...js.required].sort()).toEqual(Object.keys(validTierOne()).sort());
  });
});

describe('TIER2_LABELS', () => {
  it('labels each confidence', () => {
    expect(TIER2_LABELS).toEqual({
      confident: 'What to look for',
      likely: 'What would settle it',
      unsure: 'How to tell them apart',
      cant_tell: 'What would help',
    });
  });
});

describe('AskRequest', () => {
  it('accepts a note-only card request', () => {
    expect(AskRequest.safeParse({ kind: 'card', note: 'hawk on a steeple', context: validContext() }).success).toBe(true);
  });

  it('rejects a date that is not ISO', () => {
    expect(AskRequest.safeParse({ kind: 'card', note: 'x', context: { date: '10/10/2026' } }).success).toBe(false);
  });

  it('rejects an out-of-range latitude', () => {
    const ctx = validContext({ approx_location: { lat: 123, lng: 0 } });
    expect(AskRequest.safeParse({ kind: 'card', note: 'x', context: ctx }).success).toBe(false);
  });

  it('tolerates an unknown vendor string (the handler decides what to honour)', () => {
    expect(AskRequest.safeParse({ kind: 'card', note: 'x', context: validContext(), vendor: 'apple-device' }).success).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd proxy && npx vitest run test/schema.test.ts`
Expected: FAIL, cannot resolve `../src/card/schema.js`.

- [ ] **Step 4: Implement the schema**

`proxy/src/card/schema.ts`:
```ts
import { z } from 'zod';

export const CLASSES = ['plant', 'fungus', 'animal', 'insect', 'building', 'infrastructure', 'sign_or_art', 'geology', 'other'] as const;
export const LENSES = ['nature', 'built', 'history', 'light_weather', 'signs_people', 'surprise'] as const;
export const CONFIDENCES = ['confident', 'likely', 'unsure', 'cant_tell'] as const;
export const CLOUD_VENDORS = ['anthropic', 'openai', 'google'] as const;

export type CardClass = (typeof CLASSES)[number];
export type Lens = (typeof LENSES)[number];
export type Confidence = (typeof CONFIDENCES)[number];
export type CloudVendor = (typeof CLOUD_VENDORS)[number];

// What the model produces. Flat, every key required, nullable instead of optional
// (OpenAI strict structured outputs reject optional properties).
export const TierOneOutput = z.object({
  class: z.enum(CLASSES),
  lens: z.enum(LENSES),
  confidence: z.enum(CONFIDENCES),
  headline: z.string(),
  summary: z.string(),
  tier2_body: z.string(),
  help_asks: z.array(z.string()).nullable(),
  edible_or_medicinal: z.boolean(),
  lookalike_line: z.string().nullable(),
  follow_ups: z.array(z.string()),
});
export type TierOneOutput = z.infer<typeof TierOneOutput>;

export const DeeperOutput = z.object({
  answer: z.string(),
  follow_ups: z.array(z.string()),
});
export type DeeperOutput = z.infer<typeof DeeperOutput>;

// The app picks the tier-2 label from confidence; the model never does.
export const TIER2_LABELS: Record<Confidence, string> = {
  confident: 'What to look for',
  likely: 'What would settle it',
  unsure: 'How to tell them apart',
  cant_tell: 'What would help',
};

const SafetySchema = z.object({
  heading: z.string(),
  lead: z.string(),
  rest: z.string(),
  lookalike_line: z.string().nullable(),
});
export type Safety = z.infer<typeof SafetySchema>;

export const EnforcedCard = TierOneOutput.extend({
  tier2_label: z.string(),
  safety: SafetySchema.nullable(),
});
export type EnforcedCard = z.infer<typeof EnforcedCard>;

export const AskContext = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'date must start with YYYY-MM-DD'),
  prompt_text: z.string().optional(),
  lens: z.enum(LENSES).optional(),
  approx_location: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .optional(),
  neighborhood: z.string().optional(),
});
export type AskContext = z.infer<typeof AskContext>;

// Our own request contract (never sent to a model), so optional is fine here.
export const AskRequest = z.object({
  kind: z.enum(['card', 'deeper']),
  image: z.string().optional(),
  note: z.string().optional(),
  context: AskContext,
  card: EnforcedCard.optional(),
  question: z.string().optional(),
  vendor: z.string().optional(),
});
export type AskRequest = z.infer<typeof AskRequest>;

export type AskMeta = {
  vendor: string;
  model: string;
  prompt_version: string;
  capped: boolean;
  latency_ms: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
};

export type AskError = {
  error: 'bad_request' | 'too_large' | 'invalid_output' | 'vendor_error';
  detail: string;
};

export type AskResponse = { card: EnforcedCard; meta: AskMeta } | { deeper: DeeperOutput; meta: AskMeta };
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd proxy && npm test && npm run typecheck`
Expected: all schema tests PASS; `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add tsconfig.json .gitignore proxy/package.json proxy/package-lock.json proxy/tsconfig.json proxy/vitest.config.ts proxy/.env.local.example proxy/src/card/schema.ts proxy/test/fixtures.ts proxy/test/schema.test.ts
git commit -m "feat(proxy): scaffold proxy package and answer-card schema"
git push
```

### Task 2: Context helpers and deterministic guardrails

**Files:**
- Create: `proxy/src/card/context.ts`, `proxy/src/card/enforce.ts`
- Test: `proxy/test/context.test.ts`, `proxy/test/enforce.test.ts`

**Interfaces:**
- Consumes (Task 1): `TierOneOutput`, `DeeperOutput`, `EnforcedCard`, `AskContext`, `TIER2_LABELS`, `Confidence`; fixtures `validTierOne`, `validContext`.
- Produces (`context.ts`): `type Season = 'winter' | 'spring' | 'summer' | 'autumn'`; `seasonFor(dateIso: string): Season`; `roundCoord(n: number): number`; `roundLocation(loc?: { lat: number; lng: number } | null): { lat: number; lng: number } | null`; `contextText(ctx: AskContext): string`.
- Produces (`enforce.ts`): `SAFETY_HEADING`, `SAFETY_LEAD`, `SAFETY_REST` (strings); `checkCardRules(raw: TierOneOutput): string | null`; `enforceCard(raw: TierOneOutput): { card: EnforcedCard; capped: boolean }`; `enforceDeeper(raw: DeeperOutput): DeeperOutput`.

- [ ] **Step 1: Write the failing tests**

`proxy/test/context.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { contextText, roundLocation, seasonFor } from '../src/card/context.js';
import { validContext } from './fixtures.js';

describe('seasonFor', () => {
  it.each([
    ['2026-01-15', 'winter'],
    ['2026-03-01', 'spring'],
    ['2026-05-31', 'spring'],
    ['2026-06-01', 'summer'],
    ['2026-09-01', 'autumn'],
    ['2026-11-30', 'autumn'],
    ['2026-12-01', 'winter'],
    ['2026-10-10T23:30:00-05:00', 'autumn'],
  ])('%s is %s', (date, season) => {
    expect(seasonFor(date)).toBe(season);
  });
});

describe('roundLocation', () => {
  it('rounds to 3 decimals (~100 m)', () => {
    expect(roundLocation({ lat: 39.756491, lng: -86.146234 })).toEqual({ lat: 39.756, lng: -86.146 });
  });

  it('passes through absence', () => {
    expect(roundLocation(undefined)).toBeNull();
    expect(roundLocation(null)).toBeNull();
  });
});

describe('contextText', () => {
  it('states season and no prompt by default', () => {
    const text = contextText(validContext());
    expect(text).toContain('Season: autumn');
    expect(text).toContain('No prompt is active.');
    expect(text).not.toContain('location');
  });

  it('includes prompt, lens, rounded location and neighborhood when given', () => {
    const text = contextText(
      validContext({
        prompt_text: 'Find three plants growing where nobody planted them.',
        lens: 'nature',
        approx_location: { lat: 39.7564, lng: -86.1462 },
        neighborhood: 'Fountain Square',
      }),
    );
    expect(text).toContain('Find three plants growing where nobody planted them.');
    expect(text).toContain('lens: nature');
    expect(text).toContain('39.756, -86.146');
    expect(text).toContain('Fountain Square');
  });
});
```

`proxy/test/enforce.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { checkCardRules, enforceCard, enforceDeeper, SAFETY_HEADING, SAFETY_LEAD, SAFETY_REST } from '../src/card/enforce.js';
import { validTierOne } from './fixtures.js';

describe('enforceCard', () => {
  it('caps an edible confident find at likely and attaches the safety block', () => {
    const { card, capped } = enforceCard(
      validTierOne({ edible_or_medicinal: true, confidence: 'confident', lookalike_line: 'Moonseed looks similar and is poisonous.' }),
    );
    expect(capped).toBe(true);
    expect(card.confidence).toBe('likely');
    expect(card.tier2_label).toBe('What would settle it');
    expect(card.safety).toEqual({
      heading: SAFETY_HEADING,
      lead: SAFETY_LEAD,
      rest: SAFETY_REST,
      lookalike_line: 'Moonseed looks similar and is poisonous.',
    });
  });

  it('attaches the safety block to an edible find even when not capped', () => {
    const { card, capped } = enforceCard(validTierOne({ edible_or_medicinal: true, confidence: 'unsure' }));
    expect(capped).toBe(false);
    expect(card.safety?.lead).toBe(SAFETY_LEAD);
  });

  it('has no safety block and drops a stray lookalike line on a non-edible find', () => {
    const { card } = enforceCard(validTierOne({ lookalike_line: 'stray' }));
    expect(card.safety).toBeNull();
    expect(card.lookalike_line).toBeNull();
  });

  it.each([
    ['confident', 'What to look for'],
    ['likely', 'What would settle it'],
    ['unsure', 'How to tell them apart'],
  ] as const)('derives the %s label', (confidence, label) => {
    expect(enforceCard(validTierOne({ confidence })).card.tier2_label).toBe(label);
  });

  it('keeps help_asks only for cant_tell', () => {
    const asks = ['A shot from above', 'A note on size'];
    expect(enforceCard(validTierOne({ confidence: 'cant_tell', help_asks: asks })).card.help_asks).toEqual(asks);
    expect(enforceCard(validTierOne({ confidence: 'likely', help_asks: asks })).card.help_asks).toBeNull();
  });

  it('trims follow_ups to three', () => {
    const { card } = enforceCard(validTierOne({ follow_ups: ['a', 'b', 'c', 'd', 'e'] }));
    expect(card.follow_ups).toEqual(['a', 'b', 'c']);
  });
});

describe('checkCardRules', () => {
  it('requires exactly two help_asks for cant_tell', () => {
    expect(checkCardRules(validTierOne({ confidence: 'cant_tell', help_asks: null }))).toMatch(/help_asks/);
    expect(checkCardRules(validTierOne({ confidence: 'cant_tell', help_asks: ['one'] }))).toMatch(/help_asks/);
    expect(checkCardRules(validTierOne({ confidence: 'cant_tell', help_asks: ['one', 'two'] }))).toBeNull();
  });

  it('passes a normal card', () => {
    expect(checkCardRules(validTierOne())).toBeNull();
  });
});

describe('enforceDeeper', () => {
  it('trims follow_ups to three', () => {
    expect(enforceDeeper({ answer: 'x', follow_ups: ['a', 'b', 'c', 'd'] }).follow_ups).toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd proxy && npx vitest run test/context.test.ts test/enforce.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement context.ts**

`proxy/src/card/context.ts`:
```ts
import type { AskContext } from './schema.js';

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

// Northern-hemisphere meteorological seasons, read from the date as written
// (YYYY-MM...), so a local timestamp never shifts month through UTC conversion.
export function seasonFor(dateIso: string): Season {
  const month = Number(dateIso.slice(5, 7));
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

export function roundCoord(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function roundLocation(loc?: { lat: number; lng: number } | null): { lat: number; lng: number } | null {
  return loc ? { lat: roundCoord(loc.lat), lng: roundCoord(loc.lng) } : null;
}

export function contextText(ctx: AskContext): string {
  const lines = [`Season: ${seasonFor(ctx.date)} (date ${ctx.date.slice(0, 10)}).`];
  if (ctx.prompt_text) {
    lines.push(`Active prompt: "${ctx.prompt_text}"${ctx.lens ? ` (lens: ${ctx.lens})` : ''}.`);
  } else {
    lines.push('No prompt is active.');
  }
  const loc = roundLocation(ctx.approx_location);
  if (loc) lines.push(`Approximate location, rounded to about 100 m: ${loc.lat}, ${loc.lng}.`);
  if (ctx.neighborhood) lines.push(`Neighborhood: ${ctx.neighborhood}.`);
  return lines.join('\n');
}
```

- [ ] **Step 4: Implement enforce.ts**

`proxy/src/card/enforce.ts`:
```ts
import { TIER2_LABELS, type DeeperOutput, type EnforcedCard, type TierOneOutput } from './schema.js';

// Fixed copy. The model cannot alter or suppress it. The model's lookalike_line
// renders between SAFETY_LEAD and SAFETY_REST (design board: wild grape).
export const SAFETY_HEADING = 'Before you taste anything';
export const SAFETY_LEAD = "Don't eat or use anything on the strength of an app.";
export const SAFETY_REST =
  "This is a starting point, not a safe-to-eat verdict. A photo can't tell ripe from unripe or sprayed from unsprayed. If foraging interests you, a local guide or the county extension office is the next step.";

const MAX_FOLLOW_UPS = 3;

// Rules the JSON schema cannot express. A non-null result fails the attempt.
export function checkCardRules(raw: TierOneOutput): string | null {
  if (raw.confidence === 'cant_tell' && (!raw.help_asks || raw.help_asks.length !== 2)) {
    return 'cant_tell requires exactly two help_asks';
  }
  return null;
}

export function enforceCard(raw: TierOneOutput): { card: EnforcedCard; capped: boolean } {
  const capped = raw.edible_or_medicinal && raw.confidence === 'confident';
  const confidence = capped ? 'likely' : raw.confidence;
  const lookalike = raw.edible_or_medicinal ? raw.lookalike_line : null;
  return {
    capped,
    card: {
      ...raw,
      confidence,
      help_asks: confidence === 'cant_tell' ? raw.help_asks : null,
      lookalike_line: lookalike,
      follow_ups: raw.follow_ups.slice(0, MAX_FOLLOW_UPS),
      tier2_label: TIER2_LABELS[confidence],
      safety: raw.edible_or_medicinal
        ? { heading: SAFETY_HEADING, lead: SAFETY_LEAD, rest: SAFETY_REST, lookalike_line: lookalike }
        : null,
    },
  };
}

export function enforceDeeper(raw: DeeperOutput): DeeperOutput {
  return { answer: raw.answer, follow_ups: raw.follow_ups.slice(0, MAX_FOLLOW_UPS) };
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd proxy && npm test && npm run typecheck`
Expected: all PASS; `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add proxy/src/card/context.ts proxy/src/card/enforce.ts proxy/test/context.test.ts proxy/test/enforce.test.ts
git commit -m "feat(proxy): add context helpers and deterministic card guardrails"
git push
```

**End of Batch A.** Update the ledger (batch A done) and stop.

---

## Batch B

### Task 3: Card prompts

**Files:**
- Create: `proxy/src/card/prompt.ts`
- Test: `proxy/test/prompt.test.ts`

**Interfaces:**
- Consumes: `AskContext`, `EnforcedCard` (Task 1); `contextText` (Task 2); fixtures `validContext`, `validTierOne`; `enforceCard` (Task 2).
- Produces: `PROMPT_VERSION: string` (`'p1'`); `TIER1_INSTRUCTIONS: string`; `DEEPER_INSTRUCTIONS: string`; `tierOneUserText(ctx: AskContext, note: string | undefined, hasImage: boolean): string`; `deeperUserText(ctx: AskContext, card: EnforcedCard, question: string, note: string | undefined, hasImage: boolean): string`.

- [ ] **Step 1: Write the failing tests**

`proxy/test/prompt.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { enforceCard } from '../src/card/enforce.js';
import { DEEPER_INSTRUCTIONS, PROMPT_VERSION, TIER1_INSTRUCTIONS, deeperUserText, tierOneUserText } from '../src/card/prompt.js';
import { CLASSES, CONFIDENCES, LENSES } from '../src/card/schema.js';
import { validContext, validTierOne } from './fixtures.js';

describe('prompts', () => {
  it('has a versioned id', () => {
    expect(PROMPT_VERSION).toMatch(/^p\d+$/);
  });

  it('names every class, lens and confidence state', () => {
    for (const word of [...CLASSES, ...LENSES, ...CONFIDENCES]) expect(TIER1_INSTRUCTIONS).toContain(word);
  });

  it('forbids numeric confidence and keeps edible finds at likely', () => {
    expect(TIER1_INSTRUCTIONS).toMatch(/never express confidence as a number/i);
    expect(TIER1_INSTRUCTIONS).toMatch(/at most likely/i);
  });

  it('forbids URLs in deeper answers', () => {
    expect(DEEPER_INSTRUCTIONS).toMatch(/never include urls/i);
  });
});

describe('tierOneUserText', () => {
  it('describes a photo capture with context and note', () => {
    const text = tierOneUserText(validContext({ neighborhood: 'Near home' }), 'by the bakery', true);
    expect(text).toContain('Season: autumn');
    expect(text).toContain('A photo is attached.');
    expect(text).toContain('"by the bakery"');
    expect(text).toContain('Near home');
  });

  it('marks a note-only capture', () => {
    expect(tierOneUserText(validContext(), 'hawk on the steeple', false)).toContain('No photo');
  });
});

describe('deeperUserText', () => {
  it('carries the card and the question', () => {
    const { card } = enforceCard(validTierOne());
    const text = deeperUserText(validContext(), card, 'Why does it grow in gravel?', undefined, true);
    expect(text).toContain('Common mullein');
    expect(text).toContain('"Why does it grow in gravel?"');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd proxy && npx vitest run test/prompt.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement prompt.ts**

`proxy/src/card/prompt.ts`:
```ts
import { contextText } from './context.js';
import type { AskContext, EnforcedCard } from './schema.js';

// Bump on every change to the instructions or user text so runs can be compared.
export const PROMPT_VERSION = 'p1';

export const TIER1_INSTRUCTIONS = `You write the answer card for Verge, an app that helps people notice and understand things on walks in their own neighborhood. Someone captured a find (a photo, a note, or both) and asked "what is this?".

Work in this order:
1. Classify the find as exactly one of: plant, fungus, animal, insect, building, infrastructure, sign_or_art, geology, other.
2. Pick the lens it belongs to: nature, built, history, light_weather, signs_people, surprise.
3. Decide confidence as exactly one of four states:
   - confident: you would stake the name on it. Distinguishing features are visible and nothing common looks the same.
   - likely: the best fit is clear, but one feature that would settle it is not visible, or a lookalike exists.
   - unsure: two or three candidates, none favored.
   - cant_tell: the capture does not contain the information. This is a true statement about the capture, not a failure.
   Never express confidence as a number, percentage or probability, and never use other confidence words such as "high confidence", "probably" or "definitely".
4. Write the card.

Voice, by confidence:
- confident: state the name, then why. "Common mullein. The felted grey rosette is hard to mistake."
- likely: name it and name the doubt in the same breath. "Likely Virginia creeper. Poison ivy has three leaflets; count yours."
- unsure: offer the candidates as a choice the walker can make. "Bricked-in window, or a doorway that was never one. Here's how you'd tell."
- cant_tell: say what you can see, then exactly what would help. Never apologize. "A moth, wings closed. Wing pattern is how moths are told apart."

Guidance by class:
- plant, fungus: lead with identity, then the distinguishing features that settle it.
- building, infrastructure: say what the visible evidence suggests about age and use. Keep three things separate: what is visible; what is typical for that kind of structure in this region and era; what it would take to verify a claim about this particular place. Never state a construction date or a prior use as fact.
- sign_or_art: say what is depicted. Never attribute an artist, maker or date unless the capture itself shows it (a signature, a plaque).
- animal, insect, geology, other: identity, then the one or two features that tell it apart.

Fields:
- headline: name-first and short, in the voice of your confidence. For likely, begin with "Likely". For unsure, name the candidates. For cant_tell, name it at the level you can tell ("A moth, resting with its wings closed").
- summary: at most two sentences. Specific to this find, interesting, plain words.
- tier2_body: the teaching. confident: how to know it next time without the app. likely: the one feature that would settle it. unsure: a comparison, this if X, that if Y. cant_tell: what the capture does show and why the missing detail matters.
- help_asks: only for cant_tell, exactly two concrete things the walker could capture next ("A shot from directly above, if it opens its wings"; "A note on size: bigger than a quarter, or smaller?"). For every other confidence, null.
- edible_or_medicinal: true if people eat, forage or use this kind of thing medicinally, including fruit, nuts, seeds, leaves, mushrooms, and anything foraged that has a poisonous lookalike. Otherwise false.
- lookalike_line: when edible_or_medicinal is true and a dangerous lookalike exists, one sentence naming it and how it differs ("Lookalikes exist: for grape, that's moonseed, which is poisonous and grows in the same places."). Otherwise null.
- follow_ups: up to three short questions a curious companion would ask next about this find (why it grows there, what eats it, what it was used for). Not quiz questions, not instructions.

Safety, always:
- If edible_or_medicinal is true, confidence is at most likely, even when you are sure. Never imply the find is safe to eat, taste or use. Never give preparation or dosage.
- Never suggest trespassing, handling wildlife, or entering roads, railways, water or abandoned structures.

If there is no photo, treat the note like a photo you cannot see: unsure or cant_tell is often right, and that is fine.
Use the context (season, active prompt, approximate location, neighborhood) only to inform the identification. Never mention coordinates.
Keep every field short. No markdown, no lists inside fields, no emoji.`;

export const DEEPER_INSTRUCTIONS = `You are continuing a conversation about one find captured on a neighborhood walk in Verge. You have the capture, the answer card already shown to the walker, and their question.

- Answer only about this find and things directly connected to it. If the question is unrelated, say in one sentence that you can only talk about this find, and offer follow-ups that are about it.
- Write like a curious, knowledgeable companion: specific, warm, plain words. At most three short paragraphs separated by blank lines. No markdown, no bullet lists, no emoji.
- Separate what is known in general from claims about this particular place. Never state a construction date, prior use, maker or artist as fact; say what would verify it (a cornerstone, a county record, a plaque).
- Never include URLs, and never cite sources you cannot see.
- If the card marked the find edible or medicinal, never say or imply it is safe to eat, taste or use, and never give preparation or dosage. History, ecology and cultural uses are fine.
- Do not become more certain than the card unless the question adds new evidence.
- follow_ups: up to three new questions worth asking next.`;

function captureLines(ctx: AskContext, note: string | undefined, hasImage: boolean): string[] {
  const lines = [contextText(ctx), hasImage ? 'A photo is attached.' : 'No photo: this is a note-only capture.'];
  if (note) lines.push(`The walker's note: "${note}"`);
  return lines;
}

export function tierOneUserText(ctx: AskContext, note: string | undefined, hasImage: boolean): string {
  return [...captureLines(ctx, note, hasImage), 'What is this?'].join('\n');
}

export function deeperUserText(
  ctx: AskContext,
  card: EnforcedCard,
  question: string,
  note: string | undefined,
  hasImage: boolean,
): string {
  const shown = {
    class: card.class,
    confidence: card.confidence,
    headline: card.headline,
    summary: card.summary,
    tier2_body: card.tier2_body,
    edible_or_medicinal: card.edible_or_medicinal,
  };
  return [
    ...captureLines(ctx, note, hasImage),
    `The card already shown (JSON): ${JSON.stringify(shown)}`,
    `The walker's question: "${question}"`,
  ].join('\n');
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `cd proxy && npm test && npm run typecheck`
Expected: all PASS; `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add proxy/src/card/prompt.ts proxy/test/prompt.test.ts
git commit -m "feat(proxy): add versioned tier-1 and deeper card prompts"
git push
```

### Task 4: Providers and the AI SDK generator

**Files:**
- Create: `proxy/src/providers.ts`, `proxy/src/generate.ts`
- Test: `proxy/test/providers.test.ts`, `proxy/test/generate.test.ts`

**Interfaces:**
- Consumes: `CloudVendor`, `TierOneOutput` (Task 1); fixture `validTierOne`.
- Produces (`providers.ts`): `MODELS: Record<CloudVendor, { tier1: string; deeper: string }>`; `PRICES_PER_MTOK: Record<string, { input: number; output: number }>`; `KEY_ENV: Record<CloudVendor, string>`; `languageModel(vendor: CloudVendor, tier: Tier): LanguageModel`; `estimateCostUsd(model: string, usage: { inputTokens: number | null; outputTokens: number | null }): number | null`.
- Produces (`generate.ts`): `type Tier = 'tier1' | 'deeper'`; `type UserContent = { text: string; image?: Uint8Array }`; `type GenerateArgs<T> = { tier: Tier; instructions: string; user: UserContent; schema: z.ZodType<T>; schemaName: string }`; `type GenerateResult<T> = { output: T; model: string; usage: { inputTokens: number | null; outputTokens: number | null } }`; `type Generator = <T>(args: GenerateArgs<T>) => Promise<GenerateResult<T>>`; `class InvalidOutputError extends Error`; `class VendorError extends Error`; `aiSdkGenerator(vendor: CloudVendor, opts?: { modelFor?: (tier: Tier) => LanguageModel; maxRetries?: number; timeoutMs?: number }): Generator`.

- [ ] **Step 1: Write the failing tests**

`proxy/test/providers.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CLOUD_VENDORS } from '../src/card/schema.js';
import { estimateCostUsd, KEY_ENV, MODELS, PRICES_PER_MTOK } from '../src/providers.js';

describe('providers', () => {
  it('has both tiers and a price for every cloud vendor', () => {
    for (const v of CLOUD_VENDORS) {
      expect(MODELS[v].tier1).toBeTruthy();
      expect(MODELS[v].deeper).toBeTruthy();
      expect(PRICES_PER_MTOK[MODELS[v].tier1]).toBeDefined();
      expect(PRICES_PER_MTOK[MODELS[v].deeper]).toBeDefined();
      expect(KEY_ENV[v]).toMatch(/_API_KEY$/);
    }
  });

  it('estimates cost from usage', () => {
    // claude-haiku-5-5: $0.10 in / $0.50 out per 1M tokens
    expect(estimateCostUsd('claude-haiku-5-5', { inputTokens: 2000, outputTokens: 400 })).toBeCloseTo(0.0004, 10);
  });

  it('returns null when usage or price is unknown, and 0 for free models', () => {
    expect(estimateCostUsd('claude-haiku-5-5', { inputTokens: null, outputTokens: 10 })).toBeNull();
    expect(estimateCostUsd('no-such-model', { inputTokens: 1, outputTokens: 1 })).toBeNull();
    expect(estimateCostUsd('apple-on-device', { inputTokens: null, outputTokens: null })).toBe(0);
  });
});
```

`proxy/test/generate.test.ts`:
```ts
import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { TierOneOutput } from '../src/card/schema.js';
import { aiSdkGenerator, InvalidOutputError, VendorError } from '../src/generate.js';
import { validTierOne } from './fixtures.js';

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

function mockReturning(text: string) {
  return new MockLanguageModelV4({
    doGenerate: { content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] },
  });
}

const args = (image?: Uint8Array) => ({
  tier: 'tier1' as const,
  instructions: 'You write cards.',
  user: { text: 'What is this?', image },
  schema: TierOneOutput,
  schemaName: 'answer_card',
});

describe('aiSdkGenerator', () => {
  it('returns the parsed object, the table model id and usage', async () => {
    const model = mockReturning(JSON.stringify(validTierOne()));
    const gen = aiSdkGenerator('anthropic', { modelFor: () => model, maxRetries: 0 });
    const out = await gen(args());
    expect(out.output).toEqual(validTierOne());
    expect(out.model).toBe('claude-haiku-5-5');
    expect(out.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
  });

  it('sends the image as a jpeg file part', async () => {
    const model = mockReturning(JSON.stringify(validTierOne()));
    const gen = aiSdkGenerator('openai', { modelFor: () => model, maxRetries: 0 });
    await gen(args(new Uint8Array([0xff, 0xd8, 0xff])));
    const prompt = model.doGenerateCalls[0].prompt as Array<{ role: string; content: unknown }>;
    const user = prompt.find((m) => m.role === 'user');
    const parts = user?.content as Array<{ type: string; mediaType?: string }>;
    expect(parts.some((p) => p.type === 'file' && p.mediaType === 'image/jpeg')).toBe(true);
  });

  it('maps schema-invalid output to InvalidOutputError', async () => {
    const model = mockReturning('{"class":"mineral"}');
    const gen = aiSdkGenerator('google', { modelFor: () => model, maxRetries: 0 });
    await expect(gen(args())).rejects.toBeInstanceOf(InvalidOutputError);
  });

  it('maps a provider failure to VendorError', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({ message: 'overloaded', url: 'x', requestBodyValues: {}, statusCode: 529, isRetryable: true });
      },
    });
    const gen = aiSdkGenerator('anthropic', { modelFor: () => model, maxRetries: 0 });
    await expect(gen(args())).rejects.toBeInstanceOf(VendorError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd proxy && npx vitest run test/providers.test.ts test/generate.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement providers.ts**

Model IDs and prices were checked against vendor pricing pages on 2026-10-10. OpenAI's deeper
model is its most expensive "flagship" entry, per the spec's "current flagship"; swap it if cost
matters after the first run.

`proxy/src/providers.ts`:
```ts
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { CloudVendor } from './card/schema.js';
import type { Tier } from './generate.js';

export const MODELS: Record<CloudVendor, { tier1: string; deeper: string }> = {
  anthropic: { tier1: 'claude-haiku-5-5', deeper: 'claude-sonnet-5-5' },
  openai: { tier1: 'gpt-6-luna', deeper: 'gpt-6-astra' },
  google: { tier1: 'gemini-3.8-flash', deeper: 'gemini-3.1-pro-preview' },
};

// USD per 1M tokens (input / output), checked 2026-10-10. Prompts here stay far
// below the long-context price tiers. gemini-3.8-flash rises to 1.50 / 7.50 on 2027-01-01.
export const PRICES_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'gpt-6-luna': { input: 0.1, output: 0.5 },
  'gpt-6-astra': { input: 10, output: 50 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-3.1-pro-preview': { input: 2, output: 12 },
  'apple-on-device': { input: 0, output: 0 },
  'apple-pcc': { input: 0, output: 0 },
};

export const KEY_ENV: Record<CloudVendor, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
};

export function languageModel(vendor: CloudVendor, tier: Tier): LanguageModel {
  const id = MODELS[vendor][tier];
  switch (vendor) {
    case 'anthropic':
      return anthropic(id);
    case 'openai':
      return openai(id);
    case 'google':
      return google(id);
  }
}

export function estimateCostUsd(
  model: string,
  usage: { inputTokens: number | null; outputTokens: number | null },
): number | null {
  const price = PRICES_PER_MTOK[model];
  if (!price) return null;
  if (price.input === 0 && price.output === 0) return 0;
  if (usage.inputTokens === null || usage.outputTokens === null) return null;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}
```

- [ ] **Step 4: Implement generate.ts**

`proxy/src/generate.ts`:
```ts
import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output, type LanguageModel } from 'ai';
import type { z } from 'zod';
import type { CloudVendor } from './card/schema.js';
import { languageModel, MODELS } from './providers.js';

export type Tier = 'tier1' | 'deeper';
export type UserContent = { text: string; image?: Uint8Array };
export type GenerateArgs<T> = {
  tier: Tier;
  instructions: string;
  user: UserContent;
  schema: z.ZodType<T>;
  schemaName: string;
};
export type GenerateResult<T> = {
  output: T;
  model: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
};
// The vendor seam. Cloud vendors use aiSdkGenerator; the harness adds an `fm` CLI one.
export type Generator = <T>(args: GenerateArgs<T>) => Promise<GenerateResult<T>>;

// The model answered, but not in the required shape. Worth one retry.
export class InvalidOutputError extends Error {}
// The vendor failed (HTTP error, overload, timeout, network). Not retried by us.
export class VendorError extends Error {}

export function aiSdkGenerator(
  vendor: CloudVendor,
  opts: { modelFor?: (tier: Tier) => LanguageModel; maxRetries?: number; timeoutMs?: number } = {},
): Generator {
  const modelFor = opts.modelFor ?? ((tier: Tier) => languageModel(vendor, tier));
  return async function generate<T>(args: GenerateArgs<T>): Promise<GenerateResult<T>> {
    const content: Array<{ type: 'text'; text: string } | { type: 'file'; mediaType: string; data: Uint8Array }> = [
      { type: 'text', text: args.user.text },
    ];
    if (args.user.image) content.push({ type: 'file', mediaType: 'image/jpeg', data: args.user.image });
    try {
      const result = await generateText({
        model: modelFor(args.tier),
        instructions: args.instructions,
        messages: [{ role: 'user', content }],
        output: Output.object({ schema: args.schema, name: args.schemaName }),
        maxRetries: opts.maxRetries ?? 2,
        timeout: opts.timeoutMs ?? 60_000,
      });
      return {
        output: result.output as T,
        model: MODELS[vendor][args.tier],
        usage: { inputTokens: result.usage.inputTokens ?? null, outputTokens: result.usage.outputTokens ?? null },
      };
    } catch (e) {
      if (NoObjectGeneratedError.isInstance(e) || NoOutputGeneratedError.isInstance(e)) {
        throw new InvalidOutputError(e.message);
      }
      throw new VendorError(e instanceof Error ? e.message : String(e));
    }
  };
}
```

If `tsc` rejects the `content` array type against `generateText`'s message type, type it with
the SDK's exported part types (`TextPart`, `FilePart` from `ai`) instead of the inline union;
do not cast to `any`.

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd proxy && npm test && npm run typecheck`
Expected: all PASS; `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add proxy/src/providers.ts proxy/src/generate.ts proxy/test/providers.test.ts proxy/test/generate.test.ts
git commit -m "feat(proxy): add provider table and AI SDK card generator"
git push
```

### Task 5: Ask pipeline and fetch handler

**Files:**
- Create: `proxy/src/ask.ts`, `proxy/src/handler.ts`, `proxy/api/ask.ts`
- Create: `proxy/test/fakes.ts`
- Test: `proxy/test/ask.test.ts`, `proxy/test/handler.test.ts`

**Interfaces:**
- Consumes: Task 1 schema (`AskRequest`, `TierOneOutput`, `DeeperOutput`, `CLOUD_VENDORS`, `CloudVendor`, `AskError`, `AskMeta`, `AskResponse`); Task 2 (`checkCardRules`, `enforceCard`, `enforceDeeper`, `roundLocation`); Task 3 (`PROMPT_VERSION`, `TIER1_INSTRUCTIONS`, `DEEPER_INSTRUCTIONS`, `tierOneUserText`, `deeperUserText`); Task 4 (`Generator`, `GenerateArgs`, `GenerateResult`, `InvalidOutputError`, `VendorError`, `aiSdkGenerator`).
- Produces (`ask.ts`): `MAX_IMAGE_BYTES = 600 * 1024`; `type AskOutcome = { status: 200; body: AskResponse } | { status: 400 | 413 | 422 | 502; body: AskError }`; `type AskDeps = { generate: Generator; vendor: string; now?: () => number }`; `runAsk(input: unknown, deps: AskDeps): Promise<AskOutcome>`.
- Produces (`handler.ts`): `type LogEntry = { vendor: string; model: string | null; status: number; latency_ms: number | null; input_tokens: number | null; output_tokens: number | null }`; `type HandlerDeps = { generatorFor: (vendor: CloudVendor) => Generator; env: Record<string, string | undefined>; log: (entry: LogEntry) => void }`; `createHandler(deps: HandlerDeps): (req: Request) => Promise<Response>`.
- Produces (`test/fakes.ts`): `fakeGenerator(script: Array<unknown | Error>): Generator & { calls: GenerateArgs<unknown>[] }`.
- Produces (`api/ask.ts`): `export default { fetch }` for Vercel.

- [ ] **Step 1: Write the fake generator and the failing tests**

`proxy/test/fakes.ts`:
```ts
import type { GenerateArgs, GenerateResult, Generator } from '../src/generate.js';

// Each call consumes the next scripted item: an Error is thrown, anything else is the output.
export function fakeGenerator(script: Array<unknown | Error>): Generator & { calls: GenerateArgs<unknown>[] } {
  const calls: GenerateArgs<unknown>[] = [];
  const gen = (async (args: GenerateArgs<unknown>): Promise<GenerateResult<unknown>> => {
    calls.push(args);
    const next = script.shift();
    if (next === undefined) throw new Error('fakeGenerator: script exhausted');
    if (next instanceof Error) throw next;
    return { output: next, model: `fake-${args.tier}`, usage: { inputTokens: 100, outputTokens: 50 } };
  }) as Generator & { calls: GenerateArgs<unknown>[] };
  gen.calls = calls;
  return gen;
}
```

`proxy/test/ask.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, runAsk } from '../src/ask.js';
import { enforceCard } from '../src/card/enforce.js';
import { InvalidOutputError, VendorError } from '../src/generate.js';
import { fakeGenerator } from './fakes.js';
import { validContext, validTierOne } from './fixtures.js';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
const deps = (script: Array<unknown | Error>) => ({ generate: fakeGenerator(script), vendor: 'anthropic', now: () => 0 });

describe('runAsk: card', () => {
  it('returns an enforced card with meta', async () => {
    const out = await runAsk({ kind: 'card', image: jpeg, context: validContext() }, deps([validTierOne()]));
    expect(out.status).toBe(200);
    if (out.status !== 200 || !('card' in out.body)) throw new Error('expected card');
    expect(out.body.card.tier2_label).toBe('What to look for');
    expect(out.body.meta).toMatchObject({ vendor: 'anthropic', model: 'fake-tier1', prompt_version: 'p1', capped: false });
  });

  it('reports capped when the edible cap fires', async () => {
    const out = await runAsk({ kind: 'card', note: 'purple berries', context: validContext() }, deps([validTierOne({ edible_or_medicinal: true })]));
    if (out.status !== 200 || !('card' in out.body)) throw new Error('expected card');
    expect(out.body.card.confidence).toBe('likely');
    expect(out.body.meta.capped).toBe(true);
  });

  it('rounds location before it reaches the prompt', async () => {
    const d = deps([validTierOne()]);
    await runAsk({ kind: 'card', note: 'x', context: validContext({ approx_location: { lat: 39.756491, lng: -86.146234 } }) }, d);
    expect(d.generate.calls[0].user.text).toContain('39.756, -86.146');
    expect(d.generate.calls[0].user.text).not.toContain('39.7564');
  });

  it('retries once on invalid output, then succeeds', async () => {
    const out = await runAsk({ kind: 'card', note: 'x', context: validContext() }, deps([new InvalidOutputError('bad json'), validTierOne()]));
    expect(out.status).toBe(200);
  });

  it('retries once when card rules fail, then returns 422', async () => {
    const broken = validTierOne({ confidence: 'cant_tell', help_asks: null });
    const out = await runAsk({ kind: 'card', note: 'x', context: validContext() }, deps([broken, broken]));
    expect(out.status).toBe(422);
    expect(out.body).toMatchObject({ error: 'invalid_output' });
  });

  it('vendor error → 502 without retry', async () => {
    const d = deps([new VendorError('429 rate limited')]);
    const out = await runAsk({ kind: 'card', note: 'x', context: validContext() }, d);
    expect(out.status).toBe(502);
    expect(out.body).toMatchObject({ error: 'vendor_error', detail: '429 rate limited' });
    expect(d.generate.calls).toHaveLength(1);
  });

  it('treats an unexpected throw as a vendor error', async () => {
    const out = await runAsk({ kind: 'card', note: 'x', context: validContext() }, deps([new Error('socket hang up')]));
    expect(out.status).toBe(502);
  });

  it('400 when neither image nor note (whitespace note counts as none)', async () => {
    const out = await runAsk({ kind: 'card', note: '   ', context: validContext() }, deps([]));
    expect(out.status).toBe(400);
  });

  it('400 on malformed body', async () => {
    expect((await runAsk({ kind: 'card' }, deps([]))).status).toBe(400);
    expect((await runAsk(null, deps([]))).status).toBe(400);
  });

  it('413 when the image is over the limit', async () => {
    const big = Buffer.alloc(MAX_IMAGE_BYTES + 1, 1).toString('base64');
    expect((await runAsk({ kind: 'card', image: big, context: validContext() }, deps([]))).status).toBe(413);
  });
});

describe('runAsk: deeper', () => {
  const { card } = enforceCard(validTierOne());

  it('answers a question with trimmed follow-ups', async () => {
    const d = deps([{ answer: 'Gravel drains fast.', follow_ups: ['a', 'b', 'c', 'd'] }]);
    const out = await runAsk({ kind: 'deeper', note: 'x', context: validContext(), card, question: 'Why gravel?' }, d);
    if (out.status !== 200 || !('deeper' in out.body)) throw new Error('expected deeper');
    expect(out.body.deeper.follow_ups).toEqual(['a', 'b', 'c']);
    expect(d.generate.calls[0].tier).toBe('deeper');
    expect(d.generate.calls[0].user.text).toContain('"Why gravel?"');
  });

  it('400 without a question', async () => {
    expect((await runAsk({ kind: 'deeper', note: 'x', context: validContext(), card }, deps([]))).status).toBe(400);
  });
});
```

`proxy/test/handler.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createHandler, type LogEntry } from '../src/handler.js';
import type { CloudVendor } from '../src/card/schema.js';
import { fakeGenerator } from './fakes.js';
import { validContext, validTierOne } from './fixtures.js';

function setup(env: Record<string, string | undefined> = {}) {
  const used: CloudVendor[] = [];
  const logs: LogEntry[] = [];
  const handler = createHandler({
    generatorFor: (v) => {
      used.push(v);
      return fakeGenerator([validTierOne()]);
    },
    env,
    log: (e) => logs.push(e),
  });
  const post = (body: unknown) =>
    handler(new Request('http://local/api/ask', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
  return { handler, used, logs, post };
}

const cardBody = (extra: object = {}) => ({ kind: 'card', note: 'secret note text', context: validContext({ approx_location: { lat: 39.7, lng: -86.1 } }), ...extra });

describe('createHandler', () => {
  it('returns the card as JSON with status 200', async () => {
    const { post } = setup();
    const res = await post(cardBody());
    expect(res.status).toBe(200);
    expect((await res.json()).card.headline).toBe('Common mullein');
  });

  it('uses CARD_VENDOR as the default vendor', async () => {
    const { post, used } = setup({ CARD_VENDOR: 'google' });
    await post(cardBody());
    expect(used).toEqual(['google']);
  });

  it('ignores a vendor override unless ALLOW_VENDOR_OVERRIDE=1', async () => {
    const off = setup();
    await off.post(cardBody({ vendor: 'openai' }));
    expect(off.used).toEqual(['anthropic']);
    const on = setup({ ALLOW_VENDOR_OVERRIDE: '1' });
    await on.post(cardBody({ vendor: 'openai' }));
    expect(on.used).toEqual(['openai']);
  });

  it('400 on non-JSON, 405 on GET', async () => {
    const { post, handler } = setup();
    expect((await post('not json')).status).toBe(400);
    expect((await handler(new Request('http://local/api/ask'))).status).toBe(405);
  });

  it('logs vendor, status and tokens but never content or location', async () => {
    const { post, logs } = setup();
    await post(cardBody());
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ vendor: 'anthropic', status: 200, input_tokens: 100, output_tokens: 50 });
    const line = JSON.stringify(logs[0]);
    expect(line).not.toContain('secret note text');
    expect(line).not.toContain('39.7');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd proxy && npx vitest run test/ask.test.ts test/handler.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement ask.ts**

`proxy/src/ask.ts`:
```ts
import { roundLocation } from './card/context.js';
import { checkCardRules, enforceCard, enforceDeeper } from './card/enforce.js';
import { DEEPER_INSTRUCTIONS, PROMPT_VERSION, TIER1_INSTRUCTIONS, deeperUserText, tierOneUserText } from './card/prompt.js';
import { AskRequest, DeeperOutput, TierOneOutput, type AskError, type AskMeta, type AskResponse } from './card/schema.js';
import { InvalidOutputError, type GenerateResult, type Generator } from './generate.js';

export const MAX_IMAGE_BYTES = 600 * 1024;

export type AskOutcome = { status: 200; body: AskResponse } | { status: 400 | 413 | 422 | 502; body: AskError };
export type AskDeps = { generate: Generator; vendor: string; now?: () => number };

const fail = (status: 400 | 413 | 422 | 502, error: AskError['error'], detail: string): AskOutcome => ({
  status,
  body: { error, detail },
});

// One retry for output that is malformed or breaks card rules; vendor failures are not retried here
// (the AI SDK already retries transient provider errors).
async function attempt<T>(
  call: () => Promise<GenerateResult<T>>,
  rules: (output: T) => string | null,
): Promise<{ value: GenerateResult<T> } | { error: AskOutcome }> {
  let problem = '';
  for (let i = 0; i < 2; i++) {
    try {
      const value = await call();
      const broken = rules(value.output);
      if (!broken) return { value };
      problem = broken;
    } catch (e) {
      if (e instanceof InvalidOutputError) {
        problem = e.message;
        continue;
      }
      return { error: fail(502, 'vendor_error', e instanceof Error ? e.message : String(e)) };
    }
  }
  return { error: fail(422, 'invalid_output', problem) };
}

function meta(vendor: string, value: GenerateResult<unknown>, capped: boolean, ms: number): AskMeta {
  return { vendor, model: value.model, prompt_version: PROMPT_VERSION, capped, latency_ms: Math.round(ms), usage: value.usage };
}

export async function runAsk(input: unknown, deps: AskDeps): Promise<AskOutcome> {
  const parsed = AskRequest.safeParse(input);
  if (!parsed.success) {
    return fail(400, 'bad_request', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  }
  const req = parsed.data;
  const note = req.note?.trim() || undefined;

  let image: Uint8Array | undefined;
  if (req.image !== undefined) {
    const bytes = Buffer.from(req.image, 'base64');
    if (bytes.length === 0) return fail(400, 'bad_request', 'image: empty or not base64');
    if (bytes.length > MAX_IMAGE_BYTES) {
      return fail(413, 'too_large', `image is ${bytes.length} bytes; the limit is ${MAX_IMAGE_BYTES}`);
    }
    image = bytes;
  }
  if (!image && !note) return fail(400, 'bad_request', 'need an image or a note');

  const ctx = { ...req.context, approx_location: roundLocation(req.context.approx_location) ?? undefined };
  const now = deps.now ?? (() => performance.now());
  const started = now();

  if (req.kind === 'card') {
    const result = await attempt(
      () =>
        deps.generate({
          tier: 'tier1',
          instructions: TIER1_INSTRUCTIONS,
          user: { text: tierOneUserText(ctx, note, Boolean(image)), image },
          schema: TierOneOutput,
          schemaName: 'answer_card',
        }),
      checkCardRules,
    );
    if ('error' in result) return result.error;
    const { card, capped } = enforceCard(result.value.output);
    return { status: 200, body: { card, meta: meta(deps.vendor, result.value, capped, now() - started) } };
  }

  const question = req.question?.trim();
  if (!req.card || !question) return fail(400, 'bad_request', 'deeper needs card and question');
  const card = req.card;
  const result = await attempt(
    () =>
      deps.generate({
        tier: 'deeper',
        instructions: DEEPER_INSTRUCTIONS,
        user: { text: deeperUserText(ctx, card, question, note, Boolean(image)), image },
        schema: DeeperOutput,
        schemaName: 'deeper_answer',
      }),
    () => null,
  );
  if ('error' in result) return result.error;
  return {
    status: 200,
    body: { deeper: enforceDeeper(result.value.output), meta: meta(deps.vendor, result.value, false, now() - started) },
  };
}
```

- [ ] **Step 4: Implement handler.ts and the Vercel entry**

`proxy/src/handler.ts`:
```ts
import { runAsk } from './ask.js';
import { CLOUD_VENDORS, type CloudVendor } from './card/schema.js';
import type { Generator } from './generate.js';

export type LogEntry = {
  vendor: string;
  model: string | null;
  status: number;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
};

export type HandlerDeps = {
  generatorFor: (vendor: CloudVendor) => Generator;
  env: Record<string, string | undefined>;
  log: (entry: LogEntry) => void;
};

const isCloudVendor = (v: unknown): v is CloudVendor =>
  typeof v === 'string' && (CLOUD_VENDORS as readonly string[]).includes(v);

export function createHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  const defaultVendor: CloudVendor = isCloudVendor(deps.env.CARD_VENDOR) ? deps.env.CARD_VENDOR : 'anthropic';
  const allowOverride = deps.env.ALLOW_VENDOR_OVERRIDE === '1';

  return async function handle(req: Request): Promise<Response> {
    if (req.method !== 'POST') {
      return Response.json({ error: 'bad_request', detail: 'POST only' }, { status: 405, headers: { allow: 'POST' } });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      deps.log({ vendor: defaultVendor, model: null, status: 400, latency_ms: null, input_tokens: null, output_tokens: null });
      return Response.json({ error: 'bad_request', detail: 'body is not JSON' }, { status: 400 });
    }
    const requested = (body as { vendor?: unknown } | null)?.vendor;
    const vendor = allowOverride && isCloudVendor(requested) ? requested : defaultVendor;
    const outcome = await runAsk(body, { generate: deps.generatorFor(vendor), vendor });
    const meta = outcome.status === 200 ? outcome.body.meta : null;
    deps.log({
      vendor,
      model: meta?.model ?? null,
      status: outcome.status,
      latency_ms: meta?.latency_ms ?? null,
      input_tokens: meta?.usage.inputTokens ?? null,
      output_tokens: meta?.usage.outputTokens ?? null,
    });
    return Response.json(outcome.body, { status: outcome.status });
  };
}
```

`proxy/api/ask.ts`:
```ts
import { aiSdkGenerator } from '../src/generate.js';
import { createHandler } from '../src/handler.js';

// Vercel Functions entry (Web-standard fetch export). Not deployed in sub-project 1.
const handler = createHandler({
  generatorFor: (vendor) => aiSdkGenerator(vendor),
  env: process.env,
  log: (entry) => console.log(JSON.stringify(entry)),
});

export default { fetch: handler };
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd proxy && npm test && npm run typecheck`
Expected: all PASS; `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add proxy/src/ask.ts proxy/src/handler.ts proxy/api/ask.ts proxy/test/fakes.ts proxy/test/ask.test.ts proxy/test/handler.test.ts
git commit -m "feat(proxy): add ask pipeline with retry and error mapping, and fetch handler"
git push
```

**End of Batch B.** Update the ledger (batch B done) and stop.

---

## Batch C

### Task 6: Image prep, photo metadata and manifest scaffold

**Files:**
- Create: `proxy/eval/paths.ts`, `proxy/eval/types.ts`, `proxy/eval/image.ts`, `proxy/eval/manifest.ts`, `proxy/eval/scaffold.ts`
- Test: `proxy/test/eval/image.test.ts`, `proxy/test/eval/scaffold.test.ts`

**Interfaces:**
- Consumes: `CloudVendor`, `AskError`, `AskMeta`, `DeeperOutput`, `EnforcedCard` (Task 1); `roundLocation` (Task 2).
- Produces (`paths.ts`): `EVAL_DIR`, `PROXY_DIR`, `EVAL_DATA_DIR` (= `process.env.VERGE_EVAL_DIR ?? EVAL_DIR`), `PHOTOS_DIR`, `MANIFEST_PATH`, `RUNS_DIR`; `latestRunDir(runsDir?: string): string | null`; `resolveRunDir(arg?: string, runsDir?: string): string`.
- Produces (`types.ts`): `type HarnessVendor = CloudVendor | 'apple-device' | 'apple-pcc'`; `HARNESS_VENDORS: readonly HarnessVendor[]`; `type Variant = 'with' | 'without'`; `type LatLng = { lat: number; lng: number }`; `type ManifestCase = { id: string; file: string | null; note_file: string | null; taken_at: string; approx_location: LatLng | null; note: string; truth: string; neighborhood: string }`; `type Manifest = { cases: ManifestCase[] }`; `type LocationMode = 'both' | 'with' | 'without'`; `type DeeperRecord`; `type ResultRecord`; `type RunResults`; `type Blind`; `type Verdict`; `type LocationVerdict`; `type ScoreEntry`; `type Scores`; `type CardView` (full definitions in Step 3).
- Produces (`image.ts`): `prepareImage(input: string | Buffer): Promise<Buffer>`; `type PhotoMeta = { taken_at: string | null; approx_location: LatLng | null }`; `readPhotoMeta(filePath: string): Promise<PhotoMeta>`.
- Produces (`manifest.ts`): `caseId(base: string): string`; `defaultVariant(c: Pick<ManifestCase, 'approx_location'>): Variant`; `type MetaReader = (filePath: string) => Promise<PhotoMeta>`; `scaffold(photosDir: string, existing: Manifest | null, readMeta: MetaReader): Promise<{ manifest: Manifest; warnings: string[] }>`.

- [ ] **Step 1: Write the failing tests**

`proxy/test/eval/image.test.ts`:
```ts
import exifr from 'exifr';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { prepareImage, readPhotoMeta } from '../../eval/image.js';

async function syntheticJpeg(width: number, height: number, withExif = false): Promise<Buffer> {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 46, g: 94, b: 62 } } });
  if (withExif) img = img.withExif({ IFD0: { Copyright: 'synthetic-secret' } });
  return img.jpeg().toBuffer();
}

describe('prepareImage', () => {
  it('resizes to 1000 px on the long edge', async () => {
    const out = await prepareImage(await syntheticJpeg(3000, 2000));
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([1000, 667]);
    expect(meta.format).toBe('jpeg');
  });

  it('never enlarges a small image', async () => {
    const meta = await sharp(await prepareImage(await syntheticJpeg(400, 300))).metadata();
    expect([meta.width, meta.height]).toEqual([400, 300]);
  });

  it('strips EXIF metadata', async () => {
    const input = await syntheticJpeg(800, 600, true);
    expect((await exifr.parse(input))?.Copyright).toBe('synthetic-secret');
    const out = await prepareImage(input);
    expect((await exifr.parse(out))?.Copyright).toBeUndefined();
    expect(await exifr.gps(out)).toBeUndefined();
  });
});

describe('readPhotoMeta', () => {
  it('returns nulls for a photo with no EXIF', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'verge-meta-'));
    const file = path.join(dir, 'plain.jpg');
    writeFileSync(file, await syntheticJpeg(100, 100));
    expect(await readPhotoMeta(file)).toEqual({ taken_at: null, approx_location: null });
  });
});
```

If `withExif` is unavailable in the installed sharp, use
`img.withMetadata({ exif: { IFD0: { Copyright: 'synthetic-secret' } } })` instead; keep the assertion.

`proxy/test/eval/scaffold.test.ts`:
```ts
import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { caseId, defaultVariant, scaffold, type MetaReader } from '../../eval/manifest.js';
import type { Manifest } from '../../eval/types.js';

const withMeta: MetaReader = async () => ({ taken_at: '2026-05-01T09:00:00', approx_location: { lat: 39.757, lng: -86.146 } });
const noMeta: MetaReader = async () => ({ taken_at: null, approx_location: null });

function photosDir(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'verge-photos-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), content);
  return dir;
}

describe('scaffold', () => {
  it('builds cases from images and notes, needing no manual input', async () => {
    const dir = photosDir({ 'IMG_0001.jpg': 'x', 'IMG_0001.txt': 'by the bakery\n', 'hawk.txt': 'hawk on the steeple' });
    const { manifest, warnings } = await scaffold(dir, null, withMeta);
    expect(warnings).toEqual([]);
    expect(manifest.cases).toEqual([
      { id: 'hawk', file: null, note_file: 'hawk.txt', taken_at: expect.any(String), approx_location: null, note: 'hawk on the steeple', truth: '', neighborhood: '' },
      { id: 'img-0001', file: 'IMG_0001.jpg', note_file: 'IMG_0001.txt', taken_at: '2026-05-01T09:00:00', approx_location: { lat: 39.757, lng: -86.146 }, note: 'by the bakery', truth: '', neighborhood: '' },
    ]);
  });

  it('warns and skips HEIC, unknown files and empty note-only cases', async () => {
    const dir = photosDir({ 'IMG_0002.HEIC': 'x', 'notes.md': 'x', 'empty.txt': '   ' });
    const { manifest, warnings } = await scaffold(dir, null, withMeta);
    expect(manifest.cases).toEqual([]);
    expect(warnings.join('\n')).toMatch(/IMG_0002\.HEIC.*JPEG/);
    expect(warnings.join('\n')).toMatch(/notes\.md/);
    expect(warnings.join('\n')).toMatch(/empty\.txt/);
  });

  it('falls back to mtime when a photo has no EXIF date', async () => {
    const dir = photosDir({ 'screenshot.png': 'x' });
    const when = new Date('2026-07-04T12:00:00Z');
    utimesSync(path.join(dir, 'screenshot.png'), when, when);
    const { manifest } = await scaffold(dir, null, noMeta);
    expect(manifest.cases[0].taken_at).toBe('2026-07-04T12:00:00.000Z');
    expect(manifest.cases[0].approx_location).toBeNull();
  });

  it('preserves edited fields on re-run and drops cases whose files are gone', async () => {
    const dir = photosDir({ 'a.jpg': 'x' });
    const existing: Manifest = {
      cases: [
        { id: 'a', file: 'a.jpg', note_file: null, taken_at: '2026-04-01T08:00:00', approx_location: null, note: 'edited', truth: 'purslane', neighborhood: 'Fountain Square' },
        { id: 'gone', file: 'gone.jpg', note_file: null, taken_at: '2026-04-01T08:00:00', approx_location: null, note: '', truth: '', neighborhood: '' },
      ],
    };
    const { manifest, warnings } = await scaffold(dir, existing, withMeta);
    expect(manifest.cases).toHaveLength(1);
    expect(manifest.cases[0]).toMatchObject({ id: 'a', note: 'edited', truth: 'purslane', neighborhood: 'Fountain Square', taken_at: '2026-04-01T08:00:00' });
    expect(warnings.join('\n')).toMatch(/gone/);
  });
});

describe('helpers', () => {
  it('slugs case ids', () => {
    expect(caseId('IMG 0001 (copy)')).toBe('img-0001-copy');
  });

  it('defaults to the with-location variant only when there is a location', () => {
    expect(defaultVariant({ approx_location: { lat: 1, lng: 2 } })).toBe('with');
    expect(defaultVariant({ approx_location: null })).toBe('without');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd proxy && npx vitest run test/eval`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement paths.ts and types.ts**

`proxy/eval/paths.ts`:
```ts
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROXY_DIR = path.dirname(EVAL_DIR);
// VERGE_EVAL_DIR lets a real-flow check run in a temp dir without touching Chase's photos.
export const EVAL_DATA_DIR = process.env.VERGE_EVAL_DIR ?? EVAL_DIR;
export const PHOTOS_DIR = path.join(EVAL_DATA_DIR, 'photos');
export const MANIFEST_PATH = path.join(EVAL_DATA_DIR, 'manifest.json');
export const RUNS_DIR = path.join(EVAL_DATA_DIR, 'runs');

export function latestRunDir(runsDir: string = RUNS_DIR): string | null {
  if (!existsSync(runsDir)) return null;
  const runs = readdirSync(runsDir)
    .map((name) => path.join(runsDir, name))
    .filter((p) => existsSync(path.join(p, 'results.json')))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return runs[0] ?? null;
}

export function resolveRunDir(arg?: string, runsDir: string = RUNS_DIR): string {
  if (arg) {
    const candidate = existsSync(arg) ? arg : path.join(runsDir, arg);
    if (!existsSync(path.join(candidate, 'results.json'))) throw new Error(`No results.json in ${candidate}`);
    return candidate;
  }
  const latest = latestRunDir(runsDir);
  if (!latest) throw new Error('No runs yet. Run `npm run eval:run` first.');
  return latest;
}
```

`proxy/eval/types.ts` (every harness type lives here, including the run and score types Tasks 8–10 use):
```ts
import type { AskError, AskMeta, CloudVendor, DeeperOutput, EnforcedCard } from '../src/card/schema.js';

export type HarnessVendor = CloudVendor | 'apple-device' | 'apple-pcc';
export const HARNESS_VENDORS: readonly HarnessVendor[] = ['anthropic', 'openai', 'google', 'apple-device', 'apple-pcc'];

export type Variant = 'with' | 'without';
export type LatLng = { lat: number; lng: number };

export type ManifestCase = {
  id: string;
  file: string | null;
  note_file: string | null;
  taken_at: string;
  approx_location: LatLng | null;
  note: string;
  truth: string;
  neighborhood: string;
};

export type Manifest = { cases: ManifestCase[] };

export type LocationMode = 'both' | 'with' | 'without';

export type DeeperRecord = {
  question: string;
  status: number;
  answer: DeeperOutput | null;
  meta: AskMeta | null;
  error: AskError | null;
};

export type ResultRecord = {
  case_id: string;
  vendor: HarnessVendor;
  variant: Variant;
  status: number;
  card: EnforcedCard | null;
  meta: AskMeta | null;
  error: AskError | null;
  deeper: DeeperRecord | null;
  cost_usd: number | null;
};

export type RunResults = {
  run_id: string;
  prompt_version: string;
  started_at: string;
  vendors: HarnessVendor[];
  skipped_vendors: { vendor: HarnessVendor; reason: string }[];
  cases: ManifestCase[];
  records: ResultRecord[];
};

// case id → blind label (A, B, …) → vendor. Stored per run; the review page never sees vendors.
export type Blind = Record<string, Record<string, HarnessVendor>>;

export type Verdict = 'send' | 'edit' | 'bad';
export type LocationVerdict = 'helped' | 'same' | 'hurt';

export type ScoreEntry = {
  verdict: Verdict | null;
  actually: string;
  safety_should_fire: boolean;
  note: string;
  location: LocationVerdict | null;
};

// Keyed `${caseId}|${vendor}`. Written by the review server; the page only sees labels.
export type Scores = Record<string, ScoreEntry>;

export type CardView = {
  status: number;
  card: EnforcedCard | null;
  error: AskError | null;
  deeper: { question: string; answer: DeeperOutput | null; error: AskError | null } | null;
};
```

- [ ] **Step 4: Implement image.ts**

`proxy/eval/image.ts`:
```ts
import exifr from 'exifr';
import sharp from 'sharp';
import { roundLocation } from '../src/card/context.js';
import type { LatLng } from './types.js';

// What the app will do before upload: orient, fit inside 1000x1000, JPEG, no metadata
// (sharp strips all metadata unless keepMetadata/withMetadata is used).
export async function prepareImage(input: string | Buffer): Promise<Buffer> {
  return sharp(input)
    .autoOrient()
    .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

export type PhotoMeta = { taken_at: string | null; approx_location: LatLng | null };

export async function readPhotoMeta(filePath: string): Promise<PhotoMeta> {
  let taken_at: string | null = null;
  let approx_location: LatLng | null = null;
  try {
    const tags = await exifr.parse(filePath, { pick: ['DateTimeOriginal'], reviveValues: false });
    const raw: unknown = tags?.DateTimeOriginal;
    if (typeof raw === 'string' && /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) {
      taken_at = `${raw.slice(0, 4)}-${raw.slice(5, 7)}-${raw.slice(8, 10)}T${raw.slice(11, 19)}`;
    }
  } catch {
    // unreadable EXIF: fall back to null
  }
  try {
    const gps = await exifr.gps(filePath);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude) && !(gps.latitude === 0 && gps.longitude === 0)) {
      approx_location = roundLocation({ lat: gps.latitude, lng: gps.longitude });
    }
  } catch {
    // no GPS block
  }
  return { taken_at, approx_location };
}
```

- [ ] **Step 5: Implement manifest.ts and the scaffold CLI**

`proxy/eval/manifest.ts`:
```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { PhotoMeta } from './image.js';
import type { Manifest, ManifestCase, Variant } from './types.js';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const HEIC_EXT = new Set(['.heic', '.heif']);

export type MetaReader = (filePath: string) => Promise<PhotoMeta>;

export function caseId(base: string): string {
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'case';
}

export function defaultVariant(c: Pick<ManifestCase, 'approx_location'>): Variant {
  return c.approx_location ? 'with' : 'without';
}

export async function scaffold(
  photosDir: string,
  existing: Manifest | null,
  readMeta: MetaReader,
): Promise<{ manifest: Manifest; warnings: string[] }> {
  const warnings: string[] = [];
  const files = existsSync(photosDir) ? readdirSync(photosDir).filter((f) => !f.startsWith('.')).sort() : [];
  const groups = new Map<string, { image?: string; note?: string }>();

  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    const base = f.slice(0, f.length - ext.length);
    if (HEIC_EXT.has(ext)) {
      warnings.push(`${f}: HEIC can't be read here. Export it as JPEG (on iPhone, share it as "Most Compatible" or set Settings > Camera > Formats > Most Compatible) and re-run.`);
      continue;
    }
    const group = groups.get(base) ?? {};
    if (IMAGE_EXT.has(ext)) {
      if (group.image) {
        warnings.push(`${f}: another image is already named ${base}; skipped`);
        continue;
      }
      group.image = f;
    } else if (ext === '.txt') {
      group.note = f;
    } else {
      warnings.push(`${f}: not an image (.jpg .jpeg .png .webp) or a .txt note; skipped`);
      continue;
    }
    groups.set(base, group);
  }

  const prior = new Map((existing?.cases ?? []).map((c) => [c.id, c]));
  const seen = new Set<string>();
  const cases: ManifestCase[] = [];

  for (const [base, group] of groups) {
    const note = group.note ? readFileSync(path.join(photosDir, group.note), 'utf8').trim() : '';
    if (!group.image && !note) {
      warnings.push(`${group.note}: empty note with no photo; skipped`);
      continue;
    }
    let id = caseId(base);
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);

    const old = prior.get(id);
    if (old) {
      cases.push({ ...old, file: group.image ?? null, note_file: group.note ?? null });
      continue;
    }
    const meta = group.image ? await readMeta(path.join(photosDir, group.image)) : { taken_at: null, approx_location: null };
    const source = path.join(photosDir, group.image ?? (group.note as string));
    cases.push({
      id,
      file: group.image ?? null,
      note_file: group.note ?? null,
      taken_at: meta.taken_at ?? statSync(source).mtime.toISOString(),
      approx_location: meta.approx_location,
      note,
      truth: '',
      neighborhood: '',
    });
  }

  for (const id of prior.keys()) {
    if (!seen.has(id)) warnings.push(`${id}: its files are gone from photos/; dropped from the manifest`);
  }
  cases.sort((a, b) => a.id.localeCompare(b.id));
  return { manifest: { cases }, warnings };
}
```

`proxy/eval/scaffold.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readPhotoMeta } from './image.js';
import { scaffold } from './manifest.js';
import { MANIFEST_PATH, PHOTOS_DIR } from './paths.js';
import type { Manifest } from './types.js';

async function main(): Promise<void> {
  mkdirSync(PHOTOS_DIR, { recursive: true });
  const existing: Manifest | null = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) : null;
  const { manifest, warnings } = await scaffold(PHOTOS_DIR, existing, readPhotoMeta);
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const w of warnings) console.warn(`warning: ${w}`);
  const located = manifest.cases.filter((c) => c.approx_location).length;
  console.log(`${manifest.cases.length} case(s), ${located} with location, written to ${MANIFEST_PATH}`);
  if (manifest.cases.length === 0) console.log(`Add photos (and optional same-name .txt notes) to ${PHOTOS_DIR}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main();
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `cd proxy && npm test && npm run typecheck`
Expected: all PASS; `tsc` exits 0.

- [ ] **Step 7: Exercise the CLI on an empty folder**

Run: `cd proxy && VERGE_EVAL_DIR=$(mktemp -d) npm run eval:scaffold`
Expected: prints `0 case(s), 0 with location, written to …/manifest.json` and the "Add photos" hint; exit 0.

- [ ] **Step 8: Commit**

```bash
git add proxy/eval/paths.ts proxy/eval/types.ts proxy/eval/image.ts proxy/eval/manifest.ts proxy/eval/scaffold.ts proxy/test/eval/image.test.ts proxy/test/eval/scaffold.test.ts
git commit -m "feat(eval): add image prep, photo metadata and manifest scaffold"
git push
```

### Task 7: Apple `fm` CLI adapter

**Files:**
- Create: `proxy/eval/apple-fm.ts`
- Test: `proxy/test/eval/apple-fm.test.ts`

**Interfaces:**
- Consumes: Task 4 (`Generator`, `GenerateArgs`, `GenerateResult`, `InvalidOutputError`, `VendorError`); Task 1 (`TierOneOutput`); fixture `validTierOne`.
- Produces: `type AppleMode = 'device' | 'pcc'`; `type FmRunner = (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>`; `fmAvailable(): boolean`; `parseFmOutput(stdout: string): unknown`; `appleGenerator(mode: AppleMode, opts?: { runner?: FmRunner; schemaMode?: 'prompt' | 'json-schema' }): Generator`. Model names in results: `'apple-on-device'` and `'apple-pcc'`.

Research (2026-10-10, WWDC26 session 334) shows `fm respond [--instructions TEXT] PROMPT
[--image PATH] [--model pcc] [--schema FILE]`, on-device by default, JSON on stdout only with
`--schema`. The `--schema` file format is unconfirmed (the session only shows files made by
`fm schema object`), so the default `prompt` mode asks for JSON in the instructions and validates
with Zod; `json-schema` mode (env `APPLE_FM_SCHEMA_MODE=json-schema`) passes a JSON Schema file and
is verified on Chase's Mac in Task 11.

- [ ] **Step 1: Write the failing tests**

`proxy/test/eval/apple-fm.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appleGenerator, parseFmOutput, type FmRunner } from '../../eval/apple-fm.js';
import { TierOneOutput } from '../../src/card/schema.js';
import { InvalidOutputError, VendorError } from '../../src/generate.js';
import { validTierOne } from '../fixtures.js';

function stubRunner(result: { code: number; stdout: string; stderr?: string }) {
  const calls: string[][] = [];
  const runner: FmRunner = async (args) => {
    calls.push(args);
    return { code: result.code, stdout: result.stdout, stderr: result.stderr ?? '' };
  };
  return { runner, calls };
}

const args = (image?: Uint8Array) => ({
  tier: 'tier1' as const,
  instructions: 'You write cards.',
  user: { text: 'What is this?', image },
  schema: TierOneOutput,
  schemaName: 'answer_card',
});

describe('parseFmOutput', () => {
  it('parses bare and fenced JSON', () => {
    expect(parseFmOutput('{"a":1}')).toEqual({ a: 1 });
    expect(parseFmOutput('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('throws InvalidOutputError when there is no JSON object', () => {
    expect(() => parseFmOutput('I cannot help with that.')).toThrow(InvalidOutputError);
  });
});

describe('appleGenerator', () => {
  it('runs on-device with an image and returns validated output', async () => {
    const { runner, calls } = stubRunner({ code: 0, stdout: JSON.stringify(validTierOne()) });
    const out = await appleGenerator('device', { runner })(args(new Uint8Array([0xff, 0xd8, 0xff])));
    expect(out.output).toEqual(validTierOne());
    expect(out.model).toBe('apple-on-device');
    expect(out.usage).toEqual({ inputTokens: null, outputTokens: null });
    const a = calls[0];
    expect(a[0]).toBe('respond');
    expect(a).toContain('--image');
    expect(a).not.toContain('--model');
    expect(a).not.toContain('--schema');
    expect(a[a.indexOf('--instructions') + 1]).toMatch(/JSON/);
  });

  it('adds --model pcc for Private Cloud Compute', async () => {
    const { runner, calls } = stubRunner({ code: 0, stdout: JSON.stringify(validTierOne()) });
    const out = await appleGenerator('pcc', { runner })(args());
    expect(out.model).toBe('apple-pcc');
    expect(calls[0].slice(calls[0].indexOf('--model'), calls[0].indexOf('--model') + 2)).toEqual(['--model', 'pcc']);
    expect(calls[0]).not.toContain('--image');
  });

  it('passes a JSON Schema file in json-schema mode', async () => {
    // The temp dir is removed when the call returns, so read the file during the call.
    let captured = '';
    const runner: FmRunner = async (a) => {
      captured = readFileSync(a[a.indexOf('--schema') + 1], 'utf8');
      return { code: 0, stdout: JSON.stringify(validTierOne()), stderr: '' };
    };
    await appleGenerator('device', { runner, schemaMode: 'json-schema' })(args());
    expect((JSON.parse(captured) as { required: string[] }).required).toContain('confidence');
  });

  it('maps schema-invalid output to InvalidOutputError', async () => {
    const { runner } = stubRunner({ code: 0, stdout: '{"class":"mineral"}' });
    await expect(appleGenerator('device', { runner })(args())).rejects.toBeInstanceOf(InvalidOutputError);
  });

  it('maps a non-zero exit (e.g. context window exceeded) to VendorError carrying stderr', async () => {
    const { runner } = stubRunner({ code: 1, stdout: '', stderr: 'Error: exceeded context window size' });
    await expect(appleGenerator('device', { runner })(args())).rejects.toThrow(/exceeded context window/);
    await expect(appleGenerator('device', { runner })(args())).rejects.toBeInstanceOf(VendorError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd proxy && npx vitest run test/eval/apple-fm.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement apple-fm.ts**

`proxy/eval/apple-fm.ts`:
```ts
import { execFile, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { InvalidOutputError, VendorError, type GenerateArgs, type GenerateResult, type Generator } from '../src/generate.js';

export type AppleMode = 'device' | 'pcc';
export type FmRunner = (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;

const MODEL_NAME: Record<AppleMode, string> = { device: 'apple-on-device', pcc: 'apple-pcc' };

export function fmAvailable(): boolean {
  const probe = spawnSync('fm', ['--help'], { stdio: 'ignore' });
  return !probe.error;
}

const defaultRunner: FmRunner = (args) =>
  new Promise((resolve) => {
    execFile('fm', args, { maxBuffer: 10 * 1024 * 1024, timeout: 180_000 }, (error, stdout, stderr) => {
      const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr || (error ? error.message : '')) });
    });
  });

export function parseFmOutput(stdout: string): unknown {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start === -1 || end <= start) throw new InvalidOutputError('fm output contained no JSON object');
  try {
    return JSON.parse(stdout.slice(start, end + 1));
  } catch (e) {
    throw new InvalidOutputError(`fm output was not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function appleGenerator(
  mode: AppleMode,
  opts: { runner?: FmRunner; schemaMode?: 'prompt' | 'json-schema' } = {},
): Generator {
  const runner = opts.runner ?? defaultRunner;
  const schemaMode = opts.schemaMode ?? (process.env.APPLE_FM_SCHEMA_MODE === 'json-schema' ? 'json-schema' : 'prompt');

  return async function generate<T>(args: GenerateArgs<T>): Promise<GenerateResult<T>> {
    const dir = mkdtempSync(path.join(tmpdir(), 'verge-fm-'));
    try {
      const jsonSchema = JSON.stringify(z.toJSONSchema(args.schema));
      const instructions =
        schemaMode === 'prompt'
          ? `${args.instructions}\n\nRespond with only one JSON object that matches this JSON Schema, and nothing else:\n${jsonSchema}`
          : args.instructions;
      const fmArgs = ['respond', '--instructions', instructions, args.user.text];
      if (args.user.image) {
        const imagePath = path.join(dir, 'capture.jpg');
        writeFileSync(imagePath, args.user.image);
        fmArgs.push('--image', imagePath);
      }
      if (mode === 'pcc') fmArgs.push('--model', 'pcc');
      if (schemaMode === 'json-schema') {
        const schemaPath = path.join(dir, 'schema.json');
        writeFileSync(schemaPath, jsonSchema);
        fmArgs.push('--schema', schemaPath);
      }

      const { code, stdout, stderr } = await runner(fmArgs);
      if (code !== 0) throw new VendorError(`fm exited ${code}: ${stderr.trim() || 'no stderr'}`);
      const parsed = args.schema.safeParse(parseFmOutput(stdout));
      if (!parsed.success) throw new InvalidOutputError(`fm output failed the schema: ${parsed.error.message}`);
      return { output: parsed.data, model: MODEL_NAME[mode], usage: { inputTokens: null, outputTokens: null } };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}
```


- [ ] **Step 4: Run the tests and typecheck**

Run: `cd proxy && npm test && npm run typecheck`
Expected: all PASS; `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add proxy/eval/apple-fm.ts proxy/test/eval/apple-fm.test.ts
git commit -m "feat(eval): add Apple on-device and PCC adapter over the fm CLI"
git push
```

**End of Batch C.** Update the ledger (batch C done) and stop.

---

## Batch D

### Task 8: Retention and the run command

**Files:**
- Create: `proxy/eval/env.ts`, `proxy/eval/retention.ts`, `proxy/eval/run.ts`
- Test: `proxy/test/eval/retention.test.ts`, `proxy/test/eval/run.test.ts`

**Interfaces:**
- Consumes: Task 1 (`AskError`, `AskMeta`, `EnforcedCard`, `DeeperOutput`, `CloudVendor`); Task 3 (`PROMPT_VERSION`); Task 4 (`KEY_ENV`, `estimateCostUsd`, `aiSdkGenerator`); Task 5 (`createHandler`, `runAsk`); Task 6 (`ManifestCase`, `Manifest`, `HarnessVendor`, `HARNESS_VENDORS`, `Variant`, `LocationMode`, `ResultRecord`, `RunResults`, `Blind`, `prepareImage`, `PHOTOS_DIR`, `MANIFEST_PATH`, `RUNS_DIR`, `PROXY_DIR`); Task 7 (`appleGenerator`, `fmAvailable`); test fixture `validTierOne`.
- Produces (`env.ts`): `loadEnvLocal(dir?: string): void`; `hasKey(vendor: CloudVendor): boolean`.
- Produces (`retention.ts`): `pruneRuns(runsDir: string, nowMs: number, opts?: { maxAgeDays?: number; keepUnscored?: number }): string[]`.
- Produces (`run.ts`): `type RunArgs`; `parseRunArgs(argv: string[]): RunArgs`; `resolveVendors(requested, probes)`; `planRequests(cases, vendors, location)`; `buildCardBody(c, variant, image, vendor)`; `makeBlind(cases, vendors, rand?)`; `mapPool(items, limit, fn)`; `type AskFn = (body: Record<string, unknown>) => Promise<{ status: number; body: any }>`; `executeRun(opts): Promise<ResultRecord[]>`.

- [ ] **Step 1: Write the failing tests**

`proxy/test/eval/retention.test.ts`:
```ts
import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pruneRuns } from '../../eval/retention.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-10T12:00:00Z');

function makeRun(root: string, name: string, ageDays: number, scored = false) {
  const dir = path.join(root, name);
  mkdirSync(dir);
  writeFileSync(path.join(dir, 'results.json'), '{}');
  if (scored) writeFileSync(path.join(dir, 'scores.json'), '{}');
  const t = new Date(NOW - ageDays * DAY);
  utimesSync(dir, t, t);
}

describe('pruneRuns', () => {
  it('removes unscored runs older than 14 days', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'verge-runs-'));
    makeRun(root, 'old', 20);
    makeRun(root, 'fresh', 2);
    expect(pruneRuns(root, NOW)).toEqual(['old']);
    expect(existsSync(path.join(root, 'fresh'))).toBe(true);
  });

  it('keeps only the newest 10 unscored runs', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'verge-runs-'));
    for (let i = 0; i < 12; i++) makeRun(root, `r${String(i).padStart(2, '0')}`, i * 0.5);
    expect(pruneRuns(root, NOW).sort()).toEqual(['r10', 'r11']);
  });

  it('never prunes a scored run', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'verge-runs-'));
    makeRun(root, 'judged', 400, true);
    expect(pruneRuns(root, NOW)).toEqual([]);
    expect(existsSync(path.join(root, 'judged'))).toBe(true);
  });

  it('is a no-op when the runs dir does not exist', () => {
    expect(pruneRuns(path.join(tmpdir(), 'verge-nope-does-not-exist'), NOW)).toEqual([]);
  });
});
```

`proxy/test/eval/run.test.ts`:
```ts
import { serve } from 'srvx';
import { describe, expect, it } from 'vitest';
import { buildCardBody, executeRun, makeBlind, parseRunArgs, planRequests, resolveVendors, type AskFn } from '../../eval/run.js';
import type { ManifestCase } from '../../eval/types.js';
import type { Generator } from '../../src/generate.js';
import { createHandler } from '../../src/handler.js';
import { validTierOne } from '../fixtures.js';

const located: ManifestCase = { id: 'a', file: 'a.jpg', note_file: null, taken_at: '2026-05-01T09:00:00', approx_location: { lat: 39.757, lng: -86.146 }, note: '', truth: '', neighborhood: 'Near home' };
const unlocated: ManifestCase = { id: 'b', file: null, note_file: 'b.txt', taken_at: '2026-05-01T09:00:00', approx_location: null, note: 'hawk on the steeple', truth: '', neighborhood: '' };

describe('parseRunArgs', () => {
  it('defaults to every vendor, both variants, deeper on', () => {
    expect(parseRunArgs([])).toEqual({ vendors: ['anthropic', 'openai', 'google', 'apple-device', 'apple-pcc'], location: 'both', deeper: true, cases: null, concurrency: 4 });
  });

  it('parses flags', () => {
    expect(parseRunArgs(['--vendors', 'anthropic,google', '--location', 'without', '--no-deeper', '--cases', 'a,b', '--concurrency', '2'])).toEqual({
      vendors: ['anthropic', 'google'], location: 'without', deeper: false, cases: ['a', 'b'], concurrency: 2,
    });
  });

  it('rejects unknown vendors and flags', () => {
    expect(() => parseRunArgs(['--vendors', 'mistral'])).toThrow(/unknown vendor/);
    expect(() => parseRunArgs(['--fast'])).toThrow(/unknown argument/);
  });
});

describe('resolveVendors', () => {
  it('skips cloud vendors without keys and Apple without fm', () => {
    const r = resolveVendors(['anthropic', 'openai', 'apple-device'], { hasKey: (v) => v === 'anthropic', fmAvailable: () => false });
    expect(r.active).toEqual(['anthropic']);
    expect(r.skipped.map((s) => s.vendor)).toEqual(['openai', 'apple-device']);
  });
});

describe('planRequests', () => {
  it('skips with-variant when no location', () => {
    const jobs = planRequests([located, unlocated], ['anthropic'], 'both');
    expect(jobs.map((j) => `${j.c.id}:${j.variant}`)).toEqual(['a:with', 'a:without', 'b:without']);
  });

  it('honours with/without modes', () => {
    expect(planRequests([located, unlocated], ['anthropic'], 'with').map((j) => j.c.id)).toEqual(['a']);
    expect(planRequests([located, unlocated], ['anthropic'], 'without')).toHaveLength(2);
  });
});

describe('buildCardBody', () => {
  it('includes location and neighborhood only in the with-variant', () => {
    const img = Buffer.from([1, 2, 3]);
    const withBody = buildCardBody(located, 'with', img, 'openai') as { context: Record<string, unknown>; image: string; vendor: string };
    expect(withBody.context).toMatchObject({ date: '2026-05-01T09:00:00', approx_location: { lat: 39.757, lng: -86.146 }, neighborhood: 'Near home' });
    expect(withBody.image).toBe(img.toString('base64'));
    expect(withBody.vendor).toBe('openai');
    const withoutBody = buildCardBody(located, 'without', img, 'openai') as { context: Record<string, unknown> };
    expect(withoutBody.context).toEqual({ date: '2026-05-01T09:00:00' });
  });
});

describe('makeBlind', () => {
  it('assigns each vendor one label per case', () => {
    const blind = makeBlind([located, unlocated], ['anthropic', 'openai', 'google'], () => 0.3);
    expect(Object.keys(blind)).toEqual(['a', 'b']);
    expect(Object.keys(blind.a)).toEqual(['A', 'B', 'C']);
    expect(Object.values(blind.a).sort()).toEqual(['anthropic', 'google', 'openai']);
  });
});

describe('executeRun', () => {
  const okAsk: AskFn = async (body) =>
    body.kind === 'deeper'
      ? { status: 200, body: { deeper: { answer: 'More.', follow_ups: [] }, meta: { vendor: 'x', model: 'claude-sonnet-5-5', prompt_version: 'p1', capped: false, latency_ms: 5, usage: { inputTokens: 1000, outputTokens: 100 } } } }
      : { status: 200, body: { card: { ...validTierOne(), tier2_label: 'What to look for', safety: null }, meta: { vendor: 'x', model: 'claude-haiku-5-5', prompt_version: 'p1', capped: false, latency_ms: 5, usage: { inputTokens: 1000, outputTokens: 100 } } } };

  it('records cards, deeper answers and cost', async () => {
    const records = await executeRun({ cases: [unlocated], vendors: ['anthropic'], location: 'both', deeper: true, concurrency: 2, askFor: () => okAsk, loadImage: async () => null });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ case_id: 'b', vendor: 'anthropic', variant: 'without', status: 200 });
    expect(records[0].deeper?.question).toBe('Why does it grow in gravel?');
    expect(records[0].cost_usd).toBeGreaterThan(0);
  });

  it('skips deeper when no follow-ups', async () => {
    const noFollow: AskFn = async () => ({ status: 200, body: { card: { ...validTierOne({ follow_ups: [] }), tier2_label: 'x', safety: null }, meta: { vendor: 'x', model: 'claude-haiku-5-5', prompt_version: 'p1', capped: false, latency_ms: 5, usage: { inputTokens: 1, outputTokens: 1 } } } });
    const records = await executeRun({ cases: [unlocated], vendors: ['anthropic'], location: 'both', deeper: true, concurrency: 1, askFor: () => noFollow, loadImage: async () => null });
    expect(records[0].deeper).toBeNull();
  });

  it('records a failed request and keeps going', async () => {
    let n = 0;
    const flaky: AskFn = async (body) => {
      n += 1;
      if (n === 1) throw new Error('ECONNRESET');
      if (n === 2) return { status: 502, body: { error: 'vendor_error', detail: '429 rate limited' } };
      return okAsk(body);
    };
    const records = await executeRun({ cases: [located, unlocated], vendors: ['anthropic'], location: 'without', deeper: false, concurrency: 1, askFor: () => flaky, loadImage: async () => null });
    expect(records.map((r) => r.status)).toEqual([0, 502]);
    expect(records[0].error?.detail).toMatch(/ECONNRESET/);
    expect(records[1].error?.detail).toBe('429 rate limited');
  });

  it('works end to end over HTTP against the real handler with vendor override', async () => {
    const used: string[] = [];
    // The handler asks generatorFor once per request, so answer by tier rather than by call order.
    const byTier: Generator = async (a) => ({
      output: (a.tier === 'deeper' ? { answer: 'Gravel drains fast.', follow_ups: [] } : validTierOne()) as never,
      model: `fake-${a.tier}`,
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const handler = createHandler({
      generatorFor: (v) => {
        used.push(v);
        return byTier;
      },
      env: { ALLOW_VENDOR_OVERRIDE: '1' },
      log: () => {},
    });
    const server = serve({ fetch: handler, port: 0, hostname: '127.0.0.1', silent: true });
    await server.ready();
    try {
      const askHttp: AskFn = async (body) => {
        const res = await fetch(new URL('api/ask', server.url), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        return { status: res.status, body: await res.json() };
      };
      const records = await executeRun({ cases: [unlocated], vendors: ['google'], location: 'both', deeper: true, concurrency: 1, askFor: () => askHttp, loadImage: async () => null });
      expect(records[0].status).toBe(200);
      expect(records[0].card?.headline).toBe('Common mullein');
      expect(records[0].deeper?.answer?.answer).toBe('Gravel drains fast.');
      expect(used).toContain('google');
    } finally {
      await server.close();
    }
  });
});
```


- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd proxy && npx vitest run test/eval/retention.test.ts test/eval/run.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement env.ts and retention.ts**

`proxy/eval/env.ts`:
```ts
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { CloudVendor } from '../src/card/schema.js';
import { KEY_ENV } from '../src/providers.js';
import { PROXY_DIR } from './paths.js';

// Loads proxy/.env.local into process.env. Never print or log the values.
export function loadEnvLocal(dir: string = PROXY_DIR): void {
  const file = path.join(dir, '.env.local');
  if (existsSync(file)) process.loadEnvFile(file);
}

export function hasKey(vendor: CloudVendor): boolean {
  return Boolean(process.env[KEY_ENV[vendor]]?.trim());
}
```

`proxy/eval/retention.ts`:
```ts
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const DAY_MS = 86_400_000;

// Unscored runs: pruned when older than maxAgeDays or outside the newest keepUnscored.
// Scored runs (scores.json present) are judged evidence and are never pruned.
export function pruneRuns(
  runsDir: string,
  nowMs: number,
  opts: { maxAgeDays?: number; keepUnscored?: number } = {},
): string[] {
  const maxAgeDays = opts.maxAgeDays ?? 14;
  const keepUnscored = opts.keepUnscored ?? 10;
  if (!existsSync(runsDir)) return [];
  const unscored = readdirSync(runsDir)
    .map((name) => ({ name, dir: path.join(runsDir, name) }))
    .filter(({ dir }) => statSync(dir).isDirectory() && !existsSync(path.join(dir, 'scores.json')))
    .map((r) => ({ ...r, mtime: statSync(r.dir).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  const removed: string[] = [];
  unscored.forEach((run, index) => {
    if (index >= keepUnscored || nowMs - run.mtime > maxAgeDays * DAY_MS) {
      rmSync(run.dir, { recursive: true, force: true });
      removed.push(run.name);
    }
  });
  return removed;
}
```

- [ ] **Step 4: Implement run.ts**

`proxy/eval/run.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { serve } from 'srvx';
import { runAsk } from '../src/ask.js';
import { PROMPT_VERSION } from '../src/card/prompt.js';
import type { CloudVendor } from '../src/card/schema.js';
import { aiSdkGenerator } from '../src/generate.js';
import { createHandler } from '../src/handler.js';
import { estimateCostUsd } from '../src/providers.js';
import { appleGenerator, fmAvailable } from './apple-fm.js';
import { hasKey, loadEnvLocal } from './env.js';
import { prepareImage } from './image.js';
import { MANIFEST_PATH, PHOTOS_DIR, RUNS_DIR } from './paths.js';
import { pruneRuns } from './retention.js';
import {
  HARNESS_VENDORS,
  type Blind,
  type HarnessVendor,
  type LocationMode,
  type Manifest,
  type ManifestCase,
  type ResultRecord,
  type RunResults,
  type Variant,
} from './types.js';

export type RunArgs = { vendors: HarnessVendor[]; location: LocationMode; deeper: boolean; cases: string[] | null; concurrency: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AskFn = (body: Record<string, unknown>) => Promise<{ status: number; body: any }>;

const parseList = (s?: string): string[] => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const isAppleVendor = (v: HarnessVendor): v is 'apple-device' | 'apple-pcc' => v === 'apple-device' || v === 'apple-pcc';

export function parseRunArgs(argv: string[]): RunArgs {
  const out: RunArgs = { vendors: [...HARNESS_VENDORS], location: 'both', deeper: true, cases: null, concurrency: 4 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--vendors') {
      out.vendors = parseList(argv[++i]).map((v) => {
        if (!(HARNESS_VENDORS as readonly string[]).includes(v)) throw new Error(`unknown vendor ${v}; expected one of ${HARNESS_VENDORS.join(', ')}`);
        return v as HarnessVendor;
      });
    } else if (a === '--location') {
      const v = argv[++i];
      if (v !== 'both' && v !== 'with' && v !== 'without') throw new Error('--location must be both, with or without');
      out.location = v;
    } else if (a === '--no-deeper') {
      out.deeper = false;
    } else if (a === '--cases') {
      out.cases = parseList(argv[++i]);
    } else if (a === '--concurrency') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) throw new Error('--concurrency must be a positive integer');
      out.concurrency = n;
    } else {
      throw new Error(`unknown argument ${a}`);
    }
  }
  return out;
}

export function resolveVendors(
  requested: HarnessVendor[],
  probes: { hasKey: (v: CloudVendor) => boolean; fmAvailable: () => boolean },
): { active: HarnessVendor[]; skipped: { vendor: HarnessVendor; reason: string }[] } {
  const active: HarnessVendor[] = [];
  const skipped: { vendor: HarnessVendor; reason: string }[] = [];
  const fm = requested.some(isAppleVendor) ? probes.fmAvailable() : false;
  for (const v of requested) {
    if (isAppleVendor(v)) {
      if (fm) active.push(v);
      else skipped.push({ vendor: v, reason: '`fm` is not on PATH (needs macOS 27 on Apple silicon)' });
    } else if (probes.hasKey(v)) {
      active.push(v);
    } else {
      skipped.push({ vendor: v, reason: 'API key not set in proxy/.env.local' });
    }
  }
  return { active, skipped };
}

export function planRequests(
  cases: ManifestCase[],
  vendors: HarnessVendor[],
  location: LocationMode,
): Array<{ c: ManifestCase; vendor: HarnessVendor; variant: Variant }> {
  const jobs: Array<{ c: ManifestCase; vendor: HarnessVendor; variant: Variant }> = [];
  for (const c of cases) {
    const variants: Variant[] =
      location === 'without' ? ['without'] : location === 'with' ? (c.approx_location ? ['with'] : []) : c.approx_location ? ['with', 'without'] : ['without'];
    for (const variant of variants) for (const vendor of vendors) jobs.push({ c, vendor, variant });
  }
  return jobs;
}

export function buildCardBody(c: ManifestCase, variant: Variant, image: Buffer | null, vendor: HarnessVendor): Record<string, unknown> {
  const context: Record<string, unknown> = { date: c.taken_at };
  if (variant === 'with' && c.approx_location) context.approx_location = c.approx_location;
  if (variant === 'with' && c.neighborhood) context.neighborhood = c.neighborhood;
  return {
    kind: 'card',
    vendor,
    ...(image ? { image: image.toString('base64') } : {}),
    ...(c.note ? { note: c.note } : {}),
    context,
  };
}

export function makeBlind(cases: ManifestCase[], vendors: HarnessVendor[], rand: () => number = Math.random): Blind {
  const blind: Blind = {};
  for (const c of cases) {
    const order = [...vendors];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    blind[c.id] = Object.fromEntries(order.map((v, i) => [String.fromCharCode(65 + i), v]));
  }
  return blind;
}

export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function safeAsk(ask: AskFn, body: Record<string, unknown>): Promise<{ status: number; body: any }> {
  try {
    return await ask(body);
  } catch (e) {
    return { status: 0, body: { error: 'vendor_error', detail: `request failed: ${e instanceof Error ? e.message : String(e)}` } };
  }
}

export async function executeRun(opts: {
  cases: ManifestCase[];
  vendors: HarnessVendor[];
  location: LocationMode;
  deeper: boolean;
  concurrency: number;
  askFor: (vendor: HarnessVendor) => AskFn;
  loadImage: (c: ManifestCase) => Promise<Buffer | null>;
  onProgress?: (done: number, total: number) => void;
}): Promise<ResultRecord[]> {
  const images = new Map<string, Buffer | null>();
  for (const c of opts.cases) images.set(c.id, await opts.loadImage(c));
  const jobs = planRequests(opts.cases, opts.vendors, opts.location);
  let done = 0;

  return mapPool(jobs, opts.concurrency, async ({ c, vendor, variant }) => {
    const ask = opts.askFor(vendor);
    const body = buildCardBody(c, variant, images.get(c.id) ?? null, vendor);
    const first = await safeAsk(ask, body);
    const rec: ResultRecord = { case_id: c.id, vendor, variant, status: first.status, card: null, meta: null, error: null, deeper: null, cost_usd: null };
    if (first.status === 200) {
      rec.card = first.body.card;
      rec.meta = first.body.meta;
    } else {
      rec.error = first.body;
    }

    const question = rec.card?.follow_ups[0];
    if (opts.deeper && rec.card && question) {
      const second = await safeAsk(ask, { ...body, kind: 'deeper', card: rec.card, question });
      rec.deeper =
        second.status === 200
          ? { question, status: 200, answer: second.body.deeper, meta: second.body.meta, error: null }
          : { question, status: second.status, answer: null, meta: null, error: second.body };
    }

    const costs = [rec.meta, rec.deeper?.meta ?? null]
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .map((m) => estimateCostUsd(m.model, m.usage))
      .filter((n): n is number => n !== null);
    rec.cost_usd = costs.length ? costs.reduce((a, b) => a + b, 0) : null;
    opts.onProgress?.(++done, jobs.length);
    return rec;
  });
}

async function main(): Promise<void> {
  loadEnvLocal();
  const args = parseRunArgs(process.argv.slice(2));
  const pruned = pruneRuns(RUNS_DIR, Date.now());
  if (pruned.length) console.log(`Pruned ${pruned.length} old unscored run(s).`);

  if (!existsSync(MANIFEST_PATH)) {
    console.error('No manifest yet. Run `npm run eval:scaffold` first.');
    process.exit(1);
  }
  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const cases = args.cases ? manifest.cases.filter((c) => args.cases?.includes(c.id)) : manifest.cases;
  if (cases.length === 0) {
    console.error('No cases to run. Add photos and run `npm run eval:scaffold`.');
    process.exit(1);
  }
  const { active, skipped } = resolveVendors(args.vendors, { hasKey, fmAvailable });
  for (const s of skipped) console.warn(`Skipping ${s.vendor}: ${s.reason}`);
  if (active.length === 0) {
    console.error('No vendors available.');
    process.exit(1);
  }

  const handler = createHandler({
    generatorFor: (v) => aiSdkGenerator(v),
    env: { ...process.env, ALLOW_VENDOR_OVERRIDE: '1' },
    log: () => {},
  });
  const server = serve({ fetch: handler, port: 0, hostname: '127.0.0.1', silent: true });
  await server.ready();
  const base = server.url as string;

  const askFor = (vendor: HarnessVendor): AskFn => {
    if (isAppleVendor(vendor)) {
      const generate = appleGenerator(vendor === 'apple-pcc' ? 'pcc' : 'device');
      return (body) => runAsk(body, { generate, vendor });
    }
    return async (body) => {
      const res = await fetch(new URL('api/ask', base), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { status: res.status, body: await res.json() };
    };
  };

  const startedAt = new Date().toISOString();
  const runId = `${startedAt.replace(/[:.]/g, '-')}-${PROMPT_VERSION}`;
  let records: ResultRecord[];
  try {
    records = await executeRun({
      cases,
      vendors: active,
      location: args.location,
      deeper: args.deeper,
      concurrency: args.concurrency,
      askFor,
      loadImage: async (c) => (c.file ? prepareImage(path.join(PHOTOS_DIR, c.file)) : null),
      onProgress: (done, total) => process.stdout.write(`\r${done}/${total} requests`),
    });
  } finally {
    await server.close();
  }
  process.stdout.write('\n');

  const runDir = path.join(RUNS_DIR, runId);
  mkdirSync(runDir, { recursive: true });
  const results: RunResults = { run_id: runId, prompt_version: PROMPT_VERSION, started_at: startedAt, vendors: active, skipped_vendors: skipped, cases, records };
  writeFileSync(path.join(runDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(path.join(runDir, 'blind.json'), `${JSON.stringify(makeBlind(cases, active), null, 2)}\n`);

  const failed = records.filter((r) => r.status !== 200).length;
  console.log(`${records.length} card request(s), ${failed} failed. Saved to ${runDir}`);
  console.log('Next: npm run eval:review');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main();
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd proxy && npm test && npm run typecheck`
Expected: all PASS; `tsc` exits 0.

- [ ] **Step 6: Exercise the CLI (no cloud calls)**

Run (Apple only, so no cloud call is made even if `.env.local` holds keys; temp data dir):
```bash
cd proxy && D=$(mktemp -d) && mkdir -p "$D/photos" && echo "hawk on the steeple" > "$D/photos/hawk.txt" \
  && VERGE_EVAL_DIR=$D npm run eval:scaffold \
  && VERGE_EVAL_DIR=$D npm run eval:run -- --vendors apple-device; echo "exit $?"; rm -rf "$D"
```
Expected (on Linux): scaffold reports `1 case(s)`; run prints `Skipping apple-device: \`fm\` is not on PATH …`
then `No vendors available.` and `exit 1`, with no stack trace.
This exercises arg parsing, manifest loading, pruning and vendor resolution. Real cloud calls
happen in Task 11.

- [ ] **Step 7: Commit**

```bash
git add proxy/eval/env.ts proxy/eval/retention.ts proxy/eval/run.ts proxy/test/eval/retention.test.ts proxy/test/eval/run.test.ts
git commit -m "feat(eval): add run command with blind labels, retention and vendor skipping"
git push
```

### Task 9: Review page with blind scoring

**Files:**
- Create: `proxy/eval/review/view.ts`, `proxy/eval/review/server.ts`
- Create: `proxy/eval/review/public/index.html`, `proxy/eval/review/public/card.js`, `proxy/eval/review/public/app.js`, `proxy/eval/review/public/styles.css`
- Test: `proxy/test/eval/card.test.ts`, `proxy/test/eval/review.test.ts`

**Interfaces:**
- Consumes: Task 1 (`EnforcedCard`, `DeeperOutput`, `AskError`); Task 2 (`enforceCard`); Task 6 (`prepareImage`, `defaultVariant`, `PHOTOS_DIR`, `resolveRunDir`, `ManifestCase`, `ResultRecord`, `RunResults`, `Blind`, `ScoreEntry`, `Scores`, `CardView`); fixtures.
- Produces (`view.ts`): `EMPTY_SCORE: ScoreEntry`; `cardView(rec: ResultRecord | undefined): CardView | null`; `buildRunView(results: RunResults, blind: Blind, scores: Scores)`.
- Produces (`server.ts`): `createReviewHandler(opts: { runDir: string; photosDir: string }): (req: Request) => Promise<Response>`.
- Produces (`public/card.js`): `renderCard(view: CardView): string` (pure string rendering, no DOM; used by the page and by Task 10's export).

- [ ] **Step 1: Write the failing tests**

`proxy/test/eval/card.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { renderCard } from '../../eval/review/public/card.js';
import { enforceCard } from '../../src/card/enforce.js';
import { validTierOne } from '../fixtures.js';

const view = (overrides = {}) => ({ status: 200, card: enforceCard(validTierOne(overrides)).card, error: null, deeper: null });

describe('renderCard', () => {
  it('shows the confidence mark, word, headline and tier-2 label', () => {
    const html = renderCard(view());
    expect(html).toContain('conf--confident');
    expect(html).toContain('CONFIDENT');
    expect(html).toContain('Common mullein');
    expect(html).toContain('WHAT TO LOOK FOR');
  });

  it('renders the safety block with the lookalike line between lead and rest', () => {
    const html = renderCard(view({ edible_or_medicinal: true, lookalike_line: 'Moonseed is poisonous.' }));
    const lead = html.indexOf("Don&#39;t eat or use anything");
    const look = html.indexOf('Moonseed is poisonous.');
    const rest = html.indexOf('This is a starting point');
    expect(html).toContain('class="safety"');
    expect(lead).toBeGreaterThan(-1);
    expect(look).toBeGreaterThan(lead);
    expect(rest).toBeGreaterThan(look);
  });

  it('renders cant_tell with two asks, Leave it a mystery, and Go deeper anyway', () => {
    const html = renderCard(view({ confidence: 'cant_tell', help_asks: ['A shot from above', 'A note on size'] }));
    expect(html).toContain('A shot from above');
    expect(html).toContain('A note on size');
    expect(html).toContain('Leave it a mystery');
    expect(html).toContain('GO DEEPER ANYWAY');
  });

  it('escapes model text', () => {
    expect(renderCard(view({ headline: '<script>x</script>' }))).not.toContain('<script>');
  });

  it('renders an error card', () => {
    expect(renderCard({ status: 502, card: null, error: { error: 'vendor_error', detail: '429' }, deeper: null })).toContain('429');
  });
});
```

`proxy/test/eval/review.test.ts`:
```ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createReviewHandler } from '../../eval/review/server.js';
import type { Blind, RunResults } from '../../eval/types.js';
import { enforceCard } from '../../src/card/enforce.js';
import { validTierOne } from '../fixtures.js';

async function fixtureRun() {
  const root = mkdtempSync(path.join(tmpdir(), 'verge-review-'));
  const photosDir = path.join(root, 'photos');
  const runDir = path.join(root, 'runs', 'r1');
  mkdirSync(photosDir, { recursive: true });
  mkdirSync(runDir, { recursive: true });
  await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toFile(path.join(photosDir, 'a.jpg'));
  const card = enforceCard(validTierOne()).card;
  const meta = { vendor: 'x', model: 'claude-haiku-5-5', prompt_version: 'p1', capped: false, latency_ms: 5, usage: { inputTokens: 1, outputTokens: 1 } };
  const rec = (vendor: 'anthropic' | 'openai', variant: 'with' | 'without') => ({ case_id: 'a', vendor, variant, status: 200, card, meta, error: null, deeper: null, cost_usd: 0.001 });
  const results: RunResults = {
    run_id: 'r1', prompt_version: 'p1', started_at: '2026-10-10T00:00:00Z', vendors: ['anthropic', 'openai'], skipped_vendors: [],
    cases: [{ id: 'a', file: 'a.jpg', note_file: null, taken_at: '2026-05-01T09:00:00', approx_location: { lat: 39.757, lng: -86.146 }, note: '', truth: '', neighborhood: '' }],
    records: [rec('anthropic', 'with'), rec('anthropic', 'without'), rec('openai', 'with'), rec('openai', 'without')],
  };
  const blind: Blind = { a: { A: 'openai', B: 'anthropic' } };
  writeFileSync(path.join(runDir, 'results.json'), JSON.stringify(results));
  writeFileSync(path.join(runDir, 'blind.json'), JSON.stringify(blind));
  return { runDir, photosDir, handler: createReviewHandler({ runDir, photosDir }) };
}

const score = (handler: (r: Request) => Promise<Response>, body: object) =>
  handler(new Request('http://local/api/score', { method: 'POST', body: JSON.stringify(body) }));

describe('review server', () => {
  it('serves the run view without vendor or model names', async () => {
    const { handler } = await fixtureRun();
    const res = await handler(new Request('http://local/api/run'));
    const text = await res.text();
    expect(res.status).toBe(200);
    for (const word of ['anthropic', 'openai', 'claude', 'gpt']) expect(text.toLowerCase()).not.toContain(word);
    const view = JSON.parse(text);
    expect(Object.keys(view.cases[0].cards)).toEqual(['A', 'B']);
    expect(view.cases[0].default_variant).toBe('with');
    expect(view.cases[0].cards.A.other).not.toBeNull();
  });

  it('persists and overwrites scores, mapping labels to vendors', async () => {
    const { handler, runDir } = await fixtureRun();
    expect((await score(handler, { case_id: 'a', label: 'A', verdict: 'send' })).status).toBe(200);
    await score(handler, { case_id: 'a', label: 'A', actually: 'purslane', location: 'helped' });
    await score(handler, { case_id: 'a', label: 'A', verdict: 'edit' });
    const saved = JSON.parse(readFileSync(path.join(runDir, 'scores.json'), 'utf8'));
    expect(Object.keys(saved)).toEqual(['a|openai']);
    expect(saved['a|openai']).toEqual({ verdict: 'edit', actually: 'purslane', safety_should_fire: false, note: '', location: 'helped' });
    await score(handler, { case_id: 'a', label: 'A', verdict: null });
    const view = await (await handler(new Request('http://local/api/run'))).json();
    expect(view.scores['a|A'].verdict).toBeNull();
    expect(view.scores['a|A'].actually).toBe('purslane');
  });

  it('rejects bad scores', async () => {
    const { handler } = await fixtureRun();
    expect((await score(handler, { case_id: 'a', label: 'A', verdict: 'great' })).status).toBe(400);
    expect((await score(handler, { case_id: 'a', label: 'Z', verdict: 'send' })).status).toBe(404);
  });

  it('serves the prepared photo and the static page', async () => {
    const { handler } = await fixtureRun();
    const photo = await handler(new Request('http://local/photo/a'));
    expect(photo.headers.get('content-type')).toBe('image/jpeg');
    const meta = await sharp(Buffer.from(await photo.arrayBuffer())).metadata();
    expect(meta.width).toBe(1000);
    expect((await handler(new Request('http://local/'))).headers.get('content-type')).toMatch(/text\/html/);
    expect((await handler(new Request('http://local/photo/missing'))).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd proxy && npx vitest run test/eval/card.test.ts test/eval/review.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement card.js (shared renderer)**

`proxy/eval/review/public/card.js`:
```js
// Pure string renderer shared by the review page (browser) and eval:export (Node). No DOM.
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ring = (extra = '') => `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" ${extra}/>`;
const MARKS = {
  confident: '<circle cx="12" cy="12" r="9" fill="currentColor"/>',
  likely: `${ring()}<path d="M12 3 a9 9 0 0 0 0 18 z" fill="currentColor"/>`,
  unsure: ring(),
  cant_tell: ring('stroke-dasharray="3 3"'),
};
const WORDS = { confident: 'Confident', likely: 'Likely', unsure: 'Unsure', cant_tell: "Can't tell from this" };

const paragraphs = (text) =>
  esc(text)
    .split(/\n\s*\n/)
    .map((p) => `<p class="body-sm">${p}</p>`)
    .join('');

export function renderCard(view) {
  if (view.status !== 200 || !view.card) {
    return `<article class="card card--error"><p class="label">ERROR ${esc(view.status)}</p><p class="body-sm">${esc(view.error?.detail ?? 'No card')}</p></article>`;
  }
  const c = view.card;
  const out = [];
  out.push(
    `<header class="conf conf--${esc(c.confidence)}"><svg class="mark" viewBox="0 0 24 24" aria-hidden="true">${MARKS[c.confidence] ?? ''}</svg>` +
      `<span class="label">${esc(WORDS[c.confidence] ?? c.confidence).toUpperCase()}</span>` +
      `<span class="label lens">${esc(c.lens)} · ${esc(c.class)}</span></header>`,
  );
  out.push(`<h2 class="headline">${esc(c.headline)}</h2><p class="body">${esc(c.summary)}</p>`);
  if (c.safety) {
    const look = c.safety.lookalike_line ? ` ${esc(c.safety.lookalike_line)}` : '';
    out.push(
      `<section class="safety"><p class="label">${esc(c.safety.heading).toUpperCase()}</p>` +
        `<p class="body-sm">${esc(c.safety.lead)}${look} ${esc(c.safety.rest)}</p></section>`,
    );
  }
  out.push(`<section class="tier"><p class="label">${esc(c.tier2_label).toUpperCase()}</p><p class="body-sm">${esc(c.tier2_body)}</p>`);
  if (c.confidence === 'cant_tell') {
    const asks = (c.help_asks ?? []).map((a) => `<li>${esc(a)} →</li>`).join('');
    out.push(`<ul class="asks">${asks}<li>Leave it a mystery →</li></ul>`);
  }
  out.push('</section>');
  const deeperLabel = c.confidence === 'cant_tell' ? 'Go deeper anyway' : 'Go deeper';
  out.push(`<section class="tier"><p class="label">${deeperLabel.toUpperCase()}</p>`);
  out.push(`<ul class="followups">${c.follow_ups.map((q) => `<li>${esc(q)} →</li>`).join('')}</ul>`);
  if (view.deeper) {
    const body = view.deeper.answer
      ? paragraphs(view.deeper.answer.answer)
      : `<p class="body-sm">Deeper call failed: ${esc(view.deeper.error?.detail)}</p>`;
    out.push(`<div class="deeper"><p class="label">ASKED: ${esc(view.deeper.question)}</p>${body}</div>`);
  }
  out.push('</section>');
  return `<article class="card">${out.join('')}</article>`;
}
```

- [ ] **Step 4: Implement view.ts and server.ts**

`proxy/eval/review/view.ts`:
```ts
import { defaultVariant } from '../manifest.js';
import type { Blind, CardView, ResultRecord, RunResults, ScoreEntry, Scores } from '../types.js';

export const EMPTY_SCORE: ScoreEntry = { verdict: null, actually: '', safety_should_fire: false, note: '', location: null };

export function cardView(rec: ResultRecord | undefined): CardView | null {
  if (!rec) return null;
  return {
    status: rec.status,
    card: rec.card,
    error: rec.error,
    deeper: rec.deeper ? { question: rec.deeper.question, answer: rec.deeper.answer, error: rec.deeper.error } : null,
  };
}

// Everything the page needs, keyed by blind label. No vendor or model names leave the server.
export function buildRunView(results: RunResults, blind: Blind, scores: Scores) {
  const cases = results.cases.map((c) => {
    const variant = defaultVariant(c);
    const cards: Record<string, { default: CardView | null; other: CardView | null }> = {};
    for (const [label, vendor] of Object.entries(blind[c.id] ?? {})) {
      const find = (v: 'with' | 'without') => results.records.find((r) => r.case_id === c.id && r.vendor === vendor && r.variant === v);
      cards[label] = { default: cardView(find(variant)), other: variant === 'with' ? cardView(find('without')) : null };
    }
    return { id: c.id, has_photo: Boolean(c.file), note: c.note, has_location: Boolean(c.approx_location), default_variant: variant, cards };
  });
  const labelScores: Record<string, ScoreEntry> = {};
  for (const [caseId, labels] of Object.entries(blind)) {
    for (const [label, vendor] of Object.entries(labels)) {
      labelScores[`${caseId}|${label}`] = scores[`${caseId}|${vendor}`] ?? EMPTY_SCORE;
    }
  }
  return { run_id: results.run_id, prompt_version: results.prompt_version, cases, scores: labelScores };
}
```

`proxy/eval/review/server.ts`:
```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serve } from 'srvx';
import { z } from 'zod';
import { prepareImage } from '../image.js';
import { PHOTOS_DIR, resolveRunDir } from '../paths.js';
import type { Blind, RunResults, ScoreEntry, Scores } from '../types.js';
import { buildRunView, EMPTY_SCORE } from './view.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const STATIC: Record<string, string> = { '/': 'index.html', '/app.js': 'app.js', '/card.js': 'card.js', '/styles.css': 'styles.css' };
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const ScorePatch = z.object({
  case_id: z.string(),
  label: z.string(),
  verdict: z.enum(['send', 'edit', 'bad']).nullable().optional(),
  actually: z.string().optional(),
  safety_should_fire: z.boolean().optional(),
  note: z.string().optional(),
  location: z.enum(['helped', 'same', 'hurt']).nullable().optional(),
});

export function createReviewHandler(opts: { runDir: string; photosDir: string }): (req: Request) => Promise<Response> {
  const results: RunResults = JSON.parse(readFileSync(path.join(opts.runDir, 'results.json'), 'utf8'));
  const blind: Blind = JSON.parse(readFileSync(path.join(opts.runDir, 'blind.json'), 'utf8'));
  const scoresPath = path.join(opts.runDir, 'scores.json');
  const readScores = (): Scores => (existsSync(scoresPath) ? JSON.parse(readFileSync(scoresPath, 'utf8')) : {});

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const file = STATIC[url.pathname];
    if (req.method === 'GET' && file) {
      return new Response(readFileSync(path.join(PUBLIC_DIR, file), 'utf8'), { headers: { 'content-type': TYPES[path.extname(file)] } });
    }
    if (req.method === 'GET' && url.pathname === '/api/run') {
      return Response.json(buildRunView(results, blind, readScores()));
    }
    if (req.method === 'GET' && url.pathname.startsWith('/photo/')) {
      const id = decodeURIComponent(url.pathname.slice('/photo/'.length));
      const c = results.cases.find((x) => x.id === id);
      const photo = c?.file ? path.join(opts.photosDir, c.file) : null;
      if (!photo || !existsSync(photo)) return new Response('not found', { status: 404 });
      return new Response(new Uint8Array(await prepareImage(photo)), { headers: { 'content-type': 'image/jpeg' } });
    }
    if (req.method === 'POST' && url.pathname === '/api/score') {
      let parsed: ReturnType<typeof ScorePatch.safeParse>;
      try {
        parsed = ScorePatch.safeParse(await req.json());
      } catch {
        return Response.json({ error: 'body is not JSON' }, { status: 400 });
      }
      if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => i.message).join('; ') }, { status: 400 });
      const { case_id, label, ...patch } = parsed.data;
      const vendor = blind[case_id]?.[label];
      if (!vendor) return Response.json({ error: 'unknown case or label' }, { status: 404 });
      const scores = readScores();
      const key = `${case_id}|${vendor}`;
      const score: ScoreEntry = { ...EMPTY_SCORE, ...scores[key], ...patch };
      scores[key] = score;
      writeFileSync(scoresPath, `${JSON.stringify(scores, null, 2)}\n`);
      return Response.json({ score });
    }
    return new Response('not found', { status: 404 });
  };
}

async function main(): Promise<void> {
  const runDir = resolveRunDir(process.argv[2]);
  const port = Number(process.env.REVIEW_PORT ?? 4777);
  const server = serve({ fetch: createReviewHandler({ runDir, photosDir: PHOTOS_DIR }), port, hostname: '127.0.0.1', silent: true });
  await server.ready();
  console.log(`Reviewing ${path.basename(runDir)} at ${server.url}  (Ctrl-C to stop)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main();
```

- [ ] **Step 5: Implement the page (index.html, app.js, styles.css)**

`proxy/eval/review/public/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Card review</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=IBM+Plex+Mono:wght@500&family=Young+Serif&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main id="app"><p class="body">Loading…</p></main>
    <script type="module" src="/app.js"></script>
  </body>
</html>
```

`proxy/eval/review/public/app.js`:
```js
import { renderCard } from './card.js';

const app = document.getElementById('app');
const state = { run: null, index: 0, showOther: {} };
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const key = (caseId, label) => `${caseId}|${label}`;

async function load() {
  state.run = await (await fetch('/api/run')).json();
  render();
}

async function save(caseId, label, patch) {
  const res = await fetch('/api/score', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ case_id: caseId, label, ...patch }),
  });
  if (!res.ok) {
    document.getElementById('status').textContent = `Save failed (${res.status})`;
    return;
  }
  state.run.scores[key(caseId, label)] = (await res.json()).score;
  render();
  document.getElementById('status').textContent = 'Saved';
}

const judged = () => Object.values(state.run.scores).filter((s) => s.verdict).length;
const total = () => state.run.cases.reduce((n, c) => n + Object.keys(c.cards).length, 0);

function column(c, label, card) {
  const s = state.run.scores[key(c.id, label)];
  const other = Boolean(state.showOther[key(c.id, label)]) && card.other;
  const view = other ? card.other : card.default;
  const attrs = (act) => `data-act="${act}" data-case="${esc(c.id)}" data-label="${esc(label)}"`;
  const pick = (act, field, value, text) =>
    `<button ${attrs(act)} data-value="${value}" aria-pressed="${s[field] === value}">${text}</button>`;
  const variantLabel = c.has_location ? (other ? ' · WITHOUT LOCATION' : ' · WITH LOCATION') : '';
  const locationControls =
    c.has_location && card.other
      ? `<div class="row"><button ${attrs('toggle')}>${other ? 'Show with location' : 'Compare without location'}</button></div>
         <div class="row">${pick('location', 'location', 'helped', 'Location helped')}${pick('location', 'location', 'same', 'No difference')}${pick('location', 'location', 'hurt', 'Hurt')}</div>`
      : '';
  return `<section class="col">
    <p class="label">CARD ${esc(label)}${variantLabel}</p>
    ${view ? renderCard(view) : '<p class="body-sm">No result for this variant.</p>'}
    <div class="controls">
      <div class="row">${pick('verdict', 'verdict', 'send', 'Send unedited')}${pick('verdict', 'verdict', 'edit', 'Needs edit')}${pick('verdict', 'verdict', 'bad', 'Bad')}</div>
      <label class="field">Actually it's… <input ${attrs('actually')} value="${esc(s.actually)}" /></label>
      <label class="check"><input type="checkbox" ${attrs('safety')} ${s.safety_should_fire ? 'checked' : ''} /> Safety block should have fired</label>
      <label class="field">Note <textarea ${attrs('note')}>${esc(s.note)}</textarea></label>
      ${locationControls}
    </div>
  </section>`;
}

function render() {
  const run = state.run;
  if (!run.cases.length) {
    app.innerHTML = '<p class="body">This run has no cases.</p>';
    return;
  }
  const c = run.cases[state.index];
  const cols = Object.entries(c.cards)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, card]) => column(c, label, card))
    .join('');
  app.innerHTML = `
    <header class="top">
      <button data-act="prev" ${state.index === 0 ? 'disabled' : ''}>← Prev</button>
      <p class="label">${esc(run.run_id)} · CASE ${state.index + 1} OF ${run.cases.length} · ${judged()}/${total()} JUDGED</p>
      <button data-act="next" ${state.index === run.cases.length - 1 ? 'disabled' : ''}>Next →</button>
      <span id="status" class="label"></span>
    </header>
    <section class="capture">
      ${c.has_photo ? `<img src="/photo/${encodeURIComponent(c.id)}" alt="Capture ${esc(c.id)}" />` : '<p class="label">NOTE-ONLY CAPTURE</p>'}
      ${c.note ? `<p class="body">“${esc(c.note)}”</p>` : ''}
    </section>
    <div class="cols">${cols}</div>`;
}

app.addEventListener('click', (e) => {
  const el = e.target.closest('button[data-act]');
  if (!el) return;
  const { act, case: caseId, label, value } = el.dataset;
  const current = caseId ? state.run.scores[key(caseId, label)] : null;
  if (act === 'prev') { state.index -= 1; render(); }
  else if (act === 'next') { state.index += 1; render(); }
  else if (act === 'verdict') save(caseId, label, { verdict: current.verdict === value ? null : value });
  else if (act === 'location') save(caseId, label, { location: current.location === value ? null : value });
  else if (act === 'toggle') { state.showOther[key(caseId, label)] = !state.showOther[key(caseId, label)]; render(); }
});

app.addEventListener('change', (e) => {
  const el = e.target;
  const { act, case: caseId, label } = el.dataset ?? {};
  if (act === 'actually') save(caseId, label, { actually: el.value.trim() });
  else if (act === 'note') save(caseId, label, { note: el.value.trim() });
  else if (act === 'safety') save(caseId, label, { safety_should_fire: el.checked });
});

document.addEventListener('keydown', (e) => {
  if (!state.run || e.target.matches('input, textarea')) return;
  if (e.key === 'ArrowRight' && state.index < state.run.cases.length - 1) { state.index += 1; render(); }
  if (e.key === 'ArrowLeft' && state.index > 0) { state.index -= 1; render(); }
});

load();
```

`proxy/eval/review/public/styles.css` (tokens from `docs/design/tokens.md` and `type.md`, light set):
```css
:root {
  --paper: #f3f2ec;
  --raised: #fbfaf7;
  --ink: #1b1916;
  --soft: #4e4a43;
  --rule: #c9c5ba;
  --moss: #2e5e3e;
  --ochre: #8f6420;
  --slate: #4f6479;
  --graphite: #6b665d;
  --brick: #9a3b2b;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 400 17px/26px 'Atkinson Hyperlegible', system-ui, sans-serif; }
main { padding: 24px; max-width: 1600px; margin: 0 auto; }
.label { font: 500 12px/16px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0.08em; text-transform: uppercase; color: var(--soft); margin: 0; }
.headline { font: 400 24px/30px 'Young Serif', Georgia, serif; margin: 12px 0 8px; }
.body { margin: 0 0 12px; }
.body-sm { font-size: 15px; line-height: 22px; color: var(--soft); margin: 0 0 12px; }
.top { display: flex; gap: 16px; align-items: center; padding-bottom: 12px; border-bottom: 1px solid var(--rule); }
.capture { padding: 24px 0; border-bottom: 1px solid var(--rule); }
.capture img { max-height: 360px; max-width: 100%; border-radius: 2px; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; padding-top: 24px; }
.card { background: var(--raised); border: 1px solid var(--rule); border-radius: 4px; padding: 16px; }
.card--error { border-color: var(--graphite); }
.conf { display: flex; align-items: center; gap: 8px; }
.conf .label { color: inherit; }
.conf .lens { margin-left: auto; color: var(--soft); }
.mark { width: 24px; height: 24px; }
.conf--confident { color: var(--moss); }
.conf--likely { color: var(--ochre); }
.conf--unsure { color: var(--slate); }
.conf--cant_tell { color: var(--graphite); }
.safety { border: 1px solid var(--brick); border-radius: 4px; padding: 12px; margin: 12px 0; }
.safety .label { color: var(--brick); }
.tier { border-top: 1px solid var(--rule); padding-top: 12px; margin-top: 12px; }
.asks, .followups { list-style: none; padding: 0; margin: 0; }
.asks li, .followups li { padding: 8px 0; border-top: 1px solid var(--rule); }
.deeper { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--rule); }
.controls { margin-top: 12px; display: grid; gap: 8px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; }
button { font: 700 15px/22px 'Atkinson Hyperlegible', sans-serif; background: transparent; color: var(--ink); border: 1px solid var(--ink); border-radius: 4px; padding: 6px 12px; cursor: pointer; }
button[aria-pressed='true'] { background: var(--ink); color: var(--raised); }
button:disabled { opacity: 0.4; cursor: default; }
.field { display: grid; gap: 4px; font-size: 15px; }
input, textarea { font: inherit; padding: 6px 8px; border: 1px solid var(--rule); border-radius: 4px; background: var(--raised); color: var(--ink); }
.check { font-size: 15px; display: flex; gap: 8px; align-items: center; }
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `cd proxy && npm test && npm run typecheck`
Expected: all PASS; `tsc` exits 0.

- [ ] **Step 7: Exercise the server CLI**

Run: `cd proxy && VERGE_EVAL_DIR=$(mktemp -d) npm run eval:review`
Expected: exits non-zero and the output includes `No runs yet. Run \`npm run eval:run\` first.`
A visual check in a browser happens in Task 11 with a real run.

- [ ] **Step 8: Commit**

```bash
git add proxy/eval/review proxy/test/eval/card.test.ts proxy/test/eval/review.test.ts
git commit -m "feat(eval): add blind review page with card renderer and score persistence"
git push
```

**End of Batch D.** Update the ledger (batch D done) and stop.

---

## Batch E

### Task 10: Summary and export

**Files:**
- Create: `proxy/eval/summary.ts`, `proxy/eval/export.ts`
- Test: `proxy/test/eval/summary.test.ts`, `proxy/test/eval/export.test.ts`

**Interfaces:**
- Consumes: Task 6 (`defaultVariant`, `prepareImage`, `PHOTOS_DIR`, `resolveRunDir`); Task 6 (`RunResults`, `ResultRecord`, `HarnessVendor`, `Scores`, `ScoreEntry`); Task 9 (`cardView`, `renderCard`); fixtures.
- Produces (`summary.ts`): `type VendorSummary = { vendor: HarnessVendor; cases: number; judged: number; send_unedited: number; needs_edit: number; bad: number; accuracy: number | null; safety_misses: number; capped: number; cant_tell: number; errors: number; location: { helped: number; same: number; hurt: number }; p50_latency_ms: number | null; mean_cost_usd: number | null }`; `passBar(cases: number): number`; `summarize(results: RunResults, scores: Scores): VendorSummary[]`; `formatSummary(rows: VendorSummary[], compare?: VendorSummary[]): string`.
- Produces (`export.ts`): `pickCards(results: RunResults, scores: Scores, opts: { pick: number; vendor?: HarnessVendor; ids?: string[] }): { vendor: HarnessVendor; records: ResultRecord[] }`; `renderExport(items: Array<{ imageDataUri: string | null; note: string; html: string }>, css: string): string`.

- [ ] **Step 1: Write the failing tests**

`proxy/test/eval/summary.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatSummary, passBar, summarize } from '../../eval/summary.js';
import type { ResultRecord, RunResults, Scores } from '../../eval/types.js';
import { enforceCard } from '../../src/card/enforce.js';
import { validTierOne } from '../fixtures.js';

const meta = (latency: number, capped = false) => ({ vendor: 'x', model: 'claude-haiku-5-5', prompt_version: 'p1', capped, latency_ms: latency, usage: { inputTokens: 1, outputTokens: 1 } });
const rec = (case_id: string, vendor: 'anthropic' | 'openai', variant: 'with' | 'without', extra: Partial<ResultRecord> = {}): ResultRecord => ({
  case_id, vendor, variant, status: 200, card: enforceCard(validTierOne()).card, meta: meta(100), error: null, deeper: null, cost_usd: 0.002, ...extra,
});

const results: RunResults = {
  run_id: 'r', prompt_version: 'p1', started_at: 'x', vendors: ['anthropic', 'openai'], skipped_vendors: [],
  cases: [
    { id: 'a', file: 'a.jpg', note_file: null, taken_at: '2026-05-01', approx_location: { lat: 1, lng: 2 }, note: '', truth: '', neighborhood: '' },
    { id: 'b', file: null, note_file: 'b.txt', taken_at: '2026-05-01', approx_location: null, note: 'hawk', truth: '', neighborhood: '' },
    { id: 'c', file: 'c.jpg', note_file: null, taken_at: '2026-05-01', approx_location: null, note: '', truth: '', neighborhood: '' },
  ],
  records: [
    rec('a', 'anthropic', 'with', { meta: meta(300, true) }),
    rec('a', 'anthropic', 'without'),
    rec('b', 'anthropic', 'without', { card: enforceCard(validTierOne({ confidence: 'cant_tell', help_asks: ['x', 'y'] })).card }),
    rec('c', 'anthropic', 'without', { status: 502, card: null, meta: null, error: { error: 'vendor_error', detail: '429' }, cost_usd: null }),
    rec('a', 'openai', 'with'),
    rec('b', 'openai', 'without'),
    rec('c', 'openai', 'without'),
  ],
};

const e = (verdict: 'send' | 'edit' | 'bad' | null, extra = {}) => ({ verdict, actually: '', safety_should_fire: false, note: '', location: null, ...extra });
const scores: Scores = {
  'a|anthropic': e('send', { location: 'helped' }),
  'b|anthropic': e('edit', { actually: 'red-tailed hawk' }),
  'c|anthropic': e('bad', { safety_should_fire: true }),
  'a|openai': e('send'),
  'b|openai': e('send'),
  'c|openai': e('send'),
};

describe('summarize', () => {
  it('computes per-vendor tallies on default variants', () => {
    const [anthropic, openai] = summarize(results, scores);
    expect(anthropic).toMatchObject({
      vendor: 'anthropic', cases: 3, judged: 3, send_unedited: 1, needs_edit: 1, bad: 1,
      safety_misses: 1, capped: 1, cant_tell: 1, errors: 1, location: { helped: 1, same: 0, hurt: 0 },
    });
    expect(anthropic.accuracy).toBeCloseTo(2 / 3);
    expect(anthropic.p50_latency_ms).toBe(100);
    expect(anthropic.mean_cost_usd).toBeCloseTo(0.002);
    expect(openai.send_unedited).toBe(3);
  });

  it('handles a run with no scores', () => {
    const [anthropic] = summarize(results, {});
    expect(anthropic.judged).toBe(0);
    expect(anthropic.accuracy).toBeNull();
  });
});

describe('passBar / formatSummary', () => {
  it('is two thirds of cases, rounded up (20 of 30)', () => {
    expect(passBar(30)).toBe(20);
    expect(passBar(3)).toBe(2);
  });

  it('marks vendors that clear the bar and shows deltas against a compare run', () => {
    const rows = summarize(results, scores);
    const text = formatSummary(rows, summarize(results, {}));
    expect(text).toMatch(/openai.*PASS/);
    expect(text).not.toMatch(/anthropic.*PASS/);
    expect(text).toContain('(+3)');
  });
});
```

`proxy/test/eval/export.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { pickCards, renderExport } from '../../eval/export.js';
import type { ResultRecord, RunResults, Scores } from '../../eval/types.js';
import { enforceCard } from '../../src/card/enforce.js';
import { validTierOne } from '../fixtures.js';

const card = enforceCard(validTierOne()).card;
const meta = { vendor: 'x', model: 'claude-haiku-5-5', prompt_version: 'p1', capped: false, latency_ms: 1, usage: { inputTokens: 1, outputTokens: 1 } };
const rec = (case_id: string, vendor: 'anthropic' | 'openai'): ResultRecord => ({ case_id, vendor, variant: 'without', status: 200, card, meta, error: null, deeper: null, cost_usd: 0 });
const cases = ['a', 'b', 'c'].map((id) => ({ id, file: null, note_file: `${id}.txt`, taken_at: '2026-05-01', approx_location: null, note: `note ${id}`, truth: '', neighborhood: '' }));
const results: RunResults = { run_id: 'r', prompt_version: 'p1', started_at: 'x', vendors: ['anthropic', 'openai'], skipped_vendors: [], cases, records: cases.flatMap((c) => [rec(c.id, 'anthropic'), rec(c.id, 'openai')]) };
const e = (verdict: 'send' | 'edit' | 'bad') => ({ verdict, actually: '', safety_should_fire: false, note: '', location: null });
const scores: Scores = { 'a|openai': e('bad'), 'b|openai': e('send'), 'c|openai': e('send'), 'a|anthropic': e('edit') };

describe('pickCards', () => {
  it('defaults to the vendor with most send-unedited and orders best first', () => {
    const { vendor, records } = pickCards(results, scores, { pick: 2 });
    expect(vendor).toBe('openai');
    expect(records.map((r) => r.case_id)).toEqual(['b', 'c']);
  });

  it('honours explicit ids and vendor', () => {
    const { records } = pickCards(results, scores, { pick: 10, vendor: 'anthropic', ids: ['a'] });
    expect(records.map((r) => `${r.case_id}|${r.vendor}`)).toEqual(['a|anthropic']);
  });
});

describe('renderExport', () => {
  it('produces a standalone page with no vendor names', () => {
    const html = renderExport([{ imageDataUri: null, note: 'note a', html: '<article class="card">Common mullein</article>' }], 'body{}');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Common mullein');
    expect(html).toContain('note a');
    // 'google' is omitted on purpose: the Google Fonts stylesheet URL contains it.
    for (const word of ['anthropic', 'openai', 'claude', 'gpt', 'gemini']) expect(html.toLowerCase()).not.toContain(word);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd proxy && npx vitest run test/eval/summary.test.ts test/eval/export.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement summary.ts**

`proxy/eval/summary.ts`:
```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultVariant } from './manifest.js';
import { resolveRunDir } from './paths.js';
import type { HarnessVendor, ResultRecord, RunResults, ScoreEntry, Scores } from './types.js';

export type VendorSummary = {
  vendor: HarnessVendor;
  cases: number;
  judged: number;
  send_unedited: number;
  needs_edit: number;
  bad: number;
  accuracy: number | null;
  safety_misses: number;
  capped: number;
  cant_tell: number;
  errors: number;
  location: { helped: number; same: number; hurt: number };
  p50_latency_ms: number | null;
  mean_cost_usd: number | null;
};

// The spec's bar: 20 of 30 cards send-unedited, i.e. two thirds of the cases.
export function passBar(cases: number): number {
  return Math.ceil((cases * 2) / 3);
}

export function summarize(results: RunResults, scores: Scores): VendorSummary[] {
  return results.vendors.map((vendor) => {
    const all = results.records.filter((r) => r.vendor === vendor);
    const defaults = results.cases
      .map((c) => all.find((r) => r.case_id === c.id && r.variant === defaultVariant(c)))
      .filter((r): r is ResultRecord => Boolean(r));
    const entries = results.cases.map((c) => scores[`${c.id}|${vendor}`]).filter((s): s is ScoreEntry => Boolean(s));
    const judged = entries.filter((s) => s.verdict);
    const corrected = judged.filter((s) => s.actually.trim());
    const latencies = all
      .map((r) => r.meta?.latency_ms)
      .filter((n): n is number => typeof n === 'number')
      .sort((a, b) => a - b);
    const costs = all.map((r) => r.cost_usd).filter((n): n is number => typeof n === 'number');
    return {
      vendor,
      cases: results.cases.length,
      judged: judged.length,
      send_unedited: judged.filter((s) => s.verdict === 'send').length,
      needs_edit: judged.filter((s) => s.verdict === 'edit').length,
      bad: judged.filter((s) => s.verdict === 'bad').length,
      accuracy: judged.length ? (judged.length - corrected.length) / judged.length : null,
      safety_misses: entries.filter((s) => s.safety_should_fire).length,
      capped: defaults.filter((r) => r.meta?.capped).length,
      cant_tell: defaults.filter((r) => r.card?.confidence === 'cant_tell').length,
      errors: all.filter((r) => r.status !== 200).length,
      location: {
        helped: entries.filter((s) => s.location === 'helped').length,
        same: entries.filter((s) => s.location === 'same').length,
        hurt: entries.filter((s) => s.location === 'hurt').length,
      },
      p50_latency_ms: latencies.length ? latencies[Math.floor((latencies.length - 1) / 2)] : null,
      mean_cost_usd: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    };
  });
}

const pct = (n: number | null) => (n === null ? '-' : `${Math.round(n * 100)}%`);

export function formatSummary(rows: VendorSummary[], compare?: VendorSummary[]): string {
  const lines: string[] = [];
  const bar = rows[0] ? passBar(rows[0].cases) : 0;
  lines.push(`Pass bar: ${bar} of ${rows[0]?.cases ?? 0} send-unedited (spec: 20 of 30).`);
  lines.push('');
  for (const r of rows) {
    const prev = compare?.find((c) => c.vendor === r.vendor);
    const delta = prev ? ` (${r.send_unedited - prev.send_unedited >= 0 ? '+' : ''}${r.send_unedited - prev.send_unedited})` : '';
    lines.push(
      `${r.vendor.padEnd(13)} send ${r.send_unedited}/${r.cases}${delta}  edit ${r.needs_edit}  bad ${r.bad}  judged ${r.judged}` +
        `  ${r.send_unedited >= bar && r.cases > 0 ? 'PASS' : ''}`,
    );
    lines.push(
      `${''.padEnd(13)} accuracy ${pct(r.accuracy)}  safety misses ${r.safety_misses}  capped ${r.capped}  can't tell ${r.cant_tell}  errors ${r.errors}`,
    );
    lines.push(
      `${''.padEnd(13)} location helped/same/hurt ${r.location.helped}/${r.location.same}/${r.location.hurt}` +
        `  p50 ${r.p50_latency_ms ?? '-'} ms  cost/ask ${r.mean_cost_usd === null ? '-' : `$${r.mean_cost_usd.toFixed(4)}`}`,
    );
  }
  return lines.join('\n');
}

function load(runDir: string): { results: RunResults; scores: Scores } {
  const results: RunResults = JSON.parse(readFileSync(path.join(runDir, 'results.json'), 'utf8'));
  const scoresPath = path.join(runDir, 'scores.json');
  return { results, scores: existsSync(scoresPath) ? JSON.parse(readFileSync(scoresPath, 'utf8')) : {} };
}

function main(): void {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--compare');
  const compareArg = i >= 0 ? argv[i + 1] : undefined;
  const positional = argv.find((a, j) => a !== '--compare' && !(i >= 0 && j === i + 1));
  const current = load(resolveRunDir(positional));
  const compare = compareArg ? load(resolveRunDir(compareArg)) : null;
  console.log(`Run ${current.results.run_id} (prompt ${current.results.prompt_version})`);
  if (compare) console.log(`Compared with ${compare.results.run_id} (prompt ${compare.results.prompt_version})`);
  console.log(formatSummary(summarize(current.results, current.scores), compare ? summarize(compare.results, compare.scores) : undefined));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
```


- [ ] **Step 4: Implement export.ts**

`proxy/eval/export.ts`:
```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareImage } from './image.js';
import { defaultVariant } from './manifest.js';
import { PHOTOS_DIR, resolveRunDir } from './paths.js';
import { renderCard } from './review/public/card.js';
import { cardView } from './review/view.js';
import { summarize } from './summary.js';
import { HARNESS_VENDORS, type HarnessVendor, type ResultRecord, type RunResults, type Scores } from './types.js';

const RANK: Record<string, number> = { send: 0, edit: 1, none: 2, bad: 3 };
const CSS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'review', 'public', 'styles.css');

export function pickCards(
  results: RunResults,
  scores: Scores,
  opts: { pick: number; vendor?: HarnessVendor; ids?: string[] },
): { vendor: HarnessVendor; records: ResultRecord[] } {
  const vendor =
    opts.vendor ?? [...summarize(results, scores)].sort((a, b) => b.send_unedited - a.send_unedited)[0]?.vendor ?? results.vendors[0];
  const order = new Map(results.cases.map((c, i) => [c.id, i]));
  const records = results.cases
    .filter((c) => !opts.ids || opts.ids.includes(c.id))
    .map((c) => results.records.find((r) => r.case_id === c.id && r.vendor === vendor && r.variant === defaultVariant(c)))
    .filter((r): r is ResultRecord => Boolean(r && r.status === 200 && r.card))
    .sort((a, b) => {
      const ra = RANK[scores[`${a.case_id}|${vendor}`]?.verdict ?? 'none'];
      const rb = RANK[scores[`${b.case_id}|${vendor}`]?.verdict ?? 'none'];
      return ra - rb || (order.get(a.case_id) ?? 0) - (order.get(b.case_id) ?? 0);
    })
    .slice(0, opts.pick);
  return { vendor, records };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export function renderExport(items: Array<{ imageDataUri: string | null; note: string; html: string }>, css: string): string {
  const body = items
    .map(
      (it) =>
        `<section class="capture">${it.imageDataUri ? `<img src="${it.imageDataUri}" alt="">` : '<p class="label">NOTE-ONLY CAPTURE</p>'}` +
        `${it.note ? `<p class="body">“${esc(it.note)}”</p>` : ''}</section><div class="cols">${it.html}</div>`,
    )
    .join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verge cards</title>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=IBM+Plex+Mono:wght@500&family=Young+Serif&display=swap" rel="stylesheet">
<style>${css}</style></head><body><main>${body}</main></body></html>`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const flagged = new Set(['--pick', '--vendor', '--ids'].flatMap((f) => (argv.includes(f) ? [argv.indexOf(f), argv.indexOf(f) + 1] : [])));
  const runDir = resolveRunDir(argv.find((_, j) => !flagged.has(j)));
  const pick = Number(flag('--pick') ?? 10);
  const vendorArg = flag('--vendor');
  if (vendorArg && !(HARNESS_VENDORS as readonly string[]).includes(vendorArg)) throw new Error(`unknown vendor ${vendorArg}`);
  const ids = flag('--ids')?.split(',').map((s) => s.trim()).filter(Boolean);

  const results: RunResults = JSON.parse(readFileSync(path.join(runDir, 'results.json'), 'utf8'));
  const scoresPath = path.join(runDir, 'scores.json');
  const scores: Scores = existsSync(scoresPath) ? JSON.parse(readFileSync(scoresPath, 'utf8')) : {};
  const { records } = pickCards(results, scores, { pick, vendor: vendorArg as HarnessVendor | undefined, ids });

  const items = await Promise.all(
    records.map(async (r) => {
      const c = results.cases.find((x) => x.id === r.case_id);
      const photo = c?.file ? path.join(PHOTOS_DIR, c.file) : null;
      const imageDataUri = photo && existsSync(photo) ? `data:image/jpeg;base64,${(await prepareImage(photo)).toString('base64')}` : null;
      return { imageDataUri, note: c?.note ?? '', html: renderCard(cardView(r)) };
    }),
  );
  const out = path.join(runDir, 'export.html');
  writeFileSync(out, renderExport(items, readFileSync(CSS_PATH, 'utf8')));
  console.log(`Wrote ${items.length} card(s) to ${out}`);
  console.log('The export omits which vendor produced the cards; `npm run eval:summary` has that.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main();
```


- [ ] **Step 5: Run the tests and typecheck**

Run: `cd proxy && npm test && npm run typecheck`
Expected: all PASS; `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add proxy/eval/summary.ts proxy/eval/export.ts proxy/test/eval/summary.test.ts proxy/test/eval/export.test.ts
git commit -m "feat(eval): add run summary with pass bar and vendor-free card export"
git push
```

### Task 11: Live smoke test, eval README, real-flow verification, PR

**Files:**
- Create: `proxy/vitest.smoke.config.ts`, `proxy/test/smoke/live.test.ts`, `proxy/eval/README.md`
- Modify: ledger

**Interfaces:**
- Consumes: Task 4 (`aiSdkGenerator`), Task 5 (`runAsk`), Task 8 (`loadEnvLocal`, `hasKey`), Task 1 (`CLOUD_VENDORS`), all eval CLIs.
- Produces: `npm run smoke`; the eval README; verification evidence in the ledger; the PR.

- [ ] **Step 1: Write the smoke config and test**

`proxy/vitest.smoke.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['test/smoke/**/*.test.ts'], testTimeout: 120_000 },
});
```

`proxy/test/smoke/live.test.ts`:
```ts
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { hasKey, loadEnvLocal } from '../../eval/env.js';
import { runAsk } from '../../src/ask.js';
import { CLOUD_VENDORS } from '../../src/card/schema.js';
import { aiSdkGenerator } from '../../src/generate.js';

loadEnvLocal();
const image = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 46, g: 94, b: 62 } } }).jpeg().toBuffer();

// Real vendor calls, one per vendor with a key. A synthetic image usually yields
// unsure/cant_tell; the point is a schema-valid, guarded card end to end.
for (const vendor of CLOUD_VENDORS) {
  describe.skipIf(!hasKey(vendor))(`live ${vendor}`, () => {
    it('returns a schema-valid card for a real request', async () => {
      const out = await runAsk(
        { kind: 'card', image: image.toString('base64'), note: 'A green patch on a sidewalk', context: { date: '2026-10-10' } },
        { generate: aiSdkGenerator(vendor), vendor },
      );
      expect(out.status, JSON.stringify(out.body)).toBe(200);
    });
  });
}
```

- [ ] **Step 2: Run the smoke test**

Run: `cd proxy && npm run smoke`
Expected: one PASS per vendor whose key is set; vendors without keys are reported skipped.
If every vendor is skipped, record under "Needs Chase": "fill API keys in `proxy/.env.local`
(names in `.env.local.example`) and run `npm run smoke`". Do not read the file to check; the
skip report is the evidence.

- [ ] **Step 3: Write the eval README**

`proxy/eval/README.md`:
````markdown
# Answer-card eval harness

Runs your walk photos through every vendor and lets you judge the cards blind.
Nothing here needs filling in by hand.

## Setup (once)

1. `cd proxy && npm install`
2. Copy `.env.local.example` to `.env.local` and fill in the keys you have. Vendors without a key are skipped.
3. For the Apple candidates, run on an Apple-silicon Mac with macOS 27 (`fm` must be on PATH).

## Each round

1. Drop photos into `eval/photos/` (JPEG/PNG/WebP; export iPhone HEIC as JPEG). Optional: a same-name
   `.txt` beside a photo is its note; a `.txt` alone is a note-only case.
2. `npm run eval:scaffold`: builds `eval/manifest.json` from EXIF (date, GPS rounded to ~100 m).
   Editing it is optional (`truth`, `neighborhood`, `note`); re-running keeps your edits.
3. `npm run eval:run`: every case × vendor, with and without location, plus one go-deeper question
   per card. Flags: `-- --vendors anthropic,openai --location without --no-deeper --cases a,b --concurrency 4`.
4. `npm run eval:review`: open the printed URL. One verdict per card; "actually it's…" only when
   it's wrong; tap "Compare without location" then helped / no difference / hurt if you like.
5. `npm run eval:summary` (add `-- --compare <older-run>` after a prompt change).
6. `npm run eval:export -- --pick 10`: a vendor-free page of ten cards to show people.

Bump `PROMPT_VERSION` in `src/card/prompt.ts` whenever you change the prompt.

## Apple schema mode

The Apple adapter asks for JSON in the prompt by default. To try guided generation:
`APPLE_FM_SCHEMA_MODE=json-schema npm run eval:run -- --vendors apple-device --cases <one-id>`.
If `fm` rejects the schema file, stay on the default and note it in the ledger.

## Retention

Unscored runs older than 14 days, or beyond the newest 10 unscored, are deleted at the start of
`eval:run`. Runs you've scored are never deleted automatically.

## Privacy

`eval/photos/`, `eval/manifest.json` and `eval/runs/` are gitignored. Photos leave the machine only
as resized, metadata-stripped JPEGs sent to the vendor being asked.
````

- [ ] **Step 4: Real-flow verification on synthetic captures (agent-runnable)**

Exercise the whole pipeline end to end in a temp data dir, with real vendors when keys exist:
```bash
cd proxy
D=$(mktemp -d); mkdir -p "$D/photos"
node -e "const s=require('sharp');s({create:{width:1600,height:1200,channels:3,background:{r:120,g:90,b:60}}}).jpeg().toFile('$D/photos/brick.jpg')"
echo "a hawk sitting on a church steeple" > "$D/photos/hawk.txt"
VERGE_EVAL_DIR=$D npm run eval:scaffold
VERGE_EVAL_DIR=$D npm run eval:run -- --vendors anthropic,openai,google --concurrency 2
VERGE_EVAL_DIR=$D REVIEW_PORT=4799 npx tsx eval/review/server.ts & SERVER=$!
sleep 2
curl -s 127.0.0.1:4799/api/run | head -c 400; echo
curl -s -X POST 127.0.0.1:4799/api/score -H 'content-type: application/json' -d '{"case_id":"hawk","label":"A","verdict":"send"}'; echo
kill $SERVER
VERGE_EVAL_DIR=$D npm run eval:summary
VERGE_EVAL_DIR=$D npm run eval:export -- --pick 2
```
Expected: scaffold reports 2 cases; run reports requests with 0 failures for vendors that have keys
(skips the rest); `/api/run` JSON has no vendor names; the score POST returns `{"score":…}`;
summary prints a row per active vendor with `send 1/2` for the scored one; export writes
`export.html`. If no vendor has a key, `eval:run` exits with "No vendors available": record it
under "Needs Chase" and skip the remaining commands in this step.
Record the exact outputs (counts, not card text) in the ledger. Delete `$D` afterwards.

- [ ] **Step 5: Record what only Chase can verify**

Add to the ledger under "Needs Chase" (keep any items already there):
- Fill API keys in `proxy/.env.local`, then `npm run smoke`.
- Put ≥ 3 of your own JPEG photos in `proxy/eval/photos/`, then scaffold → run → open the review
  page in a browser and judge them → summary. Confirm a GPS-tagged photo shows "with location"
  (verifies EXIF GPS reading on a real phone photo).
- On the Mac (macOS 27): `fm respond --help` and `fm schema --help`; confirm the flags used in
  `eval/apple-fm.ts` (`--instructions`, `--image`, `--model pcc`, `--schema`); run
  `npm run eval:run -- --vendors apple-device,apple-pcc --cases <one-id>`; then try
  `APPLE_FM_SCHEMA_MODE=json-schema` once and note whether `fm` accepts a JSON Schema file.
- Then the full 30-photo round per the spec.

- [ ] **Step 6: Commit, push and open the PR**

```bash
git add proxy/vitest.smoke.config.ts proxy/test/smoke/live.test.ts proxy/eval/README.md docs/superpowers/plans/2026-10-10-answer-card-ledger.md
git commit -m "test(proxy): add live smoke test and eval README; record real-flow verification"
git push
gh pr create --base main --head feat/answer-card --title "feat: answer-card proxy and eval harness (sub-project 1)" --body "$(cat <<'EOF'
Implements docs/superpowers/specs/2026-10-10-answer-card-design.md per docs/superpowers/plans/2026-10-10-answer-card.md.

- proxy/: card schema, guardrails, prompts, AI SDK generator (Anthropic/OpenAI/Google), ask pipeline and Vercel fetch handler
- proxy/eval/: scaffold, run (with Apple fm adapter), blind review page, summary, export, retention
- Verification and remaining Chase-only steps: see the ledger

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
If `docs/answer-card-spec` (PR #1) is not merged yet, open this PR with `--base docs/answer-card-spec`
instead and say so in the ledger. Record the PR URL in the ledger, commit and push it.

**End of Batch E.** Mark batch E done in the ledger (or `needs_chase` if Step 2 or 4 was blocked
on keys) and stop.
