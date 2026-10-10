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
| C | 6, 7 | needs_chase | |
| D | 8, 9 | done | |
| E | 10, 11 | needs_chase | |

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

### Task 6: Image prep, photo metadata and manifest scaffold
- Done: `proxy/eval/paths.ts`, `types.ts`, `image.ts` (`isHeic`, `prepareImage` with HEIC through heic-decode, `readPhotoMeta`), `heic-decode.d.ts`, `manifest.ts` (`caseId`, `defaultVariant`, `scaffold`), `scaffold.ts` CLI; tests `test/eval/image.test.ts`, `test/eval/image-heic.test.ts`, `test/eval/scaffold.test.ts`. Code as the plan wrote it except one type import (see Deviations). sharp's `withExif` exists in 0.35, so the `withMetadata` fallback was not needed.
- Verified: `npx vitest run test/eval` failed first (3 files, "Cannot find module '../../eval/image.js'" / "'../../eval/manifest.js'"); after implementation `npm test` → 11 files, 78/78 passed; `npm run typecheck` → tsc exit 0. CLI: `VERGE_EVAL_DIR=$(mktemp -d) npm run eval:scaffold` printed `0 case(s), 0 with location, written to …/manifest.json` and the "Add photos" hint, exit 0. Extra real-flow run on synthetic files in a temp `VERGE_EVAL_DIR`: a 2400x1600 JPEG carrying EXIF DateTimeOriginal and GPS scaffolded with `taken_at: 2026-05-01T09:15:00` and location rounded to `{39.757, -86.146}`; a PNG and a note-only `.txt` fell back to mtime with null location; `notes.md` was warned and skipped; `prepareImage` on the JPEG gave a 1000x667 JPEG with no GPS left; a fake HEIC header through the real (unmocked) heic-decode threw `could not decode HEIC (buffer): HEIF image not found`.
- Deferred: none. Observations for Task 8: (1) libheif writes its own "Could not parse HEIF file ..." line to the console before the error is thrown; harmless noise. (2) A file named `.heic` whose bytes are not HEIF at all is not routed to heic-decode (`isHeic` checks bytes), so it fails with sharp's `Input buffer contains unsupported image format`, which names no file; Task 8's per-case error handling should prefix the case id.
- Next: Task 7.

### Task 7: Apple `fm` CLI adapter
- Done: `proxy/eval/apple-fm.ts` (`AppleMode`, `FmRunner`, `fmAvailable`, `parseFmOutput`, `appleGenerator` with `prompt` and `json-schema` modes; model names `apple-on-device` / `apple-pcc`) and `test/eval/apple-fm.test.ts`. Code exactly as the plan wrote it.
- Verified: `npx vitest run test/eval/apple-fm.test.ts` failed first ("Cannot find module '../../eval/apple-fm.js'"); after implementation `npm test` → 12 files, 85/85 passed; `npm run typecheck` → tsc exit 0. Real-flow on this Linux machine (no `fm` on PATH): `fmAvailable()` → `false`; the default runner on a tier-1 call threw `VendorError: fm exited 1: spawn fm ENOENT`, so a missing CLI maps to a vendor error rather than a crash. The real `fm respond` call (device and PCC, both schema modes) can only run on Chase's Mac; listed under Needs Chase.
- Deferred: live `fm` verification, to Task 11 on Chase's Mac (as the plan intends).
- Next: end of batch (Batch D starts at Task 8).

