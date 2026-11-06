// Part of living-ui-skills (MIT). Adapt freely.
// https://github.com/anhlamtruong/living-ui-skills
// Painters for cursor glyphs and canvas popovers (font menu, inspector,
// alignment toolbar, color wheel, review checklist, dragged image cards).
// Each paints into a context already scaled to CSS px; renderer.ts caches
// the results as sprites so nothing here runs per frame.
import { COLORS } from "./palette";
import { TOOL } from "./types";

type G = CanvasRenderingContext2D;

// Popover geometry (CSS px), shared with the choreography that aims at it.
export const DROP = { w: 140, row: 18, pad: 4 } as const;
export const dropH = (rows: number) => DROP.pad * 2 + rows * DROP.row;
export const INSP = { w: 180, head: 18, row: 18, pad: 6, trackX: 64, trackW: 70 } as const;
export const INSP_H = INSP.head + 3 * INSP.row + INSP.pad;
export const TOOLBAR = { w: 72, h: 24, icon: 22 } as const;
export const WHEEL = { w: 96, h: 116, cx: 48, cy: 48, ro: 40, ri: 30, sq: 36 } as const;
export const CHECK = { w: 112, head: 16, row: 16, pad: 6, items: ["layout", "type", "color", "a11y"] } as const;
export const CHECK_H = CHECK.head + CHECK.items.length * CHECK.row + CHECK.pad;
export const PROPS = { w: 196, head: 18, row: 16, pad: 6, valueX: 66 } as const;
export const propsH = (rows: number) => PROPS.head + rows * PROPS.row + PROPS.pad;
export const DEPLOY = { w: 220, h: 60, barY: 46 } as const;
export const DEPLOY_STEPS = ["build", "upload", "edge"] as const;
/** Shadow margin baked around dragged image cards. */
export const CARD_PAD = 18;
/** Hotspot of each cursor glyph inside its 26 px sprite. */
export const GLYPH_SIZE = 26;
export const GLYPH_HOT: readonly (readonly [number, number])[] = [
  [3, 3], [13, 13], [13, 13], [13, 13], [13, 13], [13, 13], [6, 20], [13, 13],
];

export function roundRect(g: G, x: number, y: number, w: number, h: number, r: number): void {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + q, y);
  g.arcTo(x + w, y, x + w, y + h, q);
  g.arcTo(x + w, y + h, x, y + h, q);
  g.arcTo(x, y + h, x, y, q);
  g.arcTo(x, y, x + w, y, q);
  g.closePath();
}

function panel(g: G, w: number, h: number): void {
  roundRect(g, 0.5, 0.5, w - 1, h - 1, 7);
  g.fillStyle = COLORS.glass;
  g.fill();
  g.strokeStyle = COLORS.line;
  g.lineWidth = 1;
  g.stroke();
}

function text(g: G, family: string, size: number, color: string, s: string, x: number, y: number): void {
  g.font = `500 ${size}px ${family}`;
  g.fillStyle = color;
  g.textBaseline = "middle";
  g.fillText(s, x, y);
}

