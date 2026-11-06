// Part of living-ui-skills (MIT). Adapt freely.
// https://github.com/anhlamtruong/living-ui-skills
// Scheduling: section lifecycle (plan -> build -> review), task claiming, the
// boot from the hero's agent mesh, handoff packets, the live log, inspect mode,
// the deploy finale, and the single gsap.ticker loop that steps the simulation
// and draws the overlay. Per-task timelines live in choreo.ts. Nothing here
// sets React state per frame.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CU_MAX, type Ctx, choreograph, edgePoint, gridLead, neutralCss, taskTime } from "./choreo";
import { readProps } from "./inspect";
import { LiveLog } from "./log";
import { COLORS, ROLE_COLOR, SESSION_KEY, rolePref } from "./palette";
import { Renderer } from "./renderer";
import { measureSection, measureSteps, scanPage } from "./scan";
import { Sim } from "./sim";
import {
  MK, TASK_CLAIMED, TASK_DONE, TASK_PENDING, TASK_RUNNING, TOOL,
  type Anim, type Mark, type MarkKind, type Profile, type Role, type Run, type Task,
} from "./types";
import { CHECK, CHECK_H, DEPLOY, PROPS } from "./widgets";

gsap.registerPlugin(ScrollTrigger);

// Agent modes.
const OFF = 0;
const IDLE = 1;
const TRAVEL = 2;
const WORK = 3;
const EXIT = 4;
/** Waiting on a lit mesh node to pop in. */
const SLEEP = 5;
/** Escorting the inspect-mode property sheet. */
const INSPECT = 6;
/** Running the deploy finale. */
const DEPLOYING = 7;
// Section phases.
const WAIT = 0;
const PLAN = 1;
const BUILD = 2;
const REVIEW = 3;
const DONE = 4;
/** Planner hands off to the workers this soon after a section starts (s). */
const HANDOFF = 0.3;
/** Expected travel per task (s), for planning. */
const TRAVEL_EST = 0.14;
/** Catch-up ramp length (s): keeps every timeScale change under ~1.2x per 100 ms. */
const CU_RAMP = 0.7;
/** Seconds over which the mesh nodes light up at boot. */
const BOOT_LIGHT = 0.45;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

interface Brain {
  mode: number;
  run: Run | null;
  task: Task | null;
  hx: number;
  hy: number;
  until: number;
  go: ((i: number) => void) | null;
  /** When the agent started idling (its loop's clock), or -1. */
  idleAt: number;
}

/** Idle agents keep looping this long after the last build activity (s). */
const IDLE_LINGER = 6;
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

export interface InspectState {
  available: boolean;
  on: boolean;
}

export interface DirectorOptions {
  canvas: HTMLCanvasElement;
  /** Absolutely positioned layer for draft-font clones (outside the page flow). */
  layer: HTMLElement | null;
  profile: Profile;
  /** Current vertical scroll (Lenis when present, else window.scrollY). */
  getScroll: () => number;
  /** Called when building starts/stops (rare; safe to set React state). */
  onBusy: (busy: boolean) => void;
  /** Called when inspect mode becomes available or toggles. */
  onInspect?: (s: InspectState) => void;
}

function clearInline(el: HTMLElement): void {
  el.style.removeProperty("opacity");
  el.style.removeProperty("clip-path");
  el.style.removeProperty("filter");
  if (el.getAttribute("style") === "") el.removeAttribute("style");
}

function markBuilt(el: HTMLElement): void {
  el.setAttribute("data-built", "");
  clearInline(el);
}

/** Neutral color while a color-wheel task waits; remembers the author's inline value. */
function applyTint(t: Task): void {
  if (!t.prop || t.prev !== null) return;
  t.prev = t.el.style.getPropertyValue(t.prop);
  t.el.style.setProperty(t.prop, neutralCss(t));
}

function clearTint(t: Task): void {
  if (!t.prop || t.prev === null) return;
  if (t.prev) t.el.style.setProperty(t.prop, t.prev);
  else t.el.style.removeProperty(t.prop);
  t.prev = null;
  if (t.el.getAttribute("style") === "") t.el.removeAttribute("style");
}

/** Reviewer phase timings for a section budget B (all >= 120 ms). */
const review = (B: number, phone = false) => ({
  travel: Math.min(0.18, 0.04 * B),
  outline: Math.max(0.12, Math.min(0.4, 0.09 * B)),
  open: 0.12,
  ticks: Math.max(0.12, Math.min(0.36, 0.07 * B)),
  hold: phone ? 0 : 0.12,
});

/** Seconds left for the build phase once planning and review are set aside. */
function buildWindow(B: number, handoff = HANDOFF, phone = false): number {
  const r = review(B, phone);
  return Math.max(0.6, B - handoff - (r.travel + r.outline * 0.6 + r.open + r.ticks + r.hold) - 0.12);
}

export class Director {
  readonly agentCount: number;
  private readonly o: DirectorOptions;
  private readonly sim: Sim;
  private readonly renderer: Renderer;
  private readonly roles: Role[];
  private readonly brains: Brain[];
  private readonly workers: number[] = [];
  private readonly planner: number;
  private readonly reviewer: number;
  private readonly log = new LiveLog();
  private runs: Run[] = [];
  private hero: Run | null = null;
  private byEl = new Map<Element, Run>();
  private taskByEl = new Map<Element, Task>();
  private marks: Mark[] = [];
  private fx: Anim[] = [];
  private finales: Anim[] = [];
  private summaries: Run[] = [];
  private lit: Element[] = [];
  private lightTl: Anim | null = null;
  private clock = 0;
  private elapsed = 0;
  private layoutVer = 0;
  private pre = new Map<Run, { gen: Generator<void, void, void>; ver: number; done: boolean }>();
  private idle = 0;
  private preAt = 0;
  private paceAt = 0;
  private lastBusy = 0;
  private readonly loopR: Float32Array;
  private readonly loopW: Float32Array;
  private readonly loopDir: Float32Array;
  /** Planner hand-off delay (shorter on phones). */
  private readonly handoff: number;
  private paceTick = false;
  private sy = 0;
  private vw = 0;
  private vh = 0;
  private ticking = false;
  private hidden = false;
  private busy = false;
  private alive = true;
  private exitDown: boolean | null = null;
  private statsEl: HTMLElement | null = null;
  private statsAt = -1;
  private ro: ResizeObserver | null = null;
  private roSeen = new WeakSet<Element>();
  private roFrame = 0;
  private canInspect = false;
  private inspecting = false;
  private inspAgent = -1;
  private inspEl: HTMLElement | null = null;
  private inspFrame: Mark | null = null;
  private inspPanel: Mark | null = null;

