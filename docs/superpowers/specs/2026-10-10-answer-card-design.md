# Sub-project 1: Answer card — design

Date: 2026-10-10
Status: approved in brainstorming; awaiting written-spec review
Roadmap: 2026-10-10-verge-roadmap.md
Product authority: docs/product-spec.md §2 (Ask, Discovery and learning flow), §4
(AI approaches, Weekend 1), §8 (design-pass decisions); docs/design/ (board 02,
answer card boards).

## Intent

Weekend 1 of the product spec: build the proxy and the answer card, and find out
whether a general multimodal model produces a card worth sending to a friend,
before any app UI exists. The output is a judged set of cards, not an app. If the
cards are flat, the product is rethought before sub-project 2 starts.

Success criteria (from product spec §5):

- For the chosen vendor, at least 20 of 30 cards are judged "send unedited".
- The safety block fires on every edible or medicinal find in the set.
- The confidence vocabulary behaves: can't-tell answers say what would help;
  edible finds never headline above "likely".
- Follow-up answers read like a curious companion, not a lookup.
- The with/without-location comparison says whether location improves answers.

Out of scope for this sub-project: any Expo/app code, deployment, the per-device
daily counter, device IDs, search grounding, specialist plant identifiers,
Gemini Nano testing (needs a physical Pixel 9+/Galaxy S26; a later spike if the
Apple on-device results below are promising).

## Decisions locked in brainstorming

- Scope: this sub-project only; later sub-projects are in the roadmap.
- Vendor-agnostic: the harness compares Anthropic, OpenAI and Google.
- Vendor seam: Vercel AI SDK structured-object generation with one shared Zod
  schema. (Exact API verified against current AI SDK docs at plan time.)
- One structured call per tier: tier 1 is one call (classify + answer); "go
  deeper" and free-text questions are a second call on the vendor's larger model.
- Proxy on Vercel Functions, written as a standard fetch handler; local-only in
  this sub-project. The harness exercises it over HTTP.
- Judging via a local review page with recorded scores.
- Photos plus an auto-scaffolded manifest that requires no manual input.
- Derive, don't ask (see roadmap): no field must be filled in by hand.
- On-device candidates: the harness also runs Apple's on-device model and
  Apple Private Cloud Compute via the macOS 27 `fm` CLI, as optional
  harness-only vendors (see "On-device candidates" below). They never block
  this sub-project's exit gate.

## Layout

The Expo app at the repo root is untouched. Everything here lives in `proxy/`,
its own Node package (later the Vercel project root).

```
proxy/
  package.json
  api/ask.ts             fetch handler: validate → prompt → model → enforce → respond
  src/card/schema.ts     Zod schemas: request, tier-1 card, deeper answer, response
  src/card/prompt.ts     system prompts + per-class guidance; PROMPT_VERSION
  src/card/enforce.ts    deterministic guardrails (pure)
  src/card/context.ts    season from date, location rounding, context text
  src/providers.ts       vendor → { tier1Model, deeperModel }; the only vendor-aware file in the proxy
  eval/
    scaffold.ts  run.ts  review/  summary.ts  export.ts  retention.ts
    apple-fm.ts  harness-only adapter that shells out to the `fm` CLI (macOS 27)
    photos/      (gitignored) Chase's photos and optional .txt note-only cases
    manifest.json (gitignored)
    runs/        (gitignored)
```

`schema.ts`, `enforce.ts` and `context.ts` are pure and vendor-free. Sub-project 2
imports `schema.ts` as the card contract.

## The card contract

### Tier-1 card (model output, validated by Zod)

