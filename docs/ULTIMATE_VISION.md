# AI Startup Lab Tycoon — Ultimate Vision & Achievable Build Plan

**Canonical full-game design specification**  
**Product shape:** single-player, offline-capable, browser-first strategy/tycoon game with a touch-friendly responsive UI  
**Genre:** Civilization × Game Dev Tycoon × replayable management strategy  
**Scope note:** this is the complete intended game, followed by a dependency-driven implementation order. The stages are a way to build the full game safely; they are not a replacement for the vision.

> **Fiction disclaimer:** every model, research breakthrough, benchmark, incident, and AGI concept in this document is invented game fiction. The game is not a simulation of real AI research and makes no real-world research claims.

## Hermes Session Brief

This is the compact handoff for a future implementation or design session. Treat the rest of this document as the detailed specification.

- **Product objective:** build a replayable, offline-capable, touch-friendly browser strategy/tycoon game in which a player grows a fictional AI lab from one team to an AGI Decision.
- **Immediate implementation objective:** complete **Stage 0**, establish the deterministic foundation in **Stage 1**, then prove the playable `build → launch → consequences` loop in **Stage 2** before expanding content.
- **Player promise:** every week presents a legible tradeoff among capability, compute, trust, and cash; every model has a history; every failure explains itself and suggests a replay.
- **Canonical constraints:** weekly player-controlled turns; no background simulation; six eras ending in AGI; model foundation lineage separate from brand lineage; data provenance and knowledge cutoff are first-class; pure deterministic engine; facts drive all narrative.
- **Dependency order:** contract/economy proof → deterministic engine and saves → playable core economy/teams/projects → casual shell → Eras 1–2 research → products/data/incidents → lineage/multimodal → rivals/funding/governance → Eras 4–5 tracks → AGI program/endings → meta/content/polish → simulation and release hardening.
- **Acceptance discipline:** do not advance to the next stage because code exists. Advance only when the stage gate in Section 13 is demonstrated by a playable slice, test evidence, or headless metrics.
- **Scope discipline:** protect the weekly loop, research tree, model designer/lineage, shared compute pressure, trust/incidents, deterministic engine, AGI finale, and Chronicle/replay. Defer presentation and breadth before cutting these systems.

### How to interpret this document

- **Canonical decision:** a resolved rule or architecture choice. Implement it unless a later review explicitly changes this document.
- **Target:** a measurable tuning or usability goal. It may move after evidence, but the reason for changing it must be recorded.
- **Example:** illustrative content, names, or numbers. Examples are not additional mechanics.
- **Option/idea:** a possible content variant or polish layer. It is not a dependency unless promoted to a canonical decision.

### Current repository context

Future Hermes sessions should work in the existing repository at **`/opt/data/ai-lab-tycoon`**. Do not re-scaffold it or replace its stack merely because an older design draft mentioned Expo.

- Package manager/build: **pnpm workspaces + Turborepo + TypeScript + Biome**.
- Player application: **`apps/web`**, using React, TanStack Start/Router/Query, Vite, Tailwind, and shared components from **`packages/ui`**.
- Existing service scaffolding: **`apps/server`**, Hono, oRPC, Drizzle, and Cloudflare D1. These may support optional future features, but the canonical single-player simulation, active run, and replay loop must not depend on a server or network connection.
- Add the game-specific packages described in Section 11 alongside the existing workspace packages; do not move simulation rules into React components, API handlers, or database queries.
- This document governs product direction and engine invariants. The repository's checked-in manifests, scripts, and project instruction files govern the exact commands and currently installed versions.

---

## 0. Canonical Decisions

The source material developed several excellent ideas at different levels of scope. This document resolves them into one set of rules so that design, engineering, and content work do not keep reopening the same questions.

### 0.1 The decisions that are now fixed

| Question | Canonical decision | Why it matters |
|---|---|---|
| How does time move? | One player-controlled **week** at a time. Thirteen weeks form a quarter. The player must press **Advance Week**; there is no background simulation. | A multi-day run is safe to pause, works on mobile and web, and makes every economic change attributable to a player decision. |
| How long is a run? | A normal run targets **6–10 hours of active play**, spread over many real-world sessions. A failed run may end in 1–3 hours; a slow, highly exploratory AGI attempt may approach 12 hours. | This reconciles the desire for epic progression with short sessions. It is not an idle game. |
| How long is a session? | Most sessions should take **3–15 minutes**: clear a queue, play several weeks, resolve a report, or finish a quarter. | The player can stop at a natural decision without losing progress. |
| What is the end state? | The **AGI Threshold** is the explicit summit. A successful run reaches an AGI Decision; the player's earlier doctrine, research, data, trust, and foundation determine the available outcomes. | Commercial success, prestige, or a frontier model are important milestones, but they are not substitutes for the game's final AGI fantasy. |
| How many eras? | **Six:** Sequence, Assistant, Multimodal, Generative & Agentic, World & Embodied, and AGI Threshold. | The sixth era cleanly separates the world-model/robotics build-up from the final AGI program. |
| What is a successor? | A model has a **foundation lineage** and a separate **brand lineage**. Continued training, distilled successor, and fresh foundation are distinct choices. Debt follows the foundation; expectations follow the brand. | A player may preserve a beloved name while rebuilding its technical foundation, or keep a cheap but compromised lineage alive. |
| How much inheritance is there? | Continued training inherits the most; distillation inherits a reduced floor and reduced debt; a fresh foundation inherits no technical debt or hidden risk. Every choice has a cost. | The player gets meaningful lineage decisions without making every successor permanently contaminated. |
| What is the data system? | Data is an inventory with provenance, quality, freshness, modality, restrictions, and rights risk. Sources are acquired, licensed, product-derived, or synthetic. | Data is a strategic economy and a long-term liability, not just a slider. |
| What are the important model families? | General assistants, coding models, small local/edge models, multimodal models, video models, agent models, world models, and robotics/embodied models. | Variety changes markets, compute needs, incidents, and AGI readiness. |
| What is the implementation target? | Extend the existing pnpm/Turborepo project: TanStack Start in `apps/web`, shared UI in `packages/ui`, and new platform-neutral engine/content/simulator packages. The game should be installable as a PWA and remain easy to wrap for iOS later. | This preserves work already completed, keeps core play offline, and avoids a needless framework migration. |
| What makes content feasible? | The engine emits typed facts; a data-driven content layer renders those facts through reusable templates, stance tables, and a small bespoke set. | The simulation supplies the changing nouns. The solo developer does not hand-write every possible conversation. |

### 0.2 What “full game” means here

The ultimate vision includes all six eras, the major model families, data provenance, model lineage, products, rivals, funding, incidents, AGI endings, replay meta-progression, and the casual-friendly narrative layer. The build roadmap introduces those systems in dependency order and uses acceptance gates to prevent a large amount of unfun content from being built on top of a weak core.

A stage may use placeholder text, a thin rival simulation, or a simplified robotics contract while the engine is being proven. That is an implementation tactic, not a change to the eventual player fantasy.

### 0.3 Product goals and non-goals at a glance

**Product goals**

1. Deliver a complete, replayable AGI-lab management game rather than an endless sandbox or an MVP disguised as a final design.
2. Make the first model arc understandable and emotionally memorable for a casual player.
3. Give systems-oriented players substantial depth through research paths, model recipes, data provenance, compute allocation, lineage, markets, and uncertainty.
4. Make a multi-day browser/mobile session safe: no background ticking, reliable saves, clear re-entry context, and natural stopping points.
5. Make failure useful: warnings, a specific Chronicle cause, a What-If fork, and a different experiment to try next.
6. Keep the full simulation testable and portable through a pure deterministic engine and headless simulator.

**Product non-goals**

- Real-world AI accuracy, scientific pedagogy, or claims about how actual models are trained.
- Online accounts, live-service retention, or server-dependent simulation for core play.
- A fully simulated employee/personality management game, physics sandbox, or real-time strategy game.
- Permanent power creep as the main reason to replay.
- A requirement that a solo developer author bespoke prose for every possible state.

### 0.4 Load-bearing invariants

These rules protect the identity and maintainability of the project. They are not suggestions to be traded away casually:

1. **No background simulation:** time advances only after the player explicitly advances a week.
2. **Player-readable causality:** every terminal loss has escalating warnings and a reportable cause.
3. **Research-to-model coupling:** new eras require both tree progress and a shipped model/system proof.
4. **Shared pressure:** training, serving, research, and evaluation compete for a shared compute pool.
5. **Foundation/brand separation:** technical inheritance and market expectation are different axes.
6. **Data has memory:** provenance, freshness, restrictions, and rights risk can affect later generations.
7. **Facts are the narrative API:** the engine emits typed facts; UI/content render them; no prose logic is embedded in simulation phases.
8. **Deterministic replay:** a seed plus ordered player commands reproduces the same state, facts, and fork.
9. **Content is data:** repeatable text is templated/validated content, not hardcoded casework.
10. **AGI is the summit:** ordinary commercial or prestige milestones modify the endgame but do not replace the AGI Decision.

### 0.5 Current implementation objectives and decision hierarchy

**Current objectives for the next implementation pass**

1. Model the opening economy and freeze the `GameState`, `Fact`, `Decision`, RNG-stream, and weekly phase contracts.
2. Establish the pure deterministic engine, command log, and recoverable local saves before adding substantial gameplay breadth.
3. Implement the smallest playable vertical slice from Stage 2 with placeholder facts and local persistence.
4. Prove deterministic replay and the Stage 2 acceptance gate before authoring the full tree or polishing the UI.

**When in doubt, decide in this order**

1. Protect the load-bearing invariants above.
2. Prefer a legible player decision over hidden automation or a new resource.
3. Prefer a deterministic, data-driven rule over special-case code.
4. Prefer a reusable system/content template over bespoke content.
5. Preserve the causal chain: choice → resource pressure → report → next decision.
6. Cut breadth, animation, or optional flavor before cutting research, model lineage, compute pressure, trust/incidents, or the AGI finale.
7. If two options remain viable, choose the one that is easier to test headlessly and explain in one plain-language card.

### 0.6 Review verdict and highest-risk assumptions

**Verdict:** the direction is coherent and distinctive enough to build, but it is not yet proven fun. The document is a product north star, not evidence that all its systems deserve implementation. Progress remains conditional on the stage gates.

The main-model review identified these risks, in priority order:

