# Aurora shader: how it works and how to tune it

`assets/fx/aurora.ts` is a single WebGL1 program drawn on one full-screen triangle. This file explains the math, every constant worth touching, and the cost controls. Read it before changing anything in the shader.

## Contents

1. Pipeline at a glance
2. The fragment shader, top to bottom
3. Animation: what moves and how fast
4. Pointer: lens and ripples
5. Cost controls
6. Lifecycle, context loss, StrictMode
7. Tuning recipes
8. Debugging

## 1. Pipeline at a glance

```
pointer + time (JS, double precision)
  └─ uniforms: u_o1..u_o3 (warp offsets), u_lens, u_ripple, u_seed, u_res
       └─ fragment shader: lens -> ripple -> fbm warp -> glow + strands -> palette -> edge mask -> premultiplied out
            └─ canvas (CSS opacity fades it in) composited over the page
```

Everything time-based is computed on the CPU in double precision and passed as small bounded offsets. Passing raw time into `sin()` inside the shader loses precision after a few hours on mobile GPUs (`mediump`) and the field starts to stutter; bounded offsets avoid that.

## 2. The fragment shader, top to bottom

- **Coordinates.** `uv` is 0..1 across the canvas. `p` is height-normalized (`x` runs 0..aspect), so the pattern keeps its proportions on wide and tall heroes.
- **Lens.** `lens = u_lens.z * exp(-|p - center|^2 / 0.05)` is a Gaussian bump; it is at half strength about 0.19 of the hero height from the center. Inside it, `p` is pulled toward the center (magnify, factor `0.42`) and rotated by `lens * 0.8` radians (swirl). `0.05` sets the lens radius.
- **Ripple.** A ring at radius `u_ripple.z` pushes `p` outward along the radial direction, with thickness set by the `10.0` multiplier and strength `u_ripple.w * 0.03`.
- **Warp.** `n = p * 1.85` sets the feature size; raise it for smaller, busier detail. `q` is two 3-octave fbm samples, and `f = fbm4(n + 2.3 * q + u_o3)` is the warped field. `2.3` is the warp strength: lower is calmer and more cloud-like, higher is more liquid and marbled.
- **Light.**
  - `glow = smoothstep(0.38, 0.92, f)`: broad soft areas. Narrow the range for punchier blobs.
  - `strand = pow(|cos((f * 3.4 + q.x * 0.9) * pi)|, 22) * smoothstep(0.32, 0.72, f)`: thin bright filaments along contour lines of the warped field. The exponent `22` sets thinness; `3.4` sets how many contour lines.
- **Palette.** `hue` mixes `primary -> secondary` by `q.y`, then toward `accent` by a blend of `q.x` and `f`. `light = (hue * (glow^2 * 0.2 + strand * 0.15) + accent * lens * 0.045) * intensity`. The `0.2` and `0.15` weights are the main brightness controls; `intensity` multiplies both.
- **Edge mask.** `ex`/`ey` fade to zero over the outer 14–16% at the sides, 24% at the bottom and 18% at the top, so the hero dissolves into the page.
- **Bias.** `mix(0.5, 1.0, smoothstep(0.2, 0.95, uv.x * 0.7 + uv.y * 0.45))` halves the light in the lower left, where hero copy usually sits. Flip the sign of a term to move the calm corner; delete the line for even light.
- **Veil.** A faint `veil * 0.2 * mask` tint gives the area a slight color even where there is no light, so the hero reads as a lit space rather than a hole.
- **Output.** Alpha is the brightest channel (at least the veil). Color is clamped to alpha, which is correct premultiplied output, so dark areas are transparent, not black. A one-step dither (`hash(gl_FragCoord + u_seed) / 255`) prevents banding in the dark gradients.

## 3. Animation: what moves and how fast

`t` advances by real `dt` (seconds) and starts at 37 so the first frame is already mid-flow. The three offsets:

| Uniform | Formula | Period |
| --- | --- | --- |
| `u_o1` | `(cos(t * 0.021), sin(t * 0.019)) * 2.3` | about 5 min |
| `u_o2` | `(sin(t * 0.016 + 1.3), cos(t * 0.02 + 0.4)) * 2.9` | about 5–6.5 min |
| `u_o3` | `(cos(t * 0.012 + 2.1), sin(t * 0.015 + 0.7)) * 3.3` | about 7–9 min |

Incommensurate frequencies mean the pattern never visibly repeats. To speed everything up, multiply the frequencies (not `dt`) by the same factor; 1.5× is lively and 3× starts to feel nervous. Keep the amplitudes: they set how far the field travels, not how fast.

## 4. Pointer: lens and ripples

