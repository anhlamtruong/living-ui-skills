# Pointer and type effects: the details

The numbers and mechanisms behind hologram cards, the grid spotlight, glitch headings and scramble text. Read the section for the effect you are changing.

## Contents

1. Hologram cards
2. Grid spotlight
3. Glitch headings
4. Scramble text

## 1. Hologram cards (`holo.ts`)

### Engage and release

- One delegated `pointerover` on `document` finds `target.closest(selector)` inside `within` (default `[data-holo]` inside `main`), skipping `[data-holo="off"]` subtrees and touch pointers.
- **Engage** (`isBuilt(card) && !frozen()`):
  - measure the untransformed box;
  - create the overlay span, adding `.fx-holo--in` if the card clips overflow;
  - add `.fx-holo-host`, and `.fx-holo-pos` if the card was `position: static`;
  - start the glare at the pointer, not at the center, so it doesn't sweep in from the middle.
- **Release:** on `pointerover` of another element, `pointerout` to outside the window, window `blur`, or when the page scrolls the card out from under a still pointer (checked every frame against the cached box).
- **Retry:** if the card wasn't ready (still building, or frozen), `pointermove` re-checks every 250 ms. A card that finishes building under the cursor starts tilting without another hover.

### Measuring without fighting the tilt

`measure()` sets `transform: none` inline, reads `getBoundingClientRect()`, then restores the previous transform. The inline `none` also beats any `:hover { transform }` in your CSS, so the box is the real layout box. The result is cached in document coordinates (`rect + scroll`). That keeps it valid while scrolling without re-measuring, and it is refreshed on engage (if older than 400 ms), every 1.5 s while hovered, and on resize.

### Tilt math

```
nx, ny  = pointer position inside the card, 0..1
maxY    = clamp(7 * 520 / width,  2.5, 7.5)   deg   // wide cards tilt less around Y
maxX    = clamp(7 * 420 / height, 2.5, 7.5)   deg   // tall cards tilt less around X
rotateY = -(nx - 0.5) * 2 * maxY
rotateX =  (ny - 0.5) * 2 * maxX
lift    = 3 px (translateY -3px)
persp   = max(800, 1.6 * max(width, height)) px
transform = perspective(persp) translate3d(0, -lift, 0) rotateX(rx) rotateY(ry)
```

A 520 px wide card gets up to 7°, and a 1040 px wide card up to 3.5°. The far edge of a big card moves about as many pixels as a small card's edge does. Perspective scales with the card for the same reason: a fixed 800 px perspective on a 1200 px card distorts it like a fisheye.

### Spring

Each of `rx`, `ry` and `lift` is a damped spring, integrated in fixed 1/120 s substeps so it behaves identically at any refresh rate:

| Phase | Stiffness K | Damping ratio | Feel |
| --- | --- | --- | --- |
| hovered | 150 | 0.92 | follows smoothly, no wobble |
| released | 120 | 0.58 | springs back with a small, soft overshoot |

The glare position follows with `ease(dt, 14)`. The overlay opacity eases in at rate 9 and out at rate 5. A card counts as settled when every value is within a hair of its target and every velocity is near zero. A released, settled card is finalized: the overlay is removed, the inline transform is removed (`tidyStyle` drops an empty `style=""`), and the host classes are removed. A hovered card that has caught up returns `false` to the ticker and sleeps until the pointer moves again.

### Overlay layers (`span.fx-holo`)

All driven by three custom properties written each frame: `--fx-x`, `--fx-y` (glare position) and `--fx-a` (angle from center to glare, in degrees).

1. **Glare:** `radial-gradient(circle at x y, white 10% → 3.5% → transparent 58%)`.
2. **Wash:** a diagonal `linear-gradient` at `angle + 120deg` with three faint sheen colors (4–5% mix). It shifts hue as the pointer circles the card.
3. **Ring (faint, whole border):** `::before`, a `conic-gradient` of the five sheen colors starting at `--fx-a` from the pointer position. It is cut to a 1 px border with the two-layer `mask` + `mask-composite: exclude` trick, at 0.38 opacity.
4. **Ring (bright, near pointer):** `::after`, the same conic ring at 1.5 px, further masked by a 190 px radial around the pointer (`mask-composite: intersect, exclude`).

`inset: -1px` puts the ring exactly on the card's own 1 px border. On an `overflow: hidden` card that border box is clipped, so `.fx-holo--in` uses `inset: 0` and the ring sits 1 px inside. The overlay is `z-index: 3; pointer-events: none`: it paints over controls inside the card but never takes their clicks.

## 2. Grid spotlight (`spotlight.ts`)

### Alignment

The base grid is a fixed layer with `background-position: 0 0`, so its lines sit at multiples of the cell size in viewport coordinates. The spotlight window moves to the pointer; the grid inside it must be shifted back so it shows the same lattice:

```
wx = round(pointerX) - size / 2            // window's left edge (viewport px)
gx = floor(wx / cell) * cell - wx          // in (-cell, 0]
window.style.transform = translate3d(wx, wy, 0)
grid.style.transform   = translate3d(gx, gy, 0)
```

The inner grid element is `size + cell` square, so a shift of up to one cell never exposes an edge. Fine lines (24 px) stay aligned because the cell (96 px) is a multiple of them. Keep that true if you change `--fx-grid-cell` / `--fx-grid-fine`.

### Motion and visibility

- **Mouse/pen:** the target updates on `pointermove`, and the window follows with `ease(dt, 16)`, a slight trail that reads as weight. On first appearance it jumps to the pointer instead of gliding in from its last position. The loop sleeps when within 0.3 px.
- **Hiding:** on window `blur` and when the pointer leaves the window, the window fades out over 420 ms; `visibility` is delayed so the fade completes.
- **Touch:** on `pointerup`, a fade at the tap point at 0.7 opacity, hidden after 360 ms. There is no follow, because a finger hides the spot anyway and dragging scrolls the page.

