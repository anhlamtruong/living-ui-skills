---
name: living-ui-effects
description: Add live, interactive effects that keep a web page moving after it loads. They are a WebGL aurora / liquid-light shader behind the hero that bends around the pointer, holographic 3D tilt cards with glare and an iridescent edge, a grid spotlight that follows the cursor, RGB-split glitch headings, and hover text scramble on links and buttons. Ships drop-in React/Next.js code (one shared rAF loop, zero layout shift, accessible) plus the rules that keep it smooth. Use this whenever someone wants a page to feel more alive, trippy, premium or "wow". Also use it for a shader or animated gradient background, 3D/tilt/hologram cards, cursor-follow or spotlight effects, glitch or decoding/scramble text, or interactive hover effects, even if they don't name a technique.
---

# Live effects

Four effects that keep a page moving once its content is on screen:

- **Aurora hero:** a WebGL field of soft light behind the hero that bends around the pointer.
- **Hologram cards:** a card tilts toward the cursor, lifts, and catches a glare and an iridescent edge.
- **Grid spotlight:** the page's background grid lights up in a soft circle around the cursor.
- **Glitch and scramble type:** headings RGB-split when they arrive, and link labels decode on hover.

The bar is "alive, never in the way". People should feel the page react to them, but nothing may jank, shift layout, steal clicks, or hide text from a screen reader.

Live example: https://www.lamanhtruong.com (hover the project cards, move over the hero, hover the nav).

## What's in `assets/fx/`

| File | Role |
| --- | --- |
| `ticker.ts` | One shared `requestAnimationFrame` loop that sleeps when nothing asks for frames |
| `built.ts` | Readiness gate (`isBuilt`, `buildActive`), `frozen()`, seeded PRNG, pointer media query |
| `aurora.ts` | The WebGL shader, its quality scaler and lifecycle (`createAurora`) |
| `hero-shader.tsx` | `<HeroShader />`, the React wrapper for the aurora |
| `holo.ts` | Tilt + glare + sheen on cards, spring physics, injected overlay |
| `spotlight.ts` | Grid spotlight that follows the cursor (transform only) |
| `glitch.ts`, `glitch-copies.tsx` | Glitch scheduler, `<GlitchCopies />` and `<GlitchHeading />` |
| `scramble.ts`, `scramble-text.tsx` | Scramble runner and the `<ScrambleText />` markup hook |
| `fx-root.tsx` | `<FxRoot />`: mounts holo, spotlight, glitch and scramble once |
| `fx.css` | All styles, themed with `--fx-*` custom properties |

The code only needs React; no animation library. The templates type-check under strict TypeScript against React 18 and 19 types.

## Install

1. Copy `assets/fx/` into the app, e.g. `src/components/fx/`. Keep the files together, since they import each other by relative path.
2. Mount it. The page itself can stay a static server component; only `FxRoot` and `HeroShader` are client components.

```tsx
import { FxRoot } from "@/components/fx/fx-root";
import { HeroShader } from "@/components/fx/hero-shader";
import { GlitchHeading } from "@/components/fx/glitch-copies";
import { ScrambleText } from "@/components/fx/scramble-text";

export default function Page() {
  return (
    <div className="fx-grid">                        {/* fixed base grid; skip if you have your own */}
      <main className="relative z-[1]">              {/* content sits above grid + spotlight */}
        <section className="relative min-h-[80vh]">  {/* hero must be position: relative */}
          <HeroShader />                             {/* first child, behind the hero content */}
          <h1>…</h1>
        </section>

        <GlitchHeading as="h2" className="text-5xl font-semibold">Selected work</GlitchHeading>

        <article data-holo className="rounded-2xl border p-6">
          <a href="/work/x" className="inline-flex items-center gap-2">
            <ScrambleText>Read the case study</ScrambleText> <ArrowIcon />
          </a>
        </article>
      </main>
      <FxRoot />                                     {/* once per page, inside the grid wrapper */}
    </div>
  );
}
```

