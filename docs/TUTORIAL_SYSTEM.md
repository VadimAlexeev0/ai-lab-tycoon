# V1 Tutorial System — "The Board-Required Compliance Assistant"

A design spec for a guided first-run experience with a persona-driven narrator.
Status: PROPOSED — not yet implemented. Owner: game design.

---

## 1. Design goal

A new player should reach their first product launch, understand the compute
economy, and survive their first incident without external documentation —
while being lightly mocked by the lab's compliance AI.

The tutorial is three things at once:

1. **An objective strip** — a persistent, skippable checklist of the opening
   arc (research → design → train → launch → consequence).
2. **A contextual narrator** — reactive one-liners triggered by real game
   events, not a wall of timed text.
3. **A safety net** — warnings before irreversible mistakes (shelving a
   model, firing into a compute shortage, ignoring a blocking decision).

Tone: helpful, dry, slightly passive-aggressive. Siri's politeness welded to
GLaDOS's contempt. The narrator is **never mean to the player's intelligence**,
only to the player's *choices*. The player should feel like the AI secretly
respects them and is annoyed about it.

---

## 2. The narrator persona: "PATCH"

**PATCH** (Procedural Assistant for Test Coordination & Housekeeping) is the
lab's board-mandated assistant. Canon: the board installed PATCH after the
last founder "achieved three incidents and zero revenue." PATCH is unimpressed.

Voice rules:

- Short. One sentence unless two are funny. Never three.
- Deadpan delivery. No exclamation marks. Ever.
- Compliment the outcome, not the player ("Revenue. In this economy.").
- Never blocks progress, never nags twice for the same event.
- References the player's *actual* state — names, numbers, rivals — via the
  same projection helpers the UI uses. A joke about the player's company name
  lands better than a generic one.
- Reduce frequency as the run matures: dense in weeks 1–6, sparse afterwards,
  effectively silent by the multimodal era.

Anti-rules (hard bans):

- No emoji. No "Let's go!". No forced catchphrases.
- No mocking the player after a *loss screen* — the terminal report is sincere.
  PATCH's last line is the only exception (see §5.4).
- No jokes about real-world harms (model misuse, safety incidents are treated
  with straight language in the moment; the wit comes in the follow-up).

---

## 3. Architecture

### 3.1 Data model (engine-side, deterministic)

Tutorials must replay deterministically like everything else. Two additions:

```ts
// components/tutorial.ts
export type TutorialState = {
    stepIndex: number;               // current objective (see §4)
    completedSteps: readonly string[]; // step ids, ordered
    dismissed: boolean;              // player opted out entirely
};
```

- `TutorialState` lives on `GameState` (new top-level component, schema-v2
  migration: old saves initialize to `{ stepIndex: 0, completedSteps: [],
  dismissed: false }`).
- Step advancement happens in **engine commands** (`completeTutorialStep`), not
  in the UI, so replays and cross-device resume stay correct.
- Facts: a new fact kind `tutorial_advanced` (or reuse command log) so
  Chronicle can later reference "the training arc."

### 3.2 Trigger layer (web-side, presentation only)

```
apps/web/src/game/tutorial/
    steps.ts          // step definitions: id, title, hint, completion check
    narrator.ts       // copy bank + selection logic (pure, testable)
    narrator.test.ts
    tutorial-strip.tsx  // persistent objective UI
    patch-line.tsx      // the narrator speech bubble
```

- Event hooks: the existing `facts` array from `advanceWeek`/commands is the
  trigger bus. `narrator.ts` maps fact kinds → candidate lines, picks one via
  seeded RNG (deterministic per week), never repeats the same line twice in a
  run (`seenLineIds` in local state, not save state).
- Copy bank lives in one file of plain data — writers edit one file, no
  component churn.

### 3.3 Opt-out

A persistent "Dismiss PATCH" in the run menu. Dismissal:
- hides the strip and all lines,
- sets `tutorial.dismissed` in save state (persists),
- is one-way for the run (re-enabling requires a new run — keeps replay
  determinism trivial).

---

## 4. The objective strip (first arc)

Seven steps, each completed by an actual engine event:

| # | Step | Completes when | PATCH on completion |
|---|------|----------------|---------------------|
| 1 | Assign a team to research | first `assignProject` (research) | "Research. The one part of this lab that has never disappointed me. Bar is underground." |
| 2 | Design a model | first `designModel` | "A model blueprint. I've archived the last founder's, if you want to compare regrets." |
| 3 | Train it | model enters training | "Training started. I've taken the liberty of not scheduling anything else." |
| 4 | Launch a product | first `product_launched` | "You launched something. Revenue exists. I'm as surprised as you are." |
| 5 | Manage compute | first compute purchase OR infrastructure project completes | "More compute. Bold of you to buy the thing you already needed." |
| 6 | Resolve a decision | first non-launch decision resolved | "Decisive. Statistically, that puts you ahead of the previous three founders." |
| 7 | Reach week 12 | week tick | "Twelve weeks. Most labs don't make it this far. Most labs also had adult supervision." |