| Field | Type | Rule |
|---|---|---|
| `class` | enum: plant, fungus, animal, insect, building, infrastructure, sign_or_art, geology, other | Model classifies first; drives per-class guidance. `fungus` added to the product spec's list because mushrooms are the riskiest edible case. |
| `lens` | enum: nature, built, history, light_weather, signs_people, surprise | Lets an unprompted capture get a lens without asking. |
| `confidence` | enum: confident, likely, unsure, cant_tell | The only confidence vocabulary. Never a number. |
| `headline` | string, short | Name-first, in the voice of its confidence (board 02). |
| `summary` | string, ≤ 2 sentences | |
| `tier2_body` | string | The teaching text. The model does not choose its label. |
| `help_asks` | array of exactly 2 strings, or absent | Required when `confidence` is `cant_tell`; absent otherwise. Each is a concrete capture ask ("A shot from directly above, if it opens its wings"). |
| `edible_or_medicinal` | boolean | |
| `lookalike_line` | string or null | One sentence naming a dangerous lookalike; rendered inside the safety block. Only meaningful when `edible_or_medicinal`. |
| `follow_ups` | array of ≤ 3 strings | Tappable go-deeper questions. |

### Deeper answer (model output)

| Field | Type | Rule |
|---|---|---|
| `answer` | string | Short paragraphs, never a wall of text. No URLs. Says how a claim could be verified rather than asserting unverifiable specifics. |
| `follow_ups` | array of ≤ 3 strings | |

No links in this sub-project: without search grounding they would be invented.
This narrows the product spec's "any sourced links" until search grounding lands
post-pilot.

### Guardrails (`enforce.ts`, applied after every model call)

Deterministic, regardless of model output:

1. If `edible_or_medicinal` and `confidence` is `confident`, set `confidence` to
   `likely` and set `capped: true` in response meta.
2. If `edible_or_medicinal`, attach `safety: { copy: SAFETY_COPY, lookalike_line }`.
   `SAFETY_COPY` is a constant (below); the model cannot alter or suppress it.
3. Derive `tier2_label` from the final confidence:
   - confident → "What to look for"
   - likely → "What would settle it"
   - unsure → "How to tell them apart"
   - cant_tell → "What would help" (and the renderer adds the fixed option
     "Leave it a mystery" after the two asks, and labels tier 3 "Go deeper anyway")
4. Trim `follow_ups` to 3. If `cant_tell` and `help_asks` is missing or not
   length 2, the output fails validation (triggers the one retry).

`SAFETY_COPY` (heading "Before you taste anything"):

> Don't eat or use anything on the strength of an app. This is a starting point,
> not a safe-to-eat verdict. A photo can't tell ripe from unripe or sprayed from
> unsprayed. If foraging interests you, a local guide or the county extension
> office is the next step.

The `lookalike_line` renders between the first and second sentences when present,
matching the wild-grape board.

## Prompts (`prompt.ts`)

Tier-1 system prompt requirements:

- Classify first, then answer with that class's guidance:
  - plant/fungus: identity first, then the distinguishing features that settle it.
  - building/infrastructure: what the visible evidence suggests about age and
    use; separate what is visible, what is typical for that kind of structure in
    the region and era, and what would verify a claim about this specific place.
    Never state a construction date or prior use as fact.
  - sign_or_art: what is depicted; never attribute an artist without a source.
  - animal/insect/geology/other: identity and the one or two features that tell.
- Confidence voice per board 02: confident states the name then why; likely names
  it and names the doubt in the same breath; unsure offers two or three candidates
  as a choice; cant_tell says what it can see, then exactly what would help, and
  never apologizes.
- A note-only capture is treated like a photo the model cannot see: often unsure
  or cant_tell, and that is fine.
- Edible or medicinal: set the flag, never headline above likely, never imply
  safety to eat.
- Follow-ups read like a curious companion's questions about this find.
- Context supplied as plain text: season, active prompt and lens if any, rounded
  location and neighborhood label if present.

Deeper system prompt: bounded to this capture and its tier-1 card; declines
unrelated questions in one line; keeps the edible stance; no URLs.

`PROMPT_VERSION` (e.g. `p1`, `p2`) is bumped on every prompt change and recorded
in every response and run, so tuning rounds can be compared.

## The proxy (`api/ask.ts`)

`POST /api/ask`, JSON body:

- `kind`: `"card"` or `"deeper"`
- `image`: optional base64 JPEG. Callers resize to ~1000 px long edge and strip
  EXIF; the proxy rejects images over 600 KB (decoded) and does not resize.
