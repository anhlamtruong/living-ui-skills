# Engine architecture

How `assets/swarm/` is put together, and how to change it without breaking
the parts that make it smooth.

Contents
1. Data flow
2. Boot sequence
3. The task graph (scan.ts)
4. The scheduler (director.ts)
5. Choreography (choreo.ts)
6. Motion and drawing (sim.ts, renderer.ts, widgets.ts)
7. Side channels: log, HUD, inspect, finale
8. Invariants worth keeping
9. Adding a task kind
10. Adding a role

## 1. Data flow

```
server HTML with data-build-*        <head> BuildFlagScript
        |                                    | html[data-build="on"] before paint
        v                                    v
   swarm.css hides unbuilt items (opacity 0, no layout change)
        |
  hydration -> SwarmRoot -> next/dynamic(BuildLayer, ssr:false)
        |
  BuildLayer (React shell)  -- waits for document.fonts.ready (max 1.5 s)
        |
  Director.start()
     scanPage()  -> SectionModel[] with Task graphs        (scan.ts, reads only)
     arm()       -> ScrollTrigger per section ("top 78%")
        |
  section enters view -> request():
     measureSection() (or the idle-time pre-measure)       (scan.ts, reads only)
     estimate()  -> duration scale so the plan fits the budget
     spawn()/boot() -> agents enter from edges or mesh nodes
     plan -> build (claim() + choreograph() per task) -> review -> finish()
        |
  one gsap.ticker callback per frame:
     update() brains -> claim() -> Sim.step() -> Renderer.draw()
```

React is only the shell: canvas, an out-of-flow layer for font drafts, and
the HUD. The engine never sets React state per frame. `onBusy` fires when
building starts or stops, and `onInspect` when inspect mode changes.

## 2. Boot sequence

1. **`BuildFlagScript`** runs inline in `<head>` and sets
   `html[data-build="on"]` unless:
   - the URL has `?build=off`, or
   - the tab already watched the whole build (sessionStorage), and there's
     no `?build=force`.

   It also arms a failsafe: if `window.__swarmReady` isn't set 3 s after
   `load` (or 8 s after the script ran), it removes the flag so nothing
   stays hidden.
2. **`BuildLayer`** mounts after hydration. It sets `__swarmReady` and builds
   a `Director`, then calls `start()` once fonts settle. Font metrics must
   be final before glyph boxes are measured.
3. **`start(active)`:**
   - scans the page
   - marks items outside any section as built
   - attaches focus, pointer, key, visibility, resize and scroll listeners,
     and a `ResizeObserver` per section
   - if `active` is false, marks everything done; otherwise it arms the
     triggers.
4. **The hero** (`data-build-start="load"`) starts at once. On desktop ≥1024
   px with visible `[data-swarm-spawn]` nodes, `boot()` lights the nodes one
   by one over 0.45 s, and each agent pops out of a node of its role.
   Otherwise `spawn()` brings agents in from just off-screen.
5. **Unmount** destroys the director. A real unmount, as opposed to a
   StrictMode re-run, removes the flag on the next tick, so content can
   never stay hidden.

## 3. The task graph (scan.ts)

`scanPage()` reads structure once and makes one `SectionModel` per
`[data-build-section]`. Each section gets its `Task[]`:

- **Items** become tasks of their `data-build` kind. An item nested in
  another item gets a dependency on it.
- **Lists:**
  - `dup` siblings become batched `dup` tasks that depend on the master
    `frame` (except on phones, where the batch flies from the first slot).
  - Big image lists turn a few tiles into `image` tasks.
- **Grids:** each `data-build-grid` adds a `grid` task. The outermost items
  inside it depend on it, and the grid becomes `ready` once its lines are
  drawn, so cells can start while the placeholders are still being swept.
- **Colors:** each `data-build-color` adds a `color` task that depends on the
  task showing the element. Its element starts neutral (`applyTint`) and the
  wheel picks the real value.
- **Profile rules** are applied here: phones keep one font swap per page and
  no scale; kept items never font-swap.

`measureSteps()` is a generator, so the director can spread it over idle
time. It reads, and never writes:
- each task's document-space box
- text glyph and line boxes for `type` and `reveal`
- computed radius, padding, alignment, fonts and colors
- grid lines and cells
- the default order: rows of 24 px, then x; `data-build-order` overrides it
- which cards get inspector panels
- the plan guides

`measureSection()` runs it to completion.

## 4. The scheduler (director.ts)

**Section phases:** `WAIT → PLAN → BUILD → REVIEW → DONE`.

