// Part of living-ui-skills (MIT). Adapt freely.
// Readiness gate shared by every effect.
//
// Effects must never transform, glitch or scramble something another script
// is still revealing or measuring. The contract (the same one the
// living-ui-swarm build engine uses):
//
//   html[data-build="on"]   a build animation is running on this page
//   [data-build-section]    a region it builds as a unit
//   [data-build-item]       one element it reveals
//   [data-built]            set on items and sections once they are finished
//
// With no build engine on the page, html has no data-build attribute, so
// everything counts as built and the effects start right away. If you use a
// different intro animation, set html[data-build="on"] while it runs and put
// [data-built] on each region when it settles (or remove data-build at the
// end); nothing else needs to change.
//
// html[data-fx-freeze] pauses the pointer effects for tools that read real
// element rects (an inspector, a screenshot pass, a layout test).

export const FINE_POINTER = "(hover: hover) and (pointer: fine)";

/** True while a build animation may still hide or measure content. */
export function buildActive(): boolean {
  return document.documentElement.getAttribute("data-build") === "on";
}

/** The element's own build item and its section are finished (or no build is running). */
export function isBuilt(el: Element): boolean {
  if (!buildActive()) return true;
  const item = el.closest("[data-build-item]");
  if (item && !item.hasAttribute("data-built")) return false;
  const section = el.closest("[data-build-section]");
  return !section || section.hasAttribute("data-built");
}

/**
 * Something is reading real rects right now, so cards must not tilt:
 * html[data-fx-freeze], or the living-ui-swarm HUD's inspect toggle.
 */
export function frozen(): boolean {
  const html = document.documentElement;
  return (
    html.hasAttribute("data-fx-freeze") ||
    document.querySelector('.swarm-hud__btn[aria-pressed="true"]') !== null
  );
}

/** Small seeded PRNG (xorshift32), [0, 1). Same seed, same sequence. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** Removes an empty style attribute left behind after clearing inline styles. */
export function tidyStyle(el: HTMLElement): void {
  if (el.getAttribute("style") === "") el.removeAttribute("style");
}

/** True when the user asked the OS for reduced motion. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
