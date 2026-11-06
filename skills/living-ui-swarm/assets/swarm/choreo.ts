// Part of living-ui-skills (MIT). Adapt freely.
// https://github.com/anhlamtruong/living-ui-skills
// Per-task choreography. Each task gets one GSAP timeline that drives canvas
// marks, the agent's aim and cursor tool, and the element's temporary inline
// styles (opacity, clip-path, filter, neutral tint). No React, no layout writes
// beyond the draft-font overlay, which lives outside the page flow.
//
// Every duration comes from the T table through D(), which enforces a floor
// so that even at the maximum catch-up speed nothing pops: tweens stay
// >= ~120 ms and typing steps >= 16 ms. taskTime() mirrors the timelines for
// the planner's estimate.
import { gsap } from "gsap";
import { COLORS, ROLE_COLOR } from "./palette";
import type { Renderer } from "./renderer";
import { keeps, measureText } from "./scan";
import type { Sim } from "./sim";
import { MK, TOOL, type Anim, type Box, type CharBox, type LineBox, type Mark, type MarkKind, type Run, type Task } from "./types";
import { DROP, INSP, INSP_H, TOOLBAR, WHEEL, dropH } from "./widgets";

export const EMPTY_CLIP = "polygon(0 0, 0 0, 0 0)";
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const DRAFT_COPY = [
  "font-size", "font-weight", "font-style", "letter-spacing", "word-spacing", "text-transform",
  "text-align", "text-indent", "font-kerning", "font-feature-settings", "font-variation-settings",
  "font-optical-sizing", "white-space", "text-wrap",
];

/** Highest catch-up speed a section may ramp to. */
export const CU_MAX = 1.7;
/** Shortest base tween, so it stays >= 120 ms even at CU_MAX. */
export const MIN_T = 0.12 * CU_MAX;
/** Shortest base time per typed character (>= 16 ms at CU_MAX). */
export const MIN_CHAR = 0.016 * CU_MAX;

/** Base durations (s) at scale 1, shared by the timelines and taskTime(). */
export const T = {
  frameDraw: 0.42, frameFade: 0.24, dim: 0.15,
  panelOpen: 0.14, knobReach: 0.15, knobDrag: 0.32, barOpen: 0.1, barReach: 0.16, barHold: 0.1, panelClose: 0.12,
  boxFade: 0.12, pause: 0.22, menuOpen: 0.14, menuHover: 0.2, menuClose: 0.12, menuHold: 0.1,
  morph: 0.36, toFace: 0.3, sweep: 0.55, toReal: 0.22,
  scanOutline: 0.28, scanPass: 0.4, scanFade: 0.12,
  grab: 0.1, drag: 0.6, over: 0.09, settle: 0.14, cardFade: 0.24,
  ghost: 0.36, ghostGap: 0.06, slotFade: 0.16, ghostFade: 0.14,
  wheelOpen: 0.14, ring: 0.42, square: 0.26, readout: 0.12, tint: 0.34,
  wheelClose: 0.12, wheelHold: 0.08,
  gridLine: 0.26, rowSweep: 0.3, cellGrow: 0.16,
  selIn: 0.16, grow: 0.36, seize: 0.15, slide: 0.42,
} as const;

/** Scale items start this small (transform only; layout never changes). */
const SMALL = 0.42;

/** Everything a task timeline needs, bound to one run, task and agent. */
export interface Ctx {
  run: Run;
  t: Task;
  i: number;
  tl: gsap.core.Timeline;
  /** Duration scale for this section (<= 1). */
  s: number;
  color: string;
  sim: Sim;
  r: Renderer;
  sy: number;
  vw: number;
  vh: number;
  phone: boolean;
  dragTime: number;
  layer: HTMLElement | null;
  mark(k: MarkKind, p: Partial<Mark>): Mark;
  fx(a: Anim): void;
  /** Live-log line from this agent, timed from the section start (bare: no section prefix). */
  log(what: string, bare?: boolean): void;
  /** Registers a grid cell's placeholder (faded when the cell is built). */
  holder(cell: Element, m: Mark): void;
}

// ------------------------------------------------------------------ helpers

const D = (c: Ctx, x: number) => Math.max(MIN_T, x * c.s);
const typeDur = (n: number, s: number) => Math.max(MIN_T, n * MIN_CHAR, clamp(n * 0.032, 0.2, 0.8) * s);
const revealDur = (n: number, s: number) => Math.max(MIN_T, clamp(n * 0.09, 0.28, 0.7) * s);

function aim(c: Ctx, x: number, y: number): void {
  c.sim.tx[c.i] = x;
  c.sim.ty[c.i] = y;
}

function tool(c: Ctx, t: number, follow: number): void {
  c.sim.tool[c.i] = t;
  c.sim.follow[c.i] = follow;
}

function wait(c: Ctx, d: number): void {
  c.tl.to({}, { duration: D(c, d) });
}

/** Moves the agent to (x, y) as one step of the timeline. */
function step(c: Ctx, x: number, y: number, d: number, t: number = TOOL.arrow): void {
  c.tl.call(() => {
    tool(c, t, 16);
    aim(c, x, y);
  });
  wait(c, d);
}

export function click(c: Ctx, x: number, y: number): void {
  const m = c.mark(MK.ripple, { x, y });
  c.fx(gsap.to(m, { p: 1, duration: 0.38, ease: "power1.out", onComplete: () => void (m.dead = true) }));
}

