// Part of living-ui-skills (MIT). Adapt freely.
// https://github.com/anhlamtruong/living-ui-skills
// Shared types for the agent-swarm build engine.
import type { ScrollTrigger } from "gsap/ScrollTrigger";

export type Role = "planner" | "coder" | "designer" | "layout" | "reviewer" | "tester" | "deployer";
/** Kinds authors put in data-build. */
export type BuildKind = "frame" | "type" | "reveal" | "image" | "dup";
/** Internal task kinds: DOM kinds plus the color-wheel follow-up. */
export type TaskKind = BuildKind | "color" | "grid";
export type Edge = "left" | "right" | "top" | "bottom";
export type Tint = "text" | "fill" | "stroke";

/** Rect in document coordinates (CSS px, scroll-independent). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A visual text line, in coordinates local to the item's border box. */
export interface LineBox {
  x: number;
  y: number;
  r: number;
  b: number;
}

/** Right edge (local x) of a typed glyph and the index of its line. */
export interface CharBox {
  x: number;
  line: number;
}

export const TASK_PENDING = 0;
export const TASK_CLAIMED = 1;
export const TASK_RUNNING = 2;
export const TASK_DONE = 3;

export interface Task {
  id: number;
  el: HTMLElement;
  kind: TaskKind;
  keep: boolean;
  role: Role | null;
  label: string;
  order: number | null;
  rank: number;
  deps: number[];
  /** dup batches: every sibling produced by this task (el === slots[0]). */
  slots: HTMLElement[];
  /** Items nested inside dup slots; built together with them. */
  absorbed: HTMLElement[];
  /** dup batches: index of the list's master frame task. */
  master: number;
  /** Color-wheel tasks that wait for this one (their elements start neutral). */
  tints: Task[];
  // Detail flags (resolved by scan + measure for the current profile).
  font: boolean;
  /** data-build-weight: after the font swap, sweep font-weight 250 -> weight. */
  sweep: boolean;
  weight: number;
  /** A second family inside the text (e.g. a serif span), shown in the font menu. */
  fontName2: string;
  /** Name used in the live log (data-build-label, image file name, or tag). */
  logName: string;
  /** Other tasks wait for this one (keeps its choreography short). */
  lead: boolean;
  /** The running timeline (for pacing). */
  tl: gsap.core.Timeline | null;
  /** Visible and ready for the items nested in it (may precede the end of its timeline). */
  ready: boolean;
  /** Planned seconds at the section's scale (longest-first claiming). */
  est: number;
  // Grid task (data-build-grid): direct child cells, their boxes, structure lines.
  cells: HTMLElement[];
  cellBoxes: Box[];
  /** x positions of column lines and y positions of row lines (document coords). */
  cols: number[];
  rows: number[];
  /** Grid size for the log: columns x rows. */
  dims: number[];
  /** data-build-scale: appear small and offset, get scaled up, then moved in. */
  scale: boolean;
  /** Initial offset (px) for the scale/move. */
  sdx: number;
  sdy: number;
  tune: boolean;
  inspect: boolean;
  drag: boolean;
  from: Edge | null;
  tint: Tint | null;
  // Geometry and computed style, read in measureSection.
  box: Box;
  lines: LineBox[];
  chars: CharBox[];
  slotBoxes: Box[];
  radius: number;
  /** Padding top, right, bottom, left (px). */
  pad: number[];
  /** -1 none, 0 left, 1 center, 2 right. */
  align: number;
  fontName: string;
  img: HTMLImageElement | null;
  alt: string;
  /** object-fit and object-position (fractions) of the image. */
  fit: string;
  pos: number[];
  /** Color task: CSS property, neutral and target RGBA, HSV of the target, hex. */
  prop: string;
  /** The element's own inline value for prop (restored afterwards), or null if untouched. */
  prev: string | null;
  from4: number[];
  to4: number[];
  hsv: number[];
  hex: string;
  state: number;
  agent: number;
}