3. Theme it: edit the `--fx-*` variables at the top of `fx.css`, and pass `palette` / `intensity` to `<HeroShader />` (see "Theming" below).
4. Verify with the Playwright checks in `references/verification.md` before calling it done.

Turn pieces off with props: `<FxRoot holo={false} spotlight={false} />`. Point the tilt at existing cards without touching their markup: `<FxRoot holo={{ selector: ".card", within: "main" }} />`.

## Rules that keep it smooth

These rules are what separates "premium" from "janky". Each exists because breaking it caused a visible problem.

1. **Wait until the content is ready.** Never tilt, glitch or scramble something another script is still revealing or measuring. A transform on an element mid-reveal corrupts the measurements of whoever is animating it, and the result looks like a stutter. `built.ts` implements one contract: while `html[data-build="on"]` is set, an element only counts once its `[data-build-item]` and `[data-build-section]` carry `[data-built]`. With no build engine on the page, everything counts as built immediately. Any intro animation can opt in by setting those attributes. Details: `references/gating-and-performance.md`.

2. **Use one frame loop, and let it sleep.** Every effect subscribes to `ticker.ts` instead of calling `requestAnimationFrame` itself. A subscriber returns `false` when it has settled, and when nobody needs frames the loop stops. An idle page then costs nothing, and the effects can't fight each other for frames. Glitch uses no frames at all: it is CSS keyframes toggled by an attribute.

3. **Animate only `transform`, `opacity` and `clip-path`.** These stay on the compositor. Nothing here changes size, position in flow, or font metrics, so layout shift is zero by construction. The scramble keeps the real text in place (transparent) and draws the glyphs in an overlay, so even a changing label never changes width.

4. **Match the effect to the input.** Tilt and the follow-spotlight only exist on `(hover: hover) and (pointer: fine)`. On touch, tilting under a finger reads as a bug, so touch gets a short fade at the tap point and a self-drifting shader lens instead.

5. **Leave React's DOM alone at rest.** The holo overlay `<span>` and the inline `transform` are added when a card engages and removed when it has settled back. At rest the DOM is exactly what React rendered, so re-renders, hydration and the card's own `:hover` styles keep working. Glitch layers and scramble spans are written in the markup (`<GlitchCopies>`, `<ScrambleText>`) rather than inserted around React-owned nodes at runtime; restructuring React's tree from outside breaks reconciliation.

6. **Keep text real.** Glitch copies are client-only and `aria-hidden`, so the static HTML, find-in-page and screen readers see each heading once. The scramble overlay is `aria-hidden` and the real label stays the accessible name throughout.

7. **Clean up, and survive StrictMode.** Every `setup*` returns a disposer that removes listeners, observers, overlays and inline styles. The shader frees its buffer and program but deliberately does not call `WEBGL_lose_context`, because React StrictMode mounts, unmounts and remounts on the same canvas, and a lost context stays lost.

8. **Budget the GPU.** The shader renders at reduced resolution under a pixel budget, draws only while visible, caps draws at ~80 per second on high-refresh screens, and steps quality down once if the page runs under ~38 fps. It refuses to start on a software fallback (`failIfMajorPerformanceCaveat`) and renders nothing rather than something slow.

## The effects

### Aurora hero shader (`aurora.ts`, `hero-shader.tsx`)

The shader is domain-warped value noise (fbm warped by fbm), drawn as a broad glow plus thin bright strands along the warped contours. The pointer acts as a lens: it magnifies and swirls the flow nearby. Entering the hero, clicking, or moving fast drops a soft ripple ring. Output is premultiplied alpha and faded out at every edge, so the page background and any fixed grid show through, and the hero blends into the next section instead of ending in a box.

Lifecycle: the canvas fades in over 1.8 s once its section is built. It renders only while the section is on screen (IntersectionObserver with an 80 px margin) and the tab is visible. If WebGL is missing it renders nothing.

Knobs:

