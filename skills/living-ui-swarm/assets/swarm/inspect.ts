// Part of living-ui-skills (MIT). Adapt freely.
// https://github.com/anhlamtruong/living-ui-skills
// Inspect mode: the real computed values shown in the property sheet.
import { fontLabel } from "./palette";
import { rgba } from "./scan";

export interface Props {
  title: string;
  rows: [string, string][];
  swatch: string | null;
  radius: number;
}

const px = (v: string) => Math.round(Number.parseFloat(v) || 0);
const hex = (c: number[]) => "#" + c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");

/** First element that directly holds visible text (for the font row). */
function textHolder(el: HTMLElement): HTMLElement | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue?.trim()) return n.parentElement;
  return null;
}

export function readProps(el: HTMLElement, title: string): Props {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const rows: [string, string][] = [
    ["size", `${Math.round(r.width)} × ${Math.round(r.height)}`],
    ["radius", String(px(cs.borderTopLeftRadius))],
    ["padding", `${px(cs.paddingTop)} / ${px(cs.paddingLeft)}`],
  ];
  const fill = rgba(cs.backgroundColor);
  let swatch: string | null = null;
  if (fill && fill[3] > 0.02) {
    swatch = `rgba(${fill[0]},${fill[1]},${fill[2]},${fill[3]})`;
    rows.push(["fill", hex(fill) + (fill[3] < 0.99 ? ` · ${Math.round(fill[3] * 100)}%` : "")]);
  } else rows.push(["fill", "none"]);
  const holder = textHolder(el);
  if (holder) {
    const ts = getComputedStyle(holder);
    rows.push(["font", `${fontLabel(ts.fontFamily)} ${ts.fontWeight} · ${px(ts.fontSize)}px`]);
  }
  return { title, rows, swatch, radius: Number.parseFloat(cs.borderTopLeftRadius) || 0 };
}