**Agent modes:**
- `OFF`, `IDLE`, `TRAVEL`, `WORK`, `EXIT`
- `SLEEP` (waiting on a mesh node)
- `INSPECT` (escorting the property sheet)
- `DEPLOYING` (finale)

Key methods:

- **`request(run)`** measures, estimates, spawns, sends the planner to the
  section's top-left guide, and calls `plan()`. `plan()` draws the guides
  and tag and logs "planned N tasks". After `HANDOFF` (0.3 s, or 0.2 s on
  phones) the section is in `BUILD`.
- **`estimate(run, open)`** binary-searches a duration scale `run.scale` in
  [0.35, 1]. The goal is for the build window (budget minus handoff and
  review) to fit
  `max(total work / crew + stagger, critical path)`. Cursor speed is raised
  to match (`speedMul` up to 1.6×). This is where the budget is honored:
  planned, not forced.
- **`claim()`** runs every frame for idle agents. Lower score wins:
  - distance to the task's start point
  - plus reading-order rank × 22
  - plus tasks left in the section × 6
  - role fit (`rolePref`, or a strong pull for `data-build-role`)
  - critical-path bonuses: grids first, then color picks, then tasks others
    wait on, then the longest
  - a penalty if the task is off-screen

  Grids are reserved for layout agents while one is free. The planner and
  reviewer help on phones and tablets.
- **`pace(run)`** runs every 100 ms. It recomputes the remaining work and
  critical path against the deadline. If the section is behind, it tweens
  `run.catchUp` toward the needed factor (at most `CU_MAX` 1.7, over
  `CU_RAMP` 0.7 s, `sine.inOut`). Running and new task timelines follow it
  through `timeScale`. It never jumps or truncates.
- **`wrapping(run)`** starts the review once every remaining task is running
  and ends before the checklist would open, so the review overlaps the last
  tails. The stamp still waits for every task.
- **`review()` / `inspect()` / `stamp()`:** the reviewer gets acks from the
  last workers, outlines the section, ticks a short checklist and stamps
  "approved".
- **`finish(run, instant)`** marks everything built, and fades or removes
  marks. Once every section is done, it stores the session key. It is
  instant for Skip, focus, resizes and sections scrolled past.
- **`tick()`** is the only per-frame callback:
  - wall-clock `dt` (clamped to 0.25 s)
  - `update()` for brains and phases
  - `claim()`
  - `Sim.step()`, sub-stepped up to 4×
  - `Renderer.draw()`
  - HUD stats at most 10×/s

  It removes itself when nothing is on screen.
- **Idle loop:** an `IDLE` agent traces a small personal loop around its own
  parking point while anything builds (and `IDLE_LINGER` 6 s after), then
  exits. The loop radius and speed are randomized per agent, so the crew
  never moves in lockstep.
- **Events:**
  - focus inside an unbuilt section finishes it
  - `visibilitychange` pauses all animations and the ticker
  - resize invalidates sprites and bumps `layoutVer`
  - the section `ResizeObserver` finishes running sections, because their
    rects are stale
  - scroll schedules the idle-time pre-measure

## 5. Choreography (choreo.ts)

`choreograph(ctx, master)` picks one function per kind and builds one GSAP
timeline: `frame`, `typeText`/`typeFont`, `dragIn`/`scanImage`, `dup`,
`colorPick` or `grid`. The timeline:

- moves the agent with `step()` and `aim()`, writing `sim.tx/ty`, and sets
  its cursor tool (`TOOL.*`) and grip (`sim.follow`)
- creates canvas marks with `c.mark(MK.*, {...})` and tweens their generic
  fields (`p`, `a`, `s`, `u`, `v`, ...), whose meaning per kind is defined
  in `renderer.ts`
