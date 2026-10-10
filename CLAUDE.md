# Verge

Mobile app (Expo / React Native, TypeScript) that gives people a daily reason
to walk their own neighborhood, capture what they notice, and learn what it is.

Read docs/product-spec.md before any product decision. docs/vision.md is the
founder's original intent; docs/design/ holds the UI mockups and docs/tokens.md
the design tokens.

## Non-negotiables
- No map, pins, routes, step counts, streaks, rings, leaderboards, notifications
  beyond the one opt-in morning invitation.
- Capture → Ask → Learn works with no prompt active and with no photo.
- Confidence is one of four states (confident / likely / unsure / can't tell),
  rendered as a shape, never a number. Edible finds cap at "likely" and always
  show the safety block.
- All data local (SQLite). The only server is proxy/, which holds the API key,
  caps asks at 20/device/day, and stores nothing but that daily counter.
- Tokens live in src/theme.ts, consumed by useTheme(); no inline hex in screens.
  Dark mode is in scope.

## Build order
Weekend 1: proxy function + answer-card prompt, tested against 30 real photos.
Do not build UI until the card output is good.
Then: capture + journal → prompt bank → instrumentation/export/dark mode.