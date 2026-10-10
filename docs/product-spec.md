Neighborhood Exploration App — Product Spec & Implementation Plan
Oct 10, 2026 · @Chase
1. The vision, restated, and where it strains
The product is a lens, not a map. It gives a person one small reason to walk out the door, lets them find something on their own, helps them understand what they found, and quietly remembers what caught their attention so the next invitation is a little better aimed. The walk is incidental; the thing being built is a habit of attention toward a place the user already lives in and has stopped seeing. Everythingo that is not that loop (fitness, dining, itineraries, pins, social feeds) is out of scope on purpose, because those products already exist and they all pull the eye back to the screen.
The principles are coherent, but five of them pull against each other at specific points in the journey. These are the places where design decisions, not restatements of intent, are needed.
Neighborhood-aware prompts vs. discover-first. The handoff wants prompts informed by neighborhood context, but any prompt specific enough to say "look for the limestone foundations on your block" has already made the discovery for the user. The resolution is a rule about granularity: prompts may use category-level context (season, canopy cover, housing age, whether there is a rail corridor nearby) but never name a specific feature or address. The context sharpens the lens; it does not place the pin.
Respect attention vs. learn at the moment of discovery. The most valuable moment in the product (standing in front of the thing, asking what it is) is also the moment the phone comes out. The two cannot both be fully honored. The recommendation is to make capture nearly instant (one tap, photo, pocket) and make learning available either immediately or later, at the user's choice, with the default nudging toward "keep walking, read this at home." The in-walk interaction stays shallow by design; depth lives in the journal.
Personalization vs. serendipity. A feedback loop of "interesting / not for me" is, mechanically, a filter-bubble generator. If 70% of a user's reactions are plants, a naive recommender will serve plants until the product feels like a botany app. This needs an explicit exploration budget: a fixed share of prompts (a reversible assumption below says one in four) drawn from topics the user has never reacted to. Serendipity has to be a quota, not a hope.
No completion mechanics vs. a system that needs signals. The app cannot improve without knowing what happened on the walk, but every mechanism for collecting that (did you find it? log it? rate it?) is a completion mechanic in disguise. "Quest of the Day" is itself a soft streak: a daily cadence creates a daily sense of having missed something. The resolution is to collect signal only from acts the user would do anyway (taking a photo, asking a question, writing a note) and to treat an un-walked day as nothing rather than a gap.
Meaningful learning vs. trust. Plant identification and local history are precisely the domains where a language model is most fluent and least reliable. The highest-value moment is the riskiest one. Uncertainty therefore cannot be a disclaimer at the bottom of a paragraph; it has to be a first-class state in the interface, with its own visual treatment, its own vocabulary, and a path from "I think" to "here is how to check."
Hyperlocal vs. novelty. A 15-minute walking radius has a finite number of things in it. The product's thesis is that attention, not terrain, generates novelty, and that seasons, scale, light, and lens can make the same four blocks new. That thesis is also the product's largest risk, and the validation plan treats it as the first thing to test.
One smaller tension: the handoff says "low-cost by default" and also wants multimodal AI at every discovery. Vision model calls are not free, so a free app needs a ceiling per user per day or a cheap first pass before an expensive one. This is handled in the implementation section.
2. Product and experience specification
The whole product is one loop with five stages: invite, walk, find, learn, remember. Each stage has one job and one screen at most, and the remember stage feeds the next invite. The diagram at the end of this section shows the loop and the two side-paths (skip, and ask-later).
User journeys
Journey A: the 20-minute neighborhood walk (primary). Chase opens the app on a Saturday morning. One prompt is waiting: "Find three plants growing where nobody planted them." No map, no route, no timer. He walks. Six blocks in he photographs a plant in a sidewalk crack, taps the capture button, and pockets the phone. Two blocks later, a second one. At home, he opens the journal: two captures, each with a short identification card. One says "likely common purslane (Portulaca oleracea), high confidence; the fleshy paddle-shaped leaves and reddish stems are the giveaway." The other says "probably a Setaria grass; three species are common here and I can't tell them apart from this angle; the seed head would settle it." He taps "tell me more" on the purslane and reads two paragraphs about it as a cultivated vegetable elsewhere. Next week's prompts lean slightly toward edible weeds and sidewalk ecology, and one of them is about something unrelated.
Journey B: the stationary or 5-minute version. Same user, bad knee, raining. The Explore tab has a "from where you are" prompt: "From a window or porch, find the oldest-looking thing in view and guess its age." Capture and learning work identically. Nothing in the product treats this as a lesser walk.
Journey C: the unprompted discovery. No prompt at all; the user is walking to the bakery and sees a dated brick. They open the app directly to capture. The prompt is optional on every path; capture-and-ask is the irreducible core, and it must work with zero setup.
Journey D: the returning user. Three weeks in, the journal has 14 entries. The user notices a seasonal callback: "The serviceberry you found in April should be fruiting about now." This is a later feature, but the journal's data model has to support it from day one (a capture stores a tag, an approximate location, and a date).
Key interactions
• Today: one prompt, large type, one line of optional context ("good for a 15-minute loop; works in rain"). Two actions: I'll try it (does nothing except mark it as the active lens) and show me others. No streak counter, no "you've done 4 this week."
• Explore: four to six alternative prompts across lenses (Nature, Built, History, Light & weather, Signs & people, Surprise). Each is a card; tapping one makes it today's lens.
• Capture: one button, reachable from everywhere. Photo first by default, with a note-only path for finds that don't need one (a hawk on a steeple, a brick stamped with a year); on the photo path the note field is pre-dismissed. Location is attached only if the user has opted in, and stored as approximate (see privacy). The whole interaction should take under five seconds.
• Ask: on any capture, "what is this?" and "why is it interesting?" The answer card has three tiers: a two-sentence answer with a confidence label; an expandable "what to look for" section listing distinguishing features and what would raise or lower confidence; and "go deeper," which offers three tappable follow-ups, a free-text question box bounded to this capture, and any sourced links. The card is the floor for consistency (confidence vocabulary, safety block); the follow-up conversation is where the companion voice lives. The model never answers in a wall of text.
• Journal: reverse-chronological captures, each a card with photo, identification, date, and a one-tap reaction (interesting, not for me, tell me more). Filterable by lens. No completion percentage, no empty-state nagging.
• Lens settings: a list of broad interests with three states each (curious, neutral, skip). Editable at any time; initial state comes from a three-screen onboarding or defaults to all-neutral.
Information architecture
Three top-level destinations: Today, Journal, and Capture (a persistent action, not a tab). Explore is a sheet from Today. Settings holds lenses, location consent, and data export. There is no map screen in the MVP. The absence is deliberate and should be defended when the first user asks for one.
Prompt design rules
A good prompt names a lens and a loose target, works within 15 minutes on foot, costs nothing, does not name a specific feature or address, and has an obvious capture moment. Prompts come in four shapes: count (find three X), compare (find two X that differ in Y), evidence (find evidence of Z), and re-see (look again at something you pass daily). Each prompt carries metadata: lens, effort (stationary / short / full walk), weather tolerance, and season window. Examples beyond the handoff's list:
• "Find the newest and the oldest manhole or utility cover on one block. The foundry names are often cast into them."
• "Find a place where two different eras of building touch each other."
• "Find three different ways people have fenced their yards, and decide which one was cheapest."
• "Find a plant that has gone to seed and look at how the seeds are built to travel."
• "Stand at one intersection and find the thing you have never looked at above eye level."
• "Find a sign that has been repainted over an older sign."
Prompts are generated by a model from the lens, season, weather, and the user's reaction history, then filtered against a reviewed list of rules (no trespass, no roads without sidewalks, no "taste this"). For the MVP, a hand-written bank of 80 to 120 prompts tagged with metadata is both cheaper and more reliable than generation, and should be the starting point.
Discovery and learning flow
The answer card's structure is fixed; its content depends on what was captured. The model is asked to classify the capture first (plant, animal, insect, building, infrastructure, sign or art, geology, other) and then answer with the template for that class. A plant template leads with identity and distinguishing features; a building template leads with what the visible evidence suggests about age and use, explicitly separating observation from inference; a mural template leads with what is depicted and avoids attributing an artist without a source.
Confidence has four visible states: confident, likely, unsure, and can't tell from this. The last state is a success, not a failure, and the card says what additional photo or detail would help. For anything edible or medicinal, the card carries a fixed safety block that cannot be suppressed by the model: a photo identification is a starting point, not a basis for eating anything; verify with a second source and a local expert; note the contamination risks of roadside plants.
For local-history claims about a specific place, the model is instructed to distinguish three things in the card: what is visible, what is typical for that kind of structure in that region and era, and what it would take to verify a claim about this particular address. It is not permitted to state a construction date or a prior use as fact without a link.
Personalization and feedback model
The signal is small and incidental: which prompts were made the active lens, which captures were made, which captures received interesting or tell me more, which received not for me, and the lens tags of all of the above. There is no explicit "did you complete it" question. From this, the system maintains a weight per lens and per sub-topic. Prompt selection draws roughly three in four from weighted lenses and one in four from lenses the user has not reacted to (reversible assumption; tune after testing). Reactions decay with time so that a burst of plant interest in May does not define October.
Privacy and safety
• Location is opt-in, requested only at the first capture, with a plain explanation of what it is used for (context for identification, seasonal callbacks). If declined, everything still works; the user can type a neighborhood name instead.
• Stored coordinates are rounded to roughly 100 metres before they leave the device. Photo EXIF location is stripped on upload. Nothing is public by default and the MVP has no sharing at all.
• Photos are sent to the model only when the user asks a question about them, not on capture.
• The user can export and delete everything from Settings.
• Prompts never direct users to railways, highways, private property, water, or abandoned structures. The prompt bank is reviewed against this list; generated prompts are filtered against it.
Success criteria
The product succeeds when people notice more and come back on their own terms. The measures that fit that, and that a solo developer can actually collect:
• Capture rate: share of sessions where at least one capture happens. Target for the pilot: above 50%. A prompt that produces no captures is a bad prompt, not a lazy user.
• Ask rate and depth: share of captures where the user asks a question, and share of those where they open "go deeper." This is the direct measure of the learning stage.
• Positive reaction ratio: interesting plus tell me more over all reactions, by lens. Below 40% for a lens means the prompts or the answers in that lens are weak.
• Return rate, split by invitation: two or three pilot testers get the opt-in morning invitation and the rest get nothing. Weekly return rate for the un-invited group is the honest proxy for value; the gap between the groups says what the invitation is worth.
• "I never noticed that" count: in the pilot, asked directly in a weekly check-in rather than inferred.
Daily active users, streak length, session duration, and steps are explicitly not tracked.
Learn is the only accented stage because it is where the value is created; the dashed path shows that it can be entered from the journal later rather than on the walk.
3. MVP: the smallest thing that tests the loop
The MVP is a capture-and-ask tool with a prompt on the front. If the learning moment is not satisfying, nothing else in the product matters, so the MVP is built around that moment and everything that does not feed it is cut. Target: usable by five testers within four to six weekends of solo work.
In
• Today screen with one prompt drawn from a hand-written bank of about 100 prompts, tagged by lens, effort, and season. Selection is weighted by lens settings and recent reactions, with a fixed one-in-four serendipity draw.
• Explore sheet showing five alternatives from the same bank, and an opt-in morning invitation: one local notification a day carrying today's prompt, which never mentions a missed day.
• Capture: photo, note, or both, with opt-in approximate location. Works with no prompt active and with no photo.
• Ask: "what is this?" sends the photo, note, lens, season, and (if consented) rounded location to a multimodal model with a fixed card template and the confidence vocabulary. Three-tier card: short answer, what to look for, go deeper (three tappable follow-ups plus a free-text question bounded to the capture, answered in the same template). Fixed safety block for anything edible or medicinal.
• Journal: list of captures with photo, answer, date, and the three reactions. Filter by lens.
• Lens settings: eight to ten broad interests, three states each. Onboarding is three screens or skippable.
• Local-first storage with the user's data exportable as JSON and deletable in one tap.
• Pilot instrumentation: capture rate, ask rate, go-deeper rate, reactions by lens, unprompted returns. Logged locally and exported with the data; no analytics SDK.
Out, decisively
• Any map. No map screen, no pins, no route, no "nearby." The journal shows a neighborhood name, not a dot.
• Generated prompts. The bank is hand-written. Generation is a later experiment once the bank's tagging has proven which prompts work.
• Accounts and backend sync. Data lives on the device. If a tester loses their phone they lose their journal; this is acceptable for a pilot and removes the auth, database, and privacy surface entirely.
• Notifications beyond the morning invitation. No reminders, no streak nudges, no "you haven't walked." About half the pilot testers get the invitation and half don't, so return rate still means something.
• Seasonal callbacks, travel mode, city-scale adventures, audio, AR, social, sharing. The data model leaves room for callbacks (every capture has a date, lens tag, and optional approximate location); nothing else is designed for.
• Source lookup for local history. The model may say what the evidence suggests and what would verify it, but the MVP does not fetch county records, Sanborn maps, or historic registers. This is the first thing to add after the pilot if history turns out to be a strong lens.
• A custom plant-identification model. The general multimodal model is used for everything in the MVP; a specialist identifier (see section 4) is swapped in only if plant accuracy proves to be the thing testers care about most.
What the MVP is not allowed to grow into during the pilot
Testers will ask for a map within the first week. They will ask for a way to share a find. They will ask to be reminded. Each of these is reasonable and each one pulls toward the products this is not. The rule for the pilot: write the request down, do not build it, and ask the tester what they were hoping it would do for them. The answer is usually a gap in the core loop that can be fixed without the feature.
4. Implementation plan for a solo developer
Recommended: Expo (React Native) with local SQLite, one serverless proxy function in front of a general multimodal model, and nothing else. This is the smallest architecture that keeps the API key off the device, lets you cap spend, and leaves a clean seam for a backend later. Figures below are approximate, from general knowledge, not quoted prices.
Platform options
Option
Build time to pilot
Cost at pilot scale
Privacy
What it gives up
Expo + SQLite + one proxy function (recommended)
4–6 weekends
Near zero: Vercel hobby tier plus model usage
Data stays on device; only the photo being asked about leaves
No sync, no recovery if the phone is lost
Expo + Supabase (auth, Postgres, storage, edge functions)
7–10 weekends
Free tier covers a pilot
Photos and locations now live on a server you must secure
Two to three weekends on auth, RLS, and sync that the pilot does not need
Next.js PWA on Vercel
3–4 weekends
Near zero
Same as Expo option
Camera capture is clunkier, no home-screen presence on iOS without extra steps, and testers will treat it as a website
Expo + direct model calls from the device
3 weekends
Same model cost
Fine
The API key ships inside the app; not acceptable even for a pilot
The PWA is a real option if the first goal is to test the answer card with testers before investing in native capture. If you go that way, keep the data layer and the card component framework-agnostic so they port to Expo.
AI approaches for the learning moment
Approach
Accuracy
Cost per ask (approx.)
Reliability
Privacy
Build time
General multimodal model with a fixed card template and confidence vocabulary (recommended for MVP)
Good on common plants, buildings, insects, signs; weak on fine species distinctions
A few cents with a resized photo
High; one vendor, structured output
Photo leaves device only on ask
One weekend
Specialist plant identifier (e.g. Pl@ntNet API) for plants, general model for everything else and for explanation
Noticeably better on species; returns a ranked list with scores
Specialist tier often free at low volume, plus the general call
Two vendors, two failure modes; classification step decides which path
Same
Two weekends, after the pilot shows plants matter
General model plus web search grounding for history and art claims
Turns speculation into cited claims when sources exist
Several cents more per ask; more latency
Search quality varies by city; Indianapolis has decent digitized sources
Location leaves the device as a query
One to two weekends, after the pilot
On-device small vision model
Poor on fine distinctions
Zero marginal cost
Deterministic but limited
Best possible
Several weekends; not for now
Two cheap improvements apply to any of these. First, route in two tiers: a small fast model classifies the capture and answers the short tier; a larger model is called only when the user taps "go deeper." Most asks never reach the second tier. Second, resize photos to about 1,000 pixels on the long edge before upload; it cuts cost and latency and does not hurt identification.
A daily cap per device (say 20 asks) protects against a runaway bill and, usefully, matches the product's stance that the phone is not the point.
Data model (minimal)
• prompt: id, text, lens, shape (count / compare / evidence / re-see), effort, seasons, weather tolerance, safety-reviewed flag.
• capture: id, created_at, photo_path (nullable), note, lens_at_capture, prompt_id (nullable), approx_lat, approx_lng (nullable, rounded), neighborhood_label.
• answer: id, capture_id, class (plant / building / …), short_text, confidence (one of four), look_for_text, follow_ups (JSON), deeper_text (nullable), model, created_at.
• reaction: id, capture_id, kind (interesting / not_for_me / tell_me_more), created_at.
• lens_weight: lens, weight, updated_at. Recomputed from reactions with time decay.
Everything is local. The proxy function is stateless except for a per-device daily counter.
Build sequence
1. Weekend 1 — the card, not the app. Build the proxy function and the answer-card template. Test it with 30 of your own photos from past walks (the serviceberry, the cats, the murals). Tune the prompt until the confidence vocabulary behaves, the safety block fires on anything edible, and a three-question follow-up reads like a curious companion rather than a lookup. If this weekend's output is not satisfying to you, stop and rethink before building any UI.
2. Weekend 2 — capture and journal. Expo scaffold, camera, SQLite, the journal list, reactions. No prompts yet.
3. Weekend 3 — prompt bank. Write and tag about 100 prompts. Build Today and Explore with weighted selection and the serendipity draw. Lens settings.
4. Weekend 4 — instrumentation, export, dark mode, polish. Local event log, JSON export, delete-all, the location consent flow, photo resizing, daily cap. TestFlight / internal track build.
5. Weekends 5–6 — pilot. Five testers for two weeks. Weekly ten-minute check-in each. Build nothing new during the pilot except fixes to the card.
The proxy is the only server-side component and holds no data; swapping in a specialist plant identifier or a search-grounded history path later means adding a branch inside it, not changing the app.
5. Assumptions to validate, and the experiments that test them
Six assumptions carry the product. Four can be tested before any code is written. The experiments are ordered by how cheaply they can kill the idea.
Assumption
If it's wrong
Experiment
Pass signal
A prompt is enough to get someone out the door without a destination or a reward
The product is a scavenger hunt with no hunt
Continue the ChatGPT daily-prompt trial for two weeks, but log it: did I walk, did the prompt shape where I looked, did I capture anything. Recruit two friends to do the same with a shared prompt list
Prompts led to a walk on more than half the days offered, for at least two of three people
The same four blocks stay interesting across weeks
Hyperlocal fails and the product needs city-scale travel sooner than planned
Same trial, same neighborhood, no new terrain allowed for the full two weeks
Captures do not fall off sharply in week two; at least one "I never noticed that" per person in week two
A general multimodal model gives a satisfying answer on a real neighborhood photo
The learning moment, which is the product, is flat
Weekend 1 of the build: 30 of your own past walk photos through the card template. Then show ten of the cards to three people who did not take the photos
You would send at least 20 of 30 cards to a friend unedited; testers rate at least 7 of 10 as "I learned something"
The confidence vocabulary is understood and trusted
Users either over-trust (dangerous on plants) or dismiss everything
In the card review above, ask each tester what "likely" and "unsure" mean to them and whether they would eat the purslane
Testers paraphrase confidence correctly; nobody says they would eat it on the card's word alone
Incidental signals (captures, reactions) are enough to steer prompts without a completion step
Personalization is noise and the serendipity quota is all that works
During the pilot, log every prompt served with its lens weights. After two weeks, show each tester their last ten prompts and ask which felt aimed at them
Testers identify the aimed prompts above chance, and do not report feeling boxed in
People return without being reminded
Value is lower than it feels; or the product needs a gentle cadence after all
Pilot sends no notifications. Count sessions per tester per week
At least three of five testers open the app in week two without being asked to
What to watch for that no metric catches
• Testers describing the prompt as a task ("I still need to do today's"). That is the compulsion the principles forbid, surfacing anyway.
• Testers capturing things that match the prompt rather than things they found interesting. The prompt has become the point.
• Cards that are accurate but boring. Accuracy is necessary; the pass bar is "I'd tell someone this."
• Any tester asking for a map. Ask what for, before answering.
How to run the pilot
Five people, two weeks, one Indianapolis neighborhood each, deliberately different interests (at least one person who says they are not interested in nature). A ten-minute call at the end of each week with the same five questions. Export each tester's JSON at the end and read the journals yourself; the captures and notes will say more than the numbers.
6. Decision register
Three lists, kept separate so nothing of mine is mistaken for something you decided.
Established (from the handoff; not reopened here)
• The central loop: independent noticing → the app explains → revealed interest shapes the next invitation.
• Curiosity over consumption; no restaurant, shop, class, or attraction recommendations.
• Discover first, explain second; no pin-covered map.
• Hyperlocal first; city-scale and travel are later extensions.
• No fitness, step, calorie, streak, or leaderboard mechanics as the reward. Revised Oct 10: badges that certify learning are in (section 7); streaks and activity rewards stay out.
• AI photo identification is never sufficient grounds to eat a wild plant.
• Specific-place history claims must separate verified from speculative.
• Location is sensitive: opt-in, approximate, private by default.
• React Native / Expo is a plausible starting point; no other platform choice is settled.
• Visual design happens in a separate Claude Design session; this document owns product and architecture only.
My recommendations (reversible; each is labeled so it can be undone)
Recommendation
Reversible assumption behind it
Capture-and-ask is the irreducible core; prompts are optional on every path
The learning moment is where the value lives; prompts are a reason to go look, not the product
Prompts use category-level neighborhood context only, never a named feature or address
Granularity, not context, is what breaks discover-first
Hand-written bank of about 100 tagged prompts for the MVP; no generation
Tagging data from a fixed bank is needed before generation can be judged
One-in-four serendipity draw; reaction weights decay over weeks
A fixed quota is the only reliable anti-bubble; the ratio is a guess to tune
No completion step; signal comes only from captures, reactions, and asks
Any explicit completion question becomes a chore
In-walk interaction is shallow (capture only); depth lives in the journal, available immediately by choice
Protects attention without forbidding curiosity in the moment
Four-state confidence vocabulary with "can't tell from this" treated as a good outcome
Uncertainty must be a UI state, not a sentence
Fixed, model-proof safety block for edible or medicinal captures
Guardrails live in the app, not in the prompt
No map, no notifications, no accounts, no sync in the MVP
Each one either pulls toward a different product or adds a privacy surface the pilot does not need
Expo + SQLite + one proxy function; general multimodal model; two-tier routing; 20 asks per device per day
Smallest architecture that keeps the key off the device and caps spend
Pilot success measured by capture rate, ask depth, reaction ratio, and unprompted return
These measure noticing and learning; DAU and time-on-screen measure the opposite
Weekend 1 builds the answer card before any UI
If the card is flat, nothing else is worth building
Open questions (from the handoff, with where this document stands)
• In-walk interaction depth. Recommended shallow; the pilot's ask-timing data (asked on the walk vs. at home) will say whether that was right.
• What completes a quest. Recommended: nothing does. Revisit only if testers report feeling unfinished.
• Personalization vs. serendipity ratio. Set at 3:1 as a starting guess.
• Onboarding depth. Three skippable screens; all-neutral lenses if skipped.
• Geolocation. Opt-in at first capture, rounded to about 100 m. Whether identification quality actually improves with location is a Weekend 1 test: run the 30 photos with and without it.
• Multimodal sufficiency. Weekend 1 answers this before anything else is built.
• Journal structure. Flat list with lens filter. Anything more waits for pilot journals to show what structure the entries want.
• Measuring success without DAU. Section 2's five measures; the "I never noticed that" count is collected by asking, not inferring.
Questions worth asking you now
Only two would change the design rather than tune it.
1. Is a PWA an acceptable pilot vehicle if it gets the answer card in front of testers three weekends sooner, or does the pilot need to feel like a real app on a home screen to be a fair test of return behavior?
2. Do you want local history to be a first-class lens in the MVP, knowing the model cannot verify claims about specific addresses without a source-lookup step that is out of scope? The alternative is to ship history as "what the evidence suggests" only, and promote it after the pilot if testers reach for it.
7. Rewards and badges (added Oct 10 at the founder's direction)
Badges are in, with one rule that decides every case: reward noticing and learning, never showing up. Trailhead is the right model because its badges certify that you learned a thing; Apple Fitness is the wrong one because its rings reset daily and reward consistency, which is the compulsion principle 6 was written against. The badge system below can be added to the MVP in about one weekend and tested in the pilot.
What earns a badge
Badge family
Earned by
Why it fits
First finds
First capture, first ask, first "go deeper," first capture with no prompt active
Teaches the loop without a tutorial
Field naturalist (per lens)
5, 15, 40 captures in a lens that received interesting or tell me more
Rewards depth of attention, counted over a lifetime, never per day
Honest observer
Receiving a "can't tell from this" and coming back with a second photo that resolves it
Makes uncertainty a win, which the card design depends on
Window opener
Capturing something in a lens the user had set to skip or had never reacted to
Rewards the serendipity quota instead of fighting it
Same spot, new season
A capture within about 100 m of an earlier one, in a different season
The hyperlocal thesis, made into a reward; depends on opt-in location
Look up / look down
Captures tagged above eye level, or at sidewalk level, across several walks
Nudges the re-see prompt shape
Shared jam (later)
Writing a note that references another person or a gift from a find
The serviceberry story; social without a social network
What never earns a badge
• Consecutive days, weeks, or any streak.
• Steps, distance, duration, or pace.
• Completing a prompt. A prompt can be abandoned with no record of it.
• Volume alone. Forty captures that all received not for me earn nothing.
• Rank against other users. There is no leaderboard and no public profile.
How they behave
• Most badges are hidden until earned, with the next one or two in each family shown as a silhouette. Discovering a badge should feel like discovering a plant: you find out it existed by getting it.
• Lifetime counts only. Nothing resets, nothing decays, nothing is lost by not walking.
• A badge is earned at the moment of the qualifying act, shown once as a quiet card, and then lives on a Badges screen under Journal. No push notification, no confetti.
• Each badge carries one sentence of what it certifies ("You've identified fifteen plants that interested you"), in the Trailhead style, so it reads as a record of learning rather than a trophy.
• Points: a single lifetime "field notes" number is fine if testers want a tally, but it is derived from badges, never from activity, and it is not shown on the Today screen.
The Fitness-ring alternative, if you want a progress visual
If a ring is wanted for its visual satisfaction, make it seasonal: one ring per lens that fills across a season from captures that received a positive reaction, closes at the equinox or solstice, and starts fresh with the season. A ring that takes three months to close and never resets daily keeps the satisfaction and loses the obligation. This is a reversible assumption; a weekly ring is the compromise if seasonal feels too slow in testing.
Changes elsewhere in this document
• Section 3 (MVP): badges move from out to in, as the First finds and Field naturalist families only; the rest wait for the pilot's data.
• Section 2 (success criteria): badge earn rate by family is added as a sixth measure. If Field naturalist badges concentrate in one lens, the serendipity quota is not working.
• Section 6 (decision register): the no-streak principle stands; the no-reward reading of it is revised.
• Pilot watch-item: any tester saying they captured something "for the badge." That is the signal the system has tipped from certifying attention to directing it.
8. Decisions adopted from the design pass (Oct 10)
The UI spec and mockups were built in a separate Claude Design session (working name: Verge). These rules came out of that pass and now bind the product spec.
• Name. Working name is Verge: the strip between sidewalk and street that nobody plants. Swap freely, but it's the default until something better arrives.
• Confidence is a shape first. Filled / half / ring / dashed circles for confident / likely / unsure / can't tell, with four low-chroma colors that step down in lightness. The mark must read without the word, in sun and in grayscale. Never a percentage, bar, or gauge.
• Edible or medicinal finds are capped at "Likely" in the headline even when the model is confident, and always carry the safety block. The block is a fixed component with no close control, placed between tier 1 and tier 2. Brick red appears nowhere else in the app.
• "Can't tell from this" replaces tier 2 with "What would help": two concrete asks that open Capture, plus "Leave it a mystery" as a real option. Resolving one re-runs the find and keeps the original in the journal.
• Lens set (replaces the earlier list): Nature, Built, History, Light & weather, Signs & people, Surprise. Explore cards carry effort in minutes and a weather note where it matters ("needs sun").
• Dark mode ships in the MVP. Tokens live in one theme object consumed by a hook; screens never branch on scheme. This adds a second token set to maintain through the pilot and is accepted scope.
• Reactions move up. On the answer card the three reactions sit between tier 1 and tier 2, not below Go deeper, so they are seen without scrolling. Reactions are the personalization signal; burying them starves it.
• Badges certify, never direct. The Badges screen shows silhouettes for the next badge in each family but never names a specific capture to go back to ("you have one waiting" is out).
• Type and surface. Young Serif for prompts and answer headlines only; Atkinson Hyperlegible for body (chosen for legibility in sunlight), minimum 15pt; IBM Plex Mono for labels and dates. Hairline rules instead of shadows, 4pt radii, no pills, no gradients, no emoji.
• Location label on cards is a neighborhood word ("Near home"), with rounded coordinates stored underneath for the seasonal callback in Journey D.