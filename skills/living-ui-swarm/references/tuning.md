# Tuning the feel

Where each knob lives, what it does, and which ones to turn for a given
request. All paths are inside `assets/swarm/` (your copy).

One rule first: budgets are planning targets, not deadlines. If a section
feels slow, make the plan faster (scale, speed, fewer flourishes). Never
reintroduce a hard cut-off that jumps timelines to the end. The early
version did that, and every section ended with a visible hitch.

## Per-device profile: `palette.ts` `detectProfile()`

| Knob | Desktop | Tablet | Phone | Effect |
| --- | --- | --- | --- | --- |
| `budget` (s) | 3.85 | 3.4 | 2.2 | Target from section start to approval |
| `heroBudget` (s) | 5.25 | 4.6 | 2.2 | Same for the `data-build-start="load"` section |
| `speed` (px/s) | 1725 | 1640 | 1215 | Cursor cruise speed. The planner raises it per section up to 1.6× when it compresses the plan |
| `accel` | 1.5 | 1.6 | 1.8 | Steering acceleration multiplier (snappier turns) |
| `dprCap` | 2 | 2 | 1.5 | Canvas resolution cap |
| `ROSTERS` | 1 planner, 6 coders, 3 designers, 2 layout, tester, deployer, reviewer | 1/4/2/1/1/1/1 | 1/3/1/1/1/0/1 | Crew per role |
| `DETAIL.fontFirstOnly` | false | false | true | Font swap on every `data-build-font` item, or only the first |
| `DETAIL.panels` / `autoTune` | true / 2 | true / 3 | false / 0 | Inspector panels; auto-pick every Nth leaf card |
| `DETAIL.colorsPerSection` | 99 | 2 | 1 | Color-wheel picks per section |
| `DETAIL.logoDrags` | 3 | 2 | 1 | Image drags in big image lists |
| `DETAIL.dragTime` | 1 | 0.85 | 0.6 | Duration multiplier for image drags |

The profile is decided once at start from `WIDE_QUERY` (768 px) and the
width (1024 px). Keep `WIDE_QUERY` in sync with the media query in
`swarm.css`.

## Durations: `choreo.ts`

- `T` is the base duration table (seconds at scale 1) for every step:
  - frame draw and fade
  - inspector panel and knob drags
  - font menu, morph and weight sweep
  - image grab, drag, settle
  - dup ghosts
  - color wheel
  - grid lines and row sweep
  - scale and move
- `CU_MAX = 1.7` is the highest catch-up factor.
- `MIN_T = 0.12 × CU_MAX` is the floor for every tween, and `MIN_CHAR` the
  floor per typed character. These floors are why nothing pops at full
  catch-up; keep them.
- `typeDur` gives about 32 ms per character, clamped to 0.2–0.8 s at scale 1.
  `revealDur` gives about 90 ms per line, clamped to 0.28–0.7 s.
- `SMALL = 0.42` is the starting scale of `data-build-scale` items.

When you change a timeline, change `taskTime()` to match. The planner uses
it to fit the budget.

## Scheduling: `director.ts`

| Constant | Value | Effect |
| --- | --- | --- |
| `HANDOFF` | 0.3 s (0.2 on phones) | Planner time before workers start |
| `TRAVEL_EST` | 0.14 s | Planned travel per task |
| `CU_RAMP` | 0.7 s | How gently catch-up ramps (keeps each change under about 1.2× per 100 ms) |
| `BOOT_LIGHT` | 0.45 s | Time to light all mesh nodes at boot |
| `IDLE_LINGER` | 6 s | Idle agents keep looping this long after the last activity, then leave |
| ScrollTrigger `start` | `"top 78%"` in `arm()` | How far into view a section starts building |
| loop radius / period | 12–24 px / 1.4–2.2 s (phones 10 px) | Idle loops, set in the constructor |
| `review()` | travel, outline, open, ticks, hold | Reviewer ritual length per budget |
| `crew(n)` | `ceil(n / 1.5)`, all workers above 8 tasks | How many workers a section gets |

## Steering: `sim.ts`

| Constant | Value | Effect |
| --- | --- | --- |
| `GAIN` | 9 /s | How fast velocity converges on the desired velocity. Lower is floatier |
| `MAX_ACC` | 16000 px/s² | Acceleration cap. Lower gives wider turns |
| `SEP` | 30 px | Personal space radius |
| `SEP_K` | 260 | Separation strength |

## Palette and type

- `palette.ts`:
  - `COLORS` is the canvas UI: pills, popovers, guides, checklist.
  - `ROLE_COLOR` gives cursor and pill colors per role.
  - `monoFamily()` is the canvas font. It reads `--swarm-font-mono`, falling
    back to `--font-geist-mono` and then system mono.
  - `fontLabel()` turns hashed `next/font` family names into readable menu
    rows.
- `swarm.css`: HUD and log colors come from `--swarm-*` variables, and the
  neutral start colors for color picks from `--swarm-neutral-text|fill|stroke`.
- The font menu offers the real family plus decoys. Edit the row list in
  `typeFont()` (`choreo.ts`) to change the decoys.

## Recipes

**"Make it faster"**
- Raise `speed` by 15–25% first. Travel is most of the perceived wait.
- Lower `budget` and `heroBudget` a little. The planner compresses durations
  down to its 0.35 floor.
- On phones, lower `DETAIL.dragTime`.
- Don't lower `MIN_T`.

**"Make it calmer"**
- Lower `accel` (1.0–1.2).
- Lower `GAIN` to about 7.
- Raise `budget` by 10–20%.
- Raise `CU_RAMP` to about 1.0.
- Use fewer coders in `ROSTERS`.
- Lengthen `T.frameDraw` and `T.drag`, and remember `taskTime()`.

**"More agents"**
- Add to `ROSTERS` (desktop first).
- Watch for crowding in small sections: `crew()` already sends fewer
  workers to small sections, and raising `SEP` keeps cursors apart.
- More than about 20 agents gets hard to read, and costs draw time on
  low-end laptops.

**"Fewer flourishes"**
- Set `DETAIL.panels = false`, which removes the inspector panels.
- Lower `colorsPerSection`.
- Set `fontFirstOnly = true`.
- Remove `data-build-scale` from markup.

**"The hero takes too long on phones"**
- Keep the heading with `data-build-keep="mobile"`.
- Mark long lines `reveal`.
- Lower `heroBudget` for phones.

**"Sections start too late or too early"**
- Change `"top 78%"` in `arm()`. Lower values (for example `"top 60%"`)
  start later and let people see the empty slots first.

**"Cursors hide behind my sticky header"**
- Raise `--swarm-z` (canvas) and `--swarm-hud-z` above it.

**"It feels jerky only in my browser"**
- Check whether the tab is in the background or the pane is hidden: rAF is
  throttled there.
- Test in headless Playwright or a foreground window before tuning.