export interface Guide {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SectionModel {
  el: HTMLElement;
  name: string;
  onLoad: boolean;
  /** data-build-finale: run the deploy finale after approval. */
  finale: boolean;
  planLabel: string | null;
  tasks: Task[];
  box: Box;
  guides: Guide[];
  tagX: number;
  tagY: number;
}

export interface Sprite {
  c: HTMLCanvasElement;
  w: number;
  h: number;
}

export const MK = {
  guide: 0,
  frame: 1,
  box: 2,
  ghost: 3,
  scan: 4,
  caret: 5,
  tag: 6,
  badge: 7,
  outline: 8,
  ripple: 9,
  flash: 10,
  card: 11,
  drop: 12,
  inspector: 13,
  toolbar: 14,
  wheel: 15,
  check: 16,
  packet: 17,
  props: 18,
  deploy: 19,
  holder: 20,
} as const;
export type MarkKind = (typeof MK)[keyof typeof MK];

/**
 * Something drawn on the overlay. Plain object so GSAP can tween its fields;
 * the generic fields mean different things per kind (see renderer.ts).
 */
export interface Mark {
  k: MarkKind;
  x: number;
  y: number;
  w: number;
  h: number;
  x2: number;
  y2: number;
  w2: number;
  h2: number;
  p: number;
  a: number;
  s: number;
  r: number;
  u: number;
  v: number;
  blink: boolean;
  color: string;
  label: string;
  img: Sprite | null;
  dead: boolean;
}

export const TOOL = {
  arrow: 0,
  cross: 1,
  beam: 2,
  hand: 3,
  resize: 4,
  slide: 5,
  picker: 6,
  move: 7,
} as const;

export interface Detail {
  /** Font swap on every data-build-font item, or only the page's first. */
  fontFirstOnly: boolean;
  /** Inspector panels at all (data-build-tune), and auto-pick every Nth card (0 = none). */
  panels: boolean;
  autoTune: number;
  /** Max color-wheel picks per section. */
  colorsPerSection: number;
  /** Logos per large list dragged in individually. */
  logoDrags: number;
  /** Duration multiplier for image drag-ins. */
  dragTime: number;
}

export interface Profile {
  kind: "desktop" | "tablet" | "phone";
  /** Seconds a section may take, start to approval (hero = data-build-start="load"). */
  budget: number;
  heroBudget: number;
  dprCap: number;
  roles: Role[];
  labels: string[];
  /** Base cruise speed in px/s. */
  speed: number;
  /** Steering acceleration multiplier. */
  accel: number;
  detail: Detail;
}

export type Anim = gsap.core.Animation;

/** Runtime state of one section's build. */
export interface Run {
  m: SectionModel;
  phase: number;
  /** Time budget for this section (s). */
  B: number;
  t0: number;
  deadline: number;
  /** Duration multiplier for this section's tasks (<= 1). */
  scale: number;
  speedMul: number;
  joinGate: number;
  /** When the build phase began (clock). */
  buildAt: number;
  stagger: number;
  /** Catch-up speed (1 = planned pace), ramped smoothly when running late. */
  catchUp: number;
  /** Target of the current catch-up ramp, its tween, and the factor applied to running work. */
  cuTarget: number;
  cuTween: Anim | null;
  cuApplied: number;
  /** Task timelines and their effects: these follow catchUp. */
  work: Anim[];
  marks: Mark[];
  anims: Anim[];
  /** Temporary DOM (draft-font clones) to remove when the section ends. */
  nodes: HTMLElement[];
  /** Restores temporary inline styles (e.g. a scale transform) if a task is cut short. */
  undo: (() => void)[];
  /** Placeholder box per grid cell, faded as the cell gets built. */
  holders: Map<Element, Mark>;
  /** Agents that finished tasks most recently (for the review acks). */
  recent: number[];
  /** Seconds from start to approval (0 if finished instantly). */
  took: number;
  st: ScrollTrigger | null;
}
