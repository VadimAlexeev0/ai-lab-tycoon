# Placeholder UI Wave — Plan (2026-08-27)

Goal: build beautiful, clearly-marked PLACEHOLDER surfaces for content systems
that the Ultimate Vision defines but the engine does not yet implement. Each is
interactive, data-shaped, and driven by a **Debug force-show control** so they
can be exercised without engine support. All placeholders:

- render a `PlaceholderBadge` ("Preview · coming online in a later era") so
  players are never misled;
- consume real GameState where it exists (rivals, week, products, models) and
  generated sample data only for the not-yet-engine parts, clearly seeded from
  the run seed so they are deterministic;
- live behind `/game/...` routes with nav entries in a new "Archive" nav group,
  NOT mixed into core-loop pages.

## Pieces

### 1. Quarterly Review (`/game/quarterly`)
The narrative heartbeat. Every 13 weeks this would auto-open; placeholder has a
Debug button on dashboard + route.
- Elegant report: stat deltas vs previous quarter (cash/burn/runway, compute,
  research, product users, trust/hype), sparklines per metric.
- "Board expectations" meters with 3 authored-style rows.
- Strategic Question card: one of 5 authored-style questions from
  ULTIMATE_VISION §3.4, choices present but disabled with tooltip "engine
  support pending" — selecting does nothing except a toast.
- Debug: force at any week.

### 2. Industry News Ticker (`/game/pulse`)
World-aliveness layer.
- Fixed bottom ticker on all /game pages (pausable, hideable) with headlines.
- Expandable Pulse page: headline cards w/ press-source badge, sentiment tag
  (positive/negative/neutral chip), related-rival avatar chips (real rivals).
- Headline generator: deterministic from run seed + rival progress; template
  bank (~24 templates: rival launch, funding round, controversy, market swing).
- Debug: force headline batch; slider to simulate rival progress %.

### 3. Company Chronicle (`/game/chronicle`)
Manuscript-style run history.
- Quarter-by-quarter timeline assembled from REAL commandLog/report history
  (already in state) + milestone markers; empty quarters collapse.
- On lost runs (or debug-forced): "death certificate" card with cause +
  three What-If fork buttons (disabled, "replay forks ship later").
- Ink-on-paper aesthetic via CSS only (serif display font, subtle vignette).

### 4. Lineage Gallery (`/game/lineage`)
Model family tree wall.
- Real models from state grouped by foundation lineage; connectors show
  continued/distilled descent; fate stamps (LAUNCHED/SHELFED/RETIRED/FLAGSHIP).
- Empty-state art for pre-first-model labs. Generate 3 chip-hero images for
  visual richness behind model cards.

### 5. Lab Notebook (`/game/notebook`)
Discovery grid (cross-run meta later; per-run now).
- 4×3 grid of sealed tiles; tiles unlock from REAL first-time events already in
  reports (first incident cause, first evaluation, first launch, era nodes…).
- Locked tiles show frost-lock + "?"; unlocked flip open with handwritten-style
  annotation (CSS). Count badge in nav.

### 6. AGI Program board (`/game/agiprogram`)
Late-game moon-shot kanban, playable-noop.
- Monumental vault panel: 6 socketed slots (from vision's Era 4-6 pieces);
  slots light up IF real engine milestones exist (era keystones complete),
  otherwise frost-locked with "Era X required".
- Header reads percent-aspirational (cosmetic only).

## Shared infra
- `PlaceholderBadge` component + `useSampleData(seed)` deterministic generator
  hook (mulberry32 from run seed).
- Nav: group Archive items under a collapsible group with badge count.
- Debug drawer (`?debug=1` or footer button): buttons to force-show each
  surface, plus sliders for rival progress / quarter number.

## Art to generate (after commit 1)
- 3 fictional tech-press mastheads (The Gradient Wire, Benchmarks Daily, Context Window)
- parchment/ink header texture; wax-seal icon
- 3 model-chip hero shots (monolith silhouettes)
- vault-door key art for AGI board

## Execution
Wave A worker: shared infra + Quarterly + News Ticker (routes/game/*).
Wave B worker (after A merges): Chronicle + Lineage + Notebook + AGI board,
rebasing on shared infra.
Main agent: art generation mid-wave; final gate + gold zip after B merges.
