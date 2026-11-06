// Part of living-ui-skills (MIT). Adapt freely.
// https://github.com/anhlamtruong/living-ui-skills
// DOM -> task graph. scanPage() reads structure once; measureSection() reads
// geometry and computed style (all reads, no writes) right before a section
// starts building.
import { fontLabel } from "./palette";
import type {
  Box, BuildKind, CharBox, Detail, Edge, Guide, LineBox, Role, SectionModel, Task, TaskKind, Tint,
} from "./types";

const SECTION = "[data-build-section]";
const KINDS: readonly BuildKind[] = ["frame", "type", "reveal", "image", "dup"];
const ROLES: readonly Role[] = ["planner", "coder", "designer", "reviewer", "tester", "deployer"];
const EDGES: readonly Edge[] = ["left", "right", "top", "bottom"];
const TINTS: readonly Tint[] = ["text", "fill", "stroke"];
const CLASS_WORDS = ["card", "tile", "chip", "btn", "button", "badge", "terminal", "panel", "logo"];
const TAG_WORDS: Record<string, string> = {
  IMG: "img", PICTURE: "img", SVG: "svg", A: "link", BUTTON: "button", LI: "item",
  UL: "list", OL: "list", ARTICLE: "card", FIGURE: "figure", P: "p", H1: "h1",
  H2: "h2", H3: "h3", H4: "h4", DL: "list",
};
const MAX_TYPE_CHARS = 120;
/** Neutral start colors for color-wheel items: [property, CSS variable, fallback]. */
const NEUTRAL: Record<Tint, [string, string, string]> = {
  text: ["color", "--swarm-neutral-text", "#8a97a8"],
  fill: ["background-color", "--swarm-neutral-fill", "#10151e"],
  stroke: ["border-color", "--swarm-neutral-stroke", "#2a3546"],
};

export interface ScanOpts {
  workers: number;
  phone: boolean;
  detail: Detail;
}

const kindOf = (el: HTMLElement): BuildKind => {
  const k = el.dataset.build as BuildKind;
  return KINDS.includes(k) ? k : "frame";
};

/** data-build-keep keeps an item visible; ="mobile" only on the phone profile. */
export const keeps = (el: HTMLElement, phone: boolean) => {
  const v = el.getAttribute("data-build-keep");
  return v !== null && (v !== "mobile" || phone);
};

function labelOf(el: HTMLElement, kind: TaskKind): string {
  if (el.dataset.buildLabel) return el.dataset.buildLabel;
  for (const c of Array.from(el.classList)) {
    const hit = CLASS_WORDS.find((w) => c === w || c.endsWith("-" + w));
    if (hit) return hit;
  }
  return TAG_WORDS[el.tagName.toUpperCase()] ?? (kind === "image" ? "img" : "frame");
}

function makeTask(id: number, el: HTMLElement, kind: TaskKind, phone: boolean): Task {
  const order = Number.parseFloat(el.dataset.buildOrder ?? "");
  const role = el.dataset.buildRole as Role;
  const from = el.dataset.buildFrom as Edge;
  return {
    id, el, kind,
    keep: keeps(el, phone),
    role: ROLES.includes(role) ? role : null,
    label: labelOf(el, kind),
    order: Number.isFinite(order) ? order : null,
    rank: id, deps: [], slots: [el], absorbed: [], master: -1, tints: [],
    font: false, sweep: false, weight: 0, fontName2: "", logName: el.dataset.buildLabel ?? "", lead: false, tl: null, ready: false, est: 0,
    cells: [], cellBoxes: [], cols: [], rows: [], dims: [0, 0], scale: false, sdx: 0, sdy: 0,
    tune: false, inspect: false, drag: false,
    from: EDGES.includes(from) ? from : null, tint: null,
    box: { x: 0, y: 0, w: 0, h: 0 }, lines: [], chars: [], slotBoxes: [],
    radius: 0, pad: [0, 0, 0, 0], align: -1, fontName: "", img: null, alt: "", fit: "fill", pos: [0.5, 0.5],
    prop: "", prev: null, from4: [], to4: [], hsv: [0, 0, 0], hex: "",
    state: 0, agent: -1,
  };
}