export function flash(c: Pick<Ctx, "mark" | "fx">, b: Box): void {
  const m = c.mark(MK.flash, { x: b.x, y: b.y, w: b.w, h: b.h });
  c.fx(gsap.to(m, { a: 0, duration: 0.55, ease: "power1.out", onComplete: () => void (m.dead = true) }));
}

/** Top-left for a popover docked beside box b, kept inside the viewport. */
function dock(c: Ctx, b: Box, w: number, h: number): [number, number] {
  let x = b.x + b.w + 12;
  if (x + w > c.vw - 8) x = b.x - 12 - w;
  if (x < 8) x = clamp(b.x + b.w - w - 8, 8, c.vw - w - 8);
  const lo = Math.max(c.sy + 12, b.y - h + 16);
  const hi = Math.min(c.sy + c.vh - h - 12, b.y + Math.max(0, b.h - 16));
  return [x, hi >= lo ? clamp(b.y, lo, hi) : b.y];
}

/** Clip showing every row above line L, and line L up to x = cx (local px). */
function stair(lines: LineBox[], L: number, cx: number, w: number, h: number): string {
  const P = 12;
  const top = L === 0 ? -P : (lines[L - 1].b + lines[L].y) / 2;
  const bot = L === lines.length - 1 ? h + P : (lines[L].b + lines[L + 1].y) / 2;
  const f = (v: number) => v.toFixed(1) + "px";
  return `polygon(${f(-P)} ${f(-P)}, ${f(w + P)} ${f(-P)}, ${f(w + P)} ${f(top)}, ${f(cx)} ${f(top)}, ${f(cx)} ${f(bot)}, ${f(-P)} ${f(bot)})`;
}

const rgbaCss = (a: number[], z: number[], q: number) =>
  `rgba(${Math.round(a[0] + (z[0] - a[0]) * q)},${Math.round(a[1] + (z[1] - a[1]) * q)},${Math.round(a[2] + (z[2] - a[2]) * q)},${(a[3] + (z[3] - a[3]) * q).toFixed(3)})`;

export const neutralCss = (t: Task) => rgbaCss(t.from4, t.from4, 0);

/** Where an image drag starts: data-build-from, else the nearest viewport edge. */
export function edgePoint(t: Task, sy: number, vw: number, vh: number): [number, number] {
  const b = t.box;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  let e = t.from;
  if (!e) {
    const d = [cx, vw - cx, cy - sy, sy + vh - cy].map((v) => Math.max(0, v));
    e = (["left", "right", "top", "bottom"] as const)[d.indexOf(Math.min(...d))];
  }
  const y = clamp(cy, sy + 60, sy + vh - 60);
  const x = clamp(cx, 60, vw - 60);
  return e === "left" ? [10, y] : e === "right" ? [vw - 10, y] : e === "top" ? [x, sy + 10] : [x, sy + vh - 10];
}

/** Knobs the inspector drags: radius and/or padding (one on cards others wait for). */
function knobs(t: Task): { r: boolean; p: boolean } {
  const r = t.radius >= 1;
  const p = Math.max(...t.pad) >= 1 && !(t.lead && r);
  return { r, p };
}

const hasBar = (t: Task, phone: boolean) => t.align >= 0 && t.box.w >= 560 && !phone && !t.lead;

/** Expected seconds for a task at duration scale s (mirrors the timelines below). */
export function taskTime(t: Task, s: number, dragTime: number): number {
  const d = (x: number) => Math.max(MIN_T, x * s);
  switch (t.kind) {
    case "frame": {
      let v = d(T.frameDraw) + d(T.frameFade) * 0.6;
      if (t.inspect) {
        const k = knobs(t);
        const n = Number(k.r) + Number(k.p) || 1;
        v += d(T.panelOpen) + n * d(T.knobDrag) + (n - 1) * d(T.knobReach) + d(T.panelClose) + d(T.frameFade) * 0.4;
        if (hasBar(t, false)) v += d(T.barOpen) + d(T.barReach) + d(T.barHold);
      }
      return v;
    }
    case "image": {
      if (!t.drag) return d(T.scanOutline) + d(T.scanPass) + d(T.scanFade);
      const e = (x: number) => Math.max(MIN_T, x * s * dragTime);
      return e(T.grab) + e(T.drag) + e(T.over) + e(T.settle) + e(T.cardFade);
    }
    case "grid": {
      const rows = Math.max(1, Math.round(t.dims[1]));
      return gridLead(t, s) + Math.min(0.08, 0.3 / rows) * s * (rows - 1) + d(T.rowSweep);
    }
    case "type": {
      let v = typeDur(t.chars.length, s) + (t.scale ? scaleTime(d) : 0);
      if (t.font) {
        v += d(T.pause) + d(T.menuOpen) + d(T.menuHover) + T.menuHold * s;
        if (t.fontName2) v += d(T.menuHover);
        v += t.sweep ? d(T.toFace) + Math.max(MIN_T, T.sweep * Math.max(0.7, s)) + d(T.toReal) : d(T.morph);
      }
      return v;
    }
    case "reveal":
      return revealDur(t.lines.length, s) + (t.scale ? scaleTime(d) : 0);
    case "color":
      return d(T.wheelOpen) + d(T.ring) + d(T.square) + Math.max(d(T.readout), d(T.tint)) + d(T.wheelClose) +
        T.wheelHold * s;
    default: {
      const n = t.slots.length;
      return Math.min(T.ghostGap, 0.3 / n) * s * (n - 1) + d(T.ghost);
    }
  }
}

const scaleTime = (d: (x: number) => number) => d(T.selIn) + d(T.grow) + d(T.seize) + d(T.slide);