- `note`: optional string. At least one of `image` or `note` is required.
- `context`: `{ date (ISO), prompt_text?, lens?, approx_location? {lat, lng},
  neighborhood? }`. Season is derived server-side from the date (northern
  hemisphere, meteorological seasons). Location is rounded again to 3 decimals
  (~100 m) server-side regardless of what the client sent.
- `card` and `question`: required when `kind` is `"deeper"`.
- `vendor`: optional; honoured only when env `ALLOW_VENDOR_OVERRIDE=1`, otherwise
  ignored. Default vendor from env `CARD_VENDOR`.

Response: `{ card | deeper, meta: { vendor, model, prompt_version, capped,
latency_ms, usage } }`, where `card` is the enforced card (with `tier2_label` and
optional `safety`).

Errors (JSON `{ error, detail }`):

| Status | When |
|---|---|
| 400 | malformed body; neither image nor note; deeper without card/question |
| 413 | image over the size limit |
| 422 | model output failed the schema after one retry |
| 502 | vendor error or timeout |

The proxy stores nothing and logs no image, note, question or location — only
vendor, model, status, latency and token counts.

### Providers (`providers.ts`)

| Vendor | Tier-1 model | Deeper model |
|---|---|---|
| anthropic | Haiku 5.5 | Sonnet 5.5 |
| openai | current small vision model | current flagship vision model |
| google | current Gemini Flash tier | current Gemini Pro tier |

Exact model IDs, structured-output support and per-token prices (for the cost
estimate) are looked up from vendor docs during planning and recorded in this
file; nothing is written from memory.