Rules:

- Steps 1–4 are a strict sequence; 5–7 can complete in any order.
- The strip shows **one** step at a time (current + next dimmed), top of the
  dashboard under the hero. Collapses to a dot on mobile.
- Completion checks are pure functions of state, evaluated after each command.
- If a step's condition is already satisfied on load (e.g. resumed save), the
  strip fast-forwards silently — no celebration spam.

---

## 5. Narrator event lines (copy bank, representative)

### 5.1 Economy / resources

| Trigger | Line (one of several variants) |
|---|---|
| cash < 200 | "Cash reserves at {cash}. The vending machine now extends credit." |
| cash negative | "We are now operating on ambition. Historically a short runway." |
| first revenue | "Revenue. Real money from real users. The board will assume it was luck — don't correct them." |
| compute shortage starts | "Serving demand has exceeded capacity. Training is paused, which I've flagged in the deck as 'strategic patience'." |
| compute purchase | "Compute acquired. The physics remain unimpressed but the spreadsheet is thrilled." |
| hire team | "A new team joins. I've hidden the last founder's parking spot." |
| hype up | "Hype is climbing. Remember: hype is a loan against future disappointment." |
| trust up | "Trust rising. Slowly. Like most credible things." |
| trust < 30 | "Trust at {trust}. Regulators have started spell-checking our press releases." |

### 5.2 Research / models

| Trigger | Line |
|---|---|
| research completed | "{node} complete. The tree grows. So does the grant application." |
| era advance | "New era unlocked. Everything we know is now quaint." |
| model trained, score high (≥80) | "Training complete. The estimate is strong. Estimates, like promises, are pre-outcome." |
| model trained, score low (≤45) | "The model is... honest. Let's call it honest." |
| training starved (rate 0) | "Training frozen — the product ate the compute budget. Growth: lucrative. Timing: poetic." |

### 5.3 Rivals / incidents

| Trigger | Line |
|---|---|
| rival milestone | "{rival} shipped. The press used the word 'breakthrough' 14 times. I counted." |
| rival at category_lead | "{rival} has taken the category. The board asked me to forward their 'concern'." |
| incident contained | "Incident contained. Legal has drafted an apology they hope we never need." |
| incident severe | "That was a severe incident. I've queued the post-mortem template. It has a tab for 'recurrence'." |

### 5.4 Terminal (loss) — the one sincere moment

The loss screen drops the persona for the report itself (per §2 rules), then
closes with a single PATCH line depending on reason:

- cash_depleted: "For what it's worth: the physics were sound. The burn rate wasn't. — PATCH"
- trust_collapsed: "We built remarkable things. Nobody trusted them. That's the whole lesson. — PATCH"

Then a "Replay from fork" teaser (P1.6) — the what-if hook.

---

## 6. Copy engine rules

1. **Selection:** all candidate lines for a trigger enter a pool; seeded RNG
   picks one; pool excludes lines already seen this run. Empty pool → no line.
2. **Rate limiting:** max 1 PATCH line per week, max 3 per 5 weeks. Priority:
   terminal > incident > compute > economy > flavor. Lower priority defers.
3. **Interpolation:** lines reference real projections (`companyName`,
   `cash`, `rivalName`, `nodeLabel`) — formatted through the same
   humanizers the reports use, never raw IDs.
4. **Testing:** `narrator.test.ts` is pure: given (facts, rng state, seen set)
   assert selection, dedupe, rate-limit, and interpolation. Copy bank is data;
   one test snapshot guards against accidental deletion of a trigger bucket.

---

## 7. Migration & scope notes

- Schema: `TutorialState` requires **schema-v2** — bundle this with the
  commandLog bounding migration (P1.8) to pay the migration cost once.
- The narrator is web-presentation only; the engine never stores copy. Replays
  stay byte-identical with or without the UI layer.
- Estimated scope: **M** — strip + engine step tracking + copy bank + tests.
  The copy bank is the long pole and can ship in two passes (weeks 1–6 lines
  first, era/rival lines later).
- Dependencies: best shipped after P0.4 (causal weekly card) so PATCH
  complements the resolution card rather than substituting for it. Compute
  visibility (P0.3) should land first or PATCH's best lines land before the
  player can act on them.

## 8. Out of scope / future

- Voice performance (the text persona is designed to survive voice later).
- Per-founder-archetype narration variants (P0.6 archetypes first).
- PATCH commenting on Chronicle/what-if replays.