1. **The core loop may read better than it plays.** Research, model design, launch, and consequences must produce a satisfying 20–30 minute arc before the full tree exists. If Stage 2 fails, revise the loop rather than adding systems.
2. **A long, failure-heavy run can feel punitive.** The 6–10 hour target and 70–80% first-run failure target are hypotheses. Early failures must arrive sooner, teach one specific lesson, and make fork replay nearly frictionless. Shorten runs before weakening causality or adding permanent power rewards.
3. **The full scope is large for a solo developer.** Six eras, multiple economies, eight model families, advisors, rivals, and endings are feasible only as data-driven variations over a small deterministic core. Thin implementations and reusable facts are mandatory; bespoke subsystems are the enemy.
4. **Casual readability can collapse under resource count.** Cash, compute, Insight, data, hype, trust, debt, staleness, and risk must enter progressively. If testers cannot explain a choice from the front of a card, simplify the presentation before simplifying the underlying tradeoff.
5. **The research tree can become either obvious or decorative.** Paradigms and branches must change the economy or model designer within the same era. Track pick rates, dead nodes, and dominant paths must be measured by bots and humans.
6. **Replay determinism can be accidentally broken by ordinary refactors.** Named RNG streams, sorted iteration, integer math, schema-versioned command logs, and golden runs are release invariants, not late test polish.
7. **The existing backend stack can tempt unnecessary online architecture.** Keep active runs and core rules local. Use Hono/oRPC/D1 only for an explicitly approved optional feature, never because the scaffold happens to contain them.
8. **Content volume can hide repetition rather than fix it.** Ship placeholder mode first, then author against coverage reports. Add variants only where simulation and playtests show visible repetition.

A future Hermes session should not reopen these risks abstractly. It should gather evidence at the relevant stage gate, record the result, and update this document only when the evidence changes a canonical decision.

---

## 1. Vision and Pitch

### 1.1 The fantasy

You are the founder of a fictional AI lab. You begin with one team, a precarious runway, a small compute allocation, and an idea that may or may not survive contact with the market. Over the course of a run, you choose what your lab believes in:

- scale or efficiency;
- proprietary advantage or public research;
- fresh foundations or inherited model families;
- consumer reach or enterprise trust;
- fast launches or expensive evaluation;
- scraped speed, licensed quality, or a user-data flywheel;
- cautious tools, powerful agents, embodied systems, or a broad frontier program.

You research fictional breakthroughs, turn those breakthroughs into named models, launch the models into markets, and live with their consequences. Your first text model may be charmingly flawed. Its successor may become a useful assistant. A later model might see images, generate video, run tools, imagine simulated worlds, or control a robotic fleet. Eventually, if the company survives, you assemble the pieces for an AGI program.

The climax is not a progress bar. It is a decision: what do you do with the most capable system your lab has ever built when its evaluations are still imperfect, rivals are racing, products are starving for compute, investors want a launch, and the history of every shortcut is attached to the company?

### 1.2 One-sentence pitch

> **Climb a branching research tree to breed a dynasty of fictional AI models—from a stale little text bot to video, agents, robots, and world models—while every launch, shortcut, and shelved evaluation compounds into the story of how your lab reached AGI, triumphed, or burned.**

### 1.3 The core pressure model

The game is organized around a pressure triangle with business survival underneath it:

```text
                 CAPABILITY
                /           \
               /             \
          COMPUTE ----------- TRUST
               \             /
                \           /
                 CASH / RUNWAY
```

- **Capability** creates better products, prestige, and access to new research.
- **Compute** is the scarce capacity that pays for training, evaluation, research, and serving customers.
- **Trust** determines whether people tolerate mistakes, sign contracts, share data, and allow the lab near sensitive or embodied applications.
- **Cash/runway** determines whether the player gets enough time to solve any of the above.

Every strong move should improve one corner while stressing another. A launch increases capability visibility and revenue, but consumes compute and exposes trust. A safety program improves trust but delays the market window. A fresh foundation avoids technical debt but consumes the runway earned by the old brand.

---

## 2. Design Pillars and Non-Goals

### 2.1 Design pillars

#### 1. Every success creates a new problem
A successful launch is a new operating obligation, not a victory screen. Users consume compute, rivals respond, expectations rise, and previously hidden weaknesses become visible at scale.

#### 2. The research tree is the spine
Research is not a passive technology list. It determines what models can be designed, which markets can be entered, how data can be acquired, and what kind of company the player becomes. As in Civilization, the path through the tree is strategic identity. As in Game Dev Tycoon, the model is the release that proves whether the chosen path works.

#### 3. Models are characters with memory
The player names models, watches them train, sees their strengths revealed, and chooses whether to retire them. A model's foundation, brand, cutoff date, debt, risk memories, and products form a history. The lineage gallery should make a failed model feel like a failed executive or a beloved old product, not an overwritten spreadsheet row.

#### 4. Hard choices, easy interface
The game may be difficult, but it must not be confusing. A casual player should understand the plain-language consequence of a decision; a systems player should be able to reveal the numbers, assumptions, and uncertainty bands behind the same card.

#### 5. Failure is legible content
The game should punish bad prioritization, not lack of clairvoyance. A bankruptcy, trust collapse, or severe incident must be foreshadowed, attributable to earlier choices, and summarized in a memorable Chronicle. Failure should produce a specific lesson and a tempting replay fork.

#### 6. Deterministic simulation, authored surprise
The engine is deterministic for a seed and command log, but the player should still experience uncertainty because model quality, event outcomes, and rival moves are not fully known before evaluation. Determinism makes the story reproducible; hidden information makes it dramatic.

#### 7. The world reacts without requiring a giant simulation
Rivals, markets, boards, customers, and regulators should create pressure, but the game does not need to simulate every person or every company department. Small, legible state machines and event decks are preferable to an opaque “realistic” simulation.

#### 8. Respect the player's time
The game never advances while closed. It has no daily decay, forced check-ins, energy timers, or idle rewards. Retention comes from suspended stories, pending decisions, model attachment, replay forks, and a growing personal understanding of the system.

### 2.2 Non-goals

- It is **not** a real AI research simulator, benchmark suite, or educational claim about how real models are built.
- It is **not** a coding game where the player writes training code or debugs real neural networks.
- It is **not** an idle/incremental game with background income or offline punishment.
- It is **not** a fully simulated corporate org chart. Teams are strategic capacities, not dozens of individual employee schedules.
- It is **not** a live-service economy. No server is required for the core game, and the design does not depend on daily content or an online rival population.
- It is **not** a gacha or power-grind progression system. Cross-run unlocks provide variety and knowledge, not permanent numerical superiority.
- It is **not** a promise that every combination is perfectly balanced. A combination should be viable, interesting, or instructively dangerous; it does not need to be optimal.
- It is **not** a dialogue-heavy adventure game. Dialogue is a reusable presentation layer for system facts, with bespoke writing reserved for high-value moments.

---

## 3. The Complete Player Experience

### 3.1 Start of run

The player chooses a founder archetype, a company doctrine, an optional starting trait, and a world seed. These are tradeoffs, not difficulty sliders.

**Founder archetypes** describe the founder's instinct:

| Archetype | Advantage | Liability | Typical fantasy |
|---|---|---|---|
| Research Purist | Faster Insight and prestige | Slower monetization | Build something historically important |
| Hype Founder | Stronger launch attention and fundraising | Scandals spread faster; expectations are higher | Win the narrative before rivals do |
| Infrastructure Genius | Better training and serving efficiency | Weaker marketing and public reach | Make every unit of compute count |
| Enterprise Operator | Better contracts and trust recovery | Slower consumer growth | Become the dependable institution |
| Safety Researcher | Better evaluation and incident response | Slower early capability growth | Prove that caution can win |
| Open-Source Idealist | Strong recruiting and community effects | Harder direct monetization | Build an ecosystem rather than a fortress |

**Doctrines** alter the company's posture:

- **Closed Frontier Lab:** protects proprietary advantages and monetizes strongly, but has weaker community goodwill and higher scrutiny when opaque decisions surface.
- **Open Research Collective:** publishes more cheaply and recruits well, but rivals benefit and direct product margins are weaker.
- **Enterprise AI Vendor:** stable contracts and trust, but slower hype and stricter freshness/compliance requirements.
- **Consumer AI Platform:** rapid user growth and visibility, but high serving costs and public incident exposure.
- **Embodied Systems Venture:** access to hardware partnerships and sticky contracts, but slow payback and severe physical incident consequences.

A starting trait, such as **Ex-BigTech Team**, **University Network**, **Frugal Founders**, **Well-Known Brand**, or **Debt-Ridden Prototype**, adds a small situational hook. Traits should create a different opening, not a strictly better opening.

### 3.2 The session loop

The game is designed around a short, resumable session:

```text
Open the game
→ Re-entry recap: where the lab is, what is pending, one advisor remark
→ Review 1–3 decision cards and recent reports
→ Make or defer non-blocking choices
→ Advance several weeks
→ Resolve a training dispatch, launch, incident, rival headline, or quarter review
→ Save at the new decision point
→ Put the game down while a question is still alive
```

The game should feel good after one quarter, not only after a full run. A player can open the app to decide whether to push a training run, play four weeks, and stop after the launch report.

### 3.3 The weekly loop

Each week has three visible player-facing moments:

1. **Plan:** assign teams, choose projects, allocate compute, inspect products, resolve mandatory decisions, and decide whether to advance.
2. **Advance Week:** the deterministic engine simulates exactly one week.
3. **Resolution:** facts become report cards, completed projects become choices, and the decision queue presents the consequences.

A normal week should produce information, not necessarily a dramatic crisis. The target is zero to three meaningful decisions. The player should never face a modal storm and should never need to remember an invisible action.

The player repeatedly asks:

- Should the next team work on a research node, a product, an evaluation, a hiring project, or a funding round?
- Can the lab afford to train while serving current users?
- Is this model ready enough to launch, or is the uncertainty itself the danger?
- Does a rival headline require a response, or is it bait to pull the lab off its plan?
- Is an old product worth keeping alive for revenue, or is it consuming the compute needed for the next generation?
- Should the lab publish a discovery for reputation, or hoard it for a lead?
- Is the data shortcut saving the company now while making a future incident inevitable?

### 3.4 The quarterly loop

Every thirteen weeks, the Quarterly Review summarizes the lab's recent history:

- cash, burn, revenue, and runway;
- compute capacity, spot price, and allocation pressure;
- research nodes completed and Sparks discovered;
- products, users, satisfaction, staleness, and incident exposure;
- rival positions on the public research tree;
- board expectations and funding obligations;
- trust, hype, data-rights exposure, and outstanding risk memories.

The review also raises one **Strategic Question**. These questions look authored but are generated from systemic facts:

- An enterprise customer offers stable revenue in exchange for exclusivity.
- A rival publishes a model that makes your current research look obsolete.
- A data partner offers a clean licensed corpus at a price that consumes your runway.
- A regulator asks for an evaluation report before approving your agent pilot.
- A hardware partner wants an exclusive robotics commitment before your world model is ready.

The player makes a choice with a visible immediate effect and a less obvious strategic consequence. The Quarterly Review is the narrative heartbeat: it turns many small weeks into “the quarter we bet everything on the multimodal run.”

### 3.5 The era loop

An era is a strategic chapter of roughly 45–90 minutes of active play, depending on the player's pace and the number of training decisions. The loop is:

```text
Choose a branch and paradigm
→ Accumulate Insight, data, cash, and compute
→ Design a model that embodies the era
→ Survive the training siege
→ Evaluate hidden strengths and weaknesses
→ Choose a launch posture
→ Operate the product and absorb consequences
→ Ship the era keystone
→ Enter the next era with a changed company
```

The player cannot simply research toward the summit while ignoring production. Research and models are interlocked: a generation gate requires both tree progress and a shipped model that proves the lab can turn the research into a product or public artifact.

### 3.6 The full-run loop

A full run is a company story:

1. Establish an identity and survive the garage.
2. Ship the first text model and discover what the lab is actually good at.
3. Turn the assistant era into a revenue or reputation engine.
4. Choose how the company will feed itself with data.
5. Make the text-to-multimodal leap, deciding whether to preserve a lineage, graft capability, or start clean.
6. Expand into selected model families while compute, trust, and rivals become more dangerous.
7. Build a world model and, if chosen, an embodied or robotics business.
8. Assemble the AGI program while products, boards, regulators, and rivals demand attention.
9. Face the AGI Decision.
10. Read the Company Chronicle and decide whether to replay the same world from a pivotal fork or begin a new seed.

### 3.7 The cross-run loop

The player returns across runs because each failure leaves behind:

- a Chronicle with a cause of death and three “What if?” forks;
- a Lineage Gallery containing every named model and its fate;
- a Lab Notebook recording only combos, Sparks, and incident causes personally discovered;
- new founder archetypes, doctrines, scenarios, and world modifiers;
- a desire to test a different research branch, data posture, or foundation strategy.

There is no permanent stat bonus that turns later runs into a grind. The player becomes stronger because they understand the game, not because the game quietly hands them more cash.

---

## 4. Run Pacing and Act Structure

### 4.1 Pacing targets

| Layer | Target | Player experience |
|---|---:|---|
| One week | 30–60 seconds of active review/simulation | Make a plan, advance, read a small result |
| One session | 3–15 minutes | Several weeks, a report, or a quarter review |
| One quarter | 10–20 minutes | A coherent business chapter with a strategic question |
| One era | 45–90 minutes | A model arc from research to market consequences |
| Failed run | 1–3 active hours | A hard lesson and a clear restart hook |
| Full AGI run | 6–10 active hours, up to 12 for slow play | A multi-day strategy epic |

These are experience targets, not timers. The engine never moves because real time passed.

### 4.2 The six acts

| Act | Era | Feel | New pressure | Typical danger |
|---|---|---|---|---|
| Garage | 1. Sequence | Intimate; one team and one decision can change everything | First model, first compute bill | Runway collapse |
| Startup | 2. Assistant | The lab gets users and a public reputation | Data posture, first rival, first real product | Cash or trust collapse |
| The Leap | 3. Multimodal | Midpoint set-piece; the model becomes a family of products | Brand/foundation choice, modality costs, data rights | Compute starvation, inherited risk |
| The Portfolio | 4. Generative & Agentic | Multiple products and specialization tracks compete for attention | Video, local, agents, serving allocation | Incident chains, board pressure |
| The World | 5. World & Embodied | The lab's systems interact with simulated and physical markets | World models, robotics contracts, hardware risk | Severe incident, partner obligations |
| The Threshold | 6. AGI | All systems converge in a sustained capstone | Four linked mega-projects and rival AGI clocks | Gauntlet failure, rival eclipse, hubris |

### 4.3 The first thirty minutes

The first run should teach the fantasy through consequences rather than a manual:

1. The player picks a founder card with a short personality description.
2. One Founding Team receives three project cards: research, prototype model, or investor demo.
3. The first research completion introduces the idea that research unlocks buildable options.
4. The player names the first text model. Naming is prominent because attachment to a creation is a powerful retention mechanic.
5. The training result reveals a model that is flawed but endearing: strong in one area, embarrassing in another.
6. A launch card presents plain-language options. Two advisors disagree.
7. The first users arrive. The product makes money but consumes compute.
8. A viral week or small incident introduces the signature train-versus-serve decision.
9. The player can stop at a clear cliffhanger, with the next question saved.

The first run may be difficult, but it should not be opaque. The Three Warnings Rule applies from the beginning: no terminal state should arrive without escalating, understandable signals.

### 4.4 Designed emotional cadence

The engine should provide a mix of ordinary and peak moments:

- a report-card flip every one to three weeks;
- a training score reveal for each model;
- a launch-day judgment per model;
- an advisor callback after risky choices;
- an era-keystone fanfare roughly five times before the AGI program;
- one or two “squeeze survived” moments per era;
- a rival ticker entry most weeks, but not always a decision;
- a Chronicle at the end of every run.

Rewards are event-shaped rather than a constant idle number going up.

---

## 5. The Research Tree

### 5.1 Structure

The full tree targets approximately **60–75 total research nodes**, including specialization-track nodes and the small number of endgame prerequisites. It is organized into six era columns and five branches. Era 6 is primarily the AGI program rather than another wide research column. Exact node names and the final count can be tuned as content, but the structure and gates are fixed.

| Branch | Strategic question | Examples of unlocks |
|---|---|---|
| **Architecture** | What can we build? | Model families, context systems, modality encoders, tool interfaces, world representations |
| **Scaling & Infrastructure** | How large, fast, and cheap can it be? | Training tiers, cluster expansion, compression, serving optimization, burst compute access |
| **Data & Provenance** | What feeds the model, and do we have the right to use it? | Curation, licensing, synthetic pipelines, live data, video/sensor corpora, consent systems |
| **Alignment & Safety** | Can we understand, test, and control what we built? | Evals, red-teaming, incident response, sandboxing, governance, trust tools |
| **Deployment & Markets** | Where does the model become a business? | Product channels, pricing, enterprise contracts, local runtimes, studio and hardware deals |

No branch is cosmetic. A capability rusher can reach impressive scores and still go bankrupt. A safety specialist can earn trust but lose the launch window. A data-poor lab may have a strong architecture with a stale model. A deployment-focused lab may have excellent margins but no path through the AGI gates.

### 5.2 The six eras

| Era | Fictional theme | Required keystone |
|---|---|---|
| **1. Sequence Era** | Crude text prediction and basic evaluation | Ship a Gen-1 text model |
| **2. Assistant Era** | Instruction-following, dialogue, coding, and customer feedback | Ship a Gen-2 assistant |
| **3. Multimodal Era** | Images, documents, audio, and modality integration | Ship a Gen-3 multimodal model |
| **4. Generative & Agentic Era** | Video generation, tool use, autonomous workflows, and edge deployment | Ship a Gen-4 model using at least two specialization investments |
| **5. World & Embodied Era** | Predictive world systems, simulation, robotics, and physical partnerships | Ship a Gen-5 world-model-based system |
| **6. AGI Threshold** | The capstone program and final decision | Complete the AGI program and reach an ending |

### 5.3 Era gates

To enter Era N+1, the player must satisfy both:

1. **Research requirement:** research a minimum number of nodes in the current era, including its Architecture keystone and at least one node from a non-Architecture branch.
2. **Proof requirement:** ship a model or system of the current generation.

The default target is four current-era nodes including the Architecture keystone. The exact count can be tuned, but the principle is non-negotiable: the player cannot unlock multimodality, agents, or AGI solely by accumulating Insight. They must build, launch, and live with a system.

### 5.4 Insight and Sparks

Research teams generate **Insight** each week. Insight is influenced by team fit, morale, prestige, compute assigned to experiments, and relevant research. Insight buys nodes, but it should not feel like a passive faucet.

Each important node has a gameplay-triggered **Spark** that discounts the node and tells the player what kind of company behavior reveals it:

- **Inference Optimization:** experience a serving shortage while a product is live.
- **Red-Team Methodology:** survive a moderate-or-worse incident.
- **Vision Encoders:** train a model with a meaningful multimodal data share.
- **Synthetic Data Pipelines:** complete multiple training runs.
- **Retrieval Systems:** operate a product long enough for cutoff staleness to become visible.
- **Fleet Operations:** fulfill a hardware partner milestone.

Sparks reward the player for learning from problems. They also make different runs discover different routes through the same tree.

### 5.5 Paradigm choices

Each of the first five eras contains one mutually exclusive paradigm fork. The player picks one; the other two are locked for that run. Paradigms are identity choices with a benefit and a liability, not three tiers of the same upgrade.

#### Era 1 — How does the lab get good?

- **Scale Maximalism:** higher capability ceiling and stronger training tiers; compute costs rise sharply.
- **Data Curation Doctrine:** high-quality data matters more than model size; efficient early models, but a later ceiling without data investment.
- **Architecture Tinkering:** training runs can produce unusual breakthroughs; quality variance and evaluation uncertainty are higher.

#### Era 2 — How does the lab feed and shape itself?

- **Licensing-First:** clean, reliable licensed data is cheaper and better; standing licensing burn is permanent.
- **The Flywheel:** product-derived data is abundant and well matched to users; the company is pushed toward an aggressive consent posture and accumulating privacy risk.
- **Scrape and Pray:** acquired data is cheap and fast; rights-risk incidents and retroactive model exposure become increasingly likely.

#### Era 3 — How does the lab become multimodal?

- **Unified Architecture:** one integrated model with the highest ceiling and highest training cost.
- **Encoder Bolt-Ons:** fast and cheap grafts onto an existing text lineage; reliability penalties and technical-debt tokens accumulate.
- **Specialist Ensemble:** separate modality specialists coordinated together; good margins and flexibility, lower wow factor and weaker unified-model prestige.