### Task 8: Retention and the run command
- Done: `proxy/eval/env.ts` (`loadEnvLocal`, `hasKey`), `proxy/eval/retention.ts` (`pruneRuns`), `proxy/eval/run.ts` (`parseRunArgs`, `resolveVendors`, `planRequests`, `buildCardBody`, `makeBlind`, `mapPool`, `executeRun`, CLI `main`); tests `test/eval/retention.test.ts`, `test/eval/run.test.ts`. Code as the plan wrote it, plus one added test and per-case image error handling in `executeRun` (see Deviations).
- Verified: `npx vitest run test/eval/retention.test.ts test/eval/run.test.ts` failed first ("Cannot find module '../../eval/retention.js'" / "'../../eval/run.js'"); after implementation `npm test` → 14 files, 101/101 passed; the added test failed first (the thrown image error rejected the whole run) and passed after the fix: `npm test` → 14 files, 102/102 passed; `npm run typecheck` → tsc exit 0. CLI (plan Step 6, temp `VERGE_EVAL_DIR`): scaffold printed `1 case(s), 0 with location`; run printed ``Skipping apple-device: `fm` is not on PATH (needs macOS 27 on Apple silicon)``, `No vendors available.`, `exit 1`, no stack trace. Extra CLI check in a temp dir: with `runs/old` (unscored, mtime 20 days), `runs/fresh` (unscored) and `runs/judged` (scored, 400 days), `eval:run --vendors apple-device,apple-pcc` printed `Pruned 1 old unscored run(s).` and left `fresh` and `judged`. No cloud call was made (Apple-only vendor list).
- Deferred: an unknown vendor or flag (`eval:run -- --vendors mistral`) exits through an unhandled rejection that prints a stack trace with the clear message at its head; the plan's `void main()` has no catch. Left as written (exit is non-zero and the message names the bad vendor); a candidate polish for review.
- Next: Task 9.

### Task 9: Review page with blind scoring
- Done: `proxy/eval/review/view.ts` (`EMPTY_SCORE`, `cardView`, `buildRunView`), `proxy/eval/review/server.ts` (`createReviewHandler`, CLI `main`), `proxy/eval/review/public/{index.html,card.js,app.js,styles.css}` (`renderCard` pure string renderer); tests `test/eval/card.test.ts`, `test/eval/review.test.ts`. Code as the plan wrote it except one test-only type cast (see Deviations).
- Verified: `npx vitest run test/eval/card.test.ts test/eval/review.test.ts` failed first ("Cannot find module '../../eval/review/public/card.js'" / "'../../eval/review/server.js'"); after implementation `npm test` → 16 files, 111/111 passed; `npm run typecheck` → tsc exit 0 (after the cast). CLI (plan Step 7): `VERGE_EVAL_DIR=$(mktemp -d) npm run eval:review` printed ``Error: No runs yet. Run `npm run eval:run` first.`` and exited 1. Extra real flow on a synthetic run in a temp `VERGE_EVAL_DIR` (2000x1500 JPEG, one located photo case with an edible card for one vendor, one note-only case with a 502 record and a deeper answer): the server printed `Reviewing r1 at http://127.0.0.1:4791/`; `/`, `/app.js`, `/card.js`, `/styles.css` → 200 with the right content types; `/photo/a` → 200 `image/jpeg`, 1000x750; `/photo/b` (note-only) and `/nope` → 404; `/api/run` contained none of `anthropic|openai|claude|gpt`; POST score `{a, B, send}` → 200 and `scores.json` held `a|anthropic` (B mapped back to its vendor); verdict `great` → 400. Headless Chrome rendered the page: `CASE 1 OF 2 · 1/4 JUDGED`, cards A and B `WITH LOCATION`, the likely half-disc and confident disc marks, the safety block with the lookalike line between lead and rest, `Compare without location` and the location buttons, and the saved `Send unedited` pressed after reload. Click interactions in a real browser are left to Task 11's visual check, as the plan says.
- Deferred: none. As in Task 8, `eval:review` failures exit through an unhandled rejection (stack trace under the clear message), since the plan's `void main()` has no catch.
- Next: end of batch (Batch E starts at Task 10).

