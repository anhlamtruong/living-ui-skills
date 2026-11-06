// Part of living-ui-skills (MIT). Adapt freely.
// Grid spotlight: a brighter copy of the page's fixed background grid,
// revealed in a soft circle around the pointer (see div.fx-spot in fx.css).
//
// Only transforms change per frame: the masked window follows the pointer and
// the grid inside it is shifted back so its lines stay on the same lattice as
// the base grid. Both must be anchored at the viewport origin (position:
// fixed, background-position 0 0), which .fx-grid in fx.css gives you.
// Mouse/pen: follows with a slight trailing lerp. Touch: a short fade at the
// tap point.

import { ease, sleep, wake } from "./ticker";

/** Reads a px length custom property, e.g. --fx-grid-cell: 96px. */
function cssPx(el: HTMLElement, name: string, fallback: number): number {
  const v = Number.parseFloat(getComputedStyle(el).getPropertyValue(name));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function setupSpotlight(spot: HTMLElement, grid: HTMLElement): () => void {
  // Sizes come from CSS so the stylesheet stays the one place to tune them.
  const HALF = cssPx(spot, "--fx-spot-size", 560) / 2;
  const CELL = cssPx(spot, "--fx-grid-cell", 96);
  let x = 0;
  let y = 0;
  let tx = 0;
  let ty = 0;
  let has = false;
  let lastKey = "";
  let tapTimer = 0;

  const write = () => {
    const wx = Math.round(x) - HALF;
    const wy = Math.round(y) - HALF;
    const key = wx + "," + wy;
    if (key === lastKey) return;
    lastKey = key;
    // Grid origin = the 96 px line at or before the window's corner.
    const gx = Math.floor(wx / CELL) * CELL - wx;
    const gy = Math.floor(wy / CELL) * CELL - wy;
    spot.style.transform = `translate3d(${wx}px,${wy}px,0)`;
    grid.style.transform = `translate3d(${gx}px,${gy}px,0)`;
  };

  const frame = (_now: number, dt: number): boolean => {
    const k = ease(dt, 16);
    x += (tx - x) * k;
    y += (ty - y) * k;
    const done = Math.abs(tx - x) < 0.3 && Math.abs(ty - y) < 0.3;
    if (done) {
      x = tx;
      y = ty;
    }
    write();
    return !done;
  };

  const show = (mode: "" | "tap") => {
    if (spot.getAttribute("data-on") !== mode) spot.setAttribute("data-on", mode);
  };
  const hide = () => {
    if (spot.hasAttribute("data-on")) spot.removeAttribute("data-on");
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    tx = e.clientX;
    ty = e.clientY;
    if (!has || !spot.hasAttribute("data-on")) {
      // Appear where the pointer is, not with a glide from the last spot.
      has = true;
      x = tx;
      y = ty;
      write();
    }
    window.clearTimeout(tapTimer);
    show("");
    wake(frame);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    tx = x = e.clientX;
    ty = y = e.clientY;
    has = true;
    write();
    show("tap");
    window.clearTimeout(tapTimer);
    tapTimer = window.setTimeout(hide, 360);
  };
  const onOut = (e: PointerEvent) => {
    if (!e.relatedTarget && e.pointerType !== "touch") hide();
  };
  const onBlur = () => hide();

  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerup", onUp, { passive: true });
  document.addEventListener("pointerout", onOut, { passive: true });
  window.addEventListener("blur", onBlur);

  return () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointerout", onOut);
    window.removeEventListener("blur", onBlur);
    window.clearTimeout(tapTimer);
    sleep(frame);
    hide();
  };
}