/**
 * Seconds until a grid's lines are drawn. Cell content may start then (the
 * task is `ready`) while the placeholders are still being swept out.
 */
export function gridLead(t: Task, s: number): number {
  const n = t.cols.length + t.rows.length;
  return Math.max(MIN_T, T.gridLine * s) + Math.min(0.025, 0.2 / Math.max(1, n)) * s * (n - 1);
}

// ----------------------------------------------------- scale-then-move items

/** Temporary transform of a scale item: offset and scale, origin top-left. */
interface Tf {
  dx: number;
  dy: number;
  s: number;
}

function applyTf(el: HTMLElement, f: Tf): void {
  el.style.transformOrigin = "0 0";
  el.style.transform = `translate(${f.dx.toFixed(1)}px, ${f.dy.toFixed(1)}px) scale(${f.s.toFixed(4)})`;
}

/** Remembers the author's inline transform; the returned function restores it (also on cut-short builds). */
function holdTf(c: Ctx, el: HTMLElement): () => void {
  const t0 = el.style.transform;
  const o0 = el.style.transformOrigin;
  let done = false;
  const restore = () => {
    if (done) return;
    done = true;
    el.style.transform = t0;
    el.style.transformOrigin = o0;
    if (el.getAttribute("style") === "") el.removeAttribute("style");
  };
  c.run.undo.push(restore);
  return restore;
}

/** Local (element-relative) bounding box of text lines. */
function localBox(lines: LineBox[], w: number, h: number): Box {
  if (!lines.length) return { x: 0, y: 0, w, h };
  let x = Infinity;
  let y = Infinity;
  let r = -Infinity;
  let bt = -Infinity;
  for (const l of lines) {
    x = Math.min(x, l.x);
    y = Math.min(y, l.y);
    r = Math.max(r, l.r);
    bt = Math.max(bt, l.b);
  }
  return { x, y, w: r - x, h: bt - y };
}

const ARROWS = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
const arrowFor = (vx: number, vy: number) => ARROWS[((Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) % 8) + 8) % 8];

/**
 * (b) Drag the bottom-right handle of the selection out: scale -> 1.
 * (c) Move tool: drag the text to its true place (translate -> 0) with a
 *     small settle, showing the distance in the outline label.
 * (d) The outline fades; the inline transform is removed.
 */
function settle(c: Ctx, el: HTMLElement, f: Tf, lb: Box, restore: () => void): void {
  const { tl, t } = c;
  const b = t.box;
  const sel = c.mark(MK.frame, { p: 1, a: 0 });
  const place = () => {
    sel.x = b.x + f.dx + f.s * lb.x - 3;
    sel.y = b.y + f.dy + f.s * lb.y - 2;
    sel.w = f.s * lb.w + 6;
    sel.h = f.s * lb.h + 4;
    applyTf(el, f);
  };
  place();
  tl.call(() => {
    tool(c, TOOL.resize, 16);
    aim(c, sel.x + sel.w, sel.y + sel.h);
  });
  tl.to(sel, { a: 1, duration: D(c, T.selIn) });
  tl.call(() => void (c.sim.follow[c.i] = 36));
  tl.to(f, {
    s: 1,
    duration: D(c, T.grow),
    ease: "power2.inOut",
    onUpdate: () => {
      place();
      aim(c, sel.x + sel.w, sel.y + sel.h);
    },
  });
  const dist = Math.round(Math.hypot(f.dx, f.dy));
  const label = `${arrowFor(-f.dx, -f.dy)} ${dist} px`;
  tl.call(() => {
    tool(c, TOOL.move, 18);
    sel.label = label;
    aim(c, sel.x + sel.w / 2, sel.y + sel.h / 2);
  });
  wait(c, T.seize);
  tl.call(() => void (c.sim.follow[c.i] = 34));
  tl.to(f, {
    dx: 0,
    dy: 0,
    duration: D(c, T.slide),
    ease: "back.out(1.15)",
    onUpdate: () => {
      place();
      aim(c, sel.x + sel.w / 2, sel.y + sel.h / 2);
    },
  });
  tl.call(() => {
    restore();
    fade(c, [sel], D(c, T.dim));
    tool(c, TOOL.arrow, 18);
  });
}

/** Typing/reveal driver: advances a staircase clip on `target` behind a caret. */
function typer(
  c: Ctx, target: HTMLElement | null, lines: LineBox[], chars: CharBox[], typing: boolean, b: Box, caret: Mark,
  f: Tf | null = null,
): void {
  const n = typing ? chars.length : lines.length;
  const st = { v: 0 };
  let last = "";
  const paint = () => {
    let L = 0;
    let cx = lines[0].x;
    if (typing) {
      const k = Math.min(n, Math.floor(st.v));
      if (k > 0) {
        L = chars[k - 1].line;
        cx = chars[k - 1].x;
      }
    } else {
      const q = st.v * n;
      L = Math.min(n - 1, Math.floor(q));
      cx = lines[L].x + (lines[L].r - lines[L].x) * Math.min(1, q - L);
    }
    const ln = lines[L];
    const k = f ? f.s : 1;
    caret.x = b.x + (f ? f.dx : 0) + k * cx;
    caret.y = b.y + (f ? f.dy : 0) + k * ln.y;
    caret.h = k * (ln.b - ln.y);
    aim(c, caret.x + 2, caret.y + caret.h);
    if (!target) return;
    const end = typing ? st.v >= n : st.v >= 1;
    const clip = end ? "none" : typing && st.v < 1 ? EMPTY_CLIP : stair(lines, L, cx + 1, b.w, b.h);
    if (clip !== last) target.style.clipPath = last = clip;
  };
  paint();
  c.tl.to(st, {
    v: typing ? n : 1,
    duration: typing ? typeDur(n, c.s) : revealDur(n, c.s),
    ease: typing ? "none" : "power1.inOut",
    onUpdate: paint,
    data: typing ? n : 0,
  });
}