- `palette`: `{ veil, primary, secondary, accent }` as hex. The palette is compiled into the shader, so changes need a remount.
- `intensity`: multiplies the light. 0.6 is calm, 1.4 is loud.
- Text readability: the shader biases light away from the lower left, where hero text usually sits. If your text sits elsewhere, change the `bias` line (see the reference).

Read `references/aurora-shader.md` before changing the shader math, the speed, or the quality scaler.

### Hologram cards (`holo.ts`)

Delegated `pointerover` finds the card under a fine pointer. On engage, it measures the card's untransformed box, injects one `aria-hidden` overlay span, and runs a critically damped spring (sub-stepped at 120 Hz so it behaves the same at 60 or 144 fps) toward a tilt aimed at the pointer. The edge under the cursor comes toward the viewer. On leave it springs back with a soft overshoot and removes everything once it has settled.

- Tilt scales with card size, 2.5° to 7.5°: big cards tilt less so their far edges don't swing. Perspective is 1.6× the larger side. The lift is 3 px.
- The overlay has a radial glare at the pointer, a faint diagonal color wash, and a conic-gradient ring masked to the border (dim all around, bright near the pointer).
- On an `overflow: hidden` card the 1 px border box is clipped, so the ring is drawn just inside (`.fx-holo--in`, detected automatically).
- The overlay sits at `z-index: 3` with `pointer-events: none`, so it paints over controls inside the card (a video toggle, a link) without blocking clicks.
- A static-position card gets `position: relative` only while active.
- Opt-out: `data-holo="off"` on a card or any ancestor. Pause all tilting with `html[data-fx-freeze]` while something reads real rects (an inspector, a screenshot pass). The living-ui-swarm inspect toggle is detected automatically.

### Grid spotlight (`spotlight.ts`, `div.fx-spot`)

A 560 px fixed window, radially masked, holds a brighter copy of the base grid. Each frame moves only two transforms: the window follows the cursor, and the grid inside is shifted back by `floor(x / cell) * cell - x` so its lines land exactly on the base grid's lattice. Both grids must be anchored at the viewport origin, and `.fx-grid::before` is. The trailing lerp settles and the loop sleeps when the cursor stops. It hides on window blur or when the pointer leaves the window. Touch gets a 360 ms fade at the tap point.

Grid cell, fine-line spacing and window size come from `--fx-grid-cell`, `--fx-grid-fine` and `--fx-spot-size` (px values), so CSS stays the single source of truth.

### Glitch headings (`glitch.ts`, `<GlitchHeading>` / `<GlitchCopies>`)

Markup: a `.fx-glitch[data-fx-glitch]` wrapper holding the real heading (`.fx-glitch__base`) and two client-only copies. `GlitchHeading` writes all of it; use `GlitchCopies` directly when the heading already exists and carries other attributes.

- **Entrance:** 560 ms when a built heading is at least 50% in view. The same heading won't replay within 2.5 s.
- **Micro-glitch:** 260 ms on one random visible heading every 8–14 s.
- The randomness is seeded, so the rhythm is the same on every visit and in tests.
- Only one heading glitches at a time; entrances queue behind each other.
- Implemented as pure CSS keyframes switched by `[data-glitch]`: slice with `clip-path: inset()`, offset with `translate3d`, and split color with `text-shadow`.
- `--fx-gi` scales the offsets per run.

### Scramble text (`scramble.ts`, `<ScrambleText>`)

Wrap only the label, never the icon: `<a><Icon/> <ScrambleText>{label}</ScrambleText></a>`.

- **Triggers:** hover (not touch) or keyboard `:focus-visible` on the enclosing `a`, `button` or `[data-fx-scr-host]`.
- **Duration:** 360–520 ms, depending on length.
- **Resolve:** characters resolve left to right with a little jitter. The unresolved tail redraws at ~18 Hz rather than every frame, so it reads as decoding, not noise.
- **Glyph pools:** case-matched, and punctuation like `@ . / : -` stays put so emails and paths remain readable mid-scramble.
- **Cleanup:** the overlay is always emptied, including a timer fallback for background tabs where rAF stops.