function scanSection(section: HTMLElement, o: ScanOpts): SectionModel {
  const items = Array.from(section.querySelectorAll<HTMLElement>("[data-build-item]")).filter(
    (el) => el.closest(SECTION) === section,
  );
  const isItem = new Set(items);
  const parentItem = (el: HTMLElement): HTMLElement | null => {
    for (let p = el.parentElement; p && p !== section; p = p.parentElement) if (isItem.has(p)) return p;
    return null;
  };
  const listOf = (el: HTMLElement) => el.parentElement?.closest<HTMLElement>("[data-build-list]") ?? null;
  const masterOf = (list: HTMLElement) =>
    (Array.from(list.children) as HTMLElement[]).find((c) => isItem.has(c)) ?? null;
  // A dup needs a list and a master that is not itself; otherwise it is a frame.
  const isDup = (el: HTMLElement) => {
    const k = kindOf(el);
    if (k !== "dup" && !(o.phone && k === "frame")) return false;
    const list = listOf(el);
    const master = list ? masterOf(list) : null;
    if (!list || !master) return false;
    if (master !== el) return k === "dup";
    // Phones: a plain master (nothing nested) joins its list's single sweep as
    // the first slot, one task fewer per list.
    return o.phone && !el.querySelector("[data-build-item]") &&
      (Array.from(list.children) as HTMLElement[]).some((c) => c !== el && isItem.has(c) && kindOf(c) === "dup");
  };

  const tasks: Task[] = [];
  const add = (el: HTMLElement, kind: TaskKind) => {
    const t = makeTask(tasks.length, el, kind, o.phone);
    tasks.push(t);
    return t;
  };
  const taskOf = new Map<HTMLElement, Task>();
  const dupGroups = new Map<HTMLElement, HTMLElement[]>();
  const nestedInDup = new Map<HTMLElement, HTMLElement>();

  for (const el of items) {
    let dupAncestor: HTMLElement | null = null;
    for (let p = parentItem(el); p; p = parentItem(p)) if (isDup(p)) dupAncestor = p;
    if (dupAncestor) nestedInDup.set(el, dupAncestor);
    else if (isDup(el)) {
      const list = listOf(el) as HTMLElement;
      if (!dupGroups.has(list)) dupGroups.set(list, []);
      (dupGroups.get(list) as HTMLElement[]).push(el);
    } else taskOf.set(el, add(el, kindOf(el) === "dup" ? "frame" : kindOf(el)));
  }

  dupGroups.forEach((all, list) => {
    const master = taskOf.get(masterOf(list) as HTMLElement);
    // Large image grids: a few tiles are dragged in from the edge one by one.
    let slots = all;
    const n = all.length;
    if (n >= 6 && o.detail.logoDrags > 0 && all.some((s) => s.tagName === "IMG" || s.querySelector("img"))) {
      const k = Math.min(o.detail.logoDrags, Math.floor(n / 4));
      const picked = new Set<HTMLElement>();
      for (let j = 0; j < k; j++) picked.add(all[Math.floor(((j + 1) * n) / (k + 1))]);
      picked.forEach((el) => {
        const t = add(el, "image");
        t.label = labelOf(el, "image");
        taskOf.set(el, t);
      });
      slots = all.filter((s) => !picked.has(s));
    }
    // Batch the rest: one agent duplicates several slots in a single sweep
    // (chip clouds, logo grids), so big lists need few hand-offs.
    const n2 = slots.length;
    // Phones: one sweep per list, flown from the master's slot (its first slot).
    const size = o.phone ? Math.min(24, n2) : n2 <= 3 ? 1 : Math.min(8, Math.max(2, Math.ceil(n2 / 3)));
    for (let i = 0; i < slots.length; i += size) {
      const t = add(slots[i], "dup");
      t.slots = slots.slice(i, i + size);
      t.label = master?.label ?? t.label;
      t.master = master ? master.id : -1;
      if (master && !o.phone) t.deps.push(master.id);
      for (const s of t.slots) taskOf.set(s, t);
    }
  });

  nestedInDup.forEach((slot, el) => taskOf.get(slot)?.absorbed.push(el));

  // Grid containers (data-build-grid): the section itself or a container in
  // it. A layout agent boxes the cells first; everything filling a cell waits.
  const gridOf = new Map<Element, Task>();
  const contents = tasks.slice();
  for (const g of [section, ...Array.from(section.querySelectorAll<HTMLElement>("[data-build-grid]"))]) {
    if (!g.hasAttribute("data-build-grid") || g.closest(SECTION) !== section || gridOf.has(g)) continue;
    const t = add(g, "grid");
    t.label = "grid";
    t.slots = []; // the container itself is never hidden or marked built
    t.keep = true;
    gridOf.set(g, t);
  }
  if (gridOf.size) {
    for (const t of [...contents, ...Array.from(gridOf.values())]) {
      const host = (t.slots[0] ?? t.el).parentElement?.closest("[data-build-grid]");
      const grid = host ? gridOf.get(host) : undefined;
      if (!grid || grid === t || !host) continue;
      // Only the outermost item inside the grid waits for it (nested ones wait for their parent).
      const parent = parentItem(t.slots[0] ?? t.el);
      if (!parent || !host.contains(parent)) t.deps.push(grid.id);
    }
  }
  for (const t of tasks) t.logName ||= t.label;

  // Items nested inside another item wait for it.
  for (const t of tasks) {
    const parent = parentItem(t.el);
    const dep = parent ? taskOf.get(parent) : undefined;
    if (dep && dep !== t && !t.deps.includes(dep.id)) t.deps.push(dep.id);
    const el = t.el;
    t.font = t.kind === "type" && el.hasAttribute("data-build-font");
    t.sweep = t.font && el.hasAttribute("data-build-weight");
    t.tune = t.kind === "frame" && o.detail.panels && el.hasAttribute("data-build-tune");
    t.drag = t.kind === "image" && !t.keep;
    t.scale = !o.phone && (t.kind === "type" || t.kind === "reveal") && !t.keep && el.hasAttribute("data-build-scale");
    if (t.scale) {
      t.sdx = 24 + Math.random() * 24;
      t.sdy = -10 + Math.random() * 26;
    }
  }

  // Color-wheel follow-ups run after the item that shows the element.
  let colors = 0;
  for (const el of items) {
    const tint = el.dataset.buildColor as Tint;
    if (!TINTS.includes(tint) || colors >= o.detail.colorsPerSection) continue;
    const owner = taskOf.get(el) ?? taskOf.get(nestedInDup.get(el) as HTMLElement);
    if (!owner) continue;
    const t = add(el, "color");
    t.tint = tint;
    t.label = "color";
    t.slots = [];
    t.deps.push(owner.id);
    owner.tints.push(t);
    colors++;
  }

  return {
    el: section,
    name: section.dataset.buildSection || "section",
    onLoad: section.dataset.buildStart === "load",
    finale: section.hasAttribute("data-build-finale"),
    planLabel: section.dataset.buildPlan ?? null,
    tasks,
    box: { x: 0, y: 0, w: 0, h: 0 },
    guides: [],
    tagX: 0,
    tagY: 0,
  };
}

