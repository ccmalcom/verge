# Answer-card eval harness

Runs your walk photos through every vendor and lets you judge the cards blind.
Nothing here needs filling in by hand.

## Setup (once)

1. `cd proxy && npm install`
2. Copy `.env.local.example` to `.env.local` and fill in the keys you have. Vendors without a key are skipped.
3. For the Apple candidates, run on an Apple-silicon Mac with macOS 27 (`fm` must be on PATH).

## Each round

1. Drop photos into `eval/photos/` as they come off the phone (HEIC, JPEG, PNG or WebP). Optional: a same-name
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