Use `inline` for plain inline links (keeps the underline). Use `quiet` on filled buttons, together with `--fx-scr-tail: currentColor` on the button.

## Theming

| Variable | Used by | Default |
| --- | --- | --- |
| `--fx-accent` | glitch layer A, scramble glyphs, spotlight glow, holo shadow | `#5eead4` |
| `--fx-hot` | glitch layer B | `#f472b6` |
| `--fx-sheen-1..5` | holo ring, in order around the circle | teal, blue, violet, pink, amber |
| `--fx-grid-line`, `--fx-grid-fine-line` | base grid lines | low-alpha slate |
| `--fx-grid-cell`, `--fx-grid-fine` | grid spacing (px) | `96px`, `24px` |
| `--fx-spot-size` | spotlight window (px) | `560px` |
| `--fx-mono` | scramble glyph font | system mono |
| `--fx-scr-tail` | per-element glyph color override | unset |

Colors mix through `color-mix(in srgb, …)`, supported in all current browsers. The shader takes its own palette: `<HeroShader palette={{ accent: "#22d3ee", secondary: "#f0abfc" }} intensity={0.8} />`.

Pick shader colors from the same family as the page accent. The shader is a mood, not a second brand color; if a first-time viewer notices the shader before the headline, it is too loud.

## Layering

| Layer | z-index | Notes |
| --- | --- | --- |
| Base grid (`.fx-grid::before`, fixed) | 0 | Anchored at the viewport origin |
| Spotlight (`div.fx-spot`, fixed) | 0 | After the grid in tree order, so it paints above it |
| Content (`main`, footer) | 1 | Must be positioned with `z-index: 1` |
| Hero shader (`canvas.fx-shader`) | auto | Absolute inside the hero, first child, so later content paints over it |
| Holo overlay | 3 inside its card | `pointer-events: none` |
| Fixed header, any build-animation overlay canvas | above content | Unaffected |

If the spotlight shows above your text, the content wrapper is missing `position: relative; z-index: 1`.

## Motion preferences

On lamanhtruong.com the owner chose to play every effect for everyone, including visitors with `prefers-reduced-motion`, because the motion is the point of the portfolio. That is a legitimate product decision, but make it on purpose. To respect the setting instead:

- `<FxRoot motion="respect-reduced" />` turns off tilt, spotlight, glitch and scramble for those visitors.
- `<HeroShader motion="respect-reduced" />` renders nothing for them.
- A middle ground: keep the shader (slow, ambient, no flashing) and drop glitch, which is the one effect with rapid flashes.

The glitch stays far below seizure thresholds (one 560 ms burst on entry, then 260 ms every 8 s or more, never full-screen). Keep it that way if you retune it.

## With living-ui-swarm or another intro

With the `living-ui-swarm` build engine, everything above works as-is: the engine sets `html[data-build="on"]` and `[data-built]`, the effects wait, and a "replay build" tears them down instantly and brings them back afterwards. Glitch headings wait for their closest build item, so `data-build-item` may sit on the `<h2>` itself (`<GlitchHeading headingProps={{ "data-build-item": "", ... }}>`) or on the `[data-fx-glitch]` wrapper. Theme card rules that transition `transform` (`.card { transition: transform 200ms }`) are overridden on hovered holo cards, so the spring isn't fought by a CSS transition.

