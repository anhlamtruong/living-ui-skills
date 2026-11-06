// Part of living-ui-skills (MIT). Adapt freely.
// https://github.com/anhlamtruong/living-ui-skills
"use client";

import dynamic from "next/dynamic";
import { SmoothScroll } from "./smooth-scroll";

// The engine (canvas, scheduler, HUD) loads after hydration, never during SSR.
const BuildLayer = dynamic(() => import("./build-layer"), { ssr: false });

export function SwarmRoot() {
  return (
    <>
      <SmoothScroll />
      <BuildLayer />
    </>
  );
}