/** Finds every build section plus items that live outside any section. */
export function scanPage(o: ScanOpts): { sections: SectionModel[]; orphans: HTMLElement[] } {
  const sections = Array.from(document.querySelectorAll<HTMLElement>(SECTION)).map((s) => scanSection(s, o));
  // Phones: only the page's first data-build-font item (the main heading) may
  // swap fonts; kept items never do (they are visible from first paint).
  let seen = false;
  for (const m of sections) {
    for (const t of m.tasks) {
      if (!t.font) continue;
      if (seen && o.detail.fontFirstOnly) t.font = false;
      seen = true;
      if (t.keep) t.font = false;
      t.sweep &&= t.font;
    }
  }
  const orphans = Array.from(document.querySelectorAll<HTMLElement>("[data-build-item]")).filter(
    (el) => !el.closest(SECTION),
  );
  return { sections, orphans };
}

const toDoc = (r: DOMRect, sy: number): Box => ({ x: r.left, y: r.top + sy, w: r.width, h: r.height });

/** Per-glyph right edges and line boxes of an element's text, local to `er`. */
export function measureText(el: HTMLElement, er: DOMRect): { chars: CharBox[]; lines: LineBox[] } | null {
  const range = document.createRange();
  const chars: CharBox[] = [];
  const lines: LineBox[] = [];
  let cur: LineBox | null = null;
  let prevX = -Infinity;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const s = node.data;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === 32 || c === 10 || c === 9 || c === 13 || c === 160) continue;
      const j = c >= 0xd800 && c <= 0xdbff && i + 1 < s.length ? i + 2 : i + 1;
      range.setStart(node, i);
      range.setEnd(node, j);
      i = j - 1;
      const r = range.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const x1 = r.left - er.left;
      const y1 = r.top - er.top;
      if (!cur || y1 > (cur.y + cur.b) / 2 || x1 < prevX - 2) {
        if (cur && y1 < cur.y) return null; // visual order differs from DOM order
        cur = { x: x1, y: y1, r: r.right - er.left, b: r.bottom - er.top };
        lines.push(cur);
      } else {
        cur.x = Math.min(cur.x, x1);
        cur.y = Math.min(cur.y, y1);
        cur.r = Math.max(cur.r, r.right - er.left);
        cur.b = Math.max(cur.b, r.bottom - er.top);
      }
      prevX = x1;
      chars.push({ x: r.right - er.left, line: lines.length - 1 });
      if (chars.length > MAX_TYPE_CHARS) return null;
    }
  }
  return chars.length ? { chars, lines } : null;
}