/** Original cursor glyphs; the hotspot sits at the origin. */
export function paintGlyph(g: G, tool: number, color: string): void {
  const [hx, hy] = GLYPH_HOT[tool] ?? GLYPH_HOT[0];
  g.translate(hx, hy);
  g.lineCap = "round";
  g.lineJoin = "round";
  const duo = (path: () => void, w: number) => {
    g.strokeStyle = COLORS.ink;
    g.lineWidth = w + 2.4;
    path();
    g.stroke();
    g.strokeStyle = color;
    g.lineWidth = w;
    path();
    g.stroke();
  };
  const solid = (path: () => void) => {
    path();
    g.fillStyle = color;
    g.fill();
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 1.25;
    g.stroke();
  };
  switch (tool) {
    case TOOL.cross:
      duo(() => {
        g.beginPath();
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          g.moveTo(a * 2.6, b * 2.6);
          g.lineTo(a * 8, b * 8);
        }
      }, 1.6);
      g.fillStyle = color;
      g.fillRect(-0.9, -0.9, 1.8, 1.8);
      break;
    case TOOL.beam:
      duo(() => {
        g.beginPath();
        g.moveTo(0, -7);
        g.lineTo(0, 7);
        g.moveTo(-3.2, -8);
        g.lineTo(3.2, -8);
        g.moveTo(-3.2, 8);
        g.lineTo(3.2, 8);
      }, 1.5);
      break;
    case TOOL.hand:
      for (let k = 0; k < 4; k++) solid(() => {
        g.beginPath();
        g.arc(-4.1 + k * 2.75, -2.8, 1.75, 0, Math.PI * 2);
      });
      solid(() => {
        g.beginPath();
        g.ellipse(-6.3, 1.8, 1.7, 2.4, -0.5, 0, Math.PI * 2);
      });
      solid(() => roundRect(g, -5.6, -2.6, 11.2, 9.6, 3.6));
      break;
    case TOOL.resize:
    case TOOL.slide: {
      const d = tool === TOOL.resize;
      duo(() => {
        g.beginPath();
        if (d) {
          g.moveTo(-5.5, -5.5);
          g.lineTo(5.5, 5.5);
          g.moveTo(5.5, 1.5);
          g.lineTo(5.5, 5.5);
          g.lineTo(1.5, 5.5);
          g.moveTo(-5.5, -1.5);
          g.lineTo(-5.5, -5.5);
          g.lineTo(-1.5, -5.5);
        } else {
          g.moveTo(-7.5, 0);
          g.lineTo(7.5, 0);
          g.moveTo(4.5, -3);
          g.lineTo(7.5, 0);
          g.lineTo(4.5, 3);
          g.moveTo(-4.5, -3);
          g.lineTo(-7.5, 0);
          g.lineTo(-4.5, 3);
        }
      }, 1.6);
      break;
    }
    case TOOL.move:
      // Four-way arrow: grab and position.
      duo(() => {
        g.beginPath();
        g.moveTo(-8, 0);
        g.lineTo(8, 0);
        g.moveTo(0, -8);
        g.lineTo(0, 8);
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          g.moveTo(a * 8 + b * 2.6 - a * 2.6, b * 8 + a * 2.6 - b * 2.6);
          g.lineTo(a * 8, b * 8);
          g.lineTo(a * 8 - b * 2.6 - a * 2.6, b * 8 - a * 2.6 - b * 2.6);
        }
      }, 1.5);
      break;
    case TOOL.picker:
      // A dropper leaning right: tip at the hotspot, bulb up and to the right.
      g.rotate(Math.PI / 4);
      solid(() => roundRect(g, -1.9, -12, 3.8, 9.5, 1.2));
      solid(() => {
        g.beginPath();
        g.moveTo(-1.3, -2.6);
        g.lineTo(0, 0.4);
        g.lineTo(1.3, -2.6);
        g.closePath();
      });
      solid(() => roundRect(g, -3.4, -15.5, 6.8, 4.4, 2.2));
      break;
    default:
      solid(() => {
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(13, 5);
        g.lineTo(7.2, 7.2);
        g.lineTo(5, 13);
        g.closePath();
      });
  }
}

/** Font menu; `checked` is a bit mask of checked rows. */
export function paintDropdown(g: G, family: string, rows: string[], checked: number): void {
  panel(g, DROP.w, dropH(rows.length));
  rows.forEach((s, k) => {
    const y = DROP.pad + k * DROP.row + DROP.row / 2 + 0.5;
    const on = (checked >> k) & 1;
    text(g, family, 10, on ? COLORS.text : COLORS.muted, s, 10, y);
    if (on) text(g, family, 10, COLORS.accent, "✓", DROP.w - 18, y);
  });
}