## 3. Glitch headings (`glitch.ts` + CSS)

### Structure

```html
<div class="fx-glitch" data-fx-glitch>          <!-- position: relative; gets [data-glitch] -->
  <h2 class="fx-glitch__base …">Title</h2>       <!-- the real heading -->
  <span class="fx-glitch__copy fx-glitch__copy--a …" aria-hidden>Title</span>  <!-- client-only -->
  <span class="fx-glitch__copy fx-glitch__copy--b …" aria-hidden>Title</span>
</div>
```

- **Copies:** `position: absolute; inset: 0`, the same typography classes as the heading (so they wrap identically), `visibility: hidden` at rest, and `mix-blend-mode: screen`. Screen blending means overlapping colors brighten toward white instead of covering the real text.
- **Coloring:** each copy is recolored with `color: var(--fx-gc) !important` on itself and its children, so serif or accent spans inside the title take the glitch color too.

### Keyframes

- **Timing:** every glitch keyframe uses `animation-timing-function: steps(1, end)`. Values jump between keyframes instead of tweening, which is what makes it read as a digital glitch instead of a wobble.
- **Entrance (`in`, 560 ms):**
  - the base heading jitters (`translate3d` ±1–3 px, one `skewX`), briefly clips its lower half, and carries a two-color `text-shadow` split;
  - copy A (accent) and copy B (hot) flash through 7 horizontal `clip-path: inset()` slices at different heights, offset ±3–8 px;
  - both then fade to 0 over the last quarter and end hidden.
- **Micro (`m1`/`m2`, 260 ms):** a smaller base jitter plus 3 slices; `m1` and `m2` swap which copy takes which slice pattern, for variety.
- **Scale:** `--fx-gi` scales every offset. The entrance uses 1, and micro-glitches use a seeded 0.55–0.9.

Only `transform`, `clip-path`, `opacity`, `visibility` and `text-shadow` change, so there is no layout shift. `text-shadow` repaints the heading's own layer for those frames, which is fine for a sub-second burst.

### Scheduler

- **Entrance:** fires when a built heading is at least 50% visible, unless the same heading played within the last 2.5 s.
- **One at a time:** a shared `busyUntil` reserves time slots, so entrances queue (waiting at least 140 ms, and 120 ms after the previous glitch ends). Scrolling past five headings quickly gives a short ripple of glitches, never five at once.
- **Micro:** every 8–14 s (seeded), one random heading that is visible, built, idle and quiet for more than 4 s plays a micro-glitch. If nothing qualifies, no timer is kept.
- **Hidden tab:** nothing plays, and anything running stops.
- **Seed:** the seed is fixed (`seeded(0x5eead4)`), so the sequence is the same per page load. Visual tests are reproducible, and the rhythm feels designed rather than random.

## 4. Scramble text (`scramble.ts` + `<ScrambleText>`)

### Markup and CSS

```html
<span class="fx-scr" data-fx-scr>                <!-- position: relative; inline-block -->
  <span class="fx-scr__txt">Read the case study</span>   <!-- real text, keeps the box -->
  <span class="fx-scr__fx" aria-hidden>          <!-- absolute overlay -->
    <span class="fx-scr__done"></span><span class="fx-scr__tail"></span>
  </span>
</span>
```

While running, the host gets `data-on`: the real text turns `color: transparent` (it still occupies its box and remains the accessible name), and the overlay becomes visible. The overlay is clipped sideways to the real text's width (`clip-path: inset(-0.5em 0 -0.5em 0)`) but not vertically, so descenders aren't cut. Mono glyphs in the tail can be wider than the real letters; the clip keeps them from spilling past the label.

### Timing

```
n        = number of characters
duration = clamp(300 + 14 * n, 360, 520) ms
resolveAt(i) = duration * (0.2 + 0.72 * (i + 1) / n) ± 4% jitter, kept monotonic, capped at 94%
```

- **Lead-in:** the first 20% is fully scrambled, then characters lock in left to right.
- **Glyph tail:** the unresolved tail redraws at most every 55 ms (about 18 Hz). Redrawing every frame looks like static; 18 Hz looks like decoding.
- **Glyph choice:** lowercase gets lowercase/digits/symbols, uppercase gets uppercase, and digits get digits. Spaces and `@ . / : - _ · ( )` pass through unchanged, so `name@domain.com` and `/links` keep their shape mid-scramble.
- **End:** the overlay is always emptied at the end. A `setTimeout(duration + 250)` fallback finishes it even when rAF stops in a background tab, and `visibilitychange` to hidden finishes all jobs immediately.

### Triggers

- The host is the closest `a`, `button` or `[data-fx-scr-host]` that contains a `[data-fx-scr]`. Every `ScrambleText` inside it runs together, e.g. a label plus a handle.
- `pointerover` from mouse or pen runs it once per entry. Moving between children of the same link doesn't restart it (the `relatedTarget` check).
- `focusin` runs it only when the host matches `:focus-visible` (keyboard focus). A mouse click that focuses a link doesn't scramble it a second time.
- Touch is ignored: a scramble under a finger that is about to navigate is noise.

### Pitfalls

- Wrap only the text node. Wrapping an icon puts it inside the transparent span, and it disappears during the scramble.
- `children` must be a plain string; the runner reads `textContent`.
- On a filled button where the accent equals the fill, set `--fx-scr-tail: currentColor` on the button and use `<ScrambleText quiet>`.