// -------------------------------------------------------------------- tasks

function frame(c: Ctx): void {
  const { t, tl } = c;
  const b = t.box;
  const f = c.mark(MK.frame, {
    x: b.x, y: b.y, w: b.w, h: b.h, label: t.label, r: t.inspect ? 0 : t.radius,
    x2: t.pad[0], y2: t.pad[1], w2: t.pad[2], h2: t.pad[3],
  });
  tool(c, TOOL.cross, 30);
  tl.to(f, { p: 1, duration: D(c, T.frameDraw), ease: "power2.inOut", onUpdate: () => aim(c, b.x + b.w * f.p, b.y + b.h * f.p) });
  const fade = D(c, T.frameFade);
  // A tuned card others wait for appears first and is tuned while visible,
  // so the items inside it can start; other tuned cards appear after tuning.
  const early = t.inspect && t.lead;
  if (t.inspect && !early) inspector(c, f);
  if (!t.keep) tl.fromTo(t.el, { opacity: 0 }, { opacity: 1, duration: fade, ease: "power1.out" }, t.inspect && !early ? ">" : `-=${fade * 0.4}`);
  if (early) {
    tl.call(() => void (t.ready = true));
    inspector(c, f);
  }
  tl.to(f, { a: 0.35, duration: D(c, T.dim) }, early ? ">" : "<");
}

/** Inspector panel: drag radius/padding knobs; the outline follows. */
function inspector(c: Ctx, f: Mark): void {
  const { t, tl } = c;
  const b = t.box;
  const [px, py] = dock(c, b, INSP.w, INSP_H);
  const padMax = Math.max(...t.pad);
  const k = knobs(t);
  const rMax = Math.max(16, Math.ceil((t.radius * 1.6) / 4) * 4);
  const pMax = Math.max(24, Math.ceil((padMax * 1.6) / 4) * 4);
  const panel = c.mark(MK.inspector, {
    x: px, y: py, p: 0, u: 0, v: k.p ? 0 : padMax / pMax, s: k.r || k.p ? 1 : 0, w2: rMax, h2: pMax, label: t.label,
    img: c.r.inspectorSprite(t.label),
  });
  tl.to(panel, { p: 1, duration: D(c, T.panelOpen), ease: "power2.out" });
  const rowY = (row: number) => py + INSP.head + row * INSP.row + INSP.row / 2;
  const knobX = (q: number) => px + INSP.trackX + q * INSP.trackW;
  let first = true;
  const slide = (row: number, key: "u" | "v" | "s", to: number, apply: (q: number) => void) => {
    // The first knob is reached while the panel opens; later ones need a move.
    if (first) tl.call(() => aim(c, knobX(panel[key]), rowY(row)), undefined, "<");
    else step(c, knobX(panel[key]), rowY(row), T.knobReach);
    first = false;
    tl.call(() => {
      tool(c, TOOL.slide, 34);
      click(c, knobX(panel[key]), rowY(row));
    });
    tl.to(panel, {
      [key]: to,
      duration: D(c, T.knobDrag),
      ease: "power2.inOut",
      onUpdate: () => {
        aim(c, knobX(panel[key]), rowY(row));
        apply(to > 0 ? panel[key] / to : 1);
      },
    });
  };
  if (k.r) slide(0, "u", t.radius / rMax, (q) => (f.r = t.radius * q));
  if (k.p) slide(1, "v", padMax / pMax, (q) => (f.u = q));
  if (!k.r && !k.p) slide(2, "s", 1, () => undefined);
  let bar: Mark | null = null;
  if (hasBar(t, c.phone)) {
    // Wide leaf frames: a tiny alignment toolbar under (or above) the panel.
    const below = py + INSP_H + 6;
    const ty = below + TOOLBAR.h < c.sy + c.vh - 8 ? below : py - TOOLBAR.h - 6;
    bar = c.mark(MK.toolbar, { x: px, y: ty, p: 0, u: -1, img: c.r.toolbarSprite() });
    const ix = px + 3 + t.align * TOOLBAR.icon + TOOLBAR.icon / 2;
    const iy = ty + TOOLBAR.h / 2;
    tl.to(bar, { p: 1, duration: D(c, T.barOpen) });
    step(c, ix, iy, T.barReach);
    const tb = bar;
    tl.call(() => {
      click(c, ix, iy);
      tb.u = t.align;
    });
    wait(c, T.barHold);
  }
  tl.call(() => tool(c, TOOL.arrow, 18));
  tl.to(bar ? [panel, bar] : panel, { p: 0, duration: D(c, T.panelClose), ease: "power1.in" });
}