- Positions come from window-level `pointermove`/`pointerdown`, so the lens works even when content sits above the canvas (the canvas itself is `pointer-events: none`).
- **Mouse over the hero.** The lens follows the pointer (`ease(dt, 4.5)`, about 220 ms to catch up) at full strength. It grows in at rate 2.4 and shrinks out at 1.2, so leaving feels softer than arriving.
- **No mouse over the hero.** The lens drifts on two slow sines at strength 0.28, so the hero keeps breathing on its own (and on touch devices).
- **Touch.** A tap moves the lens there for 1.6 s and drops a ripple.
- **Ripples.** One fires when the mouse enters the hero, on any click or tap inside it, and on a fast move (above 1400 px/s, at most every 1.5 s). The ring expands at 0.42 height-units per second and fades with `exp(-age * 1.3)`, gone after 4 s.

## 5. Cost controls

| Control | Value | Why |
| --- | --- | --- |
| Resolution | `min(0.5 * dpr, sqrt(budget / cssArea)) * quality` | The field is soft; half resolution is invisible after CSS upscaling and costs a quarter of the fill |
| DPR cap | 1.5 | 3× phones would otherwise render 9× the pixels for no visible gain |
| Pixel budget | 380k (fine pointer), 170k (touch) | Caps the cost on very large heroes and on phones |
| Draw cap | at most one draw per 12 ms | 120–240 Hz screens would otherwise draw 2–4× as often; state still updates every frame |
| Quality step | after 150 frames, if the average frame is over 1/38 s, quality becomes 0.72 (about half the pixels) | Rescues weak GPUs without flicker; happens once |
| Visibility | IntersectionObserver (80 px margin) + `visibilitychange` | No frames at all once the hero has scrolled away |
| Readiness | waits for the section's `[data-built]` when a build engine runs | Never competes with an intro animation for the GPU |
| Context flags | `antialias: false, depth: false, stencil: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: true` | Cheapest possible context; refuse a software renderer instead of running at 5 fps |

To see the real cost on your page, record a Performance trace with the hero on screen and look at the GPU track; then scroll away and confirm the draws stop (see `verification.md`).

## 6. Lifecycle, context loss, StrictMode

- `createAurora(canvas, scope, options)` returns `null` when no context or no program could be made. `HeroShader` then renders nothing, which is the right fallback: the hero still has its normal background.
- The canvas gets `data-on` when its scope is ready; CSS fades opacity 0 → 1 over 1.8 s. If a build replay removes `[data-built]` from the scope, `data-on` goes away and the shader stops.
- `webglcontextlost` is `preventDefault`ed (that is required to get a `restored` event) and rendering stops; `webglcontextrestored` rebuilds the program and resumes.
- `destroy()` deletes the buffer and program but does not call `WEBGL_lose_context.loseContext()`. React StrictMode mounts, cleans up and mounts again on the same canvas element in development, and a context you lost on purpose is gone for good on that canvas.

## 7. Tuning recipes

- **Calmer, more ambient:** `intensity={0.7}`, warp `2.3 -> 1.6`, strand exponent `22 -> 30`.
- **More liquid:** warp `2.3 -> 3.0`, `n = p * 1.85 -> p * 1.4`.
- **Neon strands:** strand weight `0.15 -> 0.28`, glow weight `0.2 -> 0.12`.
- **Warm palette:** `palette={{ veil: "#140806", primary: "#fb923c", secondary: "#f472b6", accent: "#fde68a" }}`.
- **Light page background:** this shader is additive light on dark. On a light page, switch output to a darkening blend or render ink-colored strands at low alpha; the premultiplied light approach will look washed out.
- **Hero text over a bright area:** move the calm corner (bias line) or lower `glow` weight. Do not add a dark overlay div; it costs a layer and dulls the whole effect.

## 8. Debugging

- **Nothing renders.** Check `canvas.getContext("webgl")` in the console. Headless Chromium without a GPU often only has SwiftShader, which `failIfMajorPerformanceCaveat` rejects by design. Then check that the canvas has `data-on` (the readiness gate) and a non-zero size (its parent must be `position: relative` with a height).
- **Compile errors.** `compile()` returns `null` silently. Temporarily log `gl.getShaderInfoLog(sh)` there while editing the GLSL.
- **Banding in dark areas.** Keep the dither line; check that nothing applies a CSS `filter` to the canvas.
- **It looks blocky.** Your hero is huge and the budget kicked in, or quality stepped down. Raise `budget` for fine pointers if your GPU headroom allows.
- **Frame drops elsewhere on the page.** Count draws with the Playwright snippet in `verification.md` and confirm they stop off screen. If they don't stop, the IntersectionObserver target is wrong (the canvas must be inside the hero, not fixed).
