// Part of living-ui-skills (MIT). Adapt freely.
"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./built";
import { setupGlitch } from "./glitch";
import { setupHolo, type HoloOptions } from "./holo";
import { setupScramble } from "./scramble";
import { setupSpotlight } from "./spotlight";
import "./fx.css";

type FxRootProps = {
  /** Tilt + glare on cards. Pass options to change which elements count. */
  holo?: boolean | HoloOptions;
  /** Brighter grid around the pointer. Needs a fixed base grid (.fx-grid). */
  spotlight?: boolean;
  /** Glitch on [data-fx-glitch] headings. */
  glitch?: boolean;
  /** Scramble on links/buttons that contain <ScrambleText>. */
  scramble?: boolean;
  /** "always" plays for everyone; "respect-reduced" turns all four off for reduced-motion users. */
  motion?: "always" | "respect-reduced";
};

/**
 * Page-wide effects, mounted once near the root of the page (inside the
 * element that holds your fixed grid, if you use the spotlight). Renders only
 * the spotlight layer; everything else is event-driven and attaches to markup
 * that is already on the page.
 */
export function FxRoot({
  holo = true,
  spotlight = true,
  glitch = true,
  scramble = true,
  motion = "always",
}: FxRootProps) {
  const spotRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // Options are read once; an inline object prop would otherwise re-run the effect every render.
  const holoOpts = useRef(typeof holo === "object" ? holo : undefined);
  const holoOn = holo !== false;

  useEffect(() => {
    if (motion === "respect-reduced" && prefersReducedMotion()) return;
    const cleanups: (() => void)[] = [];
    const add = (setup: () => () => void) => {
      try {
        cleanups.push(setup());
      } catch (err) {
        if (process.env.NODE_ENV !== "production") console.error("[fx]", err);
      }
    };
    if (holoOn) add(() => setupHolo(holoOpts.current));
    if (glitch) add(setupGlitch);
    if (scramble) add(setupScramble);
    const spot = spotRef.current;
    const grid = gridRef.current;
    if (spotlight && spot && grid) add(() => setupSpotlight(spot, grid));
    return () => cleanups.forEach((fn) => fn());
  }, [holoOn, spotlight, glitch, scramble, motion]);

  if (!spotlight) return null;
  return (
    <div ref={spotRef} className="fx-spot" aria-hidden="true">
      <div ref={gridRef} className="fx-spot__grid" />
    </div>
  );
}