function typeText(c: Ctx): void {
  const { t, tl } = c;
  const typing = t.kind === "type";
  const target = t.keep ? null : t.el;
  // Scale items are typed small and offset (transform only), then settled.
  const f: Tf | null = t.scale && target ? { dx: t.sdx, dy: t.sdy, s: SMALL } : null;
  const restore = f && target ? holdTf(c, target) : null;
  if (f && target) applyTf(target, f);
  const caret = c.mark(MK.caret, { color: c.color });
  const lb = localBox(t.lines, t.box.w, t.box.h);
  const k = f ? f.s : 1;
  const box = typing
    ? c.mark(MK.box, {
        x: t.box.x + (f ? f.dx : 0) + k * lb.x - 3, y: t.box.y + (f ? f.dy : 0) + k * lb.y - 2,
        w: k * lb.w + 6, h: k * lb.h + 4, label: t.label, a: 0.5, p: 1,
      })
    : null;
  if (target) {
    target.style.opacity = "1";
    target.style.clipPath = EMPTY_CLIP;
  }
  tool(c, TOOL.beam, typing ? 28 : 14);
  typer(c, target, t.lines, t.chars, typing, t.box, caret, f);
  // The caret and box fade on their own, so the agent is free as soon as the text is in.
  tl.call(() => fade(c, box ? [caret, box] : [caret], D(c, T.boxFade)));
  if (f && target && restore) settle(c, target, f, lb, restore);
}

/** Fire-and-forget fade of canvas marks (follows catch-up; never holds the agent). */
function fade(c: Ctx, marks: Mark[], d: number): void {
  c.fx(gsap.to(marks, { a: 0, duration: d, ease: "power1.out" }));
}

/**
 * Clone of the element's text laid over its box, outside the page flow.
 * Draft: mono, muted, shrunk to fit. Face: the real family and color, with
 * nested elements keeping their own faces (used for the weight sweep).
 */
function makeClone(c: Ctx, face: boolean): { node: HTMLElement; chars: CharBox[]; lines: LineBox[] } | null {
  const { t, layer } = c;
  if (!layer) return null;
  const el = t.el;
  const b = t.box;
  const cs = getComputedStyle(el);
  const lr = layer.getBoundingClientRect();
  const node = document.createElement("div");
  node.className = face ? "swarm-draft swarm-draft--face" : "swarm-draft";
  node.setAttribute("aria-hidden", "true");
  node.setAttribute("inert", "");
  const st = node.style;
  for (const p of DRAFT_COPY) st.setProperty(p, cs.getPropertyValue(p));
  const px = (v: string) => Number.parseFloat(v) || 0;
  const fs = px(cs.fontSize);
  if (cs.lineHeight !== "normal" && fs > 0) st.lineHeight = String(px(cs.lineHeight) / fs);
  st.left = `${b.x - lr.left}px`;
  st.top = `${b.y - (lr.top + window.scrollY)}px`;
  st.width = `${b.w}px`;
  st.height = `${b.h}px`;
  for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
    st.setProperty(`padding-${side.toLowerCase()}`, `${px(cs[`padding${side}`]) + px(cs[`border${side}Width`])}px`);
  }
  if (face) {
    st.fontFamily = cs.fontFamily;
    st.color = cs.color;
    st.fontWeight = "250";
    st.opacity = "0";
  } else st.color = cs.getPropertyValue("--swarm-neutral-text").trim() || COLORS.muted;
  for (const child of Array.from(el.childNodes)) node.appendChild(child.cloneNode(true));
  node.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  layer.appendChild(node);
  if (face) return { node, chars: [], lines: [] };
  // Mono runs wider than the real face: shrink until the draft fits the box.
  let size = fs;
  for (let k = 0; k < 4 && (node.scrollHeight > b.h + 1 || node.scrollWidth > b.w + 1); k++) {
    size *= Math.min(0.96, b.w / node.scrollWidth, Math.sqrt(b.h / node.scrollHeight));
    st.fontSize = `${size}px`;
  }
  st.clipPath = EMPTY_CLIP;
  const text = measureText(node, node.getBoundingClientRect());
  if (!text) {
    node.remove();
    return null;
  }
  return { node, ...text };
}

/**
 * Type in a mono draft, pick the real font from a menu, then cross-fade into
 * the real text. With data-build-weight the sweep runs on a face clone (out
 * of flow), so the page never reflows and the real element's weight is never
 * animated.
 */
