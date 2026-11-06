// Part of living-ui-skills (MIT). Adapt freely.
// Glitch headings ([data-fx-glitch] wrappers, see GlitchCopies): a 560 ms
// RGB-split + slice glitch when a built heading comes into view, and a short
// micro-glitch on one visible heading every 8-14 s (seeded). Only one heading
// glitches at a time. Pure CSS keyframes, toggled with [data-glitch] on the
// wrapper; nothing here runs per frame.

import { buildActive, seeded, tidyStyle } from "./built";

const IN_MS = 560;
const MICRO_MS = 260;
const REPLAY_GAP = 2500; // min time before the same heading glitches again on entry

type Head = {
  el: HTMLElement;
  base: HTMLElement | null;
  /** The build item to wait for: the heading itself or the wrapper/ancestor that carries data-build-item. */
  item: HTMLElement | null;
  section: HTMLElement | null;
  visible: boolean;
  built: boolean;
  lastAt: number;
  endTimer: number;
  queued: number;
};

export function setupGlitch(): () => void {
  const wraps = Array.from(document.querySelectorAll<HTMLElement>("[data-fx-glitch]"));
  if (!wraps.length || typeof IntersectionObserver === "undefined") return () => {};

  // Seeded, so the micro-glitch rhythm is the same on every visit (and in tests).
  const rand = seeded(0x5eead4);
  const heads: Head[] = wraps.map((el) => {
    const base = el.querySelector<HTMLElement>(".fx-glitch__base");
    return {
      el,
      base,
      item: (base ?? el).closest<HTMLElement>("[data-build-item]"),
      section: (base ?? el).closest<HTMLElement>("[data-build-section]"),
      visible: false,
      built: false,
      lastAt: -1e9,
      endTimer: 0,
      queued: 0,
    };
  });
  const byEl = new Map(heads.map((h) => [h.el, h]));
  let busyUntil = 0;
  let microTimer = 0;
  let alive = true;

  const builtNow = (h: Head) =>
    !buildActive() ||
    ((!h.item || h.item.hasAttribute("data-built")) && (!h.section || h.section.hasAttribute("data-built")));

  const stop = (h: Head) => {
    window.clearTimeout(h.endTimer);
    h.endTimer = 0;
    if (h.el.hasAttribute("data-glitch")) h.el.removeAttribute("data-glitch");
    h.el.style.removeProperty("--fx-gi");
    tidyStyle(h.el);
  };

  const cancelQueued = (h: Head) => {
    window.clearTimeout(h.queued);
    h.queued = 0;
  };

  const play = (h: Head, kind: "in" | "m1" | "m2") => {
    if (!alive || document.hidden || !h.built) return;
    const now = performance.now();
    const dur = kind === "in" ? IN_MS : MICRO_MS;
    stop(h);
    h.el.style.setProperty("--fx-gi", kind === "in" ? "1" : (0.55 + rand() * 0.35).toFixed(2));
    h.el.setAttribute("data-glitch", kind);
    h.lastAt = now;
    busyUntil = Math.max(busyUntil, now + dur);
    h.endTimer = window.setTimeout(() => stop(h), dur + 40);
  };

  /** Entrance glitch, queued behind any other heading's glitch. */
  const entrance = (h: Head) => {
    if (h.queued || h.endTimer) return;
    const now = performance.now();
    if (now - h.lastAt < REPLAY_GAP) return;
    const wait = Math.max(140, busyUntil - now + 120);
    busyUntil = now + wait + IN_MS; // reserve the slot
    h.queued = window.setTimeout(() => {
      h.queued = 0;
      if (h.visible && h.built) play(h, "in");
    }, wait);
  };

  const scheduleMicro = () => {
    if (microTimer || !alive) return;
    if (!heads.some((h) => h.visible && h.built)) return;
    microTimer = window.setTimeout(micro, 8000 + rand() * 6000);
  };

  function micro() {
    microTimer = 0;
    if (!alive) return;
    const now = performance.now();
    const pool = heads.filter(
      (h) => h.visible && h.built && !h.endTimer && !h.queued && now - h.lastAt > 4000,
    );
    if (pool.length && now >= busyUntil && !document.hidden) {
      play(pool[Math.floor(rand() * pool.length)], rand() < 0.5 ? "m1" : "m2");
    }
    scheduleMicro();
  }

  const refresh = () => {
    for (const h of heads) {
      const was = h.built;
      h.built = builtNow(h);
      if (!h.built) {
        cancelQueued(h);
        stop(h);
      } else if (!was && h.visible) entrance(h);
    }
    scheduleMicro();
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const h = byEl.get(e.target as HTMLElement);
        if (!h) continue;
        const vis = e.isIntersecting && e.intersectionRatio >= 0.5;
        if (vis === h.visible) continue;
        h.visible = vis;
        if (vis && h.built) entrance(h);
        else if (!vis) cancelQueued(h);
      }
      scheduleMicro();
    },
    { threshold: [0, 0.5, 1] },
  );

  const mo = new MutationObserver(refresh);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-build"] });
  for (const h of heads) {
    if (h.item) mo.observe(h.item, { attributes: true, attributeFilter: ["data-built"] });
    if (h.section && h.section !== h.item) {
      mo.observe(h.section, { attributes: true, attributeFilter: ["data-built"] });
    }
    h.built = builtNow(h);
    io.observe(h.el);
  }

  const onVisibility = () => {
    if (document.hidden) heads.forEach(stop);
  };
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    alive = false;
    io.disconnect();
    mo.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    window.clearTimeout(microTimer);
    heads.forEach((h) => {
      cancelQueued(h);
      stop(h);
    });
  };
}
