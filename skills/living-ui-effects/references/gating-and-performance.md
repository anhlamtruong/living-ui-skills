# Gating and performance

Why the effects wait, how they share one frame loop, and what each one costs. Read this when adding a new effect, combining these with another animation system, or chasing a frame drop.

## 1. The readiness contract

Effects transform, overlay and re-color elements. Doing that while another script is still revealing or measuring the same element is the main source of jank on animated pages. The intro reads a tilted rect, a cursor lands in the wrong place, and an item pops. So every effect asks one question first: is this element finished?

`built.ts` answers it with four attributes:

| Attribute | Set by | Meaning |
| --- | --- | --- |
| `html[data-build="on"]` | the intro/build system | an intro is running; gate everything |
| `[data-build-section]` | your markup | a region revealed as a unit |
| `[data-build-item]` | your markup | one element revealed on its own |
| `[data-built]` | the intro/build system | this item or section is finished |

```ts
isBuilt(el) === !buildActive() || (item(el) is built && section(el) is built)
```

- **No intro at all:** `data-build` is never set, so `isBuilt` is always true and the effects start on mount.
- **living-ui-swarm:** the engine writes all four attributes; nothing to do.
- **Your own intro:** set `data-build="on"` on `<html>` before the first paint (an inline head script avoids a flash), add `data-built` to each section when its reveal finishes, and remove `data-build` once everything is done. A sloppy but working minimum is just "set `data-build=on` at start, remove it at the end".

How each effect consumes it:

- **Shader:** watches its section with a `MutationObserver` (`attributeFilter: ["data-built"]`) and `<html>` (`["data-build"]`). It fades in when the section is ready and stops if the section is un-built again, e.g. by a replay button.
- **Holo:** checks `isBuilt` on engage, and every frame for active cards. A card that becomes un-built mid-tilt is finalized at once, with its overlay removed and its transform cleared.
- **Glitch:** the same observers as the shader. A heading that becomes un-built has its queued glitch cancelled and any running one stopped.
- **Scramble:** checks `isBuilt` when a hover starts. Scrambles are short enough that mid-run changes don't matter.
- **Spotlight:** not gated. It decorates the background grid, which no intro measures.

### Freezing for measurement

Anything that reads real element rects (an inspector overlay, a screenshot or visual-diff pass, a layout test) should set `html[data-fx-freeze]` while it runs; holo stops engaging new cards. `frozen()` also recognizes the living-ui-swarm HUD's pressed inspect button. If you build a different inspector, set the attribute instead of adding selectors.

## 2. One ticker

`ticker.ts` is about 50 lines and worth understanding before adding an effect:

```ts
wake(fn)   // subscribe; starts the rAF loop if it was idle
sleep(fn)  // unsubscribe; stops the loop if nobody is left
fn(now, dt) => boolean   // return false when settled -> auto-unsubscribed
```

Why one loop:

- **Ordering:** all effects read state and write styles in the same frame, in a stable order, with no interleaved rAF callbacks forcing extra style recalcs.
- **Idle cost is zero:** each subscriber returns `false` when it has settled (holo springs at rest, spotlight caught up, scramble finished), and when the set is empty the loop cancels itself. A page where the pointer is still costs no frames.
- **Stable dt:** `dt` is clamped to 1/20 s. After a background tab, a long task or a breakpoint, springs and lerps take one normal step instead of exploding.
- **Error isolation:** an exception in one subscriber is caught (and logged in development), and that subscriber is dropped. The others keep running.

Use `ease(dt, rate)` for frame-rate-independent smoothing: `x += (target - x) * ease(dt, 12)` behaves the same at 60 and 144 Hz. Never use a fixed `* 0.1` per frame; it runs 2.4 times faster on a 144 Hz screen.

If the page also runs GSAP or another engine with its own loop, that is fine. Keep the effects on this ticker anyway, so they can sleep independently.

## 3. What each effect costs

| Effect | Per-frame work while active | When it runs | Idle cost |
| --- | --- | --- | --- |
| Shader | 1 draw call; JS state update | hero on screen, tab visible, section built | 0 (no frames) |
| Holo | spring math + 1 transform + 1 style string per moving card | while a card is hovered and moving, or springing back | 0 |
| Spotlight | 2 transforms | while the cursor moves and briefly after (trailing lerp) | 0 |
| Glitch | none (CSS keyframes) | 560 ms on entry, 260 ms micro every 8–14 s | one timer |
| Scramble | text of 2 spans, at most ~18 Hz | 360–520 ms per hover | 0 |

Things that keep it this cheap:

- **Writes are diffed.** Holo builds its `transform` and overlay style strings and writes them only when they differ from the last frame. The spotlight rounds positions to whole pixels and skips identical writes.
- **No reads after writes in a frame.** Holo measures a card's untransformed box on engage and at most every 1.5 s while hovered (and on resize), never per frame. It reads with `transform: none` set inline for the measurement, so the tilt doesn't distort it.
- **Delegated listeners.** One `pointerover`/`pointermove` on `document` serves every card and link; nothing attaches per element, so adding cards adds no listeners.
- **Passive listeners** everywhere, so scrolling never waits on effect code.
- **Overlays exist only while active.** At rest there are no extra DOM nodes, so memory and style recalc stay flat.
- **Containment on the spotlight.** `contain: strict` plus `will-change: transform` keeps the 560 px window its own compositor layer, which moving never repaints.

## 4. Living with other heavy things

The portfolio runs all four effects plus a canvas build animation, seven looping videos, smooth scrolling and parallax on one page. The rules that let them coexist:

- **Never stack GPU-heavy things in view at once.** The shader is limited to the hero, and videos pause when off screen. Neither competes with the build animation, because the shader waits for its section.
- **Keep everything pointer-driven asleep without a pointer.** On phones only the shader (drifting, under the smaller touch budget) and glitch (timed CSS) are active. Still test on a real mid-range phone before shipping; desktop headroom hides problems.
- **Keep layout shift at 0.** Every effect is overlay-, transform- or clip-based, so Cumulative Layout Shift from effects is exactly zero.

## 5. Adding a new effect

1. Put its styles in `fx.css` under a new numbered section; read theme colors from `--fx-*` variables.
2. Export `setupX(): () => void` that attaches delegated listeners and returns a disposer.
3. Gate element work with `isBuilt(el)`, and pointer work with `matchMedia(FINE_POINTER)` (listen for `change` so attaching a mouse to a tablet works).
4. Animate through `wake(frame)`; return `false` from `frame` as soon as it has settled.
5. Touch only `transform`, `opacity`, `clip-path` or an overlay you inject and remove.
6. Register it in `FxRoot` behind a boolean prop, and add a Playwright check to `verification.md`.

## 6. Diagnosing a frame drop

1. Record a Performance trace in a **focused foreground** tab. Background tabs throttle rAF and make everything look broken.
2. Check "Animation frame fired" entries. With the pointer still and the hero off screen there should be none from the effects.
3. Long "Recalculate style" while hovering a card: look for a CSS rule with `transition: all` on the card, or a parent whose styles change on hover.
4. GPU-bound frames with the hero on screen: lower the shader budget or quality, or check that two canvases are not stacked (a build-animation overlay plus the shader is fine; a second full-screen shader is not).
5. Layout shift: run the CLS check in `verification.md`. Effects should contribute exactly zero; anything else is from content.