function typeFont(c: Ctx): boolean {
  const { t, tl, s } = c;
  const draft = makeClone(c, false);
  if (!draft) return false;
  c.run.nodes.push(draft.node);
  const b = t.box;
  // Scale items: the draft (and later the real element) are typed small and offset.
  const f: Tf | null = t.scale ? { dx: t.sdx, dy: t.sdy, s: SMALL } : null;
  const restore = f ? holdTf(c, t.el) : null;
  if (f) {
    applyTf(draft.node, f);
    applyTf(t.el, f);
  }
  const caret = c.mark(MK.caret, { color: c.color });
  const dl = localBox(draft.lines, b.w, b.h);
  const k = f ? f.s : 1;
  const tb: Box = { x: b.x + (f ? f.dx : 0) + k * dl.x, y: b.y + (f ? f.dy : 0) + k * dl.y, w: k * dl.w, h: k * dl.h };
  const box = c.mark(MK.box, { x: tb.x - 3, y: tb.y - 2, w: tb.w + 6, h: tb.h + 4, label: t.label, a: 0.5, p: 1 });
  tool(c, TOOL.beam, 28);
  typer(c, draft.node, draft.lines, draft.chars, true, b, caret, f);
  tl.call(() => {
    caret.blink = true;
    tool(c, TOOL.arrow, 14);
    c.log(`typed ${t.logName}`);
  });
  wait(c, T.pause);

  // Menu: the draft face, the real family and either a second family found in
  // the text (picked too) or a decoy.
  const two = !!t.fontName2;
  const rows = ["Geist Mono", t.fontName, two ? t.fontName2 : t.fontName === "Inter" ? "Geist" : "Inter"];
  const h = dropH(rows.length);
  let mx = tb.x + tb.w + 14;
  let my = tb.y;
  if (mx + DROP.w > c.vw - 8) [mx, my] = [clamp(tb.x, 8, c.vw - DROP.w - 8), tb.y + tb.h + 8];
  if (my + h > c.sy + c.vh - 8) my = Math.max(c.sy + 8, tb.y - h - 8);
  const menu = c.mark(MK.drop, { x: mx, y: my, p: 0, u: 0, v: 0, img: c.r.dropSprite(rows, 0b001) });
  const picked = c.r.dropSprite(rows, 0b010);
  const both = c.r.dropSprite(rows, 0b110);
  const rx = mx + DROP.w - 34;
  const ry = (k: number) => my + DROP.pad + k * DROP.row + DROP.row / 2;
  // The cursor heads for the menu during the pause (the caret keeps blinking).
  tl.call(() => aim(c, rx, ry(0)), undefined, `-=${D(c, T.pause) * 0.6}`);
  tl.call(() => click(c, rx, ry(0)));
  tl.to(menu, { p: 1, duration: D(c, T.menuOpen), ease: "power2.out" });
  tl.call(() => aim(c, rx, ry(1)));
  tl.to(menu, { u: 1, duration: D(c, T.menuHover), ease: "power2.inOut" });
  tl.call(() => {
    click(c, rx, ry(1));
    menu.img = picked;
  });
  if (two) {
    tl.call(() => aim(c, rx, ry(2)));
    tl.to(menu, { u: 2, duration: D(c, T.menuHover), ease: "power2.inOut" });
    tl.call(() => {
      click(c, rx, ry(2));
      menu.img = both;
    });
  }
  tl.call(() => c.log(`swapped font → ${t.fontName}${two ? ` + ${t.fontName2}` : ""}`));
  tl.to(menu, { p: 0, duration: D(c, T.menuClose), delay: T.menuHold * s, ease: "power1.in" });
  tl.call(() => void (caret.a = 0), undefined, "<");

  if (!t.sweep) {
    // Morph: the draft blurs out while the real text (real font and color) blurs in.
    const d = D(c, T.morph);
    tl.to(draft.node, { opacity: 0, filter: "blur(4px)", duration: d, ease: "power1.inOut" }, "<");
    tl.fromTo(t.el, { opacity: 0, filter: "blur(4px)" }, { opacity: 1, filter: "blur(0px)", duration: d, ease: "power1.inOut" }, "<");
    tl.to(box, { a: 0, duration: D(c, T.boxFade) }, "<");
    tl.call(() => draft.node.remove());
    if (f && restore) settle(c, t.el, f, localBox(t.lines, b.w, b.h), restore);
    return true;
  }

  // Sweep: draft -> face clone at weight 250, sweep the clone to the real
  // weight, then hand over to the real element (already at its weight).
  const face = makeClone(c, true);
  if (!face) return true;
  c.run.nodes.push(face.node);
  if (f) applyTf(face.node, f);
  const d1 = D(c, T.toFace);
  tl.to(draft.node, { opacity: 0, filter: "blur(4px)", duration: d1, ease: "power1.inOut" }, "<");
  tl.fromTo(face.node, { opacity: 0, filter: "blur(4px)" }, { opacity: 1, filter: "blur(0px)", duration: d1, ease: "power1.inOut" }, "<");
  tl.to(box, { a: 0, duration: D(c, T.boxFade) }, "<");
  const sweep = { w: 250 };
  tl.to(sweep, {
    w: t.weight,
    duration: Math.max(MIN_T, T.sweep * Math.max(0.7, s)),
    ease: "power2.out",
    onUpdate: () => void (face.node.style.fontWeight = String(Math.round(sweep.w))),
  });
  const d2 = D(c, T.toReal);
  tl.fromTo(t.el, { opacity: 0 }, { opacity: 1, duration: d2, ease: "power1.inOut" });
  tl.to(face.node, { opacity: 0, duration: d2, ease: "power1.inOut" }, "<");
  tl.call(() => {
    draft.node.remove();
    face.node.remove();
    c.log(`weight 250 → ${t.weight}`);
  });
  if (f && restore) settle(c, t.el, f, localBox(t.lines, b.w, b.h), restore);
  return true;
}

/**
 * Grid (data-build-grid): dashed column/row structure from the cells' edges,
 * then one crosshair sweep per row drags out a hatched placeholder per cell.
 */
