// Part of living-ui-skills (MIT). Adapt freely.
// Scramble text: hovering (mouse/pen) or keyboard-focusing a link or button
// that contains <ScrambleText> decodes its label left to right in ~350-500 ms.
// The real text never changes: it keeps its box (no width jump) and stays the
// accessible name; it is only made transparent while an aria-hidden overlay
// shows the resolved prefix plus a tail of mono glyphs. The overlay is always
// emptied at the end (timer fallback included, for background tabs).

import { isBuilt } from "./built";
import { sleep, wake } from "./ticker";

const LOWER = "abcdefghijklmnopqrstuvwxyz0123456789#%&*+=<>/";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/";
const DIGIT = "0123456789";
const GLYPH_MS = 55; // tail glyphs change at ~18 Hz, not every frame

type Job = {
  el: HTMLElement;
  done: HTMLElement;
  tail: HTMLElement;
  chars: string[];
  at: number[];
  t0: number;
  dur: number;
  shown: number;
  glyphAt: number;
  timer: number;
};

const pick = (pool: string) => pool[(Math.random() * pool.length) | 0];

function glyphFor(c: string): string {
  if (c === " " || c === " ") return c;
  if (/[a-z]/.test(c)) return pick(LOWER);
  if (/[A-Z]/.test(c)) return pick(UPPER);
  if (/[0-9]/.test(c)) return pick(DIGIT);
  if (/[@./:\-_·()]/.test(c)) return c; // keep structure (emails, paths) readable
  return pick(LOWER);
}

export function setupScramble(): () => void {
  const jobs = new Map<HTMLElement, Job>();

  const finish = (j: Job) => {
    window.clearTimeout(j.timer);
    j.done.textContent = "";
    j.tail.textContent = "";
    j.el.removeAttribute("data-on");
    jobs.delete(j.el);
  };

  const render = (j: Job, now: number) => {
    const t = now - j.t0;
    let k = 0;
    while (k < j.chars.length && j.at[k] <= t) k++;
    if (k === j.shown && now - j.glyphAt < GLYPH_MS) return;
    if (k !== j.shown) j.done.textContent = j.chars.slice(0, k).join("");
    j.tail.textContent = j.chars.slice(k).map(glyphFor).join("");
    j.shown = k;
    j.glyphAt = now;
  };

  const frame = (now: number): boolean => {
    jobs.forEach((j) => {
      if (now - j.t0 >= j.dur) finish(j);
      else render(j, now);
    });
    return jobs.size > 0;
  };

  const start = (el: HTMLElement) => {
    if (jobs.has(el) || !isBuilt(el)) return;
    const txt = el.querySelector<HTMLElement>(":scope > .fx-scr__txt");
    const done = el.querySelector<HTMLElement>(".fx-scr__done");
    const tail = el.querySelector<HTMLElement>(".fx-scr__tail");
    const text = txt?.textContent ?? "";
    if (!txt || !done || !tail || !text.trim()) return;
    const chars = Array.from(text);
    const n = chars.length;
    const dur = Math.min(520, Math.max(360, 300 + n * 14));
    // Left-to-right resolve times with a little jitter, kept monotonic.
    const at: number[] = [];
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const base = dur * (0.2 + (0.72 * (i + 1)) / n);
      const v = Math.min(dur * 0.94, Math.max(prev, base + (Math.random() - 0.5) * dur * 0.08));
      at.push(v);
      prev = v;
    }
    const now = performance.now();
    const j: Job = { el, done, tail, chars, at, t0: now, dur, shown: -1, glyphAt: 0, timer: 0 };
    j.timer = window.setTimeout(() => finish(j), dur + 250);
    jobs.set(el, j);
    render(j, now); // fill the overlay before the real text turns transparent
    el.setAttribute("data-on", "");
    wake(frame);
  };

  const hostOf = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null;
    const host = target.closest<HTMLElement>("a, button, [data-fx-scr-host]");
    return host && host.querySelector("[data-fx-scr]") ? host : null;
  };
  const run = (host: HTMLElement) => {
    host.querySelectorAll<HTMLElement>("[data-fx-scr]").forEach(start);
  };

  const onOver = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const host = hostOf(e.target);
    if (!host) return;
    const from = e.relatedTarget;
    if (from instanceof Node && host.contains(from)) return; // moving inside the same link
    run(host);
  };
  const onFocus = (e: FocusEvent) => {
    const host = hostOf(e.target);
    if (!host) return;
    let keyboard = true;
    try {
      keyboard = host.matches(":focus-visible");
    } catch {}
    if (keyboard) run(host);
  };
  const onVisibility = () => {
    if (document.hidden) jobs.forEach(finish);
  };

  document.addEventListener("pointerover", onOver, { passive: true });
  document.addEventListener("focusin", onFocus);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    document.removeEventListener("pointerover", onOver);
    document.removeEventListener("focusin", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
    jobs.forEach(finish);
    sleep(frame);
  };
}