/** Inspect-mode property sheet: rows of [label, value]; optional fill swatch. */
export function paintProps(g: G, family: string, title: string, rows: [string, string][], swatch: string | null): void {
  const h = propsH(rows.length);
  panel(g, PROPS.w, h);
  text(g, family, 9, COLORS.dim, title, 10, PROPS.head / 2 + 1);
  g.fillStyle = COLORS.line;
  g.fillRect(1, PROPS.head, PROPS.w - 2, 1);
  rows.forEach(([k, v], i) => {
    const y = PROPS.head + i * PROPS.row + PROPS.row / 2 + 0.5;
    text(g, family, 10, COLORS.dim, k, 10, y);
    let x = PROPS.valueX;
    if (k === "fill" && swatch) {
      g.fillStyle = swatch;
      g.fillRect(x, y - 4.5, 9, 9);
      g.strokeStyle = COLORS.lineStrong;
      g.strokeRect(x + 0.5, y - 4, 8, 8);
      x += 14;
    }
    text(g, family, 10, COLORS.text, v, x, y);
  });
}

/** Deploy panel: steps checked so far (0..3), or the final line. */
export function paintDeploy(g: G, family: string, done: number, final: string | null): void {
  panel(g, DEPLOY.w, DEPLOY.h);
  text(g, family, 9, COLORS.dim, "deploy · production", 10, 11);
  if (final) text(g, family, 10, COLORS.accent, `✓ ${final}`, 10, 29);
  else {
    let x = 10;
    DEPLOY_STEPS.forEach((s, k) => {
      const ok = k < done;
      text(g, family, 10, ok ? COLORS.text : COLORS.dim, `${s} ${ok ? "✓" : "·"}`, x, 29);
      x += g.measureText(`${s} ✓`).width + 12;
    });
  }
  g.fillStyle = COLORS.lineStrong;
  g.fillRect(10, DEPLOY.barY, DEPLOY.w - 20, 3);
}

export function paintInspector(g: G, family: string, title: string): void {
  panel(g, INSP.w, INSP_H);
  text(g, family, 9, COLORS.dim, `${title} · inspect`, 10, INSP.head / 2 + 1);
  g.fillStyle = COLORS.line;
  g.fillRect(1, INSP.head, INSP.w - 2, 1);
  ["radius", "padding", "opacity"].forEach((s, k) => {
    const y = INSP.head + k * INSP.row + INSP.row / 2;
    text(g, family, 10, COLORS.muted, s, 10, y + 0.5);
    g.fillStyle = COLORS.lineStrong;
    g.fillRect(INSP.trackX, y - 0.5, INSP.trackW, 1);
    g.beginPath();
    g.arc(INSP.trackX, y, 2.6, 0, Math.PI * 2);
    g.fillStyle = COLORS.panel;
    g.fill();
    g.strokeStyle = COLORS.muted;
    g.lineWidth = 1;
    g.stroke();
  });
}

export function paintToolbar(g: G): void {
  panel(g, TOOLBAR.w, TOOLBAR.h);
  g.fillStyle = COLORS.muted;
  const widths = [10, 6, 8];
  for (let k = 0; k < 3; k++) {
    const cx = 3 + k * TOOLBAR.icon + TOOLBAR.icon / 2;
    widths.forEach((w, j) => {
      const x = k === 0 ? cx - 5 : k === 1 ? cx - w / 2 : cx + 5 - w;
      g.fillRect(x, 7 + j * 4, w, 1.4);
    });
  }
}

