# Verifying the effects

Effects fail quietly: the shader keeps drawing off screen, a card keeps a stray `transform`, a glitch nudges a heading by a pixel, a scramble leaves a glyph behind. None of these show up in a screenshot, so check them in code. These checks use `@playwright/test` and run headless.

## Ground rules

- **Run in headless Chromium or a focused foreground window.** A background or unfocused browser tab throttles `requestAnimationFrame` (sometimes to a few fps), and some machines report `prefers-reduced-motion`. Either makes working effects look broken.
- **WebGL in headless.** On a machine with a GPU, headless Chromium gets real WebGL and the shader runs. On many CI runners only a software renderer (SwiftShader) exists; `failIfMajorPerformanceCaveat` makes the shader opt out there by design. The shader test below then skips instead of failing.
- **Smooth-scroll libraries** (Lenis and similar) may fight programmatic scrolling. Prefer `locator.scrollIntoViewIfNeeded()` or `page.mouse.wheel()` steps over `window.scrollTo`.
- **Wait for readiness.** With a build/intro engine, an effect only engages after its section has `[data-built]`. The helper below waits for that; without an engine it returns immediately.
- **Two viewports at minimum:** 1440×900 desktop, and 390×844 with touch emulation.

## Shared helpers

```ts
// tests/fx.helpers.ts
import type { Locator, Page } from "@playwright/test";

declare global {
  interface Window {
    __draws: number;
    __cls: number;
  }
}

/** Resolves once `locator`'s item and section are built (or no build engine runs). */
export async function waitBuilt(page: Page, locator: Locator) {
  const el = await locator.elementHandle();
  await page.waitForFunction(
    (node) => {
      if (!node) return false;
      if (document.documentElement.getAttribute("data-build") !== "on") return true;
      const item = node.closest("[data-build-item]");
      const section = node.closest("[data-build-section]");
      return (!item || item.hasAttribute("data-built")) && (!section || section.hasAttribute("data-built"));
    },
    el,
    { timeout: 30_000 },
  );
}

/** Counts WebGL draws, so a test can tell whether the shader is rendering. */
export async function countDraws(page: Page) {
  await page.addInitScript(() => {
    window.__draws = 0;
    const draw = WebGLRenderingContext.prototype.drawArrays;
    WebGLRenderingContext.prototype.drawArrays = function (this: WebGLRenderingContext, mode: number, first: number, count: number) {
      window.__draws++;
      return draw.call(this, mode, first, count);
    };
  });
}

/** Sums layout-shift entries (Chromium), ignoring shifts caused by input. */
export async function trackCls(page: Page) {
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!e.hadRecentInput) window.__cls += e.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}
```

## 1. The shader draws on screen and stops off screen

```ts
import { test, expect } from "@playwright/test";
import { countDraws } from "./fx.helpers";

test.use({ viewport: { width: 1440, height: 900 } });

test("aurora draws only while the hero is visible", async ({ page }) => {
  await countDraws(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const canvas = page.locator("canvas.fx-shader");
  test.skip((await canvas.count()) === 0, "no hardware WebGL here: the shader opts out by design");

  await expect(canvas).toHaveAttribute("data-on", "", { timeout: 30_000 });
  const box = await canvas.boundingBox();
  expect(box!.width).toBeGreaterThan(100);

  const draws = () => page.evaluate(() => window.__draws);
  const a = await draws();
  await page.waitForTimeout(1000);
  expect((await draws()) - a).toBeGreaterThan(20); // roughly 60-80 per second on screen

  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500); // let the observer fire
  const b = await draws();
  await page.waitForTimeout(1000);
  expect((await draws()) - b).toBe(0); // nothing while off screen
});
```

## 2. Tilt applies on hover and leaves no trace

```ts
import { test, expect } from "@playwright/test";
import { waitBuilt } from "./fx.helpers";

test("holo tilts on hover and fully clears after leaving", async ({ page }) => {
  await page.goto("/");
  const card = page.locator("[data-holo]").first(); // or your holo selector
  await card.scrollIntoViewIfNeeded();
  await waitBuilt(page, card);
  const styleBefore = await card.getAttribute("style");

  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.2, { steps: 12 });

  await expect.poll(() => card.evaluate((el) => (el as HTMLElement).style.transform)).toContain("rotateY");
  await expect(card.locator(":scope > .fx-holo")).toHaveCount(1);

  await page.mouse.move(2, 2); // leave the card
  await expect.poll(() => card.evaluate((el) => (el as HTMLElement).style.transform), { timeout: 3000 }).toBe("");
  await expect(card.locator(":scope > .fx-holo")).toHaveCount(0);
  expect(await card.getAttribute("style")).toBe(styleBefore); // no leftover style=""
  await expect(card).not.toHaveClass(/fx-holo-host/);
});

test.describe("touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("cards never tilt under a finger", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("[data-holo]").first();
    await card.scrollIntoViewIfNeeded();
    await waitBuilt(page, card);
    await card.tap();
    await page.waitForTimeout(300);
    await expect(card.locator(".fx-holo")).toHaveCount(0);
    expect(await card.evaluate((el) => (el as HTMLElement).style.transform)).toBe("");
  });
});
```

## 3. A glitch never shifts layout