Secrets: `proxy/.env.local` holds `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`GOOGLE_GENERATIVE_AI_API_KEY`. Chase fills the values; tooling checks presence
only. `.env*.local` is already gitignored.

## The eval harness (`proxy/eval/`)

All commands run from `proxy/` and require no manual input.

1. **`eval:scaffold`** scans `eval/photos/` and writes/updates `eval/manifest.json`.
   Per case: `id`, `file`, `taken_at` (EXIF), `approx_location` (EXIF GPS rounded
   to 3 decimals, or null), `note` (from a sibling `.txt` if present, else empty),
   `truth` (empty). A bare `.txt` file with no photo is a note-only case. Re-runs
   add new files and preserve every existing field value.
2. **`eval:run [--vendors a,b,c] [--location both|with|without] [--no-deeper]`**
   starts the handler on a local port with `ALLOW_VENDOR_OVERRIDE=1`. Per case:
   resize to 1000 px long edge and re-encode as JPEG without metadata (as the app
   will), then request a card from each vendor with and without location (location
   variant skipped when the case has none), then one deeper call per card using
   its first follow-up. Bounded concurrency. Vendors with missing keys are skipped
   with a warning. Every request's outcome, including errors, is written to
   `eval/runs/<timestamp>-<PROMPT_VERSION>/results.json` with raw output, enforced
   card, meta and estimated cost. Retention pruning runs at start.
3. **`eval:review [run]`** (latest run by default) serves a localhost page. Per
   case: the photo or note; one card per vendor, blind-labelled A/B/C with the
   mapping shuffled per case and stored in the run folder; a with/without-location
   toggle. Cards render with the design tokens (docs/design/tokens.md, type.md),
   the four confidence marks, tier labels, the safety block and the deeper answer.
   Each card shows its default variant: with location when the case has one (the
   production condition when consented), otherwise without. Per card: one verdict
   covering the card and its deeper answer (send unedited / needs edit / bad),
   optional "actually it's…" text, a "safety block should have fired" toggle,
   optional note. When the case has location, a toggle reveals the other variant
   with one optional tap: location helped / no difference / hurt. Every input
   saves immediately to `scores.json` in the run folder.
4. **`eval:summary [run] [--compare other-run]`** prints per vendor (unblinded):
   send-unedited count and share on default variants (bar: ≥ 20 of 30), bad
   count, accuracy (share of judged cards with no "actually it's…" correction),
   safety misses, cap-fired count, cant_tell rate, location helped/no
   difference/hurt tallies, p50 latency, mean estimated cost per ask.
   `--compare` shows deltas between two runs (prompt-tuning rounds).
5. **`eval:export [run] --pick 10`** writes a static, vendor-free HTML page of ten
   cards for the "show ten cards to three people" test. Picks the ten best-scored
   cards for the leading vendor unless ids are passed.

### Retention

- Unscored runs (no `scores.json`) are pruned when older than 14 days or outside
  the newest 10 unscored runs. Pruning runs at the start of `eval:run`.
- Scored runs are judged evidence and are never pruned automatically.
- `eval/photos/`, `eval/manifest.json` and `eval/runs/` are gitignored (private
  photos and neighborhood GPS).

### Known risk

iPhone photos are often HEIC. If the image library's prebuilt binaries cannot
decode HEIC, the fallback is exporting photos as JPEG, or a system converter
that Chase installs himself. Checked first in the plan.

### On-device candidates (Apple, harness-only)

Research on 2026-10-10 (vendor docs, not yet run live) found that Apple's
on-device Foundation Model takes image input from iOS 27 / macOS 27, with guided
generation, on Apple Intelligence devices only (an estimated 25–35% of active
iPhones). Private Cloud Compute (PCC), a larger model with a 32K context, is
available to third-party apps with an entitlement. No published evidence says
either identifies species or architecture well, so the harness measures it.

- Two optional vendors: `apple-device` (on-device model) and `apple-pcc` (PCC).
  `eval/apple-fm.ts` invokes the `fm` CLI (`fm respond … --image … --schema …`,
  `--model pcc` for PCC) with the same system prompt, context text and resized
  photo, and a JSON Schema generated from the tier-1 Zod schema. Its output goes
  through the same Zod validation and `enforce.ts` as the cloud vendors, and its
  cards appear blind on the same review page.
- These run in the harness directly, not through the proxy: the proxy runs on
  Vercel (Linux) and could never call them. In production they would be a
  device-side path in the app, not a proxy branch.
- Auto-skipped with a warning when `fm` is not on PATH, so the harness still runs
  on Linux. The full run including Apple vendors happens on Chase's Apple-silicon
  Mac on macOS 27.
- Context limit: Apple's docs say 4,096 tokens for the on-device model (a WWDC26
  sample shows 8,192); the adapter reads the actual limit if the CLI exposes it.
  If prompt + image exceed it, the case is recorded as an error with that reason.
  The prompt is not condensed for Apple, so results stay comparable.
- Exact `fm` flags, schema format and image handling are verified against the
  installed CLI's `--help` and Apple's docs at plan time; the flags above come from
  research, not a live run.
- What the results decide (after #1, not in it): whether an on-device first pass
  (class or "can't tell" before any cloud call) is worth building on capable iOS
  devices, whether PCC could serve iOS asks, and whether a Gemini Nano spike on a
  physical device is worth it. The cloud path stays the default on every device
  either way. React Native's `@react-native-ai/apple` 0.12.0 drops image input
  silently, so any app-side use needs a native module or an updated wrapper.

## Testing

- Unit (Vitest): `enforce` (cap, safety attach, label mapping, cant_tell asks,
  follow-up trim); request validation; season derivation; location rounding;
  resize/strip output contains no EXIF GPS; scaffold merge preserves edits;
  retention pruning (age, count, scored-run protection); summary arithmetic.
- Handler contract tests against a mocked model: valid card; invalid output →
  retry → 422; vendor error → 502; 400 and 413 paths; vendor override ignored
  without the env flag; no content in logs.
- Live smoke: one real photo per vendor, skipped when that vendor's key is absent
  (or, for Apple vendors, when `fm` is not on PATH).
- `apple-fm.ts` unit tests run against a stub `fm` executable (argument building,
  JSON parsing, context-limit and missing-binary errors).
- Real-flow verification before "done": scaffold → run on at least three of
  Chase's photos across all available vendors → review page click-through with
  scores saved → summary prints. Tests alone do not count.

## After this sub-project

Chase runs the full 30-photo set, tunes the prompt across versions, and picks a
vendor. If the success criteria are met, sub-project 2's spec is written. If not,
the product is rethought before any UI is built (product spec §4, Weekend 1).
