---
name: living-ui-swarm
description: Build an "agent swarm" page-build animation for React / Next.js. A crew of role-colored cursors (planner, coders, designers, layout, tester, reviewer, deployer) assembles each section as it scrolls into view. They frame cards, type headings and swap fonts, drag images in, duplicate list items, pick colors from a wheel, box out grids, then review and approve. Comes with a working engine (canvas overlay, GSAP, Lenis) and a data-attribute DOM contract. Use this skill whenever someone wants agent cursors building the page, a build-on-scroll or "assemble itself" animation, multiplayer-style cursors constructing a portfolio or launch page, a page that looks like AI agents are designing it live, or wants to tune, debug or extend an existing swarm build. It also applies when they describe the effect without naming it, e.g. "cursors that draw the boxes and type the text as you scroll".
---

# Agent-swarm build animation

A fixed canvas overlay draws a small crew of cursors that "build" each
section of a page when it scrolls into view. The content is real,
server-rendered HTML the whole time. The engine only hides items for a few
seconds and plays a short piece of choreography for each one.

Live example: https://www.lamanhtruong.com. Its source is pinned at
[portfolio-anh@a5d1651](https://github.com/anhlamtruong/portfolio-anh/tree/a5d165123922ea5c7fd645c4d0701554b1e4df8f).
`assets/swarm/` holds the same engine, cleaned up for reuse.

## When to use it, and when not

Use it where the page itself is the pitch: a portfolio, a launch or
product-story page, a case study, an "about our AI" page. People visit once,
scroll top to bottom, and the build tells them something ("this person ships
with agents").

Skip it for anything people use every day: dashboards, docs, settings,
checkout, long reading. The build costs a few seconds per section, and a
returning user has no reason to watch it twice. That is why the engine
remembers a finished build per tab (sessionStorage) and never replays it on
reload.

What it costs:
- About 5,000 lines of TypeScript. The build layer is loaded with
  `next/dynamic` after hydration, so first paint never waits for it; the
  smooth-scroll and parallax pieces (Lenis, GSAP, ScrollTrigger) load with the
  page. A fresh Next.js 15 app with all four living-ui skills came to about
  67 kB of route JS (170 kB first load).
- A small layout-shift score while the live log fills (about 0.03 in a test
  page, well under the 0.1 "good" line): new log lines move inside their
  fixed-height box. The rest of the page never shifts.
- One extra fixed canvas and one `gsap.ticker` loop. The loop stops when
  nothing is moving.
- GSAP 3.13+ (free, including ScrollTrigger), `@gsap/react`, Lenis.

## How it works in one paragraph

A tiny inline script in `<head>` sets `html[data-build="on"]` before first
paint, and CSS then hides every unbuilt `[data-build-item]` with `opacity: 0`.
Opacity rather than display or visibility means no layout shift and nothing
is dropped from the accessibility tree. After hydration the engine scans the
page into a task graph per `[data-build-section]`, arms a ScrollTrigger for
each section, and when one enters the viewport runs plan → build → review:
- **Plan:** a planner draws guides and hands tasks out.
- **Build:** workers claim tasks by distance, role and the critical path, and
  each task plays one GSAP timeline.
- **Review:** a reviewer outlines the section, ticks a checklist and stamps it.

Finished items and sections get `[data-built]`. If the engine never starts,
the head script removes the flag after 3 s so nothing stays hidden.

Architecture, data flow and how to extend it: `references/architecture.md`.

## Install (Next.js App Router)

1. **Dependencies.** Tested with Next.js 15.1 + React 18.3 (the worked
   example) and Next.js 15.5 + React 19.1 + Tailwind 4 (a fresh
   `create-next-app`), TypeScript 5.8–5.9, `gsap@3.13–3.15`,
   `@gsap/react@2.1.2`, `lenis@1.3.27`:

   ```bash
   npm i gsap@^3.13 @gsap/react@^2.1 lenis@^1.3
   ```

2. **Copy the engine.** Copy `assets/swarm/` to `src/components/swarm/`.
   Imports inside it are relative, so any folder works.
3. **Add the flag script** to the root layout `<head>`. It sets an
   attribute on `<html>` before React hydrates, so add
   `suppressHydrationWarning` to `<html>`:

   ```tsx
   // app/layout.tsx
   import { BuildFlagScript } from "@/components/swarm/build-flag-script";

   export default function RootLayout({ children }: { children: React.ReactNode }) {
     return (
       <html lang="en" suppressHydrationWarning>
         <head>
           <BuildFlagScript />
         </head>
         <body>{children}</body>
       </html>
     );
   }
   ```

4. **Mount the engine once**, on the pages that use it, after the content:

   ```tsx
   // app/page.tsx (a server component; stays static)
   import "@/components/swarm/swarm.css";
   import { SwarmRoot } from "@/components/swarm/swarm-root";

   export default function Page() {
     return (
       <>
         <main>{/* sections marked up with data-build-* */}</main>
         <SwarmRoot />
       </>
     );
   }
   ```

   `SwarmRoot` also mounts Lenis smooth scrolling driven by `gsap.ticker`. If
   the app already runs Lenis, delete `<SmoothScroll />` from `swarm-root.tsx`.
   `build-layer.tsx` reads the instance through `useLenis()`, which needs a
   `root` ReactLenis instance somewhere on the page (`<ReactLenis root />`, as
   `smooth-scroll.tsx` mounts). It doesn't have to be a parent.
5. **Keep the route static.** The engine only decorates HTML that already
   exists. Don't call `cookies()`, `headers()` or `auth()` in the page's
   layout tree just to read a session. Fetch that on the client instead, and
   the page can be prerendered and served from the CDN. On pages that don't
   mount `SwarmRoot`, the flag script is harmless: no element carries
   `data-build-item`, and the failsafe clears the flag.
6. **Theme it.** Set CSS variables (`--swarm-font-mono`, `--swarm-accent`,
   `--swarm-text`, `--swarm-muted`, `--swarm-dim`, `--swarm-line`,
   `--swarm-neutral-text|fill|stroke`), then edit `COLORS` and `ROLE_COLOR`
   in `palette.ts`. The canvas can't read CSS variables cheaply on every
   frame, so its palette lives in TS.

## Mark up the page

Everything is driven by data attributes on server-rendered markup. The full
reference, with defaults and phone behavior, is in
`references/dom-contract.md`. Copy-paste recipes for a hero, card grid, list,
image or video, metrics strip and finale are in `references/recipes.md`.

| Attribute | On | Meaning |
| --- | --- | --- |
| `data-build-section="name"` | section wrapper | One build unit with its own plan, crew and review |
| `data-build-start="load"` | section | Build right after boot instead of on scroll, with the bigger hero budget |
| `data-build-item` + `data-build="frame\|type\|reveal\|image\|dup"` | element | One task of that kind |
| `data-build-list` | list container | Its first item is the master (`frame`); `dup` siblings are copied from it |
| `data-build-grid` | container or the section | A layout agent draws the grid and boxes each cell first |
| `data-build-font` / `-weight` / `-scale` | `type` items | Mono draft then font swap; weight sweep; start small, then resize and move |
| `data-build-color="text\|fill\|stroke"` | any item | Color wheel picks the real color after the item appears |
| `data-build-tune` | `frame` | Opens the radius and padding inspector |
| `data-build-from="left\|right\|top\|bottom"` | `image` | Edge the image is dragged in from |
| `data-build-keep` / `="mobile"` | any item | Never hidden (phones only with `mobile`), still annotated |
| `data-build-label`, `-order`, `-role` | any item | Tag text, ordering hint, which role takes it |
| `data-swarm-spawn="role"` | SVG `<g>` in the hero | Mesh nodes the crew pops out of at boot (≥1024 px) |
| `data-swarm-log` | container | Server-rendered fallback lines get swapped for a live log |
| `data-build-finale` + `data-deploy-target` + `data-deploy-text` | last section, its CTA | Deployer "ships" the page after the last review |
| `?build=off` / `?build=force` | URL | Disable for this view / replay even if this tab already watched |

The engine sets: `html[data-build="on"]` while active, `[data-built]` on
finished items and sections, `[data-lit]` on mesh nodes during boot, and
`[data-deployed]` on the finale target.

Rules that keep it working:

- **Section size.** About one viewport of items per section. Split long
  pages: one section per job in a timeline, one per card in a big grid, a
  separate section for a section header. Small sections finish inside their
  budget and look deliberate; huge ones fall back to the catch-up speed.
- **Nesting.** An item nested inside another item waits for its parent. Mark
  the card as `frame` and its title, text and chips inside it.
- **Type.** Use `type` only for short text (under about 120 characters).
  Longer text automatically falls back to `reveal`. Typing reads glyph boxes
  once, so React-managed text that changes after hydration (counters, view
  counts) should be a `frame`, not `type`.
- **LCP.** Keep the main heading visible on phones with
  `data-build-keep="mobile"`. On phones the hero heading is the Largest
  Contentful Paint, and hiding it costs you Core Web Vitals. Desktop still
  gets the full font-swap build.
- **Live log.** The `data-swarm-log` container must be server-rendered with
  real fallback lines and a fixed height (`.swarm-log`). The engine swaps
  them for live lines and puts them back on Skip or unmount.

Minimal hero:

```tsx
<section data-build-section="hero" data-build-start="load">
  <p data-build-item data-build="type">your eyebrow line</p>
  <h1
    data-build-item data-build="type" data-build-font data-build-weight
    data-build-keep="mobile" data-build-order="-1" data-build-role="coder"
  >
    Your Name <span className="serif">(Accent)</span>
  </h1>
  <div data-build-item data-build="image" data-build-from="right" className="avatar">
    <img src="/me.jpg" alt="Portrait" />
  </div>
  {/* next/image works too (it renders an inner <img> the engine reads). */}
  <div data-build-list className="buttons">
    <a data-build-item data-build="frame" href="#">GitHub</a>
    <a data-build-item data-build="dup" href="#">LinkedIn</a>
    <a data-build-item data-build="dup" data-build-color="fill" href="#">Resume</a>
  </div>
</section>
```

## Smoothness rules

These came from watching real builds. Each one fixed a visible problem.

- **Never force-finish at a deadline.** An early version jumped every
  running timeline to 5× speed and popped the unclaimed items in at each
  section's deadline. People saw it as a hitch at the end of every section.
  Budgets are now planning targets.
  - `estimate()` scales task durations so the plan fits.
  - When a section runs late, `pace()` ramps a catch-up factor smoothly,
    to at most 1.7× over 0.7 s.
  - Every tween stays at least 120 ms long even at full catch-up, and typing
    steps stay at least 16 ms. Nothing pops.
  - If you need it faster, make the cursors faster (`speed` in
    `palette.ts`). Don't cut animations short.
- **Animate only opacity, clip-path, filter and transform.** No layout
  writes. Font-swap drafts are clones in an out-of-flow layer, and the scale
  task removes its inline transform at the end.
- **One clock.** The simulation and the canvas draw run in a single
  `gsap.ticker` callback. React state changes only when building starts or
  stops, never per frame. The ticker stops when no agent is on screen.
- **Measure ahead.** Sections up to about two viewports below the fold are
  measured in `requestIdleCallback` slices. A section starting never causes
  a big layout-read burst on the scroll frame.
- **Respect the reader.**
  - Focusing anything inside an unbuilt section finishes that section at
    once, so keyboard users never wait.
  - A resize mid-build finishes the running sections, because their measured
    rects are stale.
  - A hidden tab pauses everything.
  - The HUD always offers Skip, Replay and Inspect.
- **Phones get less.** Each profile has its own budget, crew and detail
  (`detectProfile()` in `palette.ts`).
  - Phones: 8 agents, about 2.2 s per section, one font swap per page, one
    color pick per section, one dup sweep per list, no inspector panels, no
    scale task, no deployer.
  - Tablets: 11 agents.
  - Desktop: 15 agents, about 3.9 s per section, 5.25 s for the hero.

Knobs for "faster", "calmer" and "more agents": `references/tuning.md`.

## Reduced motion

The engine plays for every visitor, including people whose OS asks for
reduced motion. The site owner decided the build is the point of the page,
and the HUD always offers Skip, so this is a deliberate choice, not a
default to copy blindly. To respect the setting instead, make all three of
these changes:

```ts
// build-flag-script.tsx: inside CODE, before d.setAttribute('data-build','on')
if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

// motion.ts
export function offByUrl(): boolean {
  return OFF_RE.test(window.location.search) ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// smooth-scroll.tsx
respectReducedMotion: true,
```

Test both ways: some browsers (and some automation setups) report
`reduce` even when nobody chose it, which is one reason the default here is
"on".

## Working with other effects

- **Gate on `[data-built]`.** The engine reads element rects and toggles
  opacity and clip-path while building. Tilt, glitch, scramble, parallax on
  content, or anything else that transforms an item will corrupt those
  measurements if it runs early. Start such effects only when the item and
  its section carry `[data-built]`, or when `html[data-build]` is not `"on"`.
  A ready-made helper:

  ```ts
  export function isBuilt(el: Element): boolean {
    if (document.documentElement.getAttribute("data-build") !== "on") return true;
    const item = el.closest("[data-build-item]");
    if (item && !item.hasAttribute("data-built")) return false;
    const section = el.closest("[data-build-section]");
    return !section || section.hasAttribute("data-built");
  }
  ```

- **Videos.** An `image` item that wraps a `<video poster>` is dragged in
  using its poster frame as the thumbnail. Give the wrapper a
  `data-build-label` like `clip.mp4`, because there's no `<img>` to read a
  file name from.
- **Decorative parallax** is fine anywhere it moves decoration only. Never
  put it on something the engine measures.

## Make it your own

The engine here is an original implementation, and the same standard
applies to anything you build from it. If a site inspired you, write down
what makes that site recognizable and stay away from exactly those things.
Borrowing the general idea of "cursors build the page" is fine. Copying its
signature moments is not, and if its code has no license, reading it for
implementation details is off limits too.

As an example of the method, this is the list we kept while building the
original:
- no intro where cursors orbit a center point
- no crowd that grows with scroll speed
- no finale where agents flock into a shape
- no heading whose font size ticks up while it's typed
- no width×height badge riding next to the cursor
- no "built by N agents" credit line
- no sound
- no famous-people names for agents
- no "drop it off-target, then snap to the guide" move

What changes the character fastest:
- the roles and their colors (`palette.ts`)
- the cursor glyphs and popovers (`widgets.ts`)
- which task kinds exist and how each one moves (`choreo.ts`)
- the review ritual and the finale (`director.ts`)
- pacing (`references/tuning.md`)

## Verify it

Normal browsers lie about animation in a few ways:
- Background tabs throttle rAF to about 1–2 fps.
- An embedded or hidden preview pane may never fire rAF at all.
- Some automation profiles report `prefers-reduced-motion: reduce`.

Check behavior in a headless browser you launch (`playwright` or
`playwright-core` with `channel: "chrome"`), where rAF runs at full rate.
An agent's Playwright MCP browser can be a real, throttled window (about
2 frames per second was measured), so first check the frame rate:
`await page.evaluate(() => new Promise(r => { let n = 0; const t = performance.now(); const f = () => (++n, performance.now() - t < 1000 ? requestAnimationFrame(f) : r(n)); requestAnimationFrame(f); }))`
should return 50 or more. The swarm still finishes in a slow browser because
it is time-based, but effect checks will fail falsely. Judge smoothness
yourself in a foreground window.

```js
// Playwright: scroll the page in steps, then confirm everything got built.
await page.goto(url + "?build=force");
for (let i = 0; i < 60; i++) {
  // Slow enough that each section builds while it is in view (and glitch
  // headings from living-ui-effects get their entrance). Smooth scrolling can
  // move ~1.5x each wheel delta, so short pages need smaller steps.
  await page.mouse.wheel(0, 250);
  await page.waitForTimeout(600);
  if (await page.evaluate(() => innerHeight + scrollY >= document.body.scrollHeight - 2)) break;
}
await page.waitForTimeout(4000);
const report = await page.evaluate(() => {
  const phone = !matchMedia("(min-width: 768px)").matches;
  const items = [...document.querySelectorAll("[data-build-item]")];
  const kept = (el) => el.hasAttribute("data-build-keep") &&
    (el.getAttribute("data-build-keep") !== "mobile" || phone);
  const stuck = items.filter((el) => !el.hasAttribute("data-built") && !kept(el));
  const sections = [...document.querySelectorAll("[data-build-section]")];
  return {
    flag: document.documentElement.dataset.build ?? null,
    items: items.length,
    stuck: stuck.map((el) => el.outerHTML.slice(0, 80)),
    sectionsBuilt: sections.filter((s) => s.hasAttribute("data-built")).length + "/" + sections.length,
    hiddenNow: items.filter((el) => getComputedStyle(el).opacity === "0").length,
  };
});
// Expect: stuck = [], sectionsBuilt = "N/N", hiddenNow = 0.
```

Also check:
- **`?build=off`:** everything shows immediately.
- **JavaScript disabled:** nothing is hidden.
- **Phone width (390 px):** the main heading is visible in the first
  screenshot.
- **Tab key:** pressing Tab into an unbuilt section finishes it.

## Files in `assets/swarm/`

| File | Role |
| --- | --- |
| `swarm-root.tsx` | Mount point: smooth scroll + the lazily loaded engine |
| `build-flag-script.tsx` | Inline `<head>` script: sets the flag before paint, failsafe |
| `build-layer.tsx` | React shell: canvas, draft layer, HUD, starts the Director after fonts load. Its header comment is the canonical DOM-contract summary |
| `director.ts` | Scheduler: section lifecycle, claiming, pacing, boot, review, log, inspect, finale, the ticker |
| `choreo.ts` | One GSAP timeline per task kind, the duration table, `taskTime()` for planning |
| `scan.ts` | DOM → task graph, then geometry and style reads (read-only) |
| `sim.ts` | Cursor steering on typed arrays (arrive + separation) |
| `renderer.ts`, `widgets.ts` | Canvas drawing with cached sprites; popover and glyph painters |
| `palette.ts` | Colors, roles, rosters, per-device budgets and speeds |
| `types.ts` | Shared types and mark/tool enums |
| `log.ts`, `hud.tsx`, `inspect.ts`, `motion.ts`, `smooth-scroll.tsx` | Live log, HUD, inspect sheet, URL switch, Lenis |
| `swarm.css` | Hide-until-built rule, canvas and HUD, optional log, mesh and finale styles |

## References

- `references/dom-contract.md`: every attribute, default and phone rule.
- `references/recipes.md`: markup recipes for common sections.
- `references/architecture.md`: how the engine is put together, and how to
  add a task kind or a role.
- `references/tuning.md`: speed, budgets, crew size, palette, and what to
  change for a given feel.