- writes only temporary inline styles on the element (`opacity`,
  `clip-path`, `filter`, a neutral tint, the scale task's `transform`), all
  removed when the task ends (`markBuilt`, `clearTint`, the `undo` list)
- logs one line through `c.log()` and flashes the box at the end

Timing:
- `T` is the base duration table at scale 1.
- `D(c, x) = max(MIN_T, x * c.s)` applies the section scale with a floor:
  `MIN_T = 0.12 × CU_MAX`, so a tween is still ≥120 ms at full catch-up.
  Typing has `MIN_CHAR` (≥16 ms per char).
- `taskTime(t, s, dragTime)` mirrors every timeline's length for the
  planner. Keep it in sync whenever you change a timeline, or the estimate
  will be wrong and the section will lean on catch-up.

`typeFont()` is the most involved piece:
- clones the element into `div.swarm-layer` as a mono draft (aria-hidden)
- types the clone
- opens a font menu sprite and hovers the real family (plus a second family
  if there's a nested serif or similar)
- cross-fades from clone to real text, or runs a weight sweep through a
  "face" clone

The page element itself only changes opacity and clip-path, so layout never
moves.

## 6. Motion and drawing

- **`sim.ts`** steers every agent with arrive + separation on typed arrays:
  - `GAIN` sets how fast velocity converges.
  - `MAX_ACC` caps acceleration.
  - Agents slow down inside a radius proportional to speed.
  - `SEP` and `SEP_K` give personal space.

  An agent with `follow > 0` is gripping something (a frame corner, a
  caret) and tracks it with exponential smoothing instead. `spin` rotates
  the cursor during idle loops; `pop` scales it in at spawn.
- **`renderer.ts`** draws one fixed canvas at `min(devicePixelRatio, dprCap)`
  in document space, using a scroll-offset transform. Cursor glyphs, name
  pills, popovers and image cards are cached sprites, so per frame only
  positions, a few numbers and the marks list change. Marks with
  `dead: true` are dropped.
- **`widgets.ts`** holds the painters behind those sprites (cursor glyphs,
  font dropdown, inspector, alignment toolbar, color wheel, review
  checklist, props sheet, deploy panel, dragged image card with shadow) and
  their geometry constants. The choreography aims at those constants, so
  edit both sides together.

## 7. Side channels

- **`log.ts` `LiveLog`** swaps the `[data-swarm-log]` fallback for live
  lines. Writes are batched every 100 ms, capped to N lines, and run under
  `contain: inline-size`. It restores the fallback on stop.
- **`hud.tsx`** has Skip, Replay and Inspect. Stats text is written straight
  into a DOM node by the director, never through React state. Skip keeps
  keyboard focus inside the HUD.
- **`inspect.ts` + `Director.inspectAt()`** works on desktop with a fine
  pointer once the hero is built. Hovering or focusing a built frame or image
  sends an agent with a property sheet: size, radius, padding, fill and
  font, read from computed style. Esc turns it off.
- **`Director.finale()`** runs after the `data-build-finale` section's
  approval: deployer click → build/upload/edge panel → `[data-deployed]`.

## 8. Invariants worth keeping

- The page must be complete and readable with the engine absent. The engine
  only hides things after the head script opts in, and every failure path
  removes the flag.
- No layout writes during a build. Measure once, before the section starts.
  Any later geometry change means finishing instantly, never re-measuring
  mid-animation.
- Every duration goes through `D()`, every timeline is mirrored in
  `taskTime()`, and lateness is fixed by smooth catch-up, never by
  truncation.
- One ticker, zero per-frame React state, and sprites cached.
- Anything that leaves inline styles on page elements must undo them in the
  `undo` list or on task end.

## 9. Adding a task kind

Example: a `chart` kind that draws an SVG chart's line before revealing it.

1. **`types.ts`:** add `"chart"` to `BuildKind` (authors use it) and so to
   `TaskKind`. Add any per-task fields you need to `Task`, and default them
   in `scan.ts makeTask()`.
2. **`scan.ts`:**
   - add it to `KINDS`
   - set its flags in the "Items nested inside another item" loop
   - read its geometry in `measureSteps()` (reads only)
   - give it a label word in `TAG_WORDS` or `CLASS_WORDS` if useful
3. **`choreo.ts`:**
   - write `function chart(c: Ctx)`, using only `step`, `aim`, `tool`,
     `wait` and `c.mark`
   - tween marks and opacity or clip-path; durations go through `D()`
   - add durations to `T`
   - add a branch in `choreograph()` that also sets the log text
   - add the same timing in `taskTime()`
4. **`renderer.ts`, `widgets.ts`:** if it needs a new mark, add an `MK.*`
   entry in `types.ts`, a draw case in the renderer, and (for anything
   heavier than lines) a cached sprite painter.
5. **`palette.ts`:** decide who likes it in `rolePref`/`LIKES`.
6. **Docs:** document it in `references/dom-contract.md`. Check it on a phone
   profile, which may need a cheaper variant (see how `type` falls back to
   `reveal` on phones).

## 10. Adding a role

1. Add it to `Role` in `types.ts`, `ROLE_COLOR` and each roster in
   `palette.ts`, and `ROLES` in `scan.ts` (so `data-build-role` accepts it).
2. Give it preferences in `rolePref()`.
3. If it should be numbered in its name pill ("analyst·02"), add it to the
   `numbered` check in `detectProfile()`.
4. Special roles (planner, reviewer, deployer) are wired by index in the
   `Director` constructor. A new special role needs its own spot in
   `spawn()` and its own behavior in `update()`.
5. Add a mesh node color if you use `data-swarm-spawn`.