With a different intro (GSAP reveal, View Transitions, a loader), set `data-build="on"` on `<html>` while it runs and either add `data-built` to each section when it lands or remove `data-build` at the end.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Checks fail: shader draws ~1 frame/s, nothing tilts smoothly | The test browser is a throttled window (an agent's MCP browser can be) | Launch headless Playwright (`channel: "chrome"`), and measure rAF first (50+/s expected) |
| Spotlight shows grid lines where the base grid has faded out | The base grid is masked toward the edges, the spotlight grid isn't | Lower `--fx-spot-size` or the spotlight line alpha, or drop the edge mask on the base grid |
| Shader never appears | WebGL unavailable or software-only (headless CI, remote desktop) | Expected: it opts out. Test on a GPU machine |
| Shader appears only after the hero animation | Gating works as designed | Without a build engine, check that `html` has no `data-build="on"` left over |
| Cards don't tilt | Touch device, a selector mismatch, card not built, or `data-fx-freeze` set | Check `matchMedia(FINE_POINTER)`, the `holo` selector, `[data-built]` |
| Tilt jitters or lags | A CSS `transition: transform` on the card | `.fx-holo-host` removes it; check for a more specific rule |
| Spotlight grid misaligned | Base grid not fixed at the viewport origin, or cell sizes differ | Use `.fx-grid` or match `--fx-grid-cell` |
| Spotlight covers text | Content not lifted | `position: relative; z-index: 1` on the content wrapper |
| Glitch copies wrap differently | Copies lack the heading's typography classes | Pass the same `className` to `GlitchCopies` |
| Scramble shifts width | Wrapping the icon, or overriding `.fx-scr` display | Wrap the label only |

## Verify before shipping

`references/verification.md` has headless Playwright snippets for:

- the shader drawing on screen and stopping off screen (counted via `drawArrays`);
- tilt applying on hover and fully clearing after leave;
- zero layout shift and stable rects during a glitch;
- scramble restoring the exact text, width and accessible name.

Run them at 1440×900 and at 390×844 (touch emulation) at minimum.

A real-browser caveat: a background or unfocused tab throttles rAF, and some machines report reduced motion. Judge smoothness in a focused foreground tab or in headless Chromium, not in a throttled window.

## Worked example

The portfolio these were extracted from (pinned commit):

- Effects: [`_sections/fx/`](https://github.com/anhlamtruong/portfolio-anh/tree/a5d165123922ea5c7fd645c4d0701554b1e4df8f/src/app/%28homepage%29/_sections/fx)
- Mounting `FxRoot`: [`page.tsx`](https://github.com/anhlamtruong/portfolio-anh/blob/a5d165123922ea5c7fd645c4d0701554b1e4df8f/src/app/%28homepage%29/page.tsx)
- `HeroShader` placement: [`hero.tsx`](https://github.com/anhlamtruong/portfolio-anh/blob/a5d165123922ea5c7fd645c4d0701554b1e4df8f/src/app/%28homepage%29/_sections/hero.tsx)
- Glitch wrapper inside a build-engine heading: [`shared.tsx`](https://github.com/anhlamtruong/portfolio-anh/blob/a5d165123922ea5c7fd645c4d0701554b1e4df8f/src/app/%28homepage%29/_sections/shared.tsx)
- Scramble in nav and buttons: [`site-header.tsx`](https://github.com/anhlamtruong/portfolio-anh/blob/a5d165123922ea5c7fd645c4d0701554b1e4df8f/src/app/%28homepage%29/_sections/site-header.tsx), [`contact.tsx`](https://github.com/anhlamtruong/portfolio-anh/blob/a5d165123922ea5c7fd645c4d0701554b1e4df8f/src/app/%28homepage%29/_sections/contact.tsx)

The portfolio hard-codes its theme's `.bp-card` as the card selector (in the template that is `holo={{ selector: ".bp-card" }}`), and its grid is the theme's own fixed `::before` layer instead of `.fx-grid`.

## References

- `references/aurora-shader.md`: shader math, every tunable constant, the quality scaler, context loss, debugging.
- `references/gating-and-performance.md`: the readiness contract, the ticker, per-effect cost, measured budgets.
- `references/pointer-and-type-effects.md`: holo spring and overlay math, spotlight alignment, glitch keyframe design, scramble timing.
- `references/verification.md`: Playwright checks and what "done" means.