export function paintWheel(g: G): void {
  panel(g, WHEEL.w, WHEEL.h);
  const { cx, cy, ro, ri } = WHEEL;
  for (let k = 0; k < 120; k++) {
    const a0 = ((k * 3 - 90) * Math.PI) / 180;
    const a1 = (((k + 1) * 3 - 90) * Math.PI) / 180 + 0.012;
    g.beginPath();
    g.arc(cx, cy, ro, a0, a1);
    g.arc(cx, cy, ri, a1, a0, true);
    g.closePath();
    g.fillStyle = `hsl(${k * 3 + 1.5},100%,50%)`;
    g.fill();
  }
  g.strokeStyle = "rgba(7,9,13,0.6)";
  g.lineWidth = 1;
  for (const r of [ro, ri]) {
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = COLORS.line;
  g.fillRect(1, WHEEL.h - 21, WHEEL.w - 2, 1);
}

export function paintChecklist(g: G, family: string, done: number): void {
  panel(g, CHECK.w, CHECK_H);
  text(g, family, 9, COLORS.dim, "review", 10, CHECK.head / 2 + 2);
  CHECK.items.forEach((s, k) => {
    const y = CHECK.head + k * CHECK.row + CHECK.row / 2 + 0.5;
    const ok = k < done;
    text(g, family, 10, ok ? COLORS.accent : COLORS.dim, ok ? "✓" : "○", 10, y);
    text(g, family, 10, ok ? COLORS.text : COLORS.muted, s, 24, y);
  });
}

/** 8 px tile of faint diagonal hatching, used as a pattern for grid placeholders. */
export function paintHatch(g: G, color: string): void {
  g.strokeStyle = color;
  g.globalAlpha = 0.22;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(-2, 10);
  g.lineTo(10, -2);
  g.moveTo(-2, 2);
  g.lineTo(2, -2);
  g.moveTo(6, 10);
  g.lineTo(10, 6);
  g.stroke();
  g.globalAlpha = 1;
}

/** A rounded card for a dragged image: thumbnail (or hatched placeholder) and a baked shadow. */
export function paintCard(
  g: G, family: string, cw: number, ch: number, radius: number,
  img: HTMLImageElement | null, alt: string, fit: string, pos: number[],
): void {
  const P = CARD_PAD;
  g.save();
  g.shadowColor = "rgba(0,0,0,0.55)";
  g.shadowBlur = 16;
  g.shadowOffsetY = 7;
  roundRect(g, P, P, cw, ch, radius);
  g.fillStyle = COLORS.panel;
  g.fill();
  g.restore();
  g.save();
  roundRect(g, P, P, cw, ch, radius);
  g.clip();
  let drawn = false;
  if (img && img.complete && img.naturalWidth > 0) {
    try {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      if (fit === "contain" || fit === "scale-down") {
        const k = Math.min((cw * 0.7) / iw, (ch * 0.7) / ih);
        g.drawImage(img, P + (cw - iw * k) / 2, P + (ch - ih * k) / 2, iw * k, ih * k);
      } else if (fit === "cover") {
        const k = Math.max(cw / iw, ch / ih);
        const sw = cw / k;
        const sh = ch / k;
        g.drawImage(img, (iw - sw) * pos[0], (ih - sh) * pos[1], sw, sh, P, P, cw, ch);
      } else g.drawImage(img, P, P, cw, ch);
      drawn = true;
    } catch {
      drawn = false;
    }
  }
  if (!drawn) {
    g.strokeStyle = "rgba(94,234,212,0.16)";
    g.lineWidth = 1;
    g.beginPath();
    for (let d = -ch; d < cw; d += 8) {
      g.moveTo(P + d, P + ch);
      g.lineTo(P + d + ch, P);
    }
    g.stroke();
    g.font = `500 10px ${family}`;
    const max = cw - 16;
    let s = alt;
    while (s.length > 3 && g.measureText(s).width > max) s = s.slice(0, -2);
    if (s !== alt) s = s.slice(0, -1) + "…";
    g.textAlign = "center";
    text(g, family, 10, COLORS.muted, s, P + cw / 2, P + ch / 2);
    g.textAlign = "start";
  }
  g.restore();
  roundRect(g, P + 0.5, P + 0.5, cw - 1, ch - 1, radius);
  g.strokeStyle = COLORS.lineStrong;
  g.lineWidth = 1;
  g.stroke();
}
