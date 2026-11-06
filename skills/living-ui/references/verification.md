# Verifying a living page

Motion can't be checked by reading code. You have to run it, in a browser that actually runs it.

## Which browsers to trust

| Browser | Trust it for | Watch out |
| --- | --- | --- |
| Headless Playwright you launch (`playwright-core` + `channel: "chrome"`) | rAF timing, video playback, DOM state, screenshots | none worth noting; this is the main tool |
| An agent's Playwright MCP browser | DOM state, screenshots | can be a visible window throttled to ~2 rAF/s, so timing checks fail falsely |
| The user's own Chrome (via an extension) | real fonts, real GPU | may report `prefers-reduced-motion: reduce`; background tabs run at about 2 fps |
| An embedded preview pane | static layout only | may have no `requestAnimationFrame` when hidden |
| Real phones and Safari | final feel | ask the owner; you usually can't run them |

Always run the production build (`next build && next start`) for checks. Dev mode is slower and double-invokes effects under StrictMode.

Measure the frame rate before trusting any motion check. Expect 50 or more:

```js
() => new Promise((r) => { let n = 0; const t = performance.now();
  const f = () => (++n, performance.now() - t < 1000 ? requestAnimationFrame(f) : r(n));
  requestAnimationFrame(f); })
```

## Scrolling the page

Smooth-scroll libraries such as Lenis intercept `window.scrollTo`, so use the mouse wheel. Step slowly so each section has time to build:

```js
async (page) => {
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(450);
  }
}
```

To scroll to a target, read its position and wheel toward it until it sits in a band of the viewport:

```js
for (let i = 0; i < 30; i++) {
  const y = await page.evaluate(() => document.querySelector("#projects")?.getBoundingClientRect().top ?? 0);
  if (y > 80 && y < 260) break;
  await page.mouse.wheel(0, y < 80 ? -250 : 250);
  await page.waitForTimeout(450);
}
```

## Checks

Run each check after a full scroll, or after skipping the build animation.

**Every item is built.** Nothing is left hidden:

```js
() => ({
  engine: document.documentElement.dataset.build,
  unbuilt: [...document.querySelectorAll("[data-build-item]:not([data-built])")].length,
  sectionsUnbuilt: [...document.querySelectorAll("[data-build-section]:not([data-built])")].map(s => s.getAttribute("data-build-section")),
})
```

**Videos load, and only visible ones play:**

```js
() => [...document.querySelectorAll("video")].map(v => ({
  src: v.currentSrc.split("/").pop(), ready: v.readyState, paused: v.paused,
  inView: (r => r.bottom > 0 && r.top < innerHeight)(v.getBoundingClientRect()),
}))
```

Expect `ready: 4` for every clip once the idle warm-up has run, and `paused === !inView`.

**Effects are present and gated.** The shader canvas exists and pauses when scrolled away. A hovered card carries an inline `transform` that clears on leave. The scramble text equals the original after the effect finishes.

**No horizontal overflow on phones.** Compare against the width you set, not
`innerWidth`: under mobile emulation the layout viewport widens to fit wide
content, so `scrollWidth - innerWidth` reads 0 even when the page overflows.

```js
() => document.documentElement.scrollWidth - 390   // with a 390 px viewport; expect <= 0
```

**Clean console.** Read console errors and warnings after the run; expect none.

**Screenshots.** Take them at 1440×900 and 390×844, at the hero, at each video placement and at a card while hovered. Then look at them, because a check that passes on a broken-looking page is no check at all.

## Videos specifically

Extract frames with ffmpeg and look at them, since reports don't show you the picture:

```bash
ffmpeg -ss 4 -i public/videos/showreel.mp4 -frames:v 1 -vf scale=960:-2 frame-4s.png
```

To check a loop seam, compare frame 0 with the last frame. They should differ by about one frame of motion.

## After deploy

```bash
curl -sI https://site/ | grep -iE "^(HTTP|x-nextjs-prerender|x-vercel-cache)"
curl -sI "https://site/videos/showreel.webm?v=1" | grep -iE "content-type|content-length|cache-control"
curl -s -o /dev/null -w "%{http_code}\n" https://site/opengraph-image
```

Then read production runtime logs for errors and fatals in the first 10–15 minutes. Say plainly what you could not verify, such as Safari, real phones or 120 Hz screens, and ask the owner to check those.