#### Era 4 — How much autonomy?

- **Cautious Toolbelts:** sandboxed tools and low incident risk; lower consumer upside.
- **Full Agent Loops:** high revenue and productivity potential; severe incident classes become possible.
- **Human-in-the-Loop Platform:** enterprise-friendly approvals and trust; slower consumer growth and lower hype.

#### Era 5 — What is the world system for?

- **Simulation First:** excellent world models and research prestige; slower hardware revenue.
- **Fleet First:** robotics and partner operations mature quickly; physical incidents and milestone obligations increase.
- **General Environment:** broad world/agent/embodiment compatibility; expensive, flexible, and difficult to evaluate.

Era 6 has no paradigm fork. The player's prior choices determine which AGI options are available.

### 5.6 Specialization tracks

From Era 3 onward, the Architecture branch opens six short tracks. A run can invest deeply in only two or three; this is the principal model-variety and replay engine.

| Track | Model families | Products and advantages | Signature risks |
|---|---|---|---|
| **Frontier Assistant** | General assistant, coding, enterprise models | Chat, API, coding assistant, enterprise deployments | Contested market, high expectations, broad incident surface |
| **Edge & Local** | Small local and on-device models | Device/OEM deals, privacy-sensitive products, low serving compute | Lower capability ceiling and weaker hype |
| **Video Generation** | Video and temporal media models | Studio tools, creator licensing, high launch attention | Extreme compute demand, rights disputes, misuse incidents |
| **World Models** | Predictive simulation and interactive-world systems | Simulation licensing, research prestige, AGI prerequisite | Expensive development, hard evaluation, modest early revenue |
| **Robotics & Embodied** | Sensorimotor and fleet models | Hardware partners, logistics and manufacturing contracts | Physical incidents, slow payback, partner obligations |
| **Agent Systems** | Tool-use and autonomous workflow models | Agent platforms, automation contracts, strong revenue upside | Severe misuse and reliability incidents |

Synergies make tracks more than additive bonuses:

- Edge + Assistant creates a private local assistant with low serving pressure.
- Video + World creates interactive media and simulation products.
- World + Agent improves planning and reduces agent incident risk.
- World + Robotics creates the strongest embodied path.
- Agent + Enterprise requires high trust and evaluation coverage but can produce durable contracts.

### 5.7 Publish versus hoard

When a research node completes, the player chooses:

- **Publish:** gain hype, prestige, recruitment, and fundraising strength; rivals receive a discount or a visible clue toward the node.
- **Keep proprietary:** preserve the competitive edge; lose some community goodwill and recruitment benefit; later scrutiny is harsher if the company appears opaque.

The choice is meaningful only if both are useful. An open lab should not be a strictly weaker version of a closed lab; it should trade margin for ecosystem power and a different ending posture.

### 5.8 Rules that keep the tree strategic

- Every branch contributes to at least one gate, margin improvement, or ending requirement.
- Deployment and Infrastructure contain the strongest margin tools; capability-only rushes are intentionally dangerous.
- Safety and Data are not optional “good citizen” branches. They are needed for reliable late-game systems and clean AGI outcomes.
- Rival published work appears as pins on the tree, so the player can see the strategic race without seeing every hidden rival calculation.
- A paradigm choice should be felt in the economy and the model designer within the same era, not only in a distant ending.

---

## 6. Model Design, Training, Evaluation, and Lineage

Models are the game's equivalent of Game Dev Tycoon releases. Research determines the parts available; the designer combines them; training reveals whether the combination worked; launch turns it into a business; lineage determines what survives into the next generation.

### 6.1 The model designer

The model designer is a six-step wizard. Every screen has a plain-language explanation and an optional numeric detail view.

#### Step 1 — Track and family
Choose the specialization and family: small local model, general assistant, coding model, video model, agent, world model, robotics model, or an appropriate multimodal hybrid.

#### Step 2 — Brand
Choose an existing brand or create a new one. A retained brand carries user loyalty, contracts, and expectations. A new brand has no equity but can reposition freely.

#### Step 3 — Foundation strategy
Choose one:

| Foundation choice | Cost/time | Inherits | Strategic meaning |
|---|---|---|---|
| **Continued training** | Lowest | Most hidden score floor, all technical debt, and most risk memory | Fast, familiar, and increasingly hard to clean up |
| **Distilled successor** | Medium | Partial score floor and a reduced share of debt | Pragmatic compromise; some inherited identity without all the rot |
| **Fresh foundation** | Highest | Nothing technical; wide uncertainty | Clean slate and new architecture freedom, but expensive and unproven |

Technical debt is earned by shortcuts: bolt-ons, repeated rushed launches, overused synthetic data, cheap incident fixes, and knowingly inadequate evaluation. Debt reduces reliability and increases future incident exposure. It belongs to the foundation, not the brand.

#### Step 4 — Architecture blueprint
Assemble researched components, for example:

```text
Long-context text core
+ document/vision encoder
+ retrieval interface
+ cautious toolbelt
+ cost-efficient serving head
```

The player can only use components unlocked through the research tree and compatible with the selected foundation and track.

#### Step 5 — Compute tier
Choose **Lean**, **Standard**, **Aggressive**, or **Frontier**. The tier controls training cost, duration, capability ceiling, uncertainty, and the amount of shared compute monopolized. Frontier runs should feel like sieges: the lab may have to starve products, buy volatile burst capacity, or accept slower progress elsewhere.

#### Step 6 — Data recipe and emphasis budget
Select batches from the Data Inventory and allocate an emphasis budget across unlocked goals such as reasoning, coding, multimodality, tool use, safety, reliability, latency, and cost efficiency.

The interesting combination is:

```text
family × architecture × foundation × compute tier
× data provenance/freshness × emphasis × paradigm
```

The game should not display a single “best recipe.” It should provide understandable forecasts and let the player discover strong combinations through play and the Lab Notebook.

### 6.2 Model families and model character

Each family changes the model's hidden score profile, market opportunities, and risks.

- **Text/assistant models** are flexible and relatively affordable, but broad quality creates broad expectations.
- **Coding models** care about correctness, reliability, latency, and developer trust more than raw hype.
- **Small local models** use little central serving compute and can earn privacy trust, but have a lower capability ceiling and more constrained channels.
- **Video models** create dramatic hype and studio revenue, but consume heavy serving compute and expose data-rights and misuse risks.
- **Agent models** monetize strongly when reliable, but every tool and autonomous step expands the incident surface.
- **World models** are expensive, prestigious, and essential to the AGI path; their early products are research and simulation contracts.
- **Robotics/embodied models** produce sticky hardware partnerships, but failures are physical and reputationally severe.

A model's name, family, brand, generation, foundation, cutoff, and revealed strengths should be visible in its model card and the Lineage Gallery.

### 6.3 Knowledge cutoff and staleness

Every model carries a knowledge cutoff based on the newest training data used for its foundation. The in-game calendar continues moving, so each live model has a **staleness** level.

- **Fresh:** no material penalty.
- **Aging:** satisfaction drifts down, outdated-answer complaints rise, and some enterprise deals become harder.
- **Stale:** freshness-dependent contracts are lost and public “confidently wrong about recent events” incidents become possible.

Countermeasures are different strategic investments:

- **Refresh training:** consumes compute and a fresh data batch; simple but not free.
- **Retrieval augmentation:** reduces staleness impact at ongoing serving cost.
- **Live data pipelines:** keeps the cutoff current but creates standing expense and additional rights/consent exposure.

Staleness should be a slow antagonist, not a surprise death. The dashboard shows a plain-language alert such as “Aurora's knowledge is getting old,” with the numeric cutoff available on the back of the card.

### 6.4 Data Inventory

Data batches have:

- modality and category;
- quality and fit for selected families;
- volume and freshness;
- acquisition cost;
- licensing restrictions;
- rights-risk contribution;
- consent posture, if product-derived;
- compatibility with video, sensor, world, or robotics tracks.

The four channels are:

| Source | Immediate value | Long-term cost |
|---|---|---|
| **Acquired** | Cheap, fast, and often fresh | Erratic quality and data-rights risk; can trigger retroactive scandals |
| **Licensed** | Reliable, high quality, sometimes exclusive | Expensive standing contracts and usage restrictions |
| **Product-derived** | Excellent fit and naturally fresh | Requires a consent posture; aggressive collection damages trust and privacy memory |
| **Synthetic** | Cheap, repeatable, and scalable | Overuse creates feedback degradation across successive foundations |

The Era 2 data paradigm changes prices and risk, but the player can still see what is being traded. “We never really got permission for that data” is the plain-language version of rights risk.

### 6.5 Training as a chapter

Training is not just a timer. Each run produces a few dispatches based on its tier, data, team, and risk state:

- a loss plateau;
- a cluster failure;
- a data contamination discovery;
- a promising emergent capability;
- a debate over whether to continue or stop at a salvageable checkpoint;
- a choice to adjust data or accept the current trajectory.

Dispatches use a small number of authored templates and typed facts. They should create sunk-cost tension without overwhelming the player. A training run may be allowed to finish automatically after the player has set a policy, but important choices become blocking decisions.

### 6.6 Hidden scores and evaluation

The engine stores true model scores but the player initially sees estimates with uncertainty bands. Core dimensions include:

- reasoning;
- coding;
- modality fit;
- tool use;
- reliability;
- safety;
- latency;
- serving cost;
- freshness;
- embodiment or world grounding where relevant.

For example:

```text
Aurora-2 assistant forecast
Reasoning       72 ± 18   uncertain
Coding          61 ± 22   uncertain
Reliability     54 ± 16   needs testing
Safety          48 ± 25   largely untested
Serving cost    42 ± 20   likely expensive
```

Evaluation projects consume the shared compute pool and team time. They narrow uncertainty, reveal interactions, and can expose a bias in the lab's own estimate. Morale and hype can make internal estimates too optimistic; Safety-branch investment reduces that self-deception.

Evaluation types include:

- capability evaluation;
- coding or specialist evaluation;
- safety red-team;
- reliability and long-horizon evaluation;
- latency and cost evaluation;
- enterprise readiness review;
- modality or world-grounding evaluation;
- robotics simulation and limited-fleet evaluation.

The player can launch with uncertainty, but the risk is visible in plain language. Knowledge is never free because evaluations compete with training and serving for compute.

### 6.7 Launch timing

A finished model can be:

- launched as a limited rollout;
- soft-launched to selected customers;
- offered as a research preview;
- released through an API only;
- sent to enterprise beta;
- launched aggressively;
- delayed for evaluation, safety, or optimization;
- shelved for later or retired before public release.

Early launch captures hype, revenue, user feedback, and rival timing, but increases incident and support risk. Delay improves certainty and trust while burning runway and allowing rivals to move first. There is never a universally correct launch option.

### 6.8 Brand and foundation lineage

The model history is shown as two linked lines:

```text
BRAND: Aurora
  Aurora-1 ── Aurora-2 ── Aurora-V ── Aurora-4
             │            │
FOUNDATION: F-1          F-2 (bolt-on debt)  F-3 (fresh rebuild)
```

Keeping the Aurora brand on a fresh foundation preserves market equity but creates regression backlash if the new model is worse in a dimension customers associate with Aurora. A new brand avoids that expectation but gives up contracts and recognition.

This creates the signature dilemma:

> The Aurora line is famous and profitable, but its foundation has accumulated debt. Do you continue it cheaply, distill a safer successor, or spend the entire frontier budget on a clean foundation while promising customers that it is still Aurora?

### 6.9 Model retirement

Retirement frees serving compute and removes a product's future incident surface, but it also removes revenue, annoys users, and can create a deprecation backlash. The player must learn that a model can be a beloved success and still be the wrong thing to keep operating.

---

## 7. Company Operations and External Pressure

### 7.1 Teams as strategic capacity

Teams are the central tycoon resource. Each team can own one major project at a time. Reassignment is possible, but switching creates ramp-up friction, lost momentum, or morale cost.

Full-game team roles:

- **Founding Team:** versatile early capacity and identity projects.
- **Research Team:** Insight, Sparks, and research nodes.
- **Model Team:** architecture, training, and successor familiarity.
- **Data Team:** acquisition, curation, licensing, and provenance.
- **Infrastructure Team:** compute procurement, serving optimization, and reliability.
- **Product/GTM Team:** launches, pricing, customer acquisition, and market positioning.
- **Safety/Policy Team:** evaluations, red-teaming, response, and governance.
- **Partnerships/Operations Team:** enterprise, studio, hardware, and fleet contracts.

The company begins with one versatile team and grows toward a cap of roughly eight. The late game is intentionally about prioritization, not assigning a separate employee to every task.

Teams gain veterancy with project types, model families, and foundation lines. A team that trained Aurora-1 may train an Aurora successor faster, but its knowledge may be less useful for a new robotics foundation. This makes hiring and clean-slate decisions interact with lineage.

Named key people are lightweight flavor and strategic hooks rather than a second management simulator. A rival may poach a lead, a founding researcher may become attached to a model line, or an advisor may react to a decision. The game does not require a detailed schedule for every employee.

### 7.2 Projects as the unit of work

Everything meaningful is a project with progress, inputs, and a reportable result:

- research node;
- model design and architecture;
- training run;
- evaluation;
- red-team or incident response;
- data acquisition or licensing;
- product launch preparation;
- infrastructure or compute expansion;
- hiring;
- fundraising;
- marketing campaign;
- enterprise or hardware partnership.

A project that finishes enters a **pending completion** state. The player receives a report and chooses what to do with the result rather than having it silently applied. This is the Game Dev Tycoon-style result moment.

### 7.3 Shared compute pool

Compute is a finite shared capacity allocated between:

- training;
- evaluation and red-teaming;
- research experiments;
- product serving;
- refresh and retrieval systems;
- infrastructure optimization.

Compute has capacity, cost, reliability, and a market price. Early eras are constrained by what the lab can afford. Middle eras are constrained by supply, waitlists, and rivals buying capacity. The AGI program is constrained by the fact that one run may consume most of everything the lab owns.

When a product goes viral, the player must choose among:

- pausing or slowing training;
- buying burst compute at a volatile price;
- throttling users;
- degrading service quality;
- raising prices;
- shifting users to a smaller local model;
- investing in inference optimization;
- accepting outage and trust risk.

This is the game's most reliable minute-to-minute dilemma.

### 7.4 Products and markets

A launched model becomes one or more live products. Products generate money but also compute demand, support work, freshness pressure, and incident exposure.

| Product channel | Demand profile | Main strengths | Main risks |
|---|---|---|---|
| Consumer chat | Fast user growth and hype | Visibility, feedback, recruitment | Serving spikes, public scandals |
| Developer API | Revenue tied to quality and price | Strong margins and ecosystem | Latency, reliability, rival undercutting |
| Coding assistant | Subscription and developer loyalty | Rewards coding/reliability investment | Backlash when errors waste work |
| Enterprise deployment | Slow sales, stable contracts | Trust, long-term revenue | Compliance, freshness, exclusivity |
| Local/on-device app | Low central compute | Privacy, low burn, device channels | Lower ceiling and constrained features |
| Video studio tools | Hype and licensing revenue | Big launches and creative markets | Heavy compute, rights disputes, misuse |
| World simulation | Research and industry contracts | Prestige and AGI progress | Slow monetization and hard evaluation |
| Agent platform | High automation upside | Strong revenue and strategic leverage | Severe incidents, tool failures |
| Robotics fleet | Sticky industrial revenue | Hardware partnerships and fleet scale | Physical incidents and milestone obligations |
| Research demo | Prestige and recruiting | Fundraising and talent | Little direct cash |

Every product tracks users, revenue, satisfaction, churn, quality, compute draw, trust impact, incident risk, and staleness. The player should be able to maintain a portfolio, not only chase one best channel.

### 7.5 Markets

Markets are broad demand segments rather than fully simulated populations:

- consumer;
- developers;
- enterprise;
- creators and studios;
- research institutions;
- industrial/hardware partners.

Each market has current demand, price sensitivity, trust sensitivity, freshness requirements, and rival pressure. World events and rival releases shift these values. The player's products affect future demand, so a trust collapse in consumer chat can make enterprise sales harder even if the products are technically separate.

### 7.6 Rivals

There are three to four rivals per run. They are not full mirror companies; each is a visible strategy agent with a doctrine, track focus, research clock, event deck, and AGI clock.

Rival archetypes include:

- consumer platform;
- enterprise operator;
- open-source collective;
- compute giant;
- reckless agent startup;
- robotics specialist.

Rivals can launch cheaper APIs, publish useful research, raise funding, poach talent, sign a partner, suffer a scandal, or beat the player to a benchmark. Their published nodes appear on the public tree. They specialize: a rival dominating video should threaten the player's hype and licensing market without making a robotics plan irrelevant.

The player never needs to understand a hidden rival spreadsheet. A headline should communicate the strategic change: “OpenForge released a cheap coding model. Developer demand is tightening; open research is gaining prestige.”

Late in the game, rival AGI clocks are visible. The player can see that a rival is weeks ahead, but not every detail of its final system.

### 7.7 Funding and runway

Cash is the survival pressure. The HUD shows cash, net burn, and runway in weeks. Burn includes salaries, compute commitments, data contracts, product operations, and board obligations.

Funding is a project that consumes team time. Outcomes depend on hype, revenue, model quality, prestige, trust, market sentiment, and recent incidents. Funding rounds provide cash but add expectations:

- seed;
- Series A;
- Series B;
- Series C/late stage;
- strategic contracts or grants.

Each round adds a concrete board expectation, such as a revenue target, product launch, enterprise contract, or milestone. Missing two consecutive expectations produces intervention pressure: forced cuts, a forced launch, leadership challenge, or a board-coup loss path. Board pressure is a source of strategic conflict, not a second cash shop.

### 7.8 Hype, trust, and data-rights risk

**Hype** helps user growth, fundraising, recruiting, launch impact, and valuation. It also raises expectations and makes scandals spread faster.

**Trust** helps enterprise adoption, regulator tolerance, incident recovery, retention, and stable hiring. Low trust increases churn, legal pressure, contract failure, and incident severity.

**Data-rights risk** is a distinct long-term liability. It can remain quiet through several generations and then surface in a rights complaint, forcing a recall or poisoning a brand. It is not the same as trust, although it can damage trust when exposed.

The game should allow a high-hype volatile company, a slow trusted institution, an efficient local-model business, or an open ecosystem to be viable identities.

### 7.9 Incidents and risk memory

Incidents are consequences of exposure, not arbitrary punishment. Types include:

- outage or cluster failure;
- latency spike;
- hallucination or reliability scandal;
- privacy or data-rights complaint;
- unsafe tool use or agent misuse;
- legal or contract dispute;
- compute-cost blowout;
- staleness/publicly outdated answer;
- video misuse or rights dispute;
- physical robotics incident.

Severity is minor, moderate, major, or severe. Risk depends on product scale, true safety and reliability, evaluation coverage, rollout size, compute shortage, unresolved risk memories, legal exposure, data provenance, and the player's response history.

Response options include:

- cheap fix: low immediate cost, weak recovery, leaves risk memory;
- full investigation: expensive, creates a response project, stronger recovery;
- public-relations response: protects hype, may fail to repair the technical cause;
- rollback or throttle: reduces revenue and risk;
- customer compensation: costs cash but improves trust;
- model retirement: clears future exposure but loses a product.

A risk memory is a named, visible state such as **Unresolved Privacy Concerns** or **Untested Tool Boundary**. It changes future probabilities and is inherited in reduced form by continued or distilled successors. If the same unresolved risk fires twice, it can escalate into a multi-week Crisis: regulator inquiry, press cycle, customer exodus, or partner withdrawal.

The player should be able to say, in hindsight, “I chose cheap fixes for three quarters and that is why the major incident happened.”

---

## 8. Difficulty, Failure, Replay, and Meta-Progression

### 8.1 Difficulty philosophy

The game is intentionally hard, but the difficulty comes from tradeoffs and compounding consequences rather than hidden gotchas. The first run should teach the shape of a failure:

- the lab researched faster than it could monetize;
- a viral product starved a training run;
- the company chose cheap data and ignored rights risk;
- an old model remained live too long;
- a board expectation forced an unsafe launch;
- a famous brand carried a rotten foundation into the frontier.

No terminal loss should be a pure random ambush.

### 8.2 Target difficulty curve

- Approximately **70–80% of first runs fail**, usually in Era 2 or 3.
- A third run should reliably reach Era 4 for a player who reads reports and adapts.
- A first AGI ending should require roughly 4–8 serious attempts; the rarest endings can take more.
- At least 70% of players who lose should start another run within the same play session or shortly after viewing the Chronicle.
- Different failure causes should appear; bankruptcy cannot be the only dominant death.

