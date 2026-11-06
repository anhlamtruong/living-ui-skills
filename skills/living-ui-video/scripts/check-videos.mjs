#!/usr/bin/env node
// Part of living-ui-skills (MIT). Adapt freely.
// Browser check for looping website video:
//   1. server HTML: every <video> has preload="none" and no autoplay
//   2. desktop: every clip reaches readyState 4 once the page is idle
//   3. desktop: while scrolling, only clips near the viewport play, and visible ones do play
//   4. phone (390x844): no horizontal overflow
//
// Usage: node check-videos.mjs <url> [--channel chrome] [--settle 12000] [--margin 300]
//   --channel  use an installed browser (e.g. chrome, msedge) instead of Playwright's Chromium
//   --settle   ms to wait for the idle warm-up before checking readyState (default 12000)
//   --margin   px outside the viewport a clip may still be playing (default 300; the
//              component starts playback 200 px early)
// Needs `playwright` (npm i -D playwright && npx playwright install chromium)
// or `playwright-core` with --channel pointing at an installed browser.

const argv = process.argv.slice(2);
const flag = (key, fallback) => {
  const i = argv.indexOf(`--${key}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const url = argv.find((arg, i) => !arg.startsWith("--") && !argv[i - 1]?.startsWith("--"));
if (!url) {
  console.error("Usage: node check-videos.mjs <url> [--channel chrome] [--settle 12000] [--margin 300]");
  process.exit(1);
}
const channel = flag("channel", undefined);
const settleMs = Number(flag("settle", "12000"));
const margin = Number(flag("margin", "300"));

const { chromium } = await import("playwright").catch(() => import("playwright-core"));
const failures = [];
const fail = (message) => failures.push(message);
const short = (src) => (src || "?").split("/").pop().split("?")[0];

const browser = await chromium.launch({ channel, headless: true });
try {
  // 1. Server HTML -------------------------------------------------------------
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  const html = await (await page.request.get(url)).text();
  const tags = html.match(/<video\b[^>]*>/g) ?? [];
  console.log(`server HTML: ${tags.length} <video> tag(s)`);
  if (tags.length === 0) fail("no <video> elements in the server HTML");
  for (const tag of tags) {
    if (!/preload="none"/.test(tag)) fail(`video without preload="none": ${tag.slice(0, 120)}`);
    if (/\sautoplay\b/i.test(tag)) fail(`video with autoplay in the HTML: ${tag.slice(0, 120)}`);
  }

  // 2. Warm-up -----------------------------------------------------------------
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(
    () => [...document.querySelectorAll("video")].every((v) => v.readyState === 4),
    undefined,
    { timeout: settleMs, polling: 500 },
  ).catch(() => {});
  const states = await page.evaluate(() =>
    [...document.querySelectorAll("video")].map((v) => ({ src: v.currentSrc, ready: v.readyState })),
  );
  for (const s of states) {
    console.log(`  ${short(s.src).padEnd(28)} readyState ${s.ready}`);
    if (s.ready !== 4) fail(`${short(s.src)} only reached readyState ${s.ready} after ${settleMs} ms`);
  }

  // 3. Scroll: only on-screen clips play ---------------------------------------
  let stops = 0;
  for (; stops < 120; stops++) {
    await page.waitForTimeout(800); // let smooth-scroll libraries settle
    const report = await page.evaluate((m) => {
      const vh = window.innerHeight;
      return [...document.querySelectorAll("video")].map((v) => {
        const r = v.getBoundingClientRect();
        const visible = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / Math.max(1, r.height);
        const near = r.bottom > -m && r.top < vh + m;
        const toggle = v.parentElement?.querySelector('button[aria-pressed="true"]');
        return { src: v.currentSrc, playing: !v.paused, visible, near, userPaused: Boolean(toggle) };
      });
    }, margin);
    for (const v of report) {
      if (v.playing && !v.near) fail(`${short(v.src)} plays while off-screen (stop ${stops})`);
      if (!v.playing && v.visible > 0.5 && !v.userPaused) fail(`${short(v.src)} is visible but paused (stop ${stops})`);
    }
    const atBottom = await page.evaluate(
      () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2,
    );
    if (atBottom) break;
    await page.mouse.move(720, 450);
    await page.mouse.wheel(0, 540);
  }
  console.log(`scroll: ${stops + 1} stops checked`);
  await desktop.close();

  // 4. Phone overflow ----------------------------------------------------------
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phonePage = await phone.newPage();
  await phonePage.goto(url, { waitUntil: "load" });
  await phonePage.waitForTimeout(1500);
  // Compare with the device width, not innerWidth: mobile browsers widen the
  // layout viewport to fit oversized content, which hides the overflow.
  const overflow = await phonePage.evaluate(
    (deviceWidth) => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - deviceWidth,
    390,
  );
  console.log(`phone: horizontal overflow ${overflow}px`);
  if (overflow > 1) fail(`horizontal overflow of ${overflow}px at 390px wide`);
  await phone.close();
} finally {
  await browser.close();
}

const unique = [...new Set(failures)];
if (unique.length) {
  console.log(`\n${unique.length} problem(s):`);
  for (const f of unique) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("\nall video checks passed");