function grid(c: Ctx): void {
  const { t, tl, s } = c;
  const b = t.box;
  const lime = ROLE_COLOR.layout;
  const ext = 10;
  tool(c, TOOL.cross, 26);
  const lines: Mark[] = [];
  for (const x of t.cols) lines.push(c.mark(MK.guide, { x, y: b.y - ext, x2: x, y2: b.y + b.h + ext, color: lime }));
  for (const y of t.rows) lines.push(c.mark(MK.guide, { x: b.x - ext, y, x2: b.x + b.w + ext, y2: y, color: lime }));
  const n = lines.length;
  const lineDur = D(c, T.gridLine);
  const gap = Math.min(0.025, 0.2 / Math.max(1, n)) * s;
  const ride = { q: 0 };
  tl.to(ride, { q: 1, duration: lineDur + gap * Math.max(0, n - 1), ease: "power1.inOut", onUpdate: () => aim(c, b.x + b.w * ride.q, b.y) }, 0);
  lines.forEach((m, k) => tl.to(m, { p: 1, duration: lineDur, ease: "power2.out" }, k * gap));
  // Group cells into rows by their top edge, left to right.
  const rows: number[][] = [];
  t.cellBoxes
    .map((cb, i) => i)
    .sort((a, z) => t.cellBoxes[a].y - t.cellBoxes[z].y || t.cellBoxes[a].x - t.cellBoxes[z].x)
    .forEach((i) => {
      const row = rows[rows.length - 1];
      if (row && Math.abs(t.cellBoxes[row[0]].y - t.cellBoxes[i].y) <= 3) row.push(i);
      else rows.push([i]);
    });
  const start = tl.duration();
  // Lines drawn: cell content may be claimed now (agents arrive as the boxes grow).
  tl.call(() => void (t.ready = true), undefined, start);
  const sweep = D(c, T.rowSweep);
  const rgap = Math.min(0.08, 0.3 / Math.max(1, rows.length)) * s;
  const grow = D(c, T.cellGrow);
  rows.forEach((row, r) => {
    const at = start + r * rgap;
    row.forEach((ci, k) => {
      const cb = t.cellBoxes[ci];
      const h = c.mark(MK.holder, { x: cb.x, y: cb.y, w: cb.w, h: cb.h, color: lime });
      c.holder(t.cells[ci], h);
      tl.to(h, { p: 1, duration: grow, ease: "power2.out" }, at + (k / row.length) * Math.max(0, sweep - grow));
    });
    if (r !== rows.length - 1) return;
    // The agent rides the last row's sweep along its bottom edge.
    const x0 = t.cellBoxes[row[0]].x;
    const last = t.cellBoxes[row[row.length - 1]];
    const y = Math.max(...row.map((i) => t.cellBoxes[i].y + t.cellBoxes[i].h));
    const st = { q: 0 };
    tl.to(st, { q: 1, duration: sweep, ease: "none", onUpdate: () => aim(c, x0 + (last.x + last.w - x0) * st.q, y) }, at);
  });
  tl.call(() => {
    c.log(`grid ${t.dims[0]}×${t.dims[1]} · ${c.run.m.name}`, true);
    c.log(`boxed ${t.cells.length} cell${t.cells.length === 1 ? "" : "s"}`, true);
    c.fx(gsap.to(lines, { a: 0.45, duration: D(c, T.dim) }));
  });
}

/** Outline + scan for images that must stay visible. */
function scanImage(c: Ctx): void {
  const { t, tl } = c;
  const b = t.box;
  const f = c.mark(MK.frame, { x: b.x, y: b.y, w: b.w, h: b.h, label: t.label, r: t.radius });
  const scan = c.mark(MK.scan, { x: b.x, y: b.y, w: b.w, h: b.h, a: 0 });
  tool(c, TOOL.cross, 30);
  tl.to(f, { p: 1, duration: D(c, T.scanOutline), ease: "power2.inOut", onUpdate: () => aim(c, b.x + b.w * f.p, b.y + b.h * f.p) });
  tl.call(() => void (scan.a = 1));
  tl.to(scan, { p: 1, duration: D(c, T.scanPass), ease: "power1.inOut", onUpdate: () => aim(c, b.x + b.w + 3, b.y + b.h * scan.p) });
  tl.to(scan, { a: 0, duration: D(c, T.scanFade) });
  tl.to(f, { a: 0.35, duration: D(c, T.dim) }, "<");
}

/** Grab a card at the viewport edge, drag it in on a curve, drop it on the slot. */
function dragIn(c: Ctx): void {
  const { t, tl, sim, i } = c;
  const e = (x: number) => Math.max(MIN_T, x * c.s * c.dragTime);
  const b = t.box;
  const x0 = sim.x[i];
  const y0 = sim.y[i];
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const s0 = c.phone ? 0.7 : 0.55;
  const card = c.mark(MK.card, {
    x: x0, y: y0, w: b.w, h: b.h, s: s0 * 0.8, a: 0,
    img: c.r.cardSprite(b.w, b.h, t.radius, t.img, t.alt, t.fit, t.pos),
  });
  const dx = cx - x0;
  const dy = cy - y0;
  const len = Math.hypot(dx, dy) || 1;
  const bend = (i % 2 ? 1 : -1) * Math.min(140, len * 0.2);
  const qx = (x0 + cx) / 2 - (dy / len) * bend;
  const qy = (y0 + cy) / 2 + (dx / len) * bend;
  const tilt = clamp(dx / 1400, -0.1, 0.1) + (bend > 0 ? 0.03 : -0.03);
  const st = { q: 0 };
  tool(c, TOOL.hand, 40);
  tl.call(() => click(c, x0, y0));
  tl.to(card, { a: 1, s: s0, duration: e(T.grab), ease: "power2.out" });
  tl.to(st, {
    q: 1,
    duration: e(T.drag),
    ease: "power2.inOut",
    onUpdate: () => {
      const q = st.q;
      const m = 1 - q;
      card.x = m * m * x0 + 2 * m * q * qx + q * q * cx;
      card.y = m * m * y0 + 2 * m * q * qy + q * q * cy;
      card.r = tilt * Math.sin(Math.PI * q);
      card.s = s0 + (1 - s0) * q;
      aim(c, card.x, card.y);
    },
  });
  tl.to(card, { s: 1.035, duration: e(T.over), ease: "power1.out" });
  tl.to(card, { s: 1, duration: e(T.settle), ease: "power2.inOut" });
  tl.call(() => {
    click(c, cx, cy);
    tool(c, TOOL.arrow, 18);
  });
  if (!t.keep) tl.fromTo(t.el, { opacity: 0 }, { opacity: 1, duration: e(T.cardFade) }, "<");
  tl.to(card, { a: 0, duration: e(T.cardFade) }, "<");
}