### Task 10: Summary and export
- Done: `proxy/eval/summary.ts` (`VendorSummary`, `passBar`, `summarize`, `formatSummary`, CLI with `--compare`) and `proxy/eval/export.ts` (`pickCards`, `renderExport`, CLI with `--pick`, `--vendor`, `--ids`); tests `test/eval/summary.test.ts`, `test/eval/export.test.ts`. Code exactly as the plan wrote it.
- Verified: `npx vitest run test/eval/summary.test.ts test/eval/export.test.ts` failed first ("Cannot find module '../../eval/summary.js'" / "'../../eval/export.js'"); after implementation `npm test` → 18 files, 118/118 passed; `npm run typecheck` → tsc exit 0. Extra real flow (the task has no CLI step) on a synthetic run in a temp `VERGE_EVAL_DIR` (one photo case, one note-only case, two vendors, one `send` score): `eval:summary` printed `Pass bar: 2 of 2`, a three-line row per vendor with `openai send 1/2 ... judged 1`, `accuracy 100%`, `p50 101 ms`, `cost/ask $0.0010`; `eval:export -- --pick 2` printed `Wrote 2 card(s) to .../export.html`; the page held one JPEG data URI and one `NOTE-ONLY CAPTURE` block, and zero matches for `anthropic|openai|claude|gpt|gemini`.
- Deferred: none.
- Next: Task 11.