These are tuning targets to validate with simulations and playtests, not promises to achieve by adding arbitrary punishment.

### 8.3 Loss conditions

A run can end through:

- bankruptcy or zero runway with no financing route;
- trust collapse and regulator shutdown;
- catastrophic severe incident;
- board coup after sustained failure;
- rival reaching the AGI Decision first and eclipsing the lab;
- AGI program collapse or a failed final decision.

A product setback, model failure, or lost contract is not automatically run-ending. The player should have a chance to recover unless they ignored escalating warnings.

### 8.4 The Three Warnings Rule

Before a terminal state, the game delivers at least three escalating warnings in plain language. For example:

1. “Runway is tightening. At the current burn, the lab has twelve weeks.”
2. “Your next training run will leave six weeks of cash, and no funding project is active.”
3. “We have four weeks of runway. If the round fails, payroll cannot be met.”

The rule applies to bankruptcy, trust collapse, board intervention, and severe-risk escalation. Founder Mode can provide more explicit suggested responses; Iron Founder can reduce assistance but should not remove readable facts.

### 8.5 Company Chronicle

Every run ends with a one-page Chronicle written as a retrospective news feature. It names:

- the founder and doctrine;
- the models and brands created;
- the paradigm choices;
- the key era transitions;
- the most important product;
- the pivotal quarter;
- the choice that caused the ending;
- the lab's final reputation.

A Chronicle is assembled from a library of paragraphs and run-specific facts, not generated as an unlimited bespoke narrative. It should feel personal because it contains the player's model names, rival names, data choices, and actual failure cause.

The Chronicle offers three **What If?** prompts. Each can start a replay from a deterministic fork with the same world seed and command history up to the pivotal choice. A fork is a revenge menu: “What if I had evaluated Aurora-2 instead of launching?”

### 8.6 Meta-progression without power creep

Persistent unlocks change the starting menu rather than increasing every number:

- founder archetypes;
- doctrines;
- starting traits;
- scenario starts such as Inherit a Failing Lab, Post-Scandal Rebuild, or Compute-Rich/Talent-Poor;
- world modifiers such as Compute Winter, Regulation Storm, or Open Flood;
- ending and Chronicle variants;
- the Lineage Gallery;
- Lab Notebook discoveries.

The first failure should not be “wasted.” It unlocks knowledge and perhaps a new starting identity, but it should not give a permanent compute multiplier that trivializes the next attempt.

### 8.7 Lab Notebook

The Notebook records only what the player has personally encountered:

- useful or dangerous model/data combinations;
- discovered Sparks;
- incident causes;
- observed rival behaviors;
- foundation inheritance outcomes;
- product/market interactions.

A hidden formula may exist in the engine, but the Notebook is not a complete wiki on day one. It becomes the player's own research history and supports the Game Dev Tycoon discovery feeling.

### 8.8 Difficulty modes

All modes use the same engine rules and tree:

- **Founder Mode:** default; standard warnings, advisor arguments, and fork replay.
- **Supported Founder:** more warnings, plain-language response suggestions, and optional advisor consensus markers.
- **Iron Founder:** no fork replay, stricter save policy, and minimal assistance.
- **World modifiers:** veteran challenges that change market/compute/event conditions, not the core identity of the game.

---

## 9. Endings and the AGI Endgame

### 9.1 Entering the AGI Threshold

To begin Era 6, the player must:

- ship a Gen-5 world-model-based system;
- meet an Alignment & Safety threshold;
- possess the required frontier compute reserve or secure a risky financing/partnership route;
- have enough active teams to run the capstone without instantly collapsing the company.

The exact threshold varies by doctrine and paradigm, but “no safety, no summit” is a core rule. The player can pursue a dangerous AGI program, but the game should not present an untested path as equally stable.

### 9.2 The four-part AGI Program

The AGI program is a sequence of linked mega-projects rather than one progress bar:

1. **The Foundation Run:** the largest training run in the game. Brand/foundation, data provenance, knowledge cutoff, compute, and inherited debt all matter.
2. **The Grounding:** integrates world models with the player's chosen strengths—agents, video, local deployment, robotics, or enterprise tools.
3. **The Alignment Gauntlet:** capability, safety, reliability, embodiment, and misuse evaluations. The player chooses breadth and duration, balancing rigor against rival and board pressure.
4. **The AGI Decision:** the model is not perfectly known. The player decides how to release, stage, govern, or withhold it.

During the program, ordinary products continue to consume compute, rivals' AGI clocks move, funding expectations intensify, and world events can change trust requirements. The capstone is the hardest sustained squeeze in the game.

### 9.3 Final outcomes

All successful endings are outcomes of reaching the AGI Decision. Earlier commercial or prestige milestones modify the available choices and the Chronicle, but they do not replace the summit.

| Ending | Conditions and choice | Tone |
|---|---|---|
| **Ascension** | High capability, strong grounding, gauntlet passed, and a clean or well-repaired foundation; launch broadly | Rare triumph, with remaining uncertainty acknowledged |
| **The Long Road** | Choose staged, throttled deployment with continued evaluation and limited access | Cautious success; the lab wins time rather than spectacle |
| **Stewardship Compact** | High trust, strong alignment investment, credible governance, and enough prestige to bring rivals/partners along | Trusted institution and industry co-governance |
| **The Release** | Open doctrine or an explicit open release; ecosystem adoption determines how the world reacts | Idealist ending with uncertain consequences |
| **Commercial Empire** | Strong revenue, market share, contracts, and board control; release the system through a tightly monetized platform | Tycoon victory, with the company's commercial values shaping the outcome |
| **Hubris** | Launch despite poor gauntlet results, accumulated debt, or unresolved critical risks | Catastrophic failure and the most infamous Chronicle |
| **Eclipsed** | A rival reaches the AGI Decision first | The player sees the future shaped by another lab's doctrine |

Earlier terminal losses—bankruptcy, trust collapse, board coup, and severe incidents—remain available throughout the run and receive distinct Chronicle templates.

### 9.4 Ending availability is history-dependent

A player cannot select any ending from a menu. The run's history determines the final options:

- Paradigms determine what kinds of grounding and governance are credible.
- Foundation debt and data-rights risk can lock out clean triumphs.
- Trust and evaluation coverage affect Stewardship.
- Open publishing and community presence affect The Release.
- Revenue and market share affect Commercial Empire.
- Rival timing determines whether the final decision is even yours.

This makes the ending a synthesis of the run rather than a last-minute alignment choice.

---

## 10. UX and Information Architecture

### 10.1 Information architecture

The game has a central Dashboard and a small set of focused destinations:

1. **Dashboard:** cash/runway, compute, Insight, data alerts, hype/trust, Tree Ribbon, active projects, live products, next goal, and decision queue.
2. **Decision Queue:** blocking and non-blocking decisions in priority order.
3. **Research Tree:** eras, branches, paradigms, Sparks, prerequisites, and rival pins.
4. **Model Designer:** the six-step model wizard with previews and risk callouts.
5. **Models & Products:** model cards, lineage graph, product metrics, staleness, retirement, and compute draw.
6. **Ledger:** searchable history of reports, facts, launches, incidents, and quarter reviews.
7. **Quarterly Review:** financial summary, market state, board expectations, and Strategic Question.
8. **Chronicle:** end-of-run story and fork replay.
9. **Meta Hub:** Gallery, Notebook, archetypes, doctrines, scenarios, and modifiers.
10. **Settings:** accessibility, advisor verbosity, numeric detail, save/export, and difficulty options.

Any core system should be reachable from the Dashboard in no more than three taps/clicks.

### 10.2 Two-layer information cards

Every important card has two faces:

**Front: plain-language story**

> **Launch Aurora-2 now?**  
> “It is promising, but we do not really know how safe it is. NovaMind is close to shipping.”

**Back: numeric detail**

```text
Safety estimate: 48 ± 25
Incident risk: elevated
Estimated revenue: 180–240K/week
Compute draw: 34 units
Rival NovaMind: likely launch in 5 weeks
Evaluation coverage: limited
```

The casual player can decide from the front and advisor disagreement. The systems player can inspect the back, compare bands, and infer hidden interactions. The same choice is preserved for both audiences.

### 10.3 Advisors as stance machines

The lab has three persistent advisors:

- a research lead who values long-term capability and evaluation;
- an operations or finance lead who values runway and reliability;
- a growth/market lead who values timing, users, and revenue.

On major decisions, two advisors give short opposing recommendations. They represent values, not correct answers. They may later react to the outcome (“I warned you about the untested rollout” or “The early launch bought us the runway for the world-model program”).

This provides tutorialization, emotional memory, and decision legibility without forcing the player through a tutorial tree. Advisors can be collapsed permanently for expert play. The first release can use a compact two-voice content set while the third voice's stance data remains supported by the schema.

### 10.4 Progressive disclosure

The first run should reveal systems when their story makes them relevant:

| Trigger | Revealed system | Framing |
|---|---|---|
| First model design | Compute pool | “We need somewhere to train this.” |
| First training week | Hidden scores and uncertainty | “We will not know what we built until we test it.” |
| First launch | Product card and hype | “People are using it now.” |
| First viral week | Allocation conflict | “Current users are competing with the next model.” |
| First incident | Trust and risk memory | “A shortcut has a memory.” |
| Era 2 | Full research tree | “The lab has a direction now.” |
| First successor | Brand/foundation choice | “Keep the name, rebuild the foundation, or continue.” |
| Era 3 | Data provenance and specialization tracks | “Different model families need different supplies.” |
| Era 5 | Hardware partners and physical risk | “The lab's systems can affect the physical world.” |

The full Dashboard is not shown on minute one. Every module appears with a reason attached.

### 10.5 Re-entry and ledger

Opening a mid-run save shows:

- where the company is;
- what model or crisis is active;
- what decisions are pending;
- one advisor remark;
- the next suggested objective.

The Ledger stores all past reports so that a player returning after several days is not punished for forgetting which risk memory was unresolved. The save state is valid after every action and every decision.

### 10.6 Accessibility and jargon policy

- Use plain language first: “your model's news is getting old” before “knowledge cutoff.”
- Long-press or hover on a term for a two-sentence in-fiction glossary.
- Use icons plus labels, not color alone, for warnings and state.
- Support keyboard navigation and readable touch targets in the web build.
- Allow dynamic text sizing and reduced motion.
- Keep raw numeric detail available without requiring technical knowledge.
- Never put fictional jargon in a decision option without a plain explanation.

