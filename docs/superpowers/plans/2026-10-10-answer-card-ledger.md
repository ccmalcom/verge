# Answer Card: Execution Ledger

Plan: `docs/superpowers/plans/2026-10-10-answer-card.md`
Branch: `feat/answer-card`
Launcher: saved workflow `.claude/workflows/execute-plan.js` (one fresh agent per batch, review gate after each)

The state of record. Update after every task, commit and push it with the task.

## Batches

| Batch | Tasks | Status | Review |
|---|---|---|---|
| A | 1, 2 | done | |
| B | 3, 4, 5 | done | |
| C | 6, 7 | pending | |
| D | 8, 9 | pending | |
| E | 10, 11 | pending | |

Status values: `pending`, `in_progress`, `done`, `needs_chase` (done except items below), `blocked`.

## Task log

One entry per finished task, appended in order:

```
### Task N: <name>
- Done: <what was built, commits>
- Verified: <commands run and their result: test count, typecheck, CLI output>
- Deferred: <anything intentionally left, and why; "none">
- Next: <next task or "end of batch">
```

### Task 1: Proxy package scaffold and card schema
- Done: `proxy/` package (ESM, Node >=22.12) with deps installed by `npm install` inside `proxy/` (ai 7.0.137+, @ai-sdk/anthropic 4.0.78, openai 4.0.91, google 4.0.93, zod 4.6.5; dev: typescript 6.0.3, vitest 5.0.3, vite 8.3.4, tsx 4.23.15, srvx, sharp 0.35.5, exifr, heic-decode, @types/node 22); `tsconfig.json`, `vitest.config.ts`, `.env.local.example` (key names only); `src/card/schema.ts`; `test/fixtures.ts`; `test/schema.test.ts`. Root `tsconfig.json` excludes `proxy` and `node_modules`; root `.gitignore` gains the three eval data paths. Branch `feat/answer-card` created from `origin/main` (spec branch already merged) and pushed.
- Verified: `npx vitest run test/schema.test.ts` failed first on the unresolved `../src/card/schema.js` import; after implementation `npm test` → 10/10 passed, `npm run typecheck` → tsc exit 0. Root app `npx tsc --noEmit` → exit 0 (exclude does not break the app).
- Deferred: none.
- Next: Task 2.

### Task 2: Context helpers and deterministic guardrails
- Done: `src/card/context.ts` (`seasonFor`, `roundCoord`, `roundLocation`, `contextText`) and `src/card/enforce.ts` (fixed safety copy, `checkCardRules`, `enforceCard` with edible cap at `likely` + safety block, help_asks kept only for `cant_tell`, follow_ups trimmed to three; `enforceDeeper`); tests `test/context.test.ts`, `test/enforce.test.ts`. Code exactly as the plan wrote it.
- Verified: `npx vitest run test/context.test.ts test/enforce.test.ts` failed first ("Cannot find module '../src/card/context.js'" / "'../src/card/enforce.js'"); after implementation `npm test` → 3 files, 33/33 passed; `npm run typecheck` → tsc exit 0. No CLI step in this task.
- Deferred: none.
- Next: end of batch (Batch B starts at Task 3).

### Task 3: Card prompts
- Done: `src/card/prompt.ts` (`PROMPT_VERSION = 'p1'`, `TIER1_INSTRUCTIONS`, `DEEPER_INSTRUCTIONS`, `tierOneUserText`, `deeperUserText`) and `test/prompt.test.ts`. Code exactly as the plan wrote it.
- Verified: `npx vitest run test/prompt.test.ts` failed first ("Cannot find module '../src/card/prompt.js'"); after implementation `npm test` → 4 files, 40/40 passed; `npm run typecheck` → tsc exit 0. No CLI step in this task.
- Deferred: none.
- Next: Task 4.

### Task 4: Providers and the AI SDK generator
- Done: `src/providers.ts` (`MODELS`, `PRICES_PER_MTOK`, `KEY_ENV`, `languageModel`, `estimateCostUsd`) and `src/generate.ts` (`Tier`, `UserContent`, `GenerateArgs`, `GenerateResult`, `Generator`, `InvalidOutputError`, `VendorError`, `aiSdkGenerator` on `generateText` + `Output.object`, image as a `file` part); tests `test/providers.test.ts`, `test/generate.test.ts` (MockLanguageModelV4). Code exactly as the plan wrote it; the inline content-part union type-checked, so the `TextPart`/`FilePart` fallback was not needed.
- Verified: `npx vitest run test/providers.test.ts test/generate.test.ts` failed first ("Cannot find module '../src/generate.js'" / "'../src/providers.js'"); after implementation `npm test` → 6 files, 47/47 passed; `npm run typecheck` → tsc exit 0. No CLI step in this task (live vendor calls are Task 11's smoke test).
- Deferred: none.
- Next: Task 5.

### Task 5: Ask pipeline and fetch handler
- Done: `src/ask.ts`, `src/handler.ts`, `api/ask.ts`; tests `test/fakes.ts`, `test/ask.test.ts`, `test/handler.test.ts`. Committed as `e08a704` (committed by Chase after the agent's commit command was blocked by the secrets hook). One test-only typing deviation, below.
- Verified: `npm test` → 8 files, 64/64 passed; `npm run typecheck` → tsc exit 0. Real-flow check ran without vendor keys loaded: each request logged only vendor, model, status, latency and token counts, with no note text or coordinates.
- Deferred: none. Live vendor calls are Task 11's smoke test.
- Next: end of batch (Batch C starts at Task 6).

## Needs Chase

Items only Chase can supply. Add, never silently drop.

(none yet)

## Deviations from the plan

Any place the code had to differ from the plan's text (an API that behaved differently, a type
that needed adjusting), with the reason.

- Task 5, `proxy/test/handler.test.ts:30`: `(await res.json())` became `((await res.json()) as { card: { headline: string } })`. With @types/node 22, `Response.json()` returns `Promise<unknown>`, so tsc raised TS2571. Type-only; the assertion and expected value are unchanged, and no production code differs from the plan.