/** Alt-drag ghost copies from the list master into each slot of the batch, in one sweep. */
function dup(c: Ctx, master: Box): void {
  const { t, tl, s, sim, i } = c;
  const mb = master;
  const n = t.slots.length;
  const per = D(c, T.ghost);
  const gap = Math.min(T.ghostGap, 0.3 / n) * s;
  const appear = D(c, T.slotFade);
  tool(c, TOOL.hand, 26);
  sim.flag[i] = 1;
  t.slotBoxes.forEach((sb, gi) => {
    const g = c.mark(MK.ghost, { x: sb.x, y: sb.y, w: sb.w, h: sb.h, x2: mb.x, y2: mb.y, w2: mb.w, h2: mb.h, a: 0.9 });
    const at = gi * gap;
    const lead = gi === n - 1;
    const ax = mb.x + mb.w / 2;
    const ay = mb.y + mb.h / 2;
    const bx = sb.x + sb.w / 2;
    const by = sb.y + sb.h / 2;
    tl.to(g, {
      p: 1,
      duration: per,
      ease: "power2.inOut",
      onUpdate: lead ? () => aim(c, ax + (bx - ax) * g.p, ay + (by - ay) * g.p) : undefined,
    }, at);
    const slot = t.slots[gi];
    if (!keeps(slot, c.phone)) tl.fromTo(slot, { opacity: 0 }, { opacity: 1, duration: appear }, at + per - appear * 0.5);
    tl.call(() => fade(c, [g], D(c, T.ghostFade)), undefined, at + per);
  });
}

/** Color wheel: hue ring, then the S/V square, then tween neutral -> real color. */
function colorPick(c: Ctx): void {
  const { t, tl, s } = c;
  const b = t.box;
  const [wx, wy] = dock(c, b, WHEEL.w, WHEEL.h);
  const [hue, sat, val] = t.hsv;
  const wheel = c.mark(MK.wheel, {
    x: wx, y: wy, p: 0, u: hue - 150, x2: 0.5, y2: 0.5, h2: 0, label: t.hex, color: t.hex,
    img: c.r.wheelSprite(),
  });
  const cx = wx + WHEEL.cx;
  const cy = wy + WHEEL.cy;
  const rm = (WHEEL.ro + WHEEL.ri) / 2;
  const ringX = () => cx + Math.cos(((wheel.u - 90) * Math.PI) / 180) * rm;
  const ringY = () => cy + Math.sin(((wheel.u - 90) * Math.PI) / 180) * rm;
  const sqX = () => cx - WHEEL.sq / 2 + wheel.x2 * WHEEL.sq;
  const sqY = () => cy - WHEEL.sq / 2 + (1 - wheel.y2) * WHEEL.sq;
  tool(c, TOOL.picker, 16);
  tl.call(() => {
    flash(c, b);
    aim(c, ringX(), ringY());
  });
  tl.to(wheel, { p: 1, duration: D(c, T.wheelOpen), ease: "power2.out" });
  tl.call(() => {
    tool(c, TOOL.picker, 30);
    click(c, ringX(), ringY());
  });
  tl.to(wheel, { u: hue, duration: D(c, T.ring), ease: "power2.inOut", onUpdate: () => aim(c, ringX(), ringY()) });
  // Straight from the ring into the square: the handle travels, the cursor follows.
  // Phones: the square handle moves together with the ring (one step fewer).
  if (c.phone) tl.to(wheel, { x2: sat, y2: val, duration: D(c, T.ring), ease: "power2.inOut" }, "<");
  else tl.to(wheel, { x2: sat, y2: val, duration: D(c, T.square), ease: "power2.inOut", onUpdate: () => aim(c, sqX(), sqY()) });
  tl.call(() => click(c, sqX(), sqY()));
  const st = { q: 0 };
  const el = t.el;
  tl.to(wheel, { h2: 1, duration: D(c, T.readout) });
  tl.to(st, {
    q: 1,
    duration: D(c, T.tint),
    ease: "power1.inOut",
    onUpdate: () => el.style.setProperty(t.prop, rgbaCss(t.from4, t.to4, st.q)),
  }, "<");
  tl.to(wheel, { p: 0, duration: D(c, T.wheelClose), delay: T.wheelHold * s, ease: "power1.in" });
}

const plural = (s: string) => (/^[a-z]+$/i.test(s) && !s.endsWith("s") ? s + "s" : s);

/** Builds the task's timeline. */
export function choreograph(c: Ctx, master: Box | null): void {
  const t = c.t;
  let what = "";
  if (t.kind === "grid") {
    grid(c);
  } else if (t.kind === "frame") {
    frame(c);
    what = t.inspect
      ? `tuned radius ${Math.round(t.radius)} · padding ${Math.round(Math.max(...t.pad))}`
      : `framed ${t.logName}`;
  } else if (t.kind === "image") {
    (t.drag ? dragIn : scanImage)(c);
    what = `${t.drag ? "dragged" : "scanned"} ${t.logName}`;
  } else if (t.kind === "dup") {
    dup(c, master ?? t.slotBoxes[0]);
    what = `dup ×${t.slots.length} ${plural(t.label)}`;
  } else if (t.kind === "color") {
    colorPick(c);
    what = `picked ${t.hex}`;
  } else if (!(t.kind === "type" && t.font && typeFont(c))) {
    typeText(c);
    what = `${t.kind === "type" ? "typed" : "revealed"} ${t.logName}`;
  }
  c.tl.call(() => {
    if (t.kind !== "grid") flash(c, t.box);
    if (what) c.log(what);
  });
}