### 10.7 Content authoring strategy

Content is divided into three tiers:

| Tier | Examples | Authoring method |
|---|---|---|
| **T1: Bespoke** | First-run beats, era keystones, AGI program, endings, paradigm reveals | Handwritten and polished; high reuse value |
| **T2: Templated** | Reports, advisor stances, incidents, rival events, training dispatches, Chronicle paragraphs | Slots, conditions, variants, and cooldowns |
| **T3: Grammar** | Ticker lines, minor flavor, office labels, short review blurbs | Recombined phrase fragments |

The engine emits facts such as:

```json
{
  "kind": "launch_risk",
  "week": 47,
  "severity": "warning",
  "slots": {
    "model_name": "Aurora-2",
    "rival_name": "NovaMind",
    "weeks_to_rival": 5,
    "incident_band": "elevated"
  }
}
```

A content selector chooses a valid string based on fact kind, conditions, cooldown, and a named deterministic content RNG. Templates are authored in CSV/TSV or JSON and validated at build time. Raw-fact placeholder mode keeps the game playable before the prose is finished.

A realistic full-game content budget is a small reusable library rather than thousands of unique scenes: roughly a few hundred advisor/report variants, a compact incident and event deck, a paragraph library for Chronicles, and bespoke text only for the major beats. A coverage report from headless simulations should identify dead strings, repeated strings, starved fact pools, and missing template slots.

---

## 11. Deterministic Engine and Content Principles

### 11.1 Platform-neutral architecture

The canonical implementation extends the existing TypeScript monorepo:

```text
packages/
  engine/   pure simulation and state transitions
  game-content/  typed game data, templates, conditions, validation
  sim/      headless bots, balance reports, golden runs
apps/
  web/      existing TanStack Start UI, responsive layout, PWA shell, persistence adapter
  server/   existing optional service layer; never required for core play
```

The engine has no React, DOM, browser storage, network, wall-clock, Hono, oRPC, Drizzle, or platform imports. The same engine runs in Node for simulations and in the browser for play. The web app owns IndexedDB persistence through an adapter. The existing server/D1 stack is not the authoritative store for an active single-player run. An iOS wrapper or optional cloud features can be added later without changing game rules.

A typical engine surface is intentionally small:

```ts
startRun(setup: RunSetup, seed: number): GameState
applyDecision(state: GameState, choice: DecisionChoice): EngineResult
advanceWeek(state: GameState): EngineResult
```

```ts
type EngineResult = {
  state: GameState;
  facts: Fact[];
  pending: PendingDecision[];
};
```

`advanceWeek` must reject a state with unresolved blocking decisions. The UI cannot accidentally advance through a mandatory launch, incident response, or capstone choice.

### 11.2 Integer and seeded determinism

The simulation uses integer units:

- money in whole currency units;
- compute in centi-units;
- probabilities and percentages in basis points;
- stats from 0–100;
- uncertainty as integer bands.

All multiplication/division truncation order is documented in balance formulas. No floating-point drift belongs in save state.

Use an in-repository seeded PRNG with named streams:

- training;
- incidents;
- rivals;
- content selection;
- market events;
- world events.

Each stream's state is serialized. Adding a new content roll must not reshuffle incident outcomes. IDs come from per-type deterministic counters, not UUIDs or timestamps. Iteration is sorted by ID. The engine never reads the wall clock.

This makes a seed plus command log sufficient for:

- replay-from-fork;
- bug reproduction;
- golden-run tests;
- balance simulation;
- comparing two balance revisions.

### 11.3 Fixed weekly phase order

The canonical `advanceWeek` pipeline is:

1. **Upkeep:** salaries, fixed costs, compute charges, data contracts.
2. **Projects:** team progress, morale, veterancy, completions.
3. **Research:** Insight accrual, Sparks, node completions.
4. **Training:** progress, dispatches, crises, checkpoints.
5. **Products:** users, revenue, satisfaction, compute draw.
6. **Staleness:** cutoff drift and freshness effects.
7. **Incidents:** risk accrual and incident rolls.
8. **Rivals:** research clocks, events, launches, AGI clocks.
9. **World/markets:** demand changes, compute spot-price walk, data availability.
10. **Governance:** runway warnings, board expectations, Three Warnings escalation.
11. **Era:** keystone and AGI stage checks.
12. **Terminal checks:** bankruptcy, shutdown, severe failure, rival eclipse, ending readiness.
13. **Decision assembly:** blocking and non-blocking queue items, throttled to the weekly cap.
14. **Reporting:** convert facts into cards, apply content cooldowns, update the Ledger.

Each phase is a pure transformation over state and its named RNG stream. The order is part of the contract and must be covered by tests.

### 11.4 Serializable state and saves

`GameState` is one versioned JSON-compatible object. It contains at least:

```ts
type GameState = {
  meta: { schemaVersion: number; seed: number; week: number; era: Era };
  rng: Record<StreamName, number>;
  counters: Record<EntityType, number>;
  company: CompanyState;
  teams: Team[];
  projects: Project[];
  compute: ComputeState;
  dataInventory: DataBatch[];
  research: ResearchState;
  models: Model[];
  products: Product[];
  rivals: Rival[];
  funding: FundingState;
  agi: AgiProgramState | null;
  queue: PendingDecision[];
  ledger: FactRef[];
  contentContext: ContentContext;
  warnings: WarningTracker;
};
```

The web app autosaves after every `EngineResult` to IndexedDB (with a small export/import fallback). A profile store holds the Gallery, Notebook, unlocks, settings, and completed Chronicles. Save schema migrations are required from the first version because multi-day runs will survive application updates.

### 11.5 Command log and replay-from-fork

Store the initial RunSetup, seed, and every decision command:

```text
{ week, decisionId, choiceId }
```

To replay a fork, restart from the seed and reapply the command log until the selected decision. The player then takes control. A schema-version mismatch should disable a stale fork gracefully rather than silently producing a different story.

### 11.6 Facts are the narrative contract

The engine does not produce prose. It produces typed facts. Facts are used by:

- the report renderer;
- the decision queue;
- advisor stance rules;
- the Ledger;
- the Chronicle assembler;
- the simulator's coverage and balance reports.

A `FactKind` enum should be established early and treated as a contract. Adding a new kind is an intentional schema change, not an ad hoc string sprinkled through UI code.

### 11.7 Headless simulator and verification

The simulator is a first-class deliverable, not an internal convenience. It runs simple scripted bots such as:

- capability rusher;
- cash conservative/turtle;
- flywheel data strategy;
- open research lab;
- local-efficiency specialist;
- random baseline.

It reports:

- failure rate and death cause by era;
- time to each era;
- ending reachability;
- cash, compute, and trust percentile curves;
- product and model adoption;
- research branch usage;
- content coverage and repetition;
- successor versus fresh-foundation choices.

Required test layers:

1. phase-level unit tests;
2. invariant checks for bounds, orphaned IDs, queue consistency, and terminal states;
3. deterministic same-seed/same-command-log tests across processes;
4. golden runs with committed final-state hashes;
5. save migration fixtures;
6. device/browser interruption tests;
7. manual playtests for boredom, comprehension, and emotional response.

### 11.8 Balance constants

Put all tunable values in a typed balance module. System code should not contain unexplained magic numbers. Prefer linear or piecewise formulas in hot paths so the designer can inspect and tune them. Hidden score interactions may be complex, but the player-facing forecast must remain legible.

---

## 12. Balancing and Acceptance Targets

The game is not balanced when every strategy has the same output. It is balanced when choices produce distinct, survivable stories and the intended danger appears often enough to be understood.

### 12.1 Moment-to-moment targets

- A normal week presents useful information even if no decision is required.
- No more than three meaningful decisions are generated in one week; overflow is deferred deterministically.
- A report or noticeable state change appears every one to three weeks.
- Compute allocation creates a real training-versus-serving decision at least once in the first few eras.
- Evaluating a model is valuable but never obviously free.
- Retiring an old product is sometimes correct and sometimes painful.

### 12.2 Strategy and variety targets

- Every paradigm is selected by at least a meaningful minority of playtesters; no paradigm should be a trap with no viable route.
- Successor and fresh-foundation strategies should each be chosen and regretted by real players. If one is always correct, adjust cost, debt, uncertainty, or brand backlash.
- A successful run cannot ignore all of Data, Safety, Infrastructure, and Deployment.
- At least two specialization tracks should be viable in a single run, while no run can comfortably master every track.
- All intended endings are reachable by at least one coherent bot or playtest strategy.
- Rivals should force some suboptimal-looking decision because of timing, not merely appear in a ticker.

### 12.3 Difficulty targets

- First-run failure around 70–80%, concentrated in cash/trust during Eras 2–3.
- Third-run players who adapt reach Era 4 reliably.
- Terminal states are preceded by three escalating warnings.
- Death causes are distributed across economy, trust, governance, severe incidents, and rival/AGI outcomes.
- At least 70% of players who reach a failure Chronicle express a clear next experiment or start another run.

### 12.4 Casual comprehension targets

In playtests with non-technical players:

- players can explain what their next decision affects without opening the numeric detail;
- players understand that training, serving, and evaluation share compute;
- players can name why their company failed;
- players know where to find the past report that explains a current warning;
- players can reach the next goal without a forced tutorial;
- technical language does not appear to be a prerequisite for meaningful play.

Experts should be able to reveal the numbers and make more informed choices, but they should not be given an entirely different ruleset.

### 12.5 Technical targets

- `advanceWeek` is fast enough for a low-end phone/browser and headless bulk simulation.
- A full run can be simulated thousands of times in CI.
- Same seed and command log produce identical state and fact output.
- Every save transition is recoverable after a tab close or app interruption.
- Content validation catches invalid conditions, missing slots, duplicate IDs, and impossible decision references before release.

---

## 13. Achievable Staged Roadmap

### 13.1 How to read this roadmap

The ultimate vision above is the destination. The stages below are the safest order for a solo or small team to reach it. They are deliberately small and each has a playable acceptance gate. Do not build a large amount of content before the gate for the underlying system passes.

The stages have no promised calendar duration. Scope is measured by a vertical slice and by the acceptance question, not by an arbitrary date.

### Stage 0 — Lock the contract and prove the economy on paper

**Build:**

