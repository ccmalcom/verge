# Verge MVP roadmap

Date: 2026-10-10
Source: docs/product-spec.md (the authority on product intent), docs/design/, CLAUDE.md.

The MVP in docs/product-spec.md is four independent sub-projects. Each one gets
its own spec → plan → build cycle, in this order. A sub-project's spec is written
only after the previous one has shipped and been judged; the rows below are
boundaries, not designs.

## Product principle added in brainstorming

**Derive, don't ask.** Nothing the user does in the app requires filling in a
field. Every stored value has a derived default: lens from the active prompt, or
from the answer's class when no prompt is active; neighborhood label defaults to
"Near home"; season from the capture date. The note is always optional.
Corrections are collected in passing, never up front. The same rule applies to
dev tooling (the eval harness asks Chase to fill in nothing).

## Sub-projects

| # | Name | Scope | Exit gate |
|---|------|-------|-----------|
| 1 | Answer card | proxy/ fetch handler, card schema + prompt + guardrails, three-vendor eval harness with review page. No app UI. Spec: 2026-10-10-answer-card-design.md | ≥20 of 30 cards "send unedited" for the chosen vendor; safety block fires on every edible find; Chase is satisfied with the card |
| 2 | Capture + journal | Expo Router scaffold, camera + note-only capture, client-side resize + EXIF strip, SQLite (capture, answer, reaction), answer card UI (imports #1's schema), reactions, journal with lens filter. Deploys the proxy to Vercel with a device ID header and the 20 asks/device/day counter (Upstash Redis) | The daily loop works end to end on a phone: capture → ask → card → journal → reaction |
| 3 | Prompts | Bank of ~100 hand-written prompts tagged by lens, shape, effort, season, weather; Today screen; Explore sheet; weighted 3:1 selection with reaction decay and the 1-in-4 serendipity draw; lens settings; three-screen skippable onboarding | Today serves a prompt that respects lens settings; selection is unit-tested for the serendipity quota |
| 4 | Pilot readiness | Local event log (capture, ask, go-deeper, reactions by lens, unprompted returns), JSON export, delete-all, location consent at first capture, dark mode token set, badges (First finds, Field naturalist only), opt-in morning invitation, TestFlight / internal track build | Five testers can install it |

## Contradictions in the product spec, and their resolutions

Each is confirmed in the named sub-project's spec.

| Contradiction | Resolution | Settled in |
|---|---|---|
| Proxy "stores nothing" vs a per-device daily counter | The counter is the proxy's only state: a device ID and a count, expiring daily. No content, no location. | #2 (CLAUDE.md wording updated 2026-10-10) |
| Lens settings "eight to ten interests" (§3) vs six lenses (§8, "replaces the earlier list") | Exactly the six §8 lenses: Nature, Built, History, Light & weather, Signs & people, Surprise. Onboarding's friendlier interest labels ("Wild plants", "Birds, bugs and other animals") map onto them. | #3 |
| Morning invitation to "about half" vs "two or three" testers vs "pilot sends no notifications" (§5) | The opt-in invitation ships. About half the pilot testers get it; the §5 "no notifications" experiment is the un-invited half. | #4 |
| Badges are "in" (§7) but no weekend is scheduled for them | First finds and Field naturalist only, built in #4. | #4 |
| Journey A says "likely … high confidence" | Only the four-state vocabulary exists. No secondary confidence language anywhere. | #1 |
| §6 question: PWA vs native | Settled: Expo native (the scaffold exists; CLAUDE.md names Expo). | — |
| §6 question: History as a first-class lens | Settled: History is one of the six lenses; answers say what the evidence suggests and how to verify it, with no source lookup until after the pilot. | #1 (prompt), #3 (lens) |
| Answer card "any sourced links" | No links until search grounding exists (post-pilot). Without grounding, URLs would be invented. Deeper answers say how to verify instead. | #1 |

## Shared contracts

- The answer-card Zod schema in `proxy/src/card/schema.ts` is the contract between
  #1 and #2. The app imports it; it is never redefined on the client.
- `enforce.ts` guardrails (edible cap, safety copy, tier-2 label) run in the proxy
  and are rendered by the app from the flags they set. The app never re-derives
  them from model text.
