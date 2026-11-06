# Verifying website video before shipping

Three layers: the clip itself, the page in a headless browser, and real devices. The first two are automated; the third is the one people skip and then regret.

## 1. The clip

| check | how | pass |
| --- | --- | --- |
| Composition is valid | `npx hyperframes check --json` | `ok: true`, no errors |
| Frames look right | `npx hyperframes snapshot --at ...`, then look at the PNGs at play scale | readable, on-brand, corners free |
| Frame 0 is a good poster | `snapshot --at 0` | complete, not an empty build-up |
| Loop is seamless | `node scripts/loop-seam.mjs <delivery render>` | "seamless", exit 0 |
| Size is in budget | `node scripts/encode.mjs ...` prints sizes | within DESIGN.md budgets, WebM ≤ MP4 |

`loop-seam.mjs` samples one-frame steps across the clip (every 5 frames by default) and compares the last→0 jump with the biggest of them. On the seven worked-example clips the seam measured 0.3–1.2× the biggest step. Clips cut short to fake a jump measured 1.6–4.5×. The default threshold is 1.25×. Run it on the near-lossless delivery render: in a high-CRF web encode, keyframe noise can outweigh a few pixels of motion.

## 2. The page, in a headless browser

```bash
npm i -D playwright && npx playwright install chromium
node scripts/check-videos.mjs http://localhost:3000/
# or reuse an installed browser with playwright-core:
node scripts/check-videos.mjs https://preview-url.example --channel chrome
```

| check | what it catches |
| --- | --- |
| Server HTML: every `<video>` has `preload="none"`, none has `autoplay` | a clip downloading during page load |
| Every clip reaches `readyState` 4 within `--settle` ms (default 12 s) of `load` | a broken idle warm-up, a 404, a codec the browser can't play |
| At each scroll stop, no clip plays more than `--margin` px (default 300) outside the viewport | off-screen decode work |
| At each scroll stop, every clip that is >50% visible is playing (unless its pause toggle is pressed) | an observer that never fires, a refused `play()` |
| At 390×844 (mobile, touch), `scrollWidth` ≤ 390 | a band or card that overflows sideways |

The phone check compares against the device width (390), not `window.innerWidth`, because mobile browsers widen the layout viewport to fit oversized content, which hides the overflow.

It scrolls with the mouse wheel and waits 800 ms per stop, so smooth-scroll libraries (Lenis and similar) settle before it measures. It exits 1 and lists the problems if anything fails.

Tested against the worked example's production site (all checks pass) and against a deliberately bad page with an `autoplay` + `preload="auto"` clip, a never-loading clip and a 600 px element. All five problems were reported.

### Inside an agent's Playwright browser tool

If you drive the browser through an MCP tool rather than a script, the same checks fit in one `run_code` call. These checks only read element state, so they hold even if that browser is a throttled window. Timing-sensitive checks (effects, frame rates) need a headless browser you launch yourself:

```js
async (page) => {
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForTimeout(10000); // let the idle warm-up run
  return page.evaluate(() =>
    [...document.querySelectorAll("video")].map((v) => ({
      src: v.currentSrc.split("/").pop(),
      ready: v.readyState,
      playing: !v.paused,
      top: Math.round(v.getBoundingClientRect().top),
    })),
  );
};
```

Then scroll with `page.mouse.wheel` and repeat the evaluate at a few stops, and take screenshots of the hero, a band and a card. Screenshots catch what numbers can't: a poster that's the wrong frame, a toggle covering content, a band that looks like a black bar.

Watch for throttled browsers. A desktop Chrome tab that isn't in the foreground, or a hidden preview pane, may run animation frames at 1–2 fps or not at all, and some report `prefers-reduced-motion: reduce`. Headless Playwright doesn't have that problem. Don't conclude a loop is janky from a throttled tab.

## 3. Real devices

Headless Chromium can't tell you about:

- **iOS Safari:** autoplay refused in Low Power Mode (the poster should look finished), MP4 fallback actually used, `playsinline` respected.
- **Frame rate on a mid-range phone** with everything else on the page running (entrance animations, WebGL, parallax). Clips are cheap to decode, but stacking effects isn't.
- **Data saver on:** the warm-up should not run, and clips should load only when scrolled to.

Ask the site owner to open the preview on their phone and say which section feels heavy, then fix that section rather than guessing.
