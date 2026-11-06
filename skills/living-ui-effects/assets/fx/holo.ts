// Part of living-ui-skills (MIT). Adapt freely.
// Hologram cards: built cards tilt toward a fine pointer, lift slightly, and
// get a glare + iridescent border sheen from an injected aria-hidden overlay.
// All cards share one rAF loop that runs only while a card is moving (hovered
// and catching up, or springing back). The overlay and the inline transform
// exist only while a card is active; at rest the card's DOM and styles are
// exactly what React rendered. Opt out per card or subtree with data-holo="off".

import { FINE_POINTER, frozen, isBuilt, tidyStyle } from "./built";
import { clamp, ease, sleep, wake } from "./ticker";

export type HoloOptions = {
  /** Which elements tilt. Default: anything marked data-holo (except "off"). */
  selector?: string;
  /** Only cards inside this container count. Default: "main". Use "body" for everywhere. */
  within?: string;
};

type Card = {
  el: HTMLElement;
  fx: HTMLSpanElement;
  hover: boolean;
  /** Untransformed layout box in document coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  maxX: number;
  maxY: number;
  persp: number;
  rx: number;
  ry: number;
  vx: number;
  vy: number;
  lift: number;
  vl: number;
  gx: number;
  gy: number;
  o: number;
  posClass: boolean;
  lastT: string;
  lastFx: string;
  measuredAt: number;
};

const LIFT = 3; // px
const STEP = 1 / 120; // spring substep (s)

export function setupHolo(options: HoloOptions = {}): () => void {
  const selector = options.selector ?? "[data-holo]";
  const within = options.within ?? "main";
  const mq = window.matchMedia(FINE_POINTER);
  const cards = new Map<HTMLElement, Card>();
  let hovered: HTMLElement | null = null;
  let px = -1e4;
  let py = -1e4;
  let listening = false;

  const cardOf = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null;
    const el = target.closest<HTMLElement>(selector);
    if (!el || !el.closest(within) || el.closest('[data-holo="off"]')) return null;
    return el;
  };

  const measure = (c: Card) => {
    // Read the untransformed box (inline "none" also beats :hover transforms).
    const prev = c.el.style.transform;
    c.el.style.transform = "none";
    const r = c.el.getBoundingClientRect();
    c.el.style.transform = prev;
    c.x = r.left + window.scrollX;
    c.y = r.top + window.scrollY;
    c.w = Math.max(1, r.width);
    c.h = Math.max(1, r.height);
    // Big cards tilt less so their far edges never swing too much.
    c.maxY = clamp((7 * 520) / c.w, 2.5, 7.5);
    c.maxX = clamp((7 * 420) / c.h, 2.5, 7.5);
    c.persp = Math.round(Math.max(800, 1.6 * Math.max(c.w, c.h)));
    c.measuredAt = performance.now();
  };

  const engage = (el: HTMLElement) => {
    if (!isBuilt(el) || frozen()) return;
    let c = cards.get(el);
    if (!c) {
      const cs = getComputedStyle(el);
      const fx = document.createElement("span");
      fx.className = "fx-holo";
      fx.setAttribute("aria-hidden", "true");
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") fx.classList.add("fx-holo--in");
      const posClass = cs.position === "static";
      el.classList.add("fx-holo-host");
      if (posClass) el.classList.add("fx-holo-pos");
      el.appendChild(fx);
      c = {
        el, fx, hover: true, x: 0, y: 0, w: 1, h: 1, maxX: 6, maxY: 6, persp: 900,
        rx: 0, ry: 0, vx: 0, vy: 0, lift: 0, vl: 0, gx: 0.5, gy: 0.5, o: 0,
        posClass, lastT: "", lastFx: "", measuredAt: 0,
      };
      cards.set(el, c);
      measure(c);
    } else if (performance.now() - c.measuredAt > 400) measure(c);
    c.hover = true;
    // Start the glare where the pointer is instead of sweeping in from the center.
    if (c.o < 0.02) {
      c.gx = clamp((px - (c.x - window.scrollX)) / c.w, 0, 1);
      c.gy = clamp((py - (c.y - window.scrollY)) / c.h, 0, 1);
    }
    wake(tick);
  };

  const release = (el: HTMLElement | null) => {
    if (!el) return;
    const c = cards.get(el);
    if (c) c.hover = false;
    wake(tick);
  };

  const finalize = (c: Card) => {
    c.fx.remove();
    c.el.style.removeProperty("transform");
    tidyStyle(c.el);
    c.el.classList.remove("fx-holo-host");
    if (c.posClass) c.el.classList.remove("fx-holo-pos");
    cards.delete(c.el);
    if (hovered === c.el) hovered = null;
  };

  const spring = (x: number, v: number, target: number, k: number, damp: number, dt: number) => {
    for (let s = dt; s > 1e-6; s -= STEP) {
      const h = Math.min(STEP, s);
      v += (-k * (x - target) - damp * v) * h;
      x += v * h;
    }
    return [x, v] as const;
  };

  function tick(now: number, dt: number): boolean {
    const sx = window.scrollX;
    const sy = window.scrollY;
    let moving = false;
    cards.forEach((c) => {
      if (!c.el.isConnected || !isBuilt(c.el)) {
        finalize(c);
        return;
      }
      let tRx = 0;
      let tRy = 0;
      let tL = 0;
      let tO = 0;
      let glareDone = true;
      if (c.hover) {
        if (now - c.measuredAt > 1500) measure(c);
        const lx = px - (c.x - sx);
        const ly = py - (c.y - sy);
        // The page scrolled the card away under a still pointer.
        if (lx < -8 || ly < -8 || lx > c.w + 8 || ly > c.h + 8) {
          c.hover = false;
          if (hovered === c.el) hovered = null;
        } else {
          const nx = clamp(lx / c.w, 0, 1);
          const ny = clamp(ly / c.h, 0, 1);
          // The edge under the pointer comes toward the viewer.
          tRy = -(nx - 0.5) * 2 * c.maxY;
          tRx = (ny - 0.5) * 2 * c.maxX;
          tL = LIFT;
          tO = 1;
          const k = ease(dt, 14);
          c.gx += (nx - c.gx) * k;
          c.gy += (ny - c.gy) * k;
          glareDone = Math.abs(nx - c.gx) < 0.002 && Math.abs(ny - c.gy) < 0.002;
        }
      }
      // Follow smoothly while hovered; spring back with a soft overshoot.
      const K = c.hover ? 150 : 120;
      const D = 2 * Math.sqrt(K) * (c.hover ? 0.92 : 0.58);
      [c.rx, c.vx] = spring(c.rx, c.vx, tRx, K, D, dt);
      [c.ry, c.vy] = spring(c.ry, c.vy, tRy, K, D, dt);
      [c.lift, c.vl] = spring(c.lift, c.vl, tL, K, D, dt);
      c.o += (tO - c.o) * ease(dt, tO > c.o ? 9 : 5);

      const settled =
        glareDone &&
        Math.abs(c.rx - tRx) < 0.01 && Math.abs(c.ry - tRy) < 0.01 && Math.abs(c.lift - tL) < 0.02 &&
        Math.abs(c.vx) < 0.05 && Math.abs(c.vy) < 0.05 && Math.abs(c.vl) < 0.05 && Math.abs(c.o - tO) < 0.004;
      if (!c.hover && settled) {
        finalize(c);
        return;
      }
      if (!settled) moving = true;

      const t =
        `perspective(${c.persp}px) translate3d(0,${(-c.lift).toFixed(2)}px,0) ` +
        `rotateX(${c.rx.toFixed(3)}deg) rotateY(${c.ry.toFixed(3)}deg)`;
      if (t !== c.lastT) {
        c.el.style.transform = t;
        c.lastT = t;
      }
      const ang = (Math.atan2(c.gy - 0.5, c.gx - 0.5) * 180) / Math.PI + 90;
      const fx =
        `--fx-x:${(c.gx * 100).toFixed(1)}%;--fx-y:${(c.gy * 100).toFixed(1)}%;` +
        `--fx-a:${ang.toFixed(1)}deg;opacity:${c.o.toFixed(3)}`;
      if (fx !== c.lastFx) {
        c.fx.style.cssText = fx;
        c.lastFx = fx;
      }
    });
    // Hovered and caught up: sleep until the pointer moves again.
    return moving;
  }

  const onOver = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    px = e.clientX;
    py = e.clientY;
    const el = cardOf(e.target);
    if (el === hovered) return;
    release(hovered);
    hovered = el;
    if (el) engage(el);
  };
  let retryAt = 0;
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    px = e.clientX;
    py = e.clientY;
    if (!hovered) return;
    if (cards.has(hovered)) wake(tick);
    else if (e.timeStamp > retryAt) {
      // Not engaged yet (still building, or frozen): re-check now and then.
      retryAt = e.timeStamp + 250;
      engage(hovered);
    }
  };
  const onOut = (e: PointerEvent) => {
    if (e.relatedTarget) return; // left the window
    release(hovered);
    hovered = null;
  };
  const onScroll = () => {
    if (hovered) wake(tick);
  };
  const onResize = () => {
    cards.forEach((c) => (c.measuredAt = 0));
    wake(tick);
  };
  const onBlur = () => {
    release(hovered);
    hovered = null;
  };

  const listen = (on: boolean) => {
    if (on === listening) return;
    listening = on;
    if (on) {
      document.addEventListener("pointerover", onOver, { passive: true });
      document.addEventListener("pointermove", onMove, { passive: true });
      document.addEventListener("pointerout", onOut, { passive: true });
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onResize);
      window.addEventListener("blur", onBlur);
      return;
    }
    document.removeEventListener("pointerover", onOver);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerout", onOut);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("blur", onBlur);
    hovered = null;
    cards.forEach(finalize);
    sleep(tick);
  };
  const onMedia = () => listen(mq.matches);
  mq.addEventListener("change", onMedia);
  listen(mq.matches);

  return () => {
    mq.removeEventListener("change", onMedia);
    listen(false);
  };
}