/** Visual lines of a text block, from text-node fragments only. */
function measureLines(t: Task, er: DOMRect, range: Range): void {
  const frags: LineBox[] = [];
  const walker = document.createTreeWalker(t.el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue?.trim()) continue;
    range.selectNodeContents(node);
    for (const r of Array.from(range.getClientRects())) {
      if (r.width < 0.5 || r.height < 0.5) continue;
      frags.push({ x: r.left - er.left, y: r.top - er.top, r: r.right - er.left, b: r.bottom - er.top });
    }
  }
  frags.sort((a, b) => a.y - b.y);
  const lines: LineBox[] = [];
  for (const f of frags) {
    const l = lines[lines.length - 1];
    const overlap = l ? Math.min(l.b, f.b) - Math.max(l.y, f.y) : 0;
    if (l && overlap > 0.5 * Math.min(l.b - l.y, f.b - f.y)) {
      l.x = Math.min(l.x, f.x);
      l.r = Math.max(l.r, f.r);
      l.y = Math.min(l.y, f.y);
      l.b = Math.max(l.b, f.b);
    } else lines.push({ ...f });
  }
  while (lines.length > 32) {
    for (let i = 0; i + 1 < lines.length; i++) {
      const a = lines[i];
      const b = lines.splice(i + 1, 1)[0];
      lines[i] = { x: Math.min(a.x, b.x), y: a.y, r: Math.max(a.r, b.r), b: b.b };
    }
  }
  t.lines = lines.length ? lines : [{ x: 0, y: 0, r: er.width, b: er.height }];
}

let probe: CanvasRenderingContext2D | null | undefined;
/** Any CSS color -> [r, g, b, a] in sRGB, via a 1x1 canvas. */
export function rgba(css: string): number[] | null {
  if (probe === undefined) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    probe = c.getContext("2d", { willReadFrequently: true });
  }
  if (!probe || !css) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000";
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], d[3] / 255];
}

function hsv([r, g, b]: number[]): number[] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  let h = 0;
  if (d > 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
  }
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}

const px = (v: string) => Number.parseFloat(v) || 0;

// Poster frames of looping clips, loaded once (same URL as the <video>, so cached).
const posters = new Map<string, HTMLImageElement>();
function posterImage(url: string): HTMLImageElement {
  let img = posters.get(url);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = url;
    posters.set(url, img);
  }
  return img;
}

/** "ava.jpg" from a plain or next/image URL (build hashes stripped). */
function fileName(img: HTMLImageElement): string {
  try {
    let url = new URL(img.currentSrc || img.src, location.href);
    const inner = url.searchParams.get("url");
    if (url.pathname.includes("/_next/image") && inner) url = new URL(inner, location.href);
    const base = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    return base.replace(/^(.+?)\.[0-9a-f]{6,}\.(\w+)$/i, "$1.$2");
  } catch {
    return "";
  }
}

const frac = (v: string | undefined, fallback: number) => {
  if (!v) return fallback;
  if (v.endsWith("%")) return px(v) / 100;
  return v === "left" || v === "top" ? 0 : v === "right" || v === "bottom" ? 1 : v === "center" ? 0.5 : fallback;
};