### Task 11: Live smoke test, eval README, real-flow verification, PR
- Done: `proxy/vitest.smoke.config.ts`, `proxy/test/smoke/live.test.ts` (`npm run smoke`), `proxy/eval/README.md`. Code and README exactly as the plan wrote them.
- Verified: `npm test` → 18 files, 118/118 passed; `npm run typecheck` → tsc exit 0. `npm run smoke` (real vendor calls; keys checked only through `hasKey`, `.env.local` never read): `live anthropic` PASS (3.4 s), `live openai` PASS (6.0 s), `live google` FAIL with a 502 `vendor_error` whose detail is Google's own "Your prepayment credits are depleted" billing message, so the key is set but the account has no credit (see Needs Chase). Real flow (plan Step 4, temp `VERGE_EVAL_DIR`, 1600x1200 synthetic JPEG + note-only `hawk.txt`): `eval:scaffold` → `2 case(s), 0 with location`; `eval:run -- --vendors anthropic,openai,google --concurrency 2` → `6 card request(s), 2 failed`, exit 0; the two failures are both google 502 (credits), and the four anthropic/openai records are 200 with `cant_tell` cards (expected for a flat-colour image and a bare note), three with a 200 deeper answer and one (openai brick) with none; `blind.json` and `results.json` written. Review server on port 4799 printed `Reviewing <run> at http://127.0.0.1:4799/`; `/api/run` returned the blind view; POST `{hawk, A, send}` → `{"score":{"verdict":"send",...}}` and `scores.json` held `hawk|anthropic` (A mapped back to its vendor). `eval:summary` → `Pass bar: 2 of 2`, `anthropic send 1/2 ... judged 1 ... can't tell 2 errors 0 ... p50 3010 ms cost/ask $0.0077`, `openai send 0/2 ... p50 4006 ms cost/ask $0.0062`, `google ... errors 2`. `eval:export -- --pick 2` → `Wrote 2 card(s)`; the page held one JPEG data URI, one note-only block and zero matches for `anthropic|openai|claude|gpt|gemini`. Temp dir deleted.
- Deferred: (1) Observation for review, not changed (Task 9 code): `/api/run` is blind except on a failed record, where the vendor's own error detail is passed through; Google's billing message names `ai.google.dev/gemini-api`, so a viewer can tell which label is Google on that case. It only affects error cards, which carry no card to judge, and labels are shuffled per case. (2) The page's click interactions in a real browser are not exercised by an agent here; they are covered by Chase's review round below.
- Next: end of batch (plan complete).

## Needs Chase

Items only Chase can supply. Add, never silently drop.

- Apple `fm` CLI on Chase's Mac (Task 7, checked in Task 11): run `appleGenerator('device')` and `appleGenerator('pcc')` against real `fm respond`, in the default `prompt` mode and with `APPLE_FM_SCHEMA_MODE=json-schema`, to confirm the argument shape (`--instructions`, `--image`, `--model pcc`, `--schema`) and whether `fm` accepts a plain JSON Schema file. Cannot run on Linux: `fm` is not on PATH here.
- Real iPhone HEIC photos (Task 6, checked in Task 11): the HEIC path was verified with a mocked decoder and with the real heic-decode rejecting a fake header; decoding a genuine iPhone HEIC (and its EXIF date/GPS) needs Chase's photos.
- Google Gemini billing (Task 11): the key in `proxy/.env.local` is set, but live calls fail with Google's "prepayment credits are depleted" message. Top up credit for the project in AI Studio, then `cd proxy && npm run smoke` (expect three PASS). Anthropic and OpenAI already pass.
- Your own photo round (Task 11): put at least 3 of your own JPEG photos in `proxy/eval/photos/`, then scaffold → run → open the review page in a browser and judge them → summary. Confirm a GPS-tagged photo shows "with location" (verifies EXIF GPS reading on a real phone photo). Include at least one untouched iPhone HEIC taken in portrait: it must appear upright on the review page, and scaffold must report its real capture date and location (verifies HEIC decoding, rotation and HEIC EXIF on a real file). This also exercises the review page's clicks in a real browser.
- On the Mac (macOS 27, Task 11): `fm respond --help` and `fm schema --help`; confirm the flags used in `eval/apple-fm.ts` (`--instructions`, `--image`, `--model pcc`, `--schema`); run `npm run eval:run -- --vendors apple-device,apple-pcc --cases <one-id>`; then try `APPLE_FM_SCHEMA_MODE=json-schema` once and note whether `fm` accepts a JSON Schema file.
- Then the full 30-photo round per the spec.

## Deviations from the plan

Any place the code had to differ from the plan's text (an API that behaved differently, a type
that needed adjusting), with the reason.

- Task 5, `proxy/test/handler.test.ts:30`: `(await res.json())` became `((await res.json()) as { card: { headline: string } })`. With @types/node 22, `Response.json()` returns `Promise<unknown>`, so tsc raised TS2571. Type-only; the assertion and expected value are unchanged, and no production code differs from the plan.
- Task 6, `proxy/eval/image.ts`: `import sharp from 'sharp'` + `Promise<sharp.Sharp>` became `import sharp, { type Sharp } from 'sharp'` + `Promise<Sharp>`. sharp 0.35 resolves ESM types from `dist/index.d.mts`, which exports `Sharp` as a named interface and has no `sharp` namespace, so tsc raised TS2503. Type-only; no behavior change.
- Task 8, `proxy/eval/run.ts` `executeRun` + added test `records a photo that fails to load against that case only and keeps going` in `proxy/test/eval/run.test.ts`. Ruling: the plan loaded every image up front with a bare `await`, so one corrupt photo (or a non-HEIC file named `.heic`, per the Task 6 observation) rejected `executeRun` and lost the whole run, contradicting Review Focus item 1 ("fails that one case with a clear error, never the whole run"). Each image load is now caught; that case's records get `status: 0` and `error: { error: 'bad_request', detail: 'image <file>: <message>' }` (prefixed with the file, which sharp's message omits), no ask is sent for it, and the rest of the run proceeds. No interface changed. Cost if wrong: one code path to revert; a failed photo would again abort the run.
- Task 9, `proxy/test/eval/review.test.ts:57`: `const view = await (...).json();` became `const view = (await (...).json()) as { scores: Record<string, { verdict: string | null; actually: string }> };`. Same cause as the Task 5 deviation: with @types/node 22, `Response.json()` returns `Promise<unknown>`, so tsc raised TS18046. Type-only; assertions unchanged, no production code differs.
