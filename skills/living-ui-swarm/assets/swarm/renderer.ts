// Part of living-ui-skills (MIT). Adapt freely.
// https://github.com/anhlamtruong/living-ui-skills
// Canvas overlay: one fixed full-viewport canvas, drawn in document space with
// a scroll-offset transform. Cursors, pills and popovers are cached sprites;
// per frame only positions, knobs and a few cached strings change.
import { COLORS, monoFamily } from "./palette";
import type { Sim } from "./sim";
import { MK, type Mark, type Sprite } from "./types";
import {
  CARD_PAD, CHECK, DEPLOY, DROP, GLYPH_HOT, GLYPH_SIZE, INSP, PROPS, TOOLBAR, WHEEL,
  CHECK_H, INSP_H, dropH, paintCard, paintChecklist, paintDeploy, paintDropdown, paintGlyph, paintHatch,
  paintInspector, paintProps, paintToolbar, paintWheel, propsH, roundRect,
} from "./widgets";

type PillStyle = "tag" | "plan" | "badge";
const PILLS: Record<PillStyle, { size: number; fg: string; bg: string; stroke: string | null }> = {
  tag: { size: 9, fg: COLORS.accent, bg: COLORS.panel, stroke: null },
  plan: { size: 10, fg: COLORS.guide, bg: COLORS.panel, stroke: COLORS.guide },
  badge: { size: 11, fg: COLORS.ink, bg: COLORS.accent, stroke: null },
};
const TAU = Math.PI * 2;
const NUM = Array.from({ length: 256 }, (_, i) => String(i));
const HUE = Array.from({ length: 360 }, (_, h) => `hsl(${h},100%,50%)`);
const CARD_MAX = 420;
/** Ease-out with a small overshoot, for the spawn pop. */
const backOut = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dprCap: number;
  private readonly colors: string[];
  private readonly labels: string[];
  private readonly family: string;
  private readonly font10: string;
  private dpr = 0;
  private vw = 0;
  private vh = 0;
  private dirty = true;
  private shown = false;
  private glyphs: (Sprite | undefined)[][] = [];
  private names: (Sprite | undefined)[] = [];
  private cache = new Map<string, Sprite>();
  private checks: Sprite[] = [];
  private hatch: CanvasPattern | null = null;
  private white: CanvasGradient;
  private black: CanvasGradient;
  private band: CanvasGradient;

  constructor(canvas: HTMLCanvasElement, dprCap: number, colors: string[], labels: string[]) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("swarm: 2d canvas unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.dprCap = dprCap;
    this.colors = colors;
    this.labels = labels;
    this.family = monoFamily();
    this.font10 = `500 10px ${this.family}`;
    this.dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    // Gradients live in user space, so they survive canvas resizes.
    const sq = WHEEL.sq;
    this.white = ctx.createLinearGradient(0, 0, sq, 0);
    this.white.addColorStop(0, "#fff");
    this.white.addColorStop(1, "rgba(255,255,255,0)");
    this.black = ctx.createLinearGradient(0, 0, 0, sq);
    this.black.addColorStop(0, "rgba(0,0,0,0)");
    this.black.addColorStop(1, "#000");
    this.band = ctx.createLinearGradient(0, 0, 0, 20);
    this.band.addColorStop(0, "rgba(94,234,212,0)");
    this.band.addColorStop(1, "rgba(94,234,212,0.2)");
  }

  invalidate(): void {
    this.dirty = true;
  }

  show(): void {
    if (this.shown) return;
    this.shown = true;
    this.canvas.style.visibility = "visible";
  }

  /** Clears and releases the backing store; nothing is drawn while hidden. */
  hide(): void {
    this.shown = false;
    this.canvas.style.visibility = "hidden";
    this.canvas.width = this.canvas.height = 0;
    this.dirty = true;
  }

  pillSize(text: string, style: PillStyle): { w: number; h: number } {
    const s = this.pill(text, style);
    return { w: s.w, h: s.h };
  }

  /** Inspect-mode property sheet (cached per element signature). */
  propsSprite(title: string, rows: [string, string][], swatch: string | null): Sprite {
    const key = `props|${title}|${swatch}|${rows.map((r) => r.join(":")).join("|")}`;
    return this.cached(key, PROPS.w, propsH(rows.length), (g) => paintProps(g, this.family, title, rows, swatch));
  }

  /** Deploy panel states: 0..3 steps done, then the final line. */
  deploySprites(final: string): Sprite[] {
    const out: Sprite[] = [];
    for (let k = 0; k <= 3; k++) out.push(this.cached(`deploy|${k}`, DEPLOY.w, DEPLOY.h, (g) => paintDeploy(g, this.family, k, null)));
    out.push(this.cached(`deploy|f|${final}`, DEPLOY.w, DEPLOY.h, (g) => paintDeploy(g, this.family, 3, final)));
    return out;
  }

  /** Font menu sprite: rows, with checks on the rows in the bit mask. */
  dropSprite(rows: string[], checked: number): Sprite {
    return this.cached(`drop|${checked}|${rows.join("|")}`, DROP.w, dropH(rows.length), (g) =>
      paintDropdown(g, this.family, rows, checked),
    );
  }

  inspectorSprite(title: string): Sprite {
    return this.cached(`insp|${title}`, INSP.w, INSP_H, (g) => paintInspector(g, this.family, title));
  }

  toolbarSprite(): Sprite {
    return this.cached("toolbar", TOOLBAR.w, TOOLBAR.h, paintToolbar);
  }

  wheelSprite(): Sprite {
    return this.cached("wheel", WHEEL.w, WHEEL.h, paintWheel);
  }

  /** Builds the review checklist states up front (drawn by tick count). */
  prepareChecklist(): void {
    for (let k = 0; k <= CHECK.items.length; k++) {
      this.checks[k] = this.cached(`check|${k}`, CHECK.w, CHECK_H, (g) => paintChecklist(g, this.family, k));
    }
  }

  /** Card sprite for an image being dragged in (built once per drag). */
  cardSprite(w: number, h: number, radius: number, img: HTMLImageElement | null, alt: string, fit: string, pos: number[]): Sprite {
    const k = Math.min(1, CARD_MAX / Math.max(w, h));
    const cw = Math.max(8, w * k);
    const ch = Math.max(8, h * k);
    return this.sprite(cw + CARD_PAD * 2, ch + CARD_PAD * 2, (g) =>
      paintCard(g, this.family, cw, ch, radius * k, img, alt, fit, pos),
    );
  }

  draw(sim: Sim, marks: Mark[], sy: number, now: number): void {
    if (this.dirty) this.fit();
    const { ctx, dpr, vw, vh } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, -sy * dpr);
    const top = sy - 80;
    const bottom = sy + vh + 80;

    let keep = 0;
    for (let r = 0; r < marks.length; r++) {
      const m = marks[r];
      if (m.dead) continue;
      marks[keep++] = m;
      if (m.a <= 0.003) continue;
      const far = m.k === MK.guide || m.k === MK.ghost || m.k === MK.packet;
      const alt = far ? m.y2 : m.y;
      const altB = m.k === MK.ghost ? m.y2 + m.h2 : alt;
      if (Math.max(m.y + m.h + 130, altB) < top || Math.min(m.y - 130, alt) > bottom) continue;
      this.mark(m, top, bottom, now);
    }
    marks.length = keep;

    ctx.globalAlpha = 1;
    for (let i = 0; i < sim.n; i++) {
      if (!sim.on[i]) continue;
      const x = sim.x[i];
      const y = sim.y[i];
      if (y < top || y > bottom || x < -60 || x > vw + 60) continue;
      const tool = sim.tool[i];
      const hot = GLYPH_HOT[tool] ?? GLYPH_HOT[0];
      const gl = this.glyph(i, tool);
      const nm = this.name(i);
      const k = sim.pop[i] < 1 ? backOut(sim.pop[i]) : 1;
      if (k <= 0.01) continue;
      const spin = sim.spin[i];
      if (spin > 0.005 || spin < -0.005) {
        // Idle loop: the cursor heads along its circle.
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(spin);
        ctx.drawImage(gl.c, -hot[0] * k, -hot[1] * k, gl.w * k, gl.h * k);
        ctx.restore();
      } else ctx.drawImage(gl.c, x - hot[0] * k, y - hot[1] * k, gl.w * k, gl.h * k);
      // The name pill trails the motion slightly.
      const lx = Math.max(-8, Math.min(8, -sim.vx[i] * 0.02));
      const ly = Math.max(-8, Math.min(8, -sim.vy[i] * 0.02));
      ctx.drawImage(nm.c, x + (12 + lx) * k, y + (14 + ly) * k, nm.w * k, nm.h * k);
      if (sim.flag[i] & 1) {
        // "copy" marker while alt-dragging a duplicate
        ctx.fillStyle = COLORS.accent;
        ctx.beginPath();
        ctx.arc(x + 17, y - 6, 5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = COLORS.ink;
        ctx.fillRect(x + 14.5, y - 6.6, 5, 1.2);
        ctx.fillRect(x + 16.4, y - 8.5, 1.2, 5);
      }
    }
  }

  private fit(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    if (dpr !== this.dpr) {
      this.dpr = dpr;
      this.cache.clear();
      this.checks = [];
      this.hatch = null;
      this.glyphs = [];
      this.names = [];
    }
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.canvas.width = Math.round(this.vw * dpr);
    this.canvas.height = Math.round(this.vh * dpr);
    this.dirty = false;
  }

  private sprite(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): Sprite {
    const c = document.createElement("canvas");
    c.width = Math.ceil(w * this.dpr);
    c.height = Math.ceil(h * this.dpr);
    const g = c.getContext("2d");
    if (g) {
      g.scale(this.dpr, this.dpr);
      paint(g);
    }
    return { c, w, h };
  }

  private cached(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): Sprite {
    let s = this.cache.get(key);
    if (!s) {
      s = this.sprite(w, h, paint);
      this.cache.set(key, s);
    }
    return s;
  }

  private pill(text: string, style: PillStyle): Sprite {
    const st = PILLS[style];
    const font = `500 ${st.size}px ${this.family}`;
    const key = style + "|" + text;
    const hit = this.cache.get(key);
    if (hit) return hit;
    this.ctx.font = font;
    const w = Math.ceil(this.ctx.measureText(text).width + 12);
    const h = st.size + 7;
    return this.cached(key, w, h, (g) => {
      roundRect(g, 0.5, 0.5, w - 1, h - 1, style === "tag" ? 3 : (h - 1) / 2);
      g.fillStyle = st.bg;
      g.fill();
      if (st.stroke) {
        g.strokeStyle = st.stroke;
        g.stroke();
      }
      g.font = font;
      g.fillStyle = st.fg;
      g.textBaseline = "middle";
      g.fillText(text, 6, h / 2 + 0.5);
    });
  }

  private glyph(i: number, tool: number): Sprite {
    const row = (this.glyphs[i] ??= []);
    return (row[tool] ??= this.sprite(GLYPH_SIZE, GLYPH_SIZE, (g) => paintGlyph(g, tool, this.colors[i])));
  }

  private name(i: number): Sprite {
    const hit = this.names[i];
    if (hit) return hit;
    const label = this.labels[i];
    this.ctx.font = this.font10;
    const w = Math.ceil(this.ctx.measureText(label).width + 12);
    const s = this.sprite(w, 16, (g) => {
      roundRect(g, 0, 0, w, 16, 8);
      g.fillStyle = this.colors[i];
      g.fill();
      g.font = this.font10;
      g.fillStyle = COLORS.ink;
      g.textBaseline = "middle";
      g.fillText(label, 6, 8.5);
    });
    this.names[i] = s;
    return s;
  }

  private handle(x: number, y: number): void {
    this.ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
    this.ctx.strokeRect(x - 2.5, y - 2.5, 5, 5);
  }

  private blit(s: Sprite, x: number, y: number): void {
    this.ctx.drawImage(s.c, x, y, s.w, s.h);
  }

  private mark(m: Mark, top: number, bottom: number, now: number): void {
    const ctx = this.ctx;
    ctx.globalAlpha = m.a;
    ctx.strokeStyle = m.color;
    ctx.fillStyle = m.color;
    ctx.lineWidth = 1;
    switch (m.k) {
      case MK.guide: {
        const dx = (m.x2 - m.x) * m.p;
        const dy = (m.y2 - m.y) * m.p;
        ctx.globalAlpha = m.a * 0.6;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(m.x + 0.5, m.y + 0.5);
        ctx.lineTo(m.x + dx + 0.5, m.y + dy + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        // Ruler ticks every 24 px, longer every 120 px.
        const len = Math.hypot(dx, dy);
        if (len < 1) break;
        const ux = dx / len;
        const uy = dy / len;
        ctx.globalAlpha = m.a * 0.45;
        ctx.beginPath();
        for (let d = 24; d < len; d += 24) {
          const px = m.x + ux * d + 0.5;
          const py = m.y + uy * d + 0.5;
          if (py < top || py > bottom) continue;
          const t = d % 120 === 0 ? 5 : 2.5;
          ctx.moveTo(px + uy * t, py - ux * t);
          ctx.lineTo(px - uy * t, py + ux * t);
        }
        ctx.stroke();
        break;
      }
      case MK.frame:
      case MK.box: {
        const w = m.w * m.p;
        const h = m.h * m.p;
        if (m.r > 0.5) {
          roundRect(ctx, m.x + 0.5, m.y + 0.5, w, h, m.r);
          ctx.stroke();
        } else ctx.strokeRect(m.x + 0.5, m.y + 0.5, w, h);
        if (m.k === MK.frame && m.p > 0.02) {
          ctx.fillStyle = COLORS.bg;
          this.handle(m.x, m.y);
          this.handle(m.x + w, m.y);
          this.handle(m.x, m.y + h);
          this.handle(m.x + w, m.y + h);
        }
        if (m.u > 0.01) {
          // Padding guide: x2..h2 hold padding top, right, bottom, left.
          ctx.globalAlpha = m.a * Math.min(1, m.u * 1.5) * 0.8;
          ctx.strokeStyle = COLORS.guide;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(
            m.x + m.h2 * m.u + 0.5, m.y + m.x2 * m.u + 0.5,
            m.w - (m.h2 + m.y2) * m.u, m.h - (m.x2 + m.w2) * m.u,
          );
          ctx.setLineDash([]);
          ctx.globalAlpha = m.a;
        }
        if (m.label) {
          const s = this.pill(m.label, "tag");
          this.blit(s, m.x, m.y - s.h - 4);
        }
        break;
      }
      case MK.ghost: {
        const t = m.p;
        const x = m.x2 + (m.x - m.x2) * t;
        const y = m.y2 + (m.y - m.y2) * t;
        const w = m.w2 + (m.w - m.w2) * t;
        const h = m.h2 + (m.h - m.h2) * t;
        ctx.globalAlpha = m.a * 0.08;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = m.a;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x + 0.5, y + 0.5, w, h);
        ctx.setLineDash([]);
        break;
      }
      case MK.scan: {
        const yy = m.y + m.h * m.p;
        const band = Math.min(20, yy - m.y);
        if (band > 0) {
          ctx.save();
          ctx.translate(m.x, yy - 20);
          ctx.fillStyle = this.band;
          ctx.fillRect(0, 20 - band, m.w, band);
          ctx.restore();
          ctx.fillStyle = m.color;
        }
        ctx.fillRect(m.x, yy - 1, m.w, 1.5);
        break;
      }
      case MK.caret:
        if (m.blink && ((now * 2.4) | 0) % 2) ctx.globalAlpha = m.a * 0.15;
        ctx.fillRect(m.x, m.y, 2, m.h);
        break;
      case MK.tag:
        this.blit(this.pill(m.label, "plan"), m.x, m.y - (1 - m.p) * 10);
        break;
      case MK.badge: {
        const s = this.pill(m.label, "badge");
        const w = s.w * m.s;
        const h = s.h * m.s;
        ctx.drawImage(s.c, m.x + (s.w - w) / 2, m.y + (s.h - h) / 2, w, h);
        break;
      }
      case MK.outline: {
        // Two strokes leave the top-left corner and meet at the bottom-right.
        const d = (m.w + m.h) * m.p;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x + Math.min(d, m.w), m.y);
        if (d > m.w) ctx.lineTo(m.x + m.w, m.y + Math.min(d - m.w, m.h));
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x, m.y + Math.min(d, m.h));
        if (d > m.h) ctx.lineTo(m.x + Math.min(d - m.h, m.w), m.y + m.h);
        ctx.stroke();
        break;
      }
      case MK.ripple:
        ctx.globalAlpha = m.a * (1 - m.p);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(m.x, m.y, (3 + 13 * m.p) * m.s, 0, TAU);
        ctx.stroke();
        break;
      case MK.packet: {
        // Dashed quadratic route, a dot travelling along it and a short fading trail.
        const qx = (m.x + m.x2) / 2 + (m.y2 - m.y) * m.u;
        const qy = (m.y + m.y2) / 2 - (m.x2 - m.x) * m.u;
        ctx.globalAlpha = m.a * 0.4 * (1 - m.p * 0.7);
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.quadraticCurveTo(qx, qy, m.x2, m.y2);
        ctx.stroke();
        ctx.setLineDash([]);
        for (let k = 4; k >= 0; k--) {
          const q = m.p - k * 0.05;
          if (q < 0) continue;
          const n = 1 - q;
          ctx.globalAlpha = m.a * (1 - k / 5);
          ctx.beginPath();
          ctx.arc(n * n * m.x + 2 * n * q * qx + q * q * m.x2, n * n * m.y + 2 * n * q * qy + q * q * m.y2, k ? 2.4 - k * 0.35 : 3.2, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case MK.holder: {
        // Grid placeholder: thin outline grown from the top-left, faint hatching inside.
        const w = m.w * m.p;
        const h = m.h * m.p;
        if (w < 1 || h < 1) break;
        this.hatch ??= this.pattern(m.color);
        if (this.hatch) {
          ctx.fillStyle = this.hatch;
          ctx.fillRect(m.x, m.y, w, h);
        }
        ctx.globalAlpha = m.a * 0.7;
        ctx.strokeStyle = m.color;
        ctx.strokeRect(m.x + 0.5, m.y + 0.5, w - 1, h - 1);
        break;
      }
      case MK.props: {
        if (!m.img) break;
        ctx.globalAlpha = m.a * m.p;
        this.blit(m.img, m.x, m.y + (1 - m.p) * 6);
        break;
      }
      case MK.deploy: {
        if (!m.img) break;
        const oy = m.y + (1 - m.p) * 6;
        ctx.globalAlpha = m.a * m.p;
        this.blit(m.img, m.x, oy);
        ctx.fillStyle = COLORS.accent;
        ctx.fillRect(m.x + 10, oy + DEPLOY.barY, (DEPLOY.w - 20) * m.u, 3);
        break;
      }
      case MK.flash:
        ctx.globalAlpha = m.a * 0.12;
        ctx.fillRect(m.x, m.y, m.w, m.h);
        ctx.globalAlpha = m.a * 0.7;
        ctx.strokeRect(m.x + 0.5, m.y + 0.5, m.w, m.h);
        break;
      case MK.card: {
        const s = m.img;
        if (!s) break;
        const k = (s.w - CARD_PAD * 2) / Math.max(1, m.w);
        const f = m.s / k;
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(m.r);
        ctx.scale(f, f);
        ctx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
        ctx.restore();
        break;
      }
      case MK.drop: {
        const s = m.img;
        if (!s) break;
        ctx.globalAlpha = m.a * Math.min(1, m.p * 1.4);
        const sh = s.c.height * m.p;
        if (sh >= 1) ctx.drawImage(s.c, 0, 0, s.c.width, sh, m.x, m.y, s.w, s.h * m.p);
        if (m.p > 0.95 && m.u >= 0) {
          ctx.globalAlpha = m.a * 0.16;
          ctx.fillStyle = COLORS.accent;
          ctx.fillRect(m.x + 3, m.y + DROP.pad + m.u * DROP.row, DROP.w - 6, DROP.row);
        }
        break;
      }
      case MK.inspector: {
        const s = m.img;
        if (!s) break;
        const oy = m.y + (1 - m.p) * 6;
        ctx.globalAlpha = m.a * m.p;
        this.blit(s, m.x, oy);
        if (m.p < 0.5) break;
        ctx.font = this.font10;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        for (let k = 0; k < 3; k++) {
          const t = k === 0 ? m.u : k === 1 ? m.v : m.s;
          const max = k === 0 ? m.w2 : k === 1 ? m.h2 : 100;
          const y = oy + INSP.head + k * INSP.row + INSP.row / 2;
          const x0 = m.x + INSP.trackX;
          const kx = x0 + t * INSP.trackW;
          ctx.fillStyle = COLORS.accent;
          ctx.fillRect(x0, y - 0.75, kx - x0, 1.5);
          ctx.beginPath();
          ctx.arc(kx, y, 3.6, 0, TAU);
          ctx.fillStyle = COLORS.text;
          ctx.fill();
          ctx.strokeStyle = COLORS.accent;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.fillStyle = COLORS.muted;
          ctx.fillText(NUM[Math.min(255, Math.round(t * max))], m.x + INSP.w - 9, y + 0.5);
        }
        ctx.textAlign = "start";
        break;
      }
      case MK.toolbar: {
        ctx.globalAlpha = m.a * m.p;
        if (m.img) this.blit(m.img, m.x, m.y);
        if (m.u >= 0) {
          ctx.strokeStyle = COLORS.accent;
          roundRect(ctx, m.x + 3 + m.u * TOOLBAR.icon + 1.5, m.y + 3.5, TOOLBAR.icon - 3, TOOLBAR.h - 7, 4);
          ctx.stroke();
        }
        break;
      }
      case MK.wheel: {
        // u: ring hue (deg), x2/y2: saturation/value, h2: readout alpha, label: hex.
        const oy = m.y + (1 - m.p) * 6;
        ctx.globalAlpha = m.a * m.p;
        if (m.img) this.blit(m.img, m.x, oy);
        const hue = (((m.u % 360) + 360) % 360) | 0;
        const sq = WHEEL.sq;
        const sx = m.x + WHEEL.cx - sq / 2;
        const sy = oy + WHEEL.cy - sq / 2;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.fillStyle = HUE[hue];
        ctx.fillRect(0, 0, sq, sq);
        ctx.fillStyle = this.white;
        ctx.fillRect(0, 0, sq, sq);
        ctx.fillStyle = this.black;
        ctx.fillRect(0, 0, sq, sq);
        ctx.restore();
        const ang = ((m.u - 90) * Math.PI) / 180;
        const rm = (WHEEL.ro + WHEEL.ri) / 2;
        this.ring(m.x + WHEEL.cx + Math.cos(ang) * rm, oy + WHEEL.cy + Math.sin(ang) * rm, 4.6);
        this.ring(sx + m.x2 * sq, sy + (1 - m.y2) * sq, 3.4);
        if (m.h2 > 0.01) {
          ctx.globalAlpha = m.a * m.p * m.h2;
          ctx.fillStyle = m.color;
          ctx.fillRect(m.x + 10, oy + WHEEL.h - 15, 12, 10);
          ctx.strokeStyle = COLORS.lineStrong;
          ctx.strokeRect(m.x + 10.5, oy + WHEEL.h - 14.5, 11, 9);
          ctx.font = this.font10;
          ctx.textBaseline = "middle";
          ctx.fillStyle = COLORS.text;
          ctx.fillText(m.label, m.x + 28, oy + WHEEL.h - 9.5);
        }
        break;
      }
      case MK.check: {
        const s = this.checks[Math.max(0, Math.min(CHECK.items.length, Math.floor(m.u)))];
        if (!s) break;
        ctx.globalAlpha = m.a * m.p;
        this.blit(s, m.x, m.y + (1 - m.p) * 6);
        break;
      }
    }
  }

  private pattern(color: string): CanvasPattern | null {
    const tile = this.sprite(8, 8, (g) => paintHatch(g, color));
    const pat = this.ctx.createPattern(tile.c, "repeat");
    // The tile is drawn at device resolution; map it back to CSS px.
    pat?.setTransform?.(new DOMMatrix().scaleSelf(1 / this.dpr, 1 / this.dpr));
    return pat;
  }

  private ring(x: number, y: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
  }
}
