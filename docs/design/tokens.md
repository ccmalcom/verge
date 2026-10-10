
paper #F3F2EC
ground, everywhere

paper.raised #FBFAF7
cards, sheets, inputs

ink #1B1916
text, capture button · 16.4:1

ink.soft #4E4A43
secondary text, labels · 7.9:1

rule #C9C5BA
hairlines, 1px. Replaces shadows.

moss #2E5E3E
primary action, confident · 7.6:1

ochre #8F6420
likely · 4.9:1

slate #4F6479
unsure · 5.6:1

graphite #6B665D
can't tell, silhouettes · 5.1:1

brick #9A3B2B
safety block only · 6.4:1

night #121110
camera viewfinder ground only

space.* · 4pt base
1·4
2·8
3·12
4·16
6·24
8·32
12·48
Screen gutter 24. Card padding 16. Stack gap 12 inside a card, 24 between cards, 48 between sections.
radius.* and surface
radius.card 4 · radius.button 4 · radius.chip 2 · radius.photo 2. No pills. Elevation is a 1px rule, never a shadow; sheets get a 2px top rule in ink.
motion
Sheets slide 280ms ease-out. Cards don't animate in. The earned-badge card fades in over 400ms and waits. No spring, no bounce, no particle anything.
expo / RN notes
Fonts via expo-font. Tokens as a single theme.ts consumed by a useTheme() hook; no inline hexes in screens. Dark mode ships in MVP: board 01b holds the night set; the hook swaps the whole token object, so screens never branch on scheme.