  constructor(o: DirectorOptions) {
    this.o = o;
    this.roles = o.profile.roles;
    this.agentCount = this.roles.length;
    this.sim = new Sim(this.roles.length, o.profile.accel);
    this.handoff = o.profile.kind === "phone" ? 0.2 : HANDOFF;
    this.renderer = new Renderer(o.canvas, o.profile.dprCap, this.roles.map((r) => ROLE_COLOR[r]), o.profile.labels);
    this.brains = this.roles.map(() => ({ mode: OFF, run: null, task: null, hx: 0, hy: 0, until: 0, go: null, idleAt: -1 }));
    // Each agent's own idle loop: radius, angular speed and direction.
    const n = this.roles.length;
    this.loopR = new Float32Array(n);
    this.loopW = new Float32Array(n);
    this.loopDir = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.loopR[i] = o.profile.kind === "phone" ? 10 : 12 + Math.random() * 12;
      this.loopW[i] = (Math.PI * 2) / (1.4 + Math.random() * 0.8);
      this.loopDir[i] = Math.random() < 0.5 ? -1 : 1;
    }
    this.planner = this.roles.indexOf("planner");
    this.reviewer = this.roles.indexOf("reviewer");
    this.roles.forEach((r, i) => r !== "planner" && r !== "reviewer" && this.workers.push(i));
  }

  // ---------------------------------------------------------------- public

  /** Scan the page and arm triggers. `active` = the html build flag is on. */
  start(active: boolean): void {
    const p = this.o.profile;
    const { sections, orphans } = scanPage({ workers: this.workers.length, phone: p.kind === "phone", detail: p.detail });
    orphans.forEach(markBuilt);
    this.runs = sections.map((m) => ({
      m, phase: WAIT, B: m.onLoad ? p.heroBudget : p.budget, t0: 0, deadline: 0, scale: 1, speedMul: 1,
      joinGate: 0, buildAt: 0, stagger: 0.08, catchUp: 1, cuTarget: 1, cuTween: null, cuApplied: 1, work: [],
      undo: [], holders: new Map(),
      marks: [], anims: [], nodes: [], recent: [], took: 0, st: null,
    }));
    this.hero = this.runs.find((r) => r.m.onLoad) ?? this.runs[0] ?? null;
    for (const r of this.runs) {
      this.byEl.set(r.m.el, r);
      for (const t of r.m.tasks) if (t.kind === "frame" || t.kind === "image") this.taskByEl.set(t.el, t);
    }
    this.canInspect =
      p.kind !== "phone" && window.innerWidth >= 1024 && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    this.renderer.prepareChecklist();
    document.addEventListener("focusin", this.onFocus);
    document.addEventListener("pointerover", this.onPointer, { passive: true });
    document.addEventListener("keydown", this.onKey);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("scroll", this.onScroll, { passive: true });
    this.ro = new ResizeObserver(this.onSectionResize);
    this.runs.forEach((r) => this.ro?.observe(r.m.el));
    if (!active) {
      for (const r of this.runs) {
        r.phase = DONE;
        r.m.tasks.forEach((t) => (t.state = TASK_DONE));
        if (r.m.finale) this.finale(r, true);
      }
      this.o.onBusy(false);
      this.emitInspect();
      return;
    }
    this.log.start();
    this.arm(true);
    this.emitInspect();
  }

  /** Finish every section immediately (and jump the finale to deployed). */
  skip(): void {
    this.runs.forEach((r) => this.finish(r, true));
    this.finales.slice().forEach((a) => a.progress(1));
    this.unlight();
    this.log.restore();
  }

  /** Reset every section and rebuild the ones in view; re-arm the rest. */
  replay(): void {
    if (!this.alive) return;
    this.setInspect(false);
    this.finales.forEach((a) => a.kill());
    this.finales = [];
    this.unlight();
    for (const run of this.runs) {
      this.reset(run);
      run.phase = WAIT;
      run.recent = [];
      run.took = 0;
      for (const t of run.m.tasks) {
        t.state = TASK_PENDING;
        t.agent = -1;
        t.ready = false;
        for (const el of [...t.slots, ...t.absorbed]) {
          el.removeAttribute("data-built");
          clearInline(el);
        }
      }
      run.m.el.removeAttribute("data-built");
      run.m.el.querySelector("[data-deploy-target]")?.removeAttribute("data-deployed");
    }
    this.marks.forEach((m) => gsap.killTweensOf(m));
    this.marks.length = 0;
    this.fx.forEach((a) => a.kill());
    this.fx = [];
    this.summaries = [];
    this.brains.forEach((b, i) => b.mode !== OFF && b.mode !== EXIT && this.release(i));
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {}
    document.documentElement.dataset.build = "on";
    this.elapsed = 0;
    this.setBusy();
    this.log.restore();
    this.log.start();
    this.cancelPre();
    this.pre.clear();
    this.layoutVer++;
    this.arm(false);
    this.emitInspect();
  }

  /** Inspect mode: hovering/focusing built frames and images shows their real values. */
  setInspect(on: boolean): void {
    const next = on && this.canInspect && (!this.hero || this.hero.phase === DONE);
    if (next === this.inspecting) return;
    this.inspecting = next;
    if (next) {
      this.ensureTicking();
      this.inspectAt(document.activeElement);
    } else this.closeInspect();
    this.emitInspect();
  }

  setStatsTarget(el: HTMLElement | null): void {
    this.statsEl = el;
    this.writeStats(true);
  }

  destroy(): void {
    this.alive = false;
    gsap.ticker.remove(this.tick);
    this.ticking = false;
    cancelAnimationFrame(this.roFrame);
    this.ro?.disconnect();
    document.removeEventListener("focusin", this.onFocus);
    document.removeEventListener("pointerover", this.onPointer);
    document.removeEventListener("keydown", this.onKey);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("scroll", this.onScroll);
    this.cancelPre();
    for (const run of this.runs) {
      this.reset(run);
      for (const t of run.m.tasks) [...t.slots, ...t.absorbed].forEach(clearInline);
    }
    this.finales.forEach((a) => a.kill());
    this.marks.forEach((m) => gsap.killTweensOf(m));
    this.fx.forEach((a) => a.kill());
    this.unlight();
    this.log.restore();
    this.renderer.hide();
  }

  // ------------------------------------------------------------ lifecycle

  /** Kills a run's animations and temporary DOM/styles without building it. */
  private reset(run: Run): void {
    run.st?.kill();
    run.st = null;
    run.anims.forEach((a) => a.kill());
    run.anims = [];
    run.marks = [];
    run.nodes.forEach((n) => n.remove());
    run.nodes = [];
    run.undo.forEach((u) => u());
    run.undo = [];
    run.holders.clear();
    run.m.tasks.forEach((t) => {
      clearTint(t);
      t.tl = null;
    });
    this.resetPace(run);
  }

  private resetPace(run: Run): void {
    run.cuTween?.kill();
    run.cuTween = null;
    run.catchUp = run.cuTarget = run.cuApplied = 1;
    run.work = [];
  }

  private arm(initial: boolean): void {
    this.schedulePre();
    this.readView();
    for (const run of this.runs) {
      if (run.phase !== WAIT) continue;
      const r = run.m.el.getBoundingClientRect();
      const boot = run === this.hero && run.m.onLoad;
      if ((initial && run.m.onLoad) || (r.top < this.vh * 0.78 && r.bottom > 0)) this.request(run, boot);
      else if (r.bottom <= 0) this.finish(run, true);
      else {
        run.st = ScrollTrigger.create({
          trigger: run.m.el,
          start: "top 78%",
          once: true,
          onEnter: () => this.request(run, false),
        });
      }
    }
  }

  private request(run: Run, boot: boolean): void {
    if (!this.alive || run.phase !== WAIT) return;
    run.st?.kill();
    run.st = null;
    this.readView();
    const m = run.m;
    // Use the idle-time pre-measure if no layout change happened since.
    const pm = this.pre.get(run);
    if (pm && pm.ver === this.layoutVer) while (!pm.done) pm.done = !!pm.gen.next().done;
    else measureSection(m, this.o.profile.detail.autoTune, this.o.profile.kind === "phone");
    this.pre.delete(run);
    for (const t of m.tasks) if (t.state !== TASK_DONE && (t.box.w < 1 || t.box.h < 1)) this.taskDone(run, t);
    const open = m.tasks.filter((t) => t.state !== TASK_DONE);
    if (!open.length || m.box.y + m.box.h <= this.sy) return this.finish(run, true);

    run.phase = PLAN;
    run.t0 = this.clock;
    this.resetPace(run);
    this.estimate(run, open);
    if (!(boot && this.boot(run))) this.spawn(run, open.length);
    this.ensureTicking();
    const p = this.brains[this.planner];
    const g = m.guides[0];
    if (p.mode === OFF || p.mode === IDLE || p.mode === EXIT) {
      this.send(this.planner, run, g.x1, g.y1, Math.min(0.22, 0.06 * run.B), (i) => this.plan(run, i), null);
    } else this.plan(run, -1);
    this.setBusy();
  }

  /** Picks the duration scale that makes the build phase fit the section's target. */
  private estimate(run: Run, open: Task[]): void {
    const tasks = run.m.tasks;
    const dt = this.o.profile.detail.dragTime;
    const W = buildWindow(run.B, this.handoff, this.o.profile.kind === "phone");
    const crew = this.crew(open.length);
    run.stagger = clamp((0.25 * W) / crew, 0.04, 0.1);
    const time = (sc: number) => {
      const memo = new Map<number, number>();
      const path = (t: Task): number => {
        const hit = memo.get(t.id);
        if (hit !== undefined) return hit;
        memo.set(t.id, 0);
        let longest = 0;
        for (const d of t.deps) if (tasks[d].state !== TASK_DONE) longest = Math.max(longest, readyAt(tasks[d]));
        const v = taskTime(t, sc, dt) + TRAVEL_EST + longest;
        memo.set(t.id, v);
        return v;
      };
      // Grids release their cells once the lines are drawn.
      const readyAt = (t: Task) => (t.kind === "grid" ? path(t) - taskTime(t, sc, dt) + gridLead(t, sc) : path(t));
      let sum = 0;
      let cp = 0;
      for (const t of open) {
        sum += taskTime(t, sc, dt) + TRAVEL_EST;
        cp = Math.max(cp, path(t));
      }
      return Math.max(sum / crew + run.stagger * crew * 0.5, cp);
    };
    let lo = 0.35;
    let hi = 1;
    if (time(1) <= W) lo = 1;
    else {
      for (let k = 0; k < 7; k++) {
        const mid = (lo + hi) / 2;
        if (time(mid) <= W) lo = mid;
        else hi = mid;
      }
    }
    run.scale = lo;
    run.speedMul = clamp(1.2 / lo, 1, 1.6);
    for (const t of open) t.est = taskTime(t, lo, dt);
  }

  /** Workers worth bringing in for n open tasks (everyone for big sections). */
  private crew(n: number): number {
    if (n > 8) return this.workers.length;
    return clamp(Math.ceil(n / 1.5), Math.min(2, this.workers.length), this.workers.length);
  }

  /** Brings enough agents into view for this section. */
  private spawn(run: Run, nOpen: number): void {
    const { sy, vh, vw } = this;
    const s = this.sim;
    const m = run.m;
    const L = m.guides[1].x1;
    const R = m.guides[2].x1;
    const restY = Math.min(m.box.y + m.box.h, sy + vh) - 48;
    const wanted = this.crew(nOpen);
    const far = (i: number) => s.y[i] < sy - vh * 0.6 || s.y[i] > sy + vh * 1.6;
    let active = this.workers.filter((i) => this.brains[i].mode !== OFF && this.brains[i].mode !== EXIT).length;
    let k = 0;
    // Entry point just off-screen: below the viewport, or (layout agents, when
    // the section has a grid) beside the grid's top so it is boxed promptly.
    const grid = m.tasks.find((t) => t.kind === "grid" && t.state !== TASK_DONE);
    const enter = (i: number) => {
      if (grid && this.roles[i] === "layout") s.place(i, grid.box.x < vw / 2 ? -30 : vw + 30, clamp(grid.box.y, sy + 40, sy + vh - 40));
      else s.place(i, L + Math.random() * (R - L), sy + vh + 30 + Math.random() * 80);
    };
    // Idle agents still looping where an earlier section was, now out of view,
    // re-enter from just off-screen (unseen, so nobody sees a jump).
    for (const i of this.workers) {
      const b = this.brains[i];
      if (b.mode !== IDLE || (s.y[i] > sy - 40 && s.y[i] < sy + vh + 40)) continue;
      enter(i);
      s.speed[i] = this.o.profile.speed * run.speedMul;
      b.hx = L + Math.random() * (R - L);
      b.hy = restY - Math.random() * 30;
      b.idleAt = -1;
    }
    const order = grid ? [...this.workers].sort((a, z) => +(this.roles[z] === "layout") - +(this.roles[a] === "layout")) : this.workers;
    for (const i of order) {
      const b = this.brains[i];
      if (b.mode !== OFF && b.mode !== EXIT) continue;
      if (active >= wanted) break;
      active++;
      if (b.mode === OFF || far(i)) enter(i);
      s.on[i] = 1;
      s.tool[i] = TOOL.arrow;
      b.mode = IDLE;
      b.run = null;
      s.speed[i] = this.o.profile.speed * run.speedMul;
      b.hx = L + ((k++ + 0.5) / wanted) * (R - L);
      b.hy = restY - Math.random() * 30;
    }
    const edgeY = (y: number) => clamp(y, sy + 40, sy + vh - 40);
    for (const [i, x, y] of [
      [this.planner, -30, edgeY(m.tagY)],
      [this.reviewer, vw + 30, edgeY(m.box.y + 40)],
    ] as const) {
      const b = this.brains[i];
      if (b.mode !== OFF && b.mode !== EXIT && b.mode !== IDLE) continue;
      if (b.mode === OFF || far(i)) {
        s.place(i, x, y);
        b.hx = x;
        b.hy = y;
        b.idleAt = -1;
      }
      s.on[i] = 1;
      if (b.mode === OFF || b.mode === EXIT) {
        b.mode = IDLE;
        b.hx = s.x[i];
        b.hy = s.y[i];
        s.tool[i] = TOOL.arrow;
        s.speed[i] = this.o.profile.speed;
      }
    }
  }

  /**
   * Boot from the hero's agent mesh: light [data-swarm-spawn] nodes one by one
   * and pop each agent out of a node of its role. Desktop only; returns false
   * (caller falls back to the edge spawn) when no node is visible.
   */
  private boot(run: Run): boolean {
    if (this.o.profile.kind === "phone" || this.vw < 1024) return false;
    const pts: { el: Element; role: string; x: number; y: number }[] = [];
    for (const el of Array.from(document.querySelectorAll("[data-swarm-spawn]"))) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      pts.push({ el, role: el.getAttribute("data-swarm-spawn") ?? "", x: r.left + r.width / 2, y: r.top + r.height / 2 + this.sy });
    }
    if (!pts.length) return false;
    pts.sort((a, b) => Number(b.role === "planner") - Number(a.role === "planner"));
    const step = BOOT_LIGHT / pts.length;
    const light = gsap.timeline();
    pts.forEach((p, k) => light.call(() => p.el.setAttribute("data-lit", ""), undefined, k * step));
    this.lit = pts.map((p) => p.el);
    this.lightTl = this.anim(null, light);
    const center = pts.find((p) => p.role === "planner") ?? pts[0];
    const used = new Map<string, number>();
    const s = this.sim;
    this.roles.forEach((role, i) => {
      const b = this.brains[i];
      if (b.mode !== OFF && b.mode !== EXIT && b.mode !== IDLE) return;
      const list = pts.filter((p) => p.role === role);
      const n = used.get(role) ?? 0;
      used.set(role, n + 1);
      const p = list.length ? list[n % list.length] : center;
      s.place(i, p.x, p.y);
      s.on[i] = 0;
      s.tool[i] = TOOL.arrow;
      s.speed[i] = this.o.profile.speed * run.speedMul;
      b.mode = SLEEP;
      b.run = null;
      b.hx = p.x;
      b.hy = p.y;
      b.until = this.clock + pts.indexOf(p) * step + 0.03 + Math.random() * 0.05;
    });
    this.wake(this.planner);
    return true;
  }

  /** An agent pops out of its node: cursor scales in inside an expanding ring. */
  private wake(i: number): void {
    const b = this.brains[i];
    const s = this.sim;
    b.mode = IDLE;
    s.on[i] = 1;
    s.pop[i] = 0;
    const ring = this.mark(null, MK.ripple, { x: s.x[i], y: s.y[i], s: 2.2, color: ROLE_COLOR[this.roles[i]] });
    this.anim(null, gsap.to(ring, { p: 1, duration: 0.5, ease: "power2.out", onComplete: () => void (ring.dead = true) }));
  }

  private unlight(): void {
    this.lightTl?.kill();
    this.lightTl = null;
    this.lit.forEach((el) => el.removeAttribute("data-lit"));
    this.lit = [];
  }

  private plan(run: Run, i: number): void {
    // The build may already have started (hand-off is time-based); still lay out the plan.
    if (run.phase !== PLAN && run.phase !== BUILD) return this.free(i, run, null);
    const B = run.B;
    const m = run.m;
    const guides = m.guides.map((g) =>
      this.mark(run, MK.guide, { x: g.x1, y: g.y1, x2: g.x2, y2: g.y2, color: COLORS.guide }),
    );
    const label = m.planLabel ?? `plan · ${m.tasks.length} task${m.tasks.length === 1 ? "" : "s"}`;
    const tag = this.mark(run, MK.tag, { x: m.tagX, y: m.tagY, label, a: 0 });
    const tl = this.anim(run, gsap.timeline({ onComplete: () => this.free(i, run, null) }));
    const dur = Math.min(0.3, 0.08 * B);
    const gap = Math.min(0.06, 0.016 * B);
    guides.forEach((g, gi) => tl.to(g, { p: 1, duration: dur, ease: "power2.out" }, gi * gap));
    tl.to(tag, { a: 1, p: 1, duration: Math.max(0.12, Math.min(0.2, 0.06 * B)), ease: "back.out(2)" }, gap);
    tl.call(() => this.beginBuild(run), undefined, Math.min(0.15, tl.duration() * 0.5));
    this.say(run, i >= 0 ? i : this.planner, `planned ${m.tasks.length} tasks`);
    if (i >= 0) {
      const g = guides[0];
      this.sim.follow[i] = 18;
      this.sim.tool[i] = TOOL.cross;
      tl.eventCallback("onUpdate", () => this.aim(i, g.x + (g.x2 - g.x) * g.p, g.y));
    }
  }

  private beginBuild(run: Run): void {
    if (run.phase !== PLAN) return;
    run.phase = BUILD;
    run.deadline = this.clock + buildWindow(run.B, this.handoff, this.o.profile.kind === "phone");
    run.buildAt = this.clock;
    run.joinGate = this.clock;
  }

  /**
   * Running late? Ramp the section's catch-up factor smoothly (never a jump):
   * it speeds up running and new task timelines and the cursors. Unclaimed
   * work is still done by agents; the first ramp brings in every free worker.
   */
  private pace(run: Run): void {
    const tasks = run.m.tasks;
    const dt = this.o.profile.detail.dragTime;
    const own = (t: Task) =>
      t.tl ? Math.max(0, t.tl.duration() - t.tl.time()) : taskTime(t, run.scale, dt) + TRAVEL_EST;
    const memo = new Map<number, number>();
    const left = (t: Task): number => {
      if (t.state === TASK_DONE) return 0;
      const hit = memo.get(t.id);
      if (hit !== undefined) return hit;
      memo.set(t.id, 0);
      let longest = 0;
      for (const d of t.deps) longest = Math.max(longest, left(tasks[d]));
      const v = own(t) + longest;
      memo.set(t.id, v);
      return v;
    };
    let sum = 0;
    let cp = 0;
    let open = 0;
    for (const t of tasks) {
      if (t.state === TASK_DONE) continue;
      open++;
      sum += own(t);
      cp = Math.max(cp, left(t));
    }
    if (!open) return;
    const need = Math.max(sum / this.crew(open), cp) / Math.max(0.35, run.deadline - this.clock);
    const target = clamp(Math.ceil(need * 1.08 * 20) / 20, 1, CU_MAX);
    if (target <= run.cuTarget + 0.05) return;
    if (run.cuTarget === 1) this.spawn(run, Number.POSITIVE_INFINITY);
    run.cuTarget = target;
    run.cuTween?.kill();
    run.cuTween = this.anim(null, gsap.to(run, { catchUp: target, duration: CU_RAMP, ease: "sine.inOut" }));
  }

  /**
   * True once the build is done, or its last tasks are all running and end
   * before the reviewer's checklist opens (the review overlaps their tails;
   * the stamp still waits for every task).
   */
  private wrapping(run: Run): boolean {
    const R = review(run.B, this.o.profile.kind === "phone");
    const lead = R.travel + R.outline * 0.6 + R.open;
    for (const t of run.m.tasks) {
      if (t.state === TASK_DONE) continue;
      if (!t.tl) return false;
      if ((t.tl.duration() - t.tl.time()) / Math.max(0.1, t.tl.timeScale()) > lead) return false;
    }
    return true;
  }

  private review(run: Run): void {
    run.phase = REVIEW;
    const i = this.reviewer;
    const b = this.brains[i];
    const box = run.m.box;
    if (b.mode !== OFF && b.mode !== IDLE && b.mode !== EXIT) return this.inspect(run, -1);
    const y = clamp(this.sy + 18, box.y + 4, box.y + box.h - 4);
    if (b.mode === OFF) this.sim.place(i, this.vw + 30, y);
    this.send(i, run, box.x + 4, y, review(run.B).travel, (ai) => this.inspect(run, ai), null);
  }

  /** Reviewer: acks from the last workers, outline, a short checklist, then stamp. */
  private inspect(run: Run, i: number): void {
    if (run.phase !== REVIEW) return this.free(i, run, null);
    const R = review(run.B, this.o.profile.kind === "phone");
    const bx = run.m.box;
    const b = { x: bx.x + 3, y: bx.y + 3, w: Math.max(1, bx.w - 6), h: Math.max(1, bx.h - 6) };
    const rideY = clamp(this.sy + 18, b.y, b.y + b.h);
    const out = this.mark(run, MK.outline, { x: b.x, y: b.y, w: b.w, h: b.h });
    const cx = Math.min(b.x + b.w, this.vw) - CHECK.w - 14;
    const cy = clamp(rideY + 10, b.y + 6, Math.max(b.y + 6, b.y + b.h - CHECK_H - 6));
    const list = this.mark(run, MK.check, { x: cx, y: cy, p: 0, u: 0 });
    if (i >= 0) {
      this.sim.follow[i] = 20;
      this.sim.tool[i] = TOOL.cross;
      run.recent.slice(-3).forEach((w, k) => this.packet(run, w, i, k * 0.07, 0.3));
    }
    const n = CHECK.items.length;
    const rowY = () => cy + CHECK.head + Math.min(n - 1, Math.floor(list.u)) * CHECK.row + CHECK.row / 2;
    this.anim(run, gsap.timeline())
      .to(out, {
        p: 1,
        duration: R.outline,
        ease: "power1.inOut",
        onUpdate: () => this.aim(i, b.x + Math.min(b.w, (b.w + b.h) * out.p), rideY),
      })
      // The checklist opens while the outline finishes.
      .call(() => {
        if (i >= 0) this.sim.tool[i] = TOOL.arrow;
        this.aim(i, cx + 14, rowY());
      }, undefined, `-=${R.outline * 0.4}`)
      .to(list, { p: 1, duration: R.open, ease: "power2.out" }, "<")
      .to(list, {
        u: n,
        duration: R.ticks,
        ease: `steps(${n})`,
        onUpdate: () => this.aim(i, cx + 14, rowY()),
      })
      .to({}, { duration: R.hold || R.open }, R.hold ? ">" : "<")
      .call(() => this.stamp(run, i, list));
  }

  private stamp(run: Run, i: number, list: Mark): void {
    if (run.phase !== REVIEW) return;
    // A task tail still running (the review overlapped it): stamp right after.
    if (!run.m.tasks.every((t) => t.state === TASK_DONE)) {
      this.anim(run, gsap.delayedCall(0.03, () => this.stamp(run, i, list)));
      return;
    }
    const label = "✓ approved";
    const { w, h } = this.renderer.pillSize(label, "badge");
    const x = list.x + CHECK.w - w;
    const y = list.y + 2;
    const badge = this.mark(null, MK.badge, { x, y, label, a: 0, s: 1.5 });
    const ripple = this.mark(null, MK.ripple, { x: x + w / 2, y: y + h / 2 });
    this.anim(null, gsap.to(ripple, { p: 1, duration: 0.4, onComplete: () => void (ripple.dead = true) }));
    this.anim(null, gsap.timeline()
      .to(badge, { a: 1, s: 1, duration: 0.16, ease: "back.out(2.5)" })
      .to(badge, { a: 0, duration: 0.25, delay: 0.55, onComplete: () => void (badge.dead = true) }));
    this.say(run, i >= 0 ? i : this.reviewer, `approved ${run.m.name}`);
    if (i >= 0 && this.brains[i].run === run) {
      this.release(i);
      this.brains[i].hx = x - 10;
      this.brains[i].hy = y + h + 8;
    }
    this.finish(run, false);
  }

  /** Completes a section: instantly (skip/focus/resize) or after review. */
  private finish(run: Run, instant: boolean): void {
    if (run.phase === DONE) return;
    if (!instant) {
      run.took = this.clock - run.t0;
      this.summaries.push(run);
    }
    run.phase = DONE;
    run.st?.kill();
    run.st = null;
    const anims = run.anims;
    run.anims = [];
    for (const a of anims) if (a.progress() < 1) a.progress(1);
    for (const t of run.m.tasks) {
      if (t.state !== TASK_DONE) this.taskDone(run, t);
      t.slots.forEach(markBuilt);
      t.absorbed.forEach(markBuilt);
      clearTint(t);
    }
    run.nodes.forEach((n) => n.remove());
    run.nodes = [];
    run.undo.forEach((u) => u());
    run.undo = [];
    run.holders.clear();
    this.resetPace(run);
    run.m.el.setAttribute("data-built", "");
    for (const m of run.marks) {
      gsap.killTweensOf(m);
      if (instant || m.k === MK.ripple || m.k === MK.flash || m.k === MK.packet) m.dead = true;
      else this.anim(null, gsap.to(m, { a: 0, p: m.k === MK.check ? 0 : m.p, duration: 0.3, onComplete: () => void (m.dead = true) }));
    }
    run.marks = [];
    this.brains.forEach((b, i) => b.run === run && (b.mode === TRAVEL || b.mode === WORK) && this.release(i));
    if (run === this.hero) {
      this.unlight();
      this.emitInspect();
    }
    if (run.m.finale) this.finale(run, instant);
    this.setBusy();
    if (this.runs.every((r) => r.phase === DONE)) {
      try {
        sessionStorage.setItem(SESSION_KEY, "all");
      } catch {}
    }
  }

  // ---------------------------------------------------------------- tasks

  private claim(): void {
    // On phones and tablets (fewer workers) the planner lends a hand once its
    // plan is drawn. (The reviewer too; if it is busy when a review is due, the
    // review runs without it.)
    const crew = this.o.profile.kind !== "desktop" ? [...this.workers, this.planner, this.reviewer] : this.workers;
    if (!crew.some((i) => this.brains[i].mode === IDLE)) return;
    const open: { run: Run; t: Task; x: number; y: number; left: number }[] = [];
    for (const run of this.runs) {
      // While the planner draws its plan, layout agents may already box grids.
      const planning = run.phase === PLAN;
      if (run.phase !== BUILD && !planning) continue;
      const tasks = run.m.tasks;
      let left = 0;
      for (const t of tasks) if (t.state !== TASK_DONE) left++;
      for (const t of tasks) {
        if (planning && t.kind !== "grid") continue;
        if (t.state !== TASK_PENDING || !t.deps.every((d) => tasks[d].state === TASK_DONE || tasks[d].ready)) continue;
        const [x, y] = this.startPoint(run, t);
        open.push({ run, t, x, y, left });
      }
    }
    if (!open.length) return;
    const s = this.sim;
    // Grids belong to layout agents: others leave them alone while one is free
    // or for a moment after the build starts; then whoever is free takes them
    // (everything in the grid waits for it).
    const layoutOn = this.roles.some((r, k) => r === "layout" && this.brains[k].mode !== OFF);
    const layoutFree = this.roles.some((r, k) => r === "layout" && this.brains[k].mode === IDLE);
    const hold = this.o.profile.kind === "phone" ? 0.4 : 1;
    for (const i of crew) {
      const b = this.brains[i];
      if (b.mode !== IDLE) continue;
      const role = this.roles[i];
      let best = -1;
      let bestScore = Infinity;
      for (let j = 0; j < open.length; j++) {
        const o = open[j];
        if (o.t.state !== TASK_PENDING || (b.run !== o.run && this.clock < o.run.joinGate)) continue;
        if (o.run.phase === PLAN && role !== "layout") continue;
        if (o.t.kind === "grid" && role !== "layout" && layoutOn && (layoutFree || this.clock - o.run.buildAt < hold)) continue;
        // Near first, in reading order; small sections slightly first so they
        // finish promptly when several build at once.
        let score = Math.hypot(o.x - s.x[i], o.y - s.y[i]) + o.t.rank * 22 + o.left * 6;
        if (o.t.role) score += o.t.role === role ? -200 : 600;
        else score += rolePref(role, o.t.kind);
        // Critical-path first: color picks end chains, cards with nested items start them.
        if (o.t.kind === "color") score -= 220;
        else if (o.t.kind === "grid") score -= 200;
        else if (o.t.lead || o.t.tints.some((c) => c.state !== TASK_DONE)) score -= 150;
        score -= Math.min(1, o.t.est) * 120; // longest first
        // The reviewer helps on phones only while there is plenty left.
        if (i === this.reviewer && o.left <= 4) continue;
        const cy = o.t.box.y + o.t.box.h / 2;
        if (cy < this.sy - 20 || cy > this.sy + this.vh + 20) score += 700;
        if (score < bestScore) [bestScore, best] = [score, j];
      }
      if (best < 0) continue;
      const { run, t, x, y } = open[best];
      if (b.run !== run) run.joinGate = this.clock + run.stagger / run.catchUp;
      t.state = TASK_CLAIMED;
      t.agent = i;
      const cap = clamp((0.2 * run.scale + 0.04) / run.catchUp, 0.1, 0.22);
      this.send(i, run, x, y, cap, (ai) => this.work(run, t, ai), t);
      this.packet(run, this.planner, i, 0, 0.35);
    }
  }

  /** Handoff packet: a dot with a short trail on a dashed curve between two agents. */
  private packet(run: Run, from: number, to: number, delay: number, dur: number): void {
    const s = this.sim;
    if (this.o.profile.kind === "phone" || from < 0 || to < 0 || !s.on[from] || !s.on[to]) return;
    const fy = s.y[from] - this.sy;
    if (fy < 0 || fy > this.vh || s.x[from] < 0 || s.x[from] > this.vw) return;
    let live = 0;
    for (const m of this.marks) if (m.k === MK.packet && !m.dead) live++;
    if (live >= 4) return;
    const m = this.mark(run, MK.packet, {
      x: s.x[from], y: s.y[from], x2: s.x[to], y2: s.y[to], u: to % 2 ? 0.2 : -0.2,
      color: ROLE_COLOR[this.roles[to]],
    });
    this.anim(run, gsap.to(m, {
      p: 1,
      delay,
      duration: dur,
      ease: "power1.inOut",
      onUpdate: () => {
        m.x2 = s.x[to];
        m.y2 = s.y[to];
      },
      onComplete: () => void (m.dead = true),
    }));
  }

  private startPoint(run: Run, t: Task): [number, number] {
    const b = t.box;
    if (t.kind === "dup") {
      const mb = t.master >= 0 ? run.m.tasks[t.master].box : t.slotBoxes[0];
      return [mb.x + mb.w / 2, mb.y + mb.h / 2];
    }
    if (t.kind === "image" && t.drag) return edgePoint(t, this.sy, this.vw, this.vh);
    if (t.kind === "color") return [Math.min(b.x + b.w, this.vw - 20), b.y + Math.min(b.h / 2, 24)];
    if (t.kind === "type" || t.kind === "reveal") return [b.x + t.lines[0].x, b.y + t.lines[0].b];
    return [b.x, b.y];
  }

  private work(run: Run, t: Task, i: number): void {
    if (t.state !== TASK_CLAIMED || (run.phase !== BUILD && run.phase !== PLAN)) return this.free(i, run, t);
    t.state = TASK_RUNNING;
    // Color follow-ups: their elements appear neutral, then get picked.
    for (const c of t.tints) if (c.state === TASK_PENDING) applyTint(c);
    const tl = this.labor(run, gsap.timeline({ onComplete: () => this.taskDone(run, t) }));
    t.tl = tl;
    const ctx: Ctx = {
      run, t, i, tl, s: run.scale, color: ROLE_COLOR[this.roles[i]], sim: this.sim, r: this.renderer,
      sy: this.sy, vw: this.vw, vh: this.vh, phone: this.o.profile.kind === "phone",
      dragTime: this.o.profile.detail.dragTime, layer: this.o.layer,
      mark: (k, p) => this.mark(run, k, p),
      fx: (a) => void this.labor(run, a),
      log: (what, bare) => this.say(run, i, what, false, !!bare),
      holder: (cell, m) => void run.holders.set(cell, m),
    };
    const master = t.kind === "dup" && t.master >= 0 ? run.m.tasks[t.master].box : null;
    choreograph(ctx, master);
  }

  private taskDone(run: Run, t: Task): void {
    if (t.state === TASK_DONE) return;
    const i = t.agent;
    t.state = TASK_DONE;
    t.agent = -1;
    t.tl = null;
    t.ready = true;
    t.slots.forEach(markBuilt);
    t.absorbed.forEach(markBuilt);
    clearTint(t);
    if (run.holders.size) for (const el of [t.el, ...t.slots]) this.unhold(run, el);
    if (i >= 0 && run.phase !== DONE) {
      run.recent = run.recent.filter((r) => r !== i);
      run.recent.push(i);
      if (run.recent.length > 3) run.recent.shift();
    }
    if (i >= 0 && this.brains[i].task === t) this.release(i);
  }

  /** Fades the grid placeholder of the cell containing el (once the cell is built). */
  private unhold(run: Run, el: Element): void {
    for (let e: Element | null = el; e && e !== run.m.el; e = e.parentElement) {
      const m = run.holders.get(e);
      if (!m) continue;
      run.holders.delete(e);
      gsap.killTweensOf(m);
      this.anim(run, gsap.to(m, { a: 0, duration: 0.3, ease: "power1.out", onComplete: () => void (m.dead = true) }));
      return;
    }
  }

  // ----------------------------------------------------------- live log

  /** One live-log line from agent i, timed from the section's start. */
  private say(run: Run, i: number, what: string, force = false, bare = false): void {
    if (!this.log.live || (!force && run.phase === DONE)) return;
    const who = i >= 0 ? this.o.profile.labels[i] : "swarm";
    const color = i >= 0 ? ROLE_COLOR[this.roles[i]] : COLORS.accent;
    const prefix = bare || this.log.inside(run.m.el) ? "" : `${run.m.name} · `;
    this.log.push(who, color, prefix + what, `${Math.max(0, this.clock - run.t0).toFixed(2)}s`);
  }

  /** Once everything in view is built: one summary line per finished section. */
  private summarize(): void {
    for (const r of this.summaries) {
      const n = r.m.tasks.length;
      this.log.push("✓", COLORS.accent, `${r.m.name} · ${n} task${n === 1 ? "" : "s"}`, `${r.took.toFixed(1)}s`);
    }
    this.summaries = [];
  }

  // --------------------------------------------------------- inspect mode

  private emitInspect(): void {
    this.o.onInspect?.({
      available: this.canInspect && (!this.hero || this.hero.phase === DONE),
      on: this.inspecting,
    });
  }

  private pickInspector(): number {
    const free = (k: number) => k >= 0 && [OFF, IDLE, EXIT].includes(this.brains[k].mode);
    const designers = this.roles.flatMap((r, k) => (r === "designer" ? [k] : []));
    return [...designers, this.reviewer].find(free) ?? -1;
  }

  /** Moves the inspect agent, outline and property sheet to a built frame/image. */
  private inspectAt(target: EventTarget | null): void {
    if (!this.inspecting || !(target instanceof Element)) return;
    const el = target.closest<HTMLElement>("[data-build-item][data-built]");
    if (!el || el === this.inspEl) return;
    const t = this.taskByEl.get(el);
    if (!t) return;
    const i = this.inspAgent >= 0 ? this.inspAgent : this.pickInspector();
    if (i < 0) return;
    this.readView();
    this.inspAgent = i;
    this.inspEl = el;
    const r = el.getBoundingClientRect();
    const box = { x: r.left, y: r.top + this.sy, w: r.width, h: r.height };
    const props = readProps(el, `${t.label} · ${el.tagName.toLowerCase()}`);
    const img = this.renderer.propsSprite(props.title, props.rows, props.swatch);
    let px = box.x + box.w + 14;
    if (px + PROPS.w > this.vw - 8) px = box.x - 14 - PROPS.w;
    if (px < 8) px = clamp(box.x + box.w - PROPS.w - 8, 8, this.vw - PROPS.w - 8);
    const py = clamp(box.y, this.sy + 12, this.sy + this.vh - img.h - 12);
    this.inspFrame ??= this.mark(null, MK.frame, { ...box, p: 1, a: 0, r: props.radius });
    this.anim(null, gsap.to(this.inspFrame, { ...box, r: props.radius, a: 1, duration: 0.24, ease: "power2.out", overwrite: true }));
    if (this.inspPanel) this.inspPanel.img = img;
    else this.inspPanel = this.mark(null, MK.props, { x: px, y: py, p: 0, img });
    this.anim(null, gsap.to(this.inspPanel, { x: px, y: py, p: 1, a: 1, duration: 0.24, ease: "power2.out", overwrite: true }));
    const s = this.sim;
    const b = this.brains[i];
    if (b.mode === OFF) s.place(i, box.x + box.w < this.vw / 2 ? -30 : this.vw + 30, box.y);
    s.on[i] = 1;
    b.mode = INSPECT;
    b.run = null;
    b.task = null;
    s.follow[i] = 0;
    s.tool[i] = TOOL.arrow;
    s.speed[i] = this.o.profile.speed * 0.9;
    s.tx[i] = box.x + box.w;
    s.ty[i] = box.y;
    this.ensureTicking();
  }

  private closeInspect(): void {
    for (const m of [this.inspFrame, this.inspPanel]) {
      if (m) this.anim(null, gsap.to(m, { a: 0, duration: 0.2, overwrite: true, onComplete: () => void (m.dead = true) }));
    }
    if (this.inspAgent >= 0 && this.brains[this.inspAgent].mode === INSPECT) this.release(this.inspAgent);
    this.inspFrame = this.inspPanel = this.inspEl = null;
    this.inspAgent = -1;
  }

  // ------------------------------------------------------- deploy finale

  /**
   * After the finale section's approval: the deployer clicks the deploy target,
   * a small panel runs build/upload/edge, then the target gets [data-deployed].
   * Purely additive; instant finishes (and Skip) jump to the deployed state.
   */
  private finale(run: Run, instant: boolean): void {
    const target = run.m.el.querySelector<HTMLElement>("[data-deploy-target]");
    if (!target || target.hasAttribute("data-deployed")) return;
    const free = (k: number) => k >= 0 && [OFF, IDLE, EXIT].includes(this.brains[k].mode);
    let i = this.roles.indexOf("deployer");
    if (!free(i)) i = this.workers.find(free) ?? -1;
    if (instant || i < 0) {
      target.setAttribute("data-deployed", "");
      return;
    }
    this.readView();
    const phone = this.o.profile.kind === "phone";
    const text = target.dataset.deployText || "deployed";
    const r = target.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2 + this.sy;
    const px = clamp(r.left, 8, this.vw - DEPLOY.w - 8);
    const py = r.bottom + this.sy + 10;
    const s = this.sim;
    const b = this.brains[i];
    if (b.mode === OFF) s.place(i, clamp(cx + (Math.random() - 0.5) * 240, 20, this.vw - 20), this.sy + this.vh + 30);
    s.on[i] = 1;
    b.mode = DEPLOYING;
    b.run = null;
    b.task = null;
    s.follow[i] = 0;
    s.tool[i] = TOOL.arrow;
    s.tx[i] = cx;
    s.ty[i] = cy;
    const travel = phone ? 0.25 : 0.35;
    s.speed[i] = Math.max(this.o.profile.speed, (s.dist(i) / travel) * 1.3);
    const sprites = this.renderer.deploySprites(text);
    const panel = this.mark(null, MK.deploy, { x: px, y: py, p: 0, u: 0, v: 0, img: sprites[0] });
    const ripple = this.mark(null, MK.ripple, { x: cx, y: cy, s: 1.4, a: 0 });
    const tl: gsap.core.Timeline = gsap.timeline({
      onComplete: () => {
        this.finales = this.finales.filter((a) => a !== tl);
        if (b.mode === DEPLOYING) this.release(i);
      },
    });
    tl.to({}, { duration: travel })
      .call(() => {
        s.follow[i] = 14;
        ripple.a = 1;
      })
      .to(ripple, { p: 1, duration: 0.35, ease: "power1.out", onComplete: () => void (ripple.dead = true) })
      .to(panel, { p: 1, duration: 0.14, ease: "power2.out" }, "<")
      .to(panel, {
        u: 1,
        duration: phone ? 0.7 : 1.05,
        ease: "power1.inOut",
        onUpdate: () => {
          const k = Math.min(3, Math.floor(panel.u * 3 + 0.001));
          if (k !== panel.v) {
            panel.v = k;
            panel.img = sprites[k];
          }
          s.tx[i] = px + 10 + (DEPLOY.w - 20) * panel.u;
          s.ty[i] = py + DEPLOY.barY + 2;
        },
      })
      .call(() => {
        panel.img = sprites[4];
        target.setAttribute("data-deployed", "");
        this.say(run, i, `deployed → ${text}`, true);
      })
      .to(panel, { a: 0, duration: 0.3, delay: phone ? 0.35 : 0.6, onComplete: () => void (panel.dead = true) });
    this.finales.push(tl);
    this.ensureTicking();
  }

  // --------------------------------------------------------------- agents

  private send(i: number, run: Run, x: number, y: number, cap: number, go: (i: number) => void, task: Task | null): void {
    const b = this.brains[i];
    const s = this.sim;
    s.on[i] = 1;
    b.mode = TRAVEL;
    b.run = run;
    b.task = task;
    b.go = go;
    b.until = this.clock + cap;
    s.follow[i] = 0;
    s.flag[i] = 0;
    s.tool[i] = TOOL.arrow;
    s.tx[i] = x;
    s.ty[i] = y;
    // Fast but bounded: long trips take a little longer instead of lurching.
    const base = this.o.profile.speed * run.speedMul * run.catchUp;
    s.speed[i] = clamp((s.dist(i) / Math.max(cap, 0.05)) * 1.3, base, Math.max(base, this.o.profile.speed * 2.4));
  }

  private release(i: number): void {
    const b = this.brains[i];
    const s = this.sim;
    if (b.mode === OFF) return;
    if (b.mode === SLEEP) {
      b.mode = OFF;
      s.on[i] = 0;
      return;
    }
    b.mode = IDLE;
    b.task = null;
    b.go = null;
    s.follow[i] = 0;
    s.flag[i] = 0;
    s.tool[i] = TOOL.arrow;
    s.speed[i] = this.o.profile.speed;
    // Park near where it finished, or just inside the viewport if that is offscreen.
    b.hx = clamp(s.x[i], 30, this.vw - 30);
    b.hy = clamp(s.y[i], this.sy + 30, this.sy + this.vh - 30);
    b.idleAt = -1;
  }

  /** Releases agent i only if it is still busy with this run/task. */
  private free(i: number, run: Run, task: Task | null): void {
    const b = i >= 0 ? this.brains[i] : null;
    if (b && b.run === run && b.task === task && (b.mode === WORK || b.mode === TRAVEL)) this.release(i);
  }

  private aim(i: number, x: number, y: number): void {
    if (i < 0) return;
    this.sim.tx[i] = x;
    this.sim.ty[i] = y;
  }

  private exit(i: number): void {
    const b = this.brains[i];
    const s = this.sim;
    if (this.exitDown === null) {
      this.exitDown = this.runs.some((r) => r.phase === WAIT && r.m.el.getBoundingClientRect().top > this.vh * 0.5);
    }
    b.mode = EXIT;
    b.run = null;
    b.until = this.clock + 1.6;
    s.follow[i] = 0;
    s.flag[i] = 0;
    s.tool[i] = TOOL.arrow;
    s.speed[i] = this.o.profile.speed * 0.75;
    if (this.exitDown) {
      s.tx[i] = s.x[i] + (Math.random() - 0.5) * 80;
      s.ty[i] = this.sy + this.vh + 90;
    } else {
      s.tx[i] = s.x[i] < this.vw / 2 ? -90 : this.vw + 90;
      s.ty[i] = s.y[i] + (Math.random() - 0.5) * 80;
    }
  }

  // ----------------------------------------------------------------- loop

  private tick = (_time: number, deltaMs: number): void => {
    // Scheduling runs on wall time (like the GSAP tweens) so slow devices keep
    // to the budget; physics is sub-stepped for stability.
    const dt = clamp(deltaMs / 1000, 0.001, 0.25);
    this.clock += dt;
    if (this.busy) {
      this.elapsed += dt;
      this.lastBusy = this.clock;
    }
    this.sy = this.o.getScroll();
    this.update(dt);
    const steps = Math.min(4, Math.ceil(dt * 60));
    for (let k = 0; k < steps; k++) this.sim.step(dt / steps);
    this.renderer.draw(this.sim, this.marks, this.sy, this.clock);
    this.writeStats(false);
    if (
      !this.busy && !this.inspecting && !this.finales.length && !this.marks.length &&
      this.brains.every((b) => b.mode === OFF)
    ) this.stopTicking();
  };

  private update(dt: number): void {
    const s = this.sim;
    this.paceTick = this.clock - this.paceAt >= 0.1;
    if (this.paceTick) this.paceAt = this.clock;
    let oldest: Run | null = null;
    for (const run of this.runs) {
      if (run.phase === PLAN && this.clock > run.t0 + this.handoff) this.beginBuild(run);
      if (run.phase === BUILD) {
        if (this.wrapping(run)) this.review(run);
        else if (this.paceTick) this.pace(run);
      }
      if (run.catchUp !== run.cuApplied) {
        // Follow the (smoothly ramping) catch-up factor; drop finished work.
        run.work = run.work.filter((a) => a.progress() < 1);
        for (const a of run.work) a.timeScale(run.catchUp);
        run.cuApplied = run.catchUp;
      }
      if ((run.phase === PLAN || run.phase === BUILD) && (!oldest || run.t0 < oldest.t0)) oldest = run;
    }
    this.claim();
    for (let i = 0; i < s.n; i++) {
      const b = this.brains[i];
      if (s.pop[i] < 1) s.pop[i] = Math.min(1, s.pop[i] + dt * 3.4);
      if (b.mode !== IDLE) {
        b.idleAt = -1;
        // Ease the cursor back to its own heading after a loop.
        if (s.spin[i]) {
          let a = s.spin[i] % (Math.PI * 2);
          if (a > Math.PI) a -= Math.PI * 2;
          else if (a < -Math.PI) a += Math.PI * 2;
          a *= Math.exp(-dt * 12);
          s.spin[i] = Math.abs(a) < 0.003 ? 0 : a;
        }
      }
      if (b.mode === SLEEP) {
        if (!this.busy) this.release(i);
        else if (this.clock >= b.until) this.wake(i);
      } else if (b.mode === TRAVEL) {
        // Work starts on arrival only (never at a far-away spot). Past the
        // cap, "close" counts (agents sharing a start point keep their
        // personal space); much later, glide in rather than circle.
        const d = s.dist(i);
        if (d < 14 || (this.clock >= b.until && d < 48)) {
          const go = b.go;
          b.mode = WORK;
          b.go = null;
          go?.(i);
        } else if (this.clock > b.until + 1.2 && !s.follow[i]) s.follow[i] = 9;
      } else if (b.mode === IDLE) {
        // Loop in place while anything builds (or inspect is on), then leave.
        if (!this.busy && !this.inspecting && this.clock - this.lastBusy > IDLE_LINGER) {
          this.exit(i);
          continue;
        }
        if (i === this.reviewer && oldest) {
          // Wait where the review starts (top-left), so approval follows the build closely.
          const box = oldest.m.box;
          b.hx = clamp(box.x + 28, 20, this.vw - 70);
          b.hy = clamp(this.sy + 40, box.y + 20, Math.max(box.y + 20, box.y + box.h - 20));
        }
        // A small personal loop around the agent's own parking point (never a
        // shared target). It starts at the park point with the cursor's own
        // heading, eases its radius in over 0.3 s, and the cursor turns with it.
        if (b.idleAt < 0) b.idleAt = this.clock;
        const age = this.clock - b.idleAt;
        const ease = age >= 0.3 ? 1 : easeInOut(age / 0.3);
        const dir = this.loopDir[i];
        const th0 = -0.75 * Math.PI - dir * 0.5 * Math.PI;
        const turn = dir * this.loopW[i] * age;
        const r = this.loopR[i] * ease;
        s.tx[i] = b.hx + r * (Math.cos(th0 + turn) - Math.cos(th0));
        s.ty[i] = b.hy + r * (Math.sin(th0 + turn) - Math.sin(th0));
        s.spin[i] = turn * ease;
      } else if (b.mode === EXIT) {
        const y = s.y[i] - this.sy;
        if (y < -40 || y > this.vh + 40 || s.x[i] < -40 || s.x[i] > this.vw + 40 || this.clock > b.until) {
          b.mode = OFF;
          s.on[i] = 0;
        }
      }
    }
  }

  private ensureTicking(): void {
    if (this.ticking || !this.alive) return;
    this.ticking = true;
    this.renderer.show();
    if (!this.hidden) gsap.ticker.add(this.tick);
  }

  private stopTicking(): void {
    this.ticking = false;
    gsap.ticker.remove(this.tick);
    this.renderer.hide();
    this.fx = this.fx.filter((a) => a.isActive());
    this.writeStats(true);
  }

  private setBusy(): void {
    const busy = this.runs.some((r) => r.phase >= PLAN && r.phase <= REVIEW);
    if (busy === this.busy) return;
    this.busy = busy;
    if (busy) this.exitDown = null;
    else this.summarize();
    this.o.onBusy(busy);
    this.writeStats(true);
  }

  private writeStats(force: boolean): void {
    const el = this.statsEl;
    if (!el || (!force && this.clock - this.statsAt < 0.1)) return;
    this.statsAt = this.clock;
    let done = 0;
    let total = 0;
    for (const r of this.runs) {
      for (const t of r.m.tasks) {
        total++;
        if (t.state === TASK_DONE) done++;
      }
    }
    const t = this.elapsed;
    const text = `agents ${this.agentCount} · tasks ${done}/${total} · ${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(1).padStart(4, "0")}`;
    if (el.textContent !== text) el.textContent = text;
  }

  /** Layout-time view (matches the rects measureSection reads). */
  private readView(): void {
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.sy = window.scrollY;
  }

  private mark(run: Run | null, k: MarkKind, p: Partial<Mark>): Mark {
    const m: Mark = {
      k, x: 0, y: 0, w: 0, h: 0, x2: 0, y2: 0, w2: 0, h2: 0, p: 0, a: 1, s: 1, r: 0, u: 0, v: 0,
      blink: false, color: COLORS.accent, label: "", img: null, dead: false, ...p,
    };
    this.marks.push(m);
    run?.marks.push(m);
    return m;
  }

  /** Task work: follows the section's catch-up factor from the start. */
  private labor<T extends Anim>(run: Run, a: T): T {
    a.timeScale(run.catchUp);
    run.work.push(a);
    return this.anim(run, a);
  }

  private anim<T extends Anim>(run: Run | null, a: T): T {
    (run ? run.anims : this.fx).push(a);
    return a;
  }

  // --------------------------------------------------------------- events

  private onFocus = (e: FocusEvent): void => {
    const target = e.target instanceof Element ? e.target : null;
    for (let el = target?.closest("[data-build-section]"); el; el = el.parentElement?.closest("[data-build-section]")) {
      const run = this.byEl.get(el);
      if (run) this.finish(run, true);
    }
    this.inspectAt(target);
  };

  private onPointer = (e: PointerEvent): void => {
    if (this.inspecting) this.inspectAt(e.target);
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && this.inspecting) this.setInspect(false);
  };

  private onVisibility = (): void => {
    const hidden = document.visibilityState === "hidden";
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    const all = this.runs.flatMap((r) => r.anims).concat(this.fx, this.finales);
    all.forEach((a) => (hidden ? a.pause() : a.resume()));
    if (!this.ticking) return;
    if (hidden) gsap.ticker.remove(this.tick);
    else gsap.ticker.add(this.tick);
  };

  private onResize = (): void => {
    this.renderer.invalidate();
    this.readView();
    this.layoutVer++;
  };

  private onScroll = (): void => {
    if (this.clock - this.preAt > 0.25 || !this.ticking) this.schedulePre();
  };

  // ------------------------------------------------------------ pre-measure

  /**
   * Measures sections within about a viewport below the fold in idle time,
   * a task at a time, so a section's start never does a big read burst on
   * the scroll frame. Invalidated by ResizeObserver / window resizes.
   */
  private schedulePre(): void {
    if (this.idle || !this.alive) return;
    this.preAt = this.clock;
    const ric = window.requestIdleCallback;
    this.idle = ric ? ric(this.premeasure, { timeout: 500 }) : window.setTimeout(() => this.premeasure(null), 120);
  }

  private cancelPre(): void {
    if (!this.idle) return;
    if (window.cancelIdleCallback) window.cancelIdleCallback(this.idle);
    else window.clearTimeout(this.idle);
    this.idle = 0;
  }

  private premeasure = (deadline: IdleDeadline | null): void => {
    this.idle = 0;
    if (!this.alive) return;
    const end = performance.now() + (deadline ? Math.max(2, deadline.timeRemaining() - 1) : 6);
    const vh = window.innerHeight;
    let more = false;
    for (const run of this.runs) {
      if (run.phase !== WAIT) continue;
      let pm = this.pre.get(run);
      if (pm && pm.done && pm.ver === this.layoutVer) continue;
      const r = run.m.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh * 2) continue;
      if (!pm || pm.ver !== this.layoutVer) {
        pm = {
          gen: measureSteps(run.m, this.o.profile.detail.autoTune, this.o.profile.kind === "phone"),
          ver: this.layoutVer,
          done: false,
        };
        this.pre.set(run, pm);
      }
      while (!pm.done && performance.now() < end) pm.done = !!pm.gen.next().done;
      if (!pm.done) {
        more = true;
        break;
      }
    }
    if (more) this.schedulePre();
  };

  private onSectionResize = (entries: ResizeObserverEntry[]): void => {
    let changed = false;
    for (const e of entries) {
      if (this.roSeen.has(e.target)) changed = true;
      else this.roSeen.add(e.target);
    }
    if (!changed || this.roFrame) return;
    this.layoutVer++;
    this.roFrame = requestAnimationFrame(() => {
      this.roFrame = 0;
      for (const run of this.runs) if (run.phase >= PLAN && run.phase <= REVIEW) this.finish(run, true);
      ScrollTrigger.refresh();
    });
  };
}