- canonical `GameState` categories and integer units;
- seeded RNG and named stream design;
- fixed weekly phase order;
- initial balance constants;
- a spreadsheet or headless script covering cash, compute, training costs, revenue, and runway;
- ten to twenty hand-played or scripted early-game scenarios.

**Do not build yet:** art, dialogue, full research content, or a large UI.

**Acceptance gate:** the Sequence-to-Assistant opening produces a genuine choice between research, launch, hiring, evaluation, and survival. A near-death moment should emerge from the economy without a scripted “you lose now” event.

**Failure response:** revise the economy before writing content. If there is no interesting tradeoff on paper, more UI will not fix the game.

### Stage 1 — Deterministic foundation and save safety

**Build:**

- pure `packages/engine` workspace package with no UI or server imports;
- integer units, deterministic IDs, fixed phase order, and named RNG streams;
- serializable state and versioned save schema;
- command log and same-seed replay harness;
- IndexedDB persistence adapter owned by `apps/web`;
- save migrations and interruption fixtures from the first schema version;
- raw `Fact` and `PendingDecision` output rendered by a temporary developer harness.

**Acceptance gate:** the same seed and command sequence produce byte-equivalent canonical state/fact output across separate runs; closing and reopening after every test transition loses no progress; the engine runs headlessly without importing browser, React, API, or database code.

**Why this precedes the vertical slice:** replay-from-fork, multi-day saves, and bulk simulation are architectural properties. Building gameplay first and retrofitting determinism later creates avoidable rewrites.

### Stage 2 — Core “build → launch → consequences” vertical slice and casual shell

**Build:**

- one founder setup and one Founding Team;
- three project types, cash/runway, and a small shared compute pool;
- one fictional text model family;
- simple model design with compute tier and a few data/emphasis choices;
- hidden scores and one evaluation type;
- one launch choice, one live product, one incident, and one loss condition;
- decision queue with blocking versus non-blocking decisions;
- responsive Dashboard, Re-entry Card, Ledger, and two-layer cards;
- a minimal advisor stance system;
- progressive system unlock flags;
- local save/resume through the Stage 1 adapter.

Research can be three hardcoded unlocks at this stage. Use placeholder facts instead of prose.

**Acceptance gate:** a new player can play for 20–30 minutes and describe why the model launch changed the company. The team must feel the training-versus-serving tension at least once. A casual tester understands the first three systems without a manual, while an expert can reveal numeric detail. If `build → launch → consequences` is not fun, stop and repair it.

### Stage 3 — Eras 1–2 and the real research tree

**Build:**

- Insight and Sparks;
- five branches in a compact Sequence and Assistant tree;
- era gates requiring research plus a shipped model;
- Era 1 paradigm choice;
- Era 2 data-posture paradigm choice;
- publish-versus-hoard;
- first rival pins as simple clocks;
- model designer data recipes and emphasis budget.

Start with roughly twenty well-tuned nodes, but make the data schema capable of the full tree.

**Acceptance gate:** two players with the same setup make different research choices and can explain how those choices changed their model or economy. A capability-only rush must be visibly dangerous, while a pure economy path must not be able to skip all technology.

### Stage 4 — Full compute, data inventory, products, and incidents

**Build:**

- compute allocation among training, serving, research, and evaluation;
- compute upgrades and a simple burst market;
- data inventory with acquired, licensed, product-derived, and synthetic batches;
- provenance and rights-risk state;
- at least three product channels;
- product metrics and market demand;
- hype/trust split;
- risk memories, incident responses, and model retirement;
- staleness and one freshness countermeasure.

**Acceptance gate:** a viral product creates a genuine training-versus-serving dilemma; a data shortcut can be attractive now but dangerous later; a player can recover from a minor incident and understand why a repeated risk escalated.

**Content rule:** use a small reusable event deck. Do not write hundreds of unique events until coverage data shows which fact pools are starved.

### Stage 5 — Brand/foundation lineage and the multimodal midpoint

**Build:**

- brand versus foundation identity;
- continued, distilled, and fresh foundations;
- inherited score floors, debt, risk memory, and uncertainty;
- model naming and lineage graph;
- Era 3 tree and multimodal keystone;
- at least three specialization tracks, with the data schema for all six;
- text-to-multimodal successor and clean rebuild options;
- video or local model as a second model family;
- training dispatches and score reveal presentation.

**Acceptance gate:** players choose both successor and fresh-foundation strategies in meaningful numbers, and each choice sometimes feels like the correct decision and sometimes creates regret. The multimodal launch must feel like the run's midpoint climax, not just another unlock.

### Stage 6 — Portfolio pressure: products, rivals, funding, and governance

**Build:**

- all core product channels in thin but functional form;
- three to four specialized rivals with visible tree positions;
- rival launches, publications, funding, and poaching events;
- funding rounds and board expectations;
- quarterly reviews and Strategic Questions;
- crisis chains;
- advisor callbacks and report templates;
- full Deployment and Market branch effects.

**Acceptance gate:** a player makes a strategically suboptimal choice because of a rival, customer, or board deadline; the choice is understandable in hindsight; the lab feels like a portfolio rather than a single project queue.

### Stage 7 — Eras 4–5 and model variety

**Build:**

- Generative & Agentic era;
- video, local, and agent tracks;
- World Model track and Era 5 keystone;
- Robotics/Embodied track as a thin but complete strategic path;
- hardware partner contracts and physical incident category;
- staleness countermeasures and modality-specific data dependencies;
- rival specialization and visible AGI clocks.

The robotics layer does not need physics simulation. A partner, milestone, fleet capacity, and incident state are enough to create the intended strategic tradeoff.

**Acceptance gate:** at least two distinct late-game strategies can reach the World era; world-model investment matters to AGI; robotics, video, local, and agent paths feel different in compute, revenue, trust, and risk.

### Stage 8 — AGI program, endings, and failure content

**Build:**

- Era 6 gate;
- Foundation Run, Grounding, Alignment Gauntlet, and AGI Decision;
- Ascension, Long Road, Stewardship Compact, Release, Commercial Empire, Hubris, and Eclipsed outcomes;
- all ordinary terminal losses;
- Chronicle assembler;
- three What-If fork prompts;
- replay-from-fork UI;
- ending-specific gallery and Notebook entries.

**Acceptance gate:** a full seeded run can reach the AGI Decision; every intended ending is reachable by at least one coherent strategy; a failed player can name the choices that led to the ending and sees a compelling next fork.

### Stage 9 — Meta-progression and content production system

**Build:**

- Lineage Gallery;
- Lab Notebook;
- archetype/doctrine/scenario unlocks;
- Founder, Supported, and Iron modes;
- world modifiers;
- full content coverage reports;
- cooldowns, variant pools, and Chronicle paragraph assembly;
- spreadsheet/CSV authoring pipeline with validation and placeholder fallback;
- first complete content pass for required decisions, reports, warnings, advisors, and endings.

**Acceptance gate:** the whole game is playable in both placeholder mode and authored-content mode; simulations find no dead critical pools or missing template slots; common runs do not repeat high-salience lines excessively; players who fail can identify a next experiment.

### Stage 10 — Balance, hardening, and release readiness

**Build:**

- bot simulation across thousands of seeds;
- economy and ending reachability tuning;
- golden-run updates with intentional schema changes only;
- migration fixtures;
- browser interruption/offline testing;
- performance tests on low-end devices;
- save export/import and recovery messaging;
- final first-run onboarding and content edit pass;
- accessibility, keyboard/touch support, reduced motion, and readable alerts;
- optional lightweight office visualization reading engine state;
- PWA presentation and release assets.

**Acceptance gate:** all technical, difficulty, comprehension, and replay targets have recorded evidence. The release candidate remains fully playable in placeholder mode, and its authored mode has passed final content, accessibility, offline, interruption, and visual-quality review.

### 13.2 Explicit cut and defer lines

If scope pressure appears, cut in this order:

#### Safe to defer without damaging the identity

- animated office scenes and elaborate visualizations;
- audio and voice acting;
- localization beyond externalized strings;
- cloud sync, accounts, social features, and server analytics;
- Android/native wrappers if the responsive PWA is stable;
- additional rival archetypes and cosmetic event variants;
- deep hardware physics or a detailed employee-scheduling simulation;
- live-service events and online leaderboards.

#### Ship thin rather than omit

- Robotics: use partner milestones, fleet scale, and physical incident facts instead of simulation physics.
- Video: one or two coherent studio products with clear compute and rights tradeoffs rather than many subgenres.
- Rivals: visible tree clocks and event decks rather than full internal companies.
- Advisors: two fully authored voices can carry the first release if the stance system supports three.
- Office layer: static or lightly animated state visualization.

#### Do not cut without changing the game

- weekly Plan → Advance → Resolution loop;
- research tree with meaningful mutually exclusive paradigms;
- model designer and named models;
- brand/foundation lineage and successor-versus-fresh choice;
- shared compute tension;
- data provenance and cutoff/staleness pressure;
- products that create ongoing pressure;
- trust, incidents, and risk memory;
- deterministic engine and save/replay safety;
- AGI program and final decision;
- Chronicle with a clear cause of failure and replay fork;
- casual-readable decision cards.

These protected systems are the game's identity. More content cannot compensate for their absence.

### 13.3 Definition of done for the complete v1

The full release is ready when:

- a first-time player can understand and enjoy the first model arc without technical knowledge;
- an experienced player can take meaningfully different paths through all six eras;
- model families, data, brands, foundations, products, and markets interact rather than existing as separate menus;
- the player can reach AGI and face a history-dependent ending;
- failure is hard, warned, and specific;
- a Chronicle makes a failed run feel like a story worth replaying;
- seeds, saves, and forks are deterministic and recoverable;
- headless simulations and human playtests support the balance claims;
- the UI can be maintained by a small team because content is data and the engine is isolated.

---

## 14. Final Design North Star

The game succeeds when a player closes the browser after a short session and keeps thinking about one decision:

> “Aurora was finally good enough to launch, but I knew the safety band was wide. I launched anyway because NovaMind was five weeks away. Now the product is viral, compute is exhausted, and the model's old data is becoming a problem. Tomorrow I either retire my most successful model, spend the runway on a clean foundation, or double down and try to reach AGI before the rival does.”

That is the intended fusion of Civilization and Game Dev Tycoon: the research tree supplies the strategic identity, the model designer supplies the creative release moment, the tycoon systems turn success into pressure, and the deterministic Chronicle turns each run—especially a failed one—into a reason to play again.