/** Computed style the detail pass needs (radius, padding, fonts, colors, images). */
function measureStyle(t: Task, cs: CSSStyleDeclaration): void {
  const b = t.box;
  const rad = cs.borderTopLeftRadius;
  t.radius = rad.endsWith("%") ? (px(rad) / 100) * Math.min(b.w, b.h) : px(rad);
  if (t.kind === "frame") {
    t.pad = [px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft)];
    const a = cs.textAlign;
    t.align = a === "center" ? 1 : a === "right" || a === "end" ? 2 : 0;
  } else if (t.kind === "type" && t.font) {
    t.fontName = fontLabel(cs.fontFamily);
    t.weight = px(cs.fontWeight) || 400;
    if (/mono/i.test(t.fontName)) [t.font, t.sweep] = [false, false]; // already in the draft face
    // A child in another family (e.g. a serif italic span) gets its own menu row.
    t.fontName2 = "";
    for (const child of Array.from(t.el.querySelectorAll<HTMLElement>("*"))) {
      if (!child.textContent?.trim()) continue;
      const name = fontLabel(getComputedStyle(child).fontFamily);
      if (name !== t.fontName && !/mono/i.test(name)) {
        t.fontName2 = name;
        break;
      }
    }
  } else if (t.kind === "image") {
    let img = t.el instanceof HTMLImageElement ? t.el : t.el.querySelector("img");
    // A looping clip: the dragged-in card shows its poster frame.
    const video = img ? null : t.el.querySelector<HTMLVideoElement>("video[poster]");
    if (video) img = posterImage(video.poster);
    t.img = img;
    if (!t.el.dataset.buildLabel && img) t.logName = fileName(img) || t.label;
    t.alt = img?.alt || t.el.getAttribute("aria-label") || t.el.querySelector("[aria-label]")?.getAttribute("aria-label") || t.label;
    if (img) {
      const ics = getComputedStyle(video ?? img);
      t.fit = ics.objectFit;
      const [x, y] = ics.objectPosition.split(" ");
      t.pos = [frac(x, 0.5), frac(y, 0.5)];
    }
  } else if (t.kind === "color" && t.tint) {
    const [prop, cssVar, fallback] = NEUTRAL[t.tint];
    const target = t.tint === "text" ? cs.color : t.tint === "fill" ? cs.backgroundColor : cs.borderTopColor;
    const to = rgba(target);
    const from = rgba(cs.getPropertyValue(cssVar).trim() || fallback) ?? rgba(fallback);
    const noStroke = t.tint === "stroke" && px(cs.borderTopWidth) === 0;
    if (!to || !from || to[3] < 0.05 || noStroke) {
      t.state = 3; // nothing to pick
      return;
    }
    t.prop = prop;
    t.from4 = from;
    t.to4 = to;
    t.hsv = hsv(to);
    t.hex = "#" + to.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");
  }
}

/** Distinct values (sorted), merging ones closer than 3 px. */
function distinct(vals: number[]): number[] {
  const out: number[] = [];
  for (const v of vals.sort((a, b) => a - b)) if (!out.length || v - out[out.length - 1] > 3) out.push(v);
  return out;
}

/** Cells of a grid container and its column/row lines, from the cells' rects. */
function measureGrid(t: Task, sy: number): void {
  const cells: HTMLElement[] = [];
  const boxes: Box[] = [];
  for (const c of Array.from(t.el.children)) {
    if (!(c instanceof HTMLElement)) continue;
    const r = c.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    cells.push(c);
    boxes.push(toDoc(r, sy));
  }
  t.cells = cells;
  t.cellBoxes = boxes;
  const lefts = distinct(boxes.map((b) => b.x));
  const tops = distinct(boxes.map((b) => b.y));
  t.dims = [lefts.length, tops.length];
  // Irregular flex-wrap rows (chip clouds) get only the outer columns.
  t.cols = lefts.length > 10 ? [t.box.x, t.box.x + t.box.w] : distinct(boxes.flatMap((b) => [b.x, b.x + b.w]));
  t.rows = distinct(boxes.flatMap((b) => [b.y, b.y + b.h])).slice(0, 24);
}

/**
 * Reads every rect and style the section's build needs, one task per step
 * (all reads, no writes), so it can run in idle time in small chunks.
 * Each step reads scrollY with its rects, so the document coordinates stay
 * consistent even if the page scrolls between steps.
 */