```ts
import { test, expect } from "@playwright/test";
import { trackCls, waitBuilt } from "./fx.helpers";

test("glitch headings cause zero layout shift", async ({ page }) => {
  await trackCls(page);
  await page.goto("/");
  const wrap = page.locator("[data-fx-glitch]").first();
  await wrap.scrollIntoViewIfNeeded();
  await waitBuilt(page, wrap.locator(".fx-glitch__base"));

  // Sample the wrapper and the element after it every frame while the glitch runs.
  const result = await wrap.evaluate(async (el) => {
    const next = el.nextElementSibling ?? el.parentElement!;
    const rects: string[] = [];
    const clsStart = window.__cls;
    const start = performance.now();
    let sawGlitch = false;
    await new Promise<void>((done) => {
      const tick = () => {
        if (el.hasAttribute("data-glitch")) sawGlitch = true;
        const a = el.getBoundingClientRect();
        const b = next.getBoundingClientRect();
        rects.push([a.top, a.height, a.width, b.top].map((v) => v.toFixed(2)).join(","));
        if (performance.now() - start < 1500) requestAnimationFrame(tick);
        else done();
      };
      requestAnimationFrame(tick);
    });
    return { sawGlitch, distinct: new Set(rects).size, cls: window.__cls - clsStart };
  });

  expect(result.sawGlitch).toBe(true); // the entrance glitch played in the window
  expect(result.distinct).toBe(1); // wrapper and next element never moved or resized
  expect(result.cls).toBe(0);
});
```

If `sawGlitch` is false, the heading had already glitched before sampling began (it fires as soon as it is half visible). Sample from just before scrolling it into view, or wait for the next micro-glitch (up to 14 s).

## 4. Scramble restores the exact text, width and name

```ts
import { test, expect } from "@playwright/test";
import { waitBuilt } from "./fx.helpers";

test("scramble decodes and restores the label", async ({ page }) => {
  await page.goto("/");
  const link = page.locator("a:has([data-fx-scr])").first();
  await link.scrollIntoViewIfNeeded();
  await waitBuilt(page, link);
  const label = link.locator(".fx-scr__txt").first();
  const text = await label.textContent();
  const aria = await link.ariaSnapshot(); // role + accessible name, as assistive tech sees it

  // Record the link's width every frame for 900 ms, starting before the hover.
  const widths = link.evaluate(
    (el) =>
      new Promise<number[]>((done) => {
        const out: number[] = [];
        const t0 = performance.now();
        const tick = () => {
          // offsetWidth is layout width; getBoundingClientRect() would also
          // report a holo card's tilt as "jitter" if the link sits in one.
          out.push((el as HTMLElement).offsetWidth);
          if (performance.now() - t0 < 900) requestAnimationFrame(tick);
          else done(out);
        };
        requestAnimationFrame(tick);
      }),
  );
  await link.hover();
  await expect(link.locator("[data-fx-scr][data-on]")).toHaveCount(1);
  expect(await link.ariaSnapshot()).toBe(aria); // mid-scramble, the name is still the real label
  const w = await widths;

  await expect(link.locator("[data-fx-scr][data-on]")).toHaveCount(0, { timeout: 2000 });
  expect(Math.max(...w) - Math.min(...w)).toBeLessThan(0.5); // no width jump at any point
  await expect(label).toHaveText(text!); // real text untouched
  await expect(link.locator(".fx-scr__done")).toHaveText("");
  await expect(link.locator(".fx-scr__tail")).toHaveText("");
  expect(await link.ariaSnapshot()).toBe(aria); // and after
});
```

## 5. Spotlight follows and hides

```ts
test("spotlight follows the cursor and hides on blur", async ({ page }) => {
  await page.goto("/");
  const spot = page.locator("div.fx-spot");
  await page.mouse.move(400, 300);
  await page.mouse.move(600, 420, { steps: 8 });
  await expect(spot).toHaveAttribute("data-on", "");
  await expect.poll(() => spot.evaluate((el) => (el as HTMLElement).style.transform)).toMatch(/translate3d\(3\d\dpx, 1\d\dpx/);
  await page.evaluate(() => window.dispatchEvent(new Event("blur"))); // same path as leaving the window
  await expect(spot).not.toHaveAttribute("data-on", /.*/);
});
```

The window is 560 px, so its left edge sits at `x - 280` (320 px for `x = 600`). Adjust the regex if you change `--fx-spot-size`.

## 6. Reduced motion, if you opted in to respecting it

```ts
test("respect-reduced turns the effects off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("canvas.fx-shader")).toHaveCount(0);
  const card = page.locator("[data-holo]").first();
  await card.hover();
  await expect(card.locator(".fx-holo")).toHaveCount(0);
});
```

Skip this test when the site deliberately plays motion for everyone (`motion="always"`, the default).

## Done means

- [ ] Shader draws on screen and stops completely off screen, or skips cleanly without hardware WebGL.
- [ ] A hovered card tilts; after leaving, its `style`, classes and children are exactly as React rendered them.
- [ ] No tilt and no overlay on touch.
- [ ] Glitch: zero layout shift and no rect changes during a run.
- [ ] Scramble: same text, same width every frame, same accessible name, empty overlay afterwards.
- [ ] No console errors or warnings at either viewport.
- [ ] Judged by eye in a focused foreground tab on a real device (desktop plus one mid-range phone), not only headless.