export function* measureSteps(m: SectionModel, autoTune: number, phone = false): Generator<void, void, void> {
  const range = document.createRange();
  m.box = toDoc(m.el.getBoundingClientRect(), window.scrollY);
  for (const t of m.tasks) {
    yield;
    const sy = window.scrollY;
    const r = t.el.getBoundingClientRect();
    t.box = toDoc(r, sy);
    if (t.kind === "type") {
      const text = measureText(t.el, r);
      if (text) [t.chars, t.lines] = [text.chars, text.lines];
      // Phones: longer lines are line-revealed rather than typed (except the
      // font-swap heading), so a section fits its 2.2 s target.
      if (!text || (phone && !t.font && text.chars.length > 12)) [t.kind, t.font] = ["reveal", false];
    }
    if (t.kind === "reveal") measureLines(t, r, range);
    if (t.kind === "dup") {
      t.slotBoxes = t.slots.map((s) => toDoc(s.getBoundingClientRect(), sy));
      const xs = t.slotBoxes;
      const x = Math.min(...xs.map((b) => b.x));
      const y = Math.min(...xs.map((b) => b.y));
      t.box = {
        x, y,
        w: Math.max(...xs.map((b) => b.x + b.w)) - x,
        h: Math.max(...xs.map((b) => b.y + b.h)) - y,
      };
    }
    if (t.kind === "grid") measureGrid(t, sy);
    else if (t.kind !== "dup" && t.kind !== "reveal") measureStyle(t, getComputedStyle(t.el));
  }

  // Default order: rows top-to-bottom, then left-to-right; data-build-order overrides.
  const geo = m.tasks
    .slice()
    .sort((a, b) => Math.round(a.box.y / 24) - Math.round(b.box.y / 24) || a.box.x - b.box.x || a.id - b.id);
  geo.forEach((t, i) => (t.rank = i));
  geo
    .sort((a, b) => (a.order ?? a.rank) - (b.order ?? b.rank) || a.rank - b.rank)
    .forEach((t, i) => (t.rank = i));

  // Inspector panels: data-build-tune always; otherwise every Nth leaf card.
  const parents = new Set<number>();
  for (const t of m.tasks) if (t.kind !== "color") t.deps.forEach((d) => parents.add(d));
  for (const t of m.tasks) t.lead = parents.has(t.id);
  let n = 0;
  for (const t of geo) {
    if (t.kind !== "frame" || t.keep) continue;
    const card = t.radius > 0 || t.pad.some((p) => p >= 8);
    const auto = autoTune > 0 && card && !parents.has(t.id) && t.box.w >= 120 && t.box.h >= 44;
    t.inspect = t.tune || (auto && n++ % autoTune === 0);
  }

  const visible = m.tasks.filter((t) => t.box.w > 0 && t.box.h > 0);
  const src = visible.length ? visible.map((t) => t.box) : [m.box];
  const left = Math.min(...src.map((b) => b.x));
  const right = Math.max(...src.map((b) => b.x + b.w));
  const top = Math.min(...src.map((b) => b.y));
  const bottom = Math.max(...src.map((b) => b.y + b.h));
  const guides: Guide[] = [
    { x1: left - 28, y1: top, x2: right + 28, y2: top },
    { x1: left, y1: top - 18, x2: left, y2: bottom + 18 },
    { x1: right, y1: top - 18, x2: right, y2: bottom + 18 },
  ];
  // One interior column line: the most common left edge away from the sides.
  const counts = new Map<number, number>();
  for (const b of src) {
    const x = Math.round(b.x / 4) * 4;
    if (x - left > 24 && right - x > 24) counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  let col = -1;
  let best = 0;
  counts.forEach((c, x) => {
    if (c > best) [best, col] = [c, x];
  });
  if (col >= 0) guides.push({ x1: col, y1: top - 18, x2: col, y2: bottom + 18 });
  m.guides = guides;
  m.tagX = left;
  m.tagY = top - 26;
}

/** Measures a whole section synchronously. */
export function measureSection(m: SectionModel, autoTune: number, phone = false): void {
  for (const _ of measureSteps(m, autoTune, phone)); // eslint-disable-line @typescript-eslint/no-unused-vars
}
