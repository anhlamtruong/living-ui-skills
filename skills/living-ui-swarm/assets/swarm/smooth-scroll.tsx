// Part of living-ui-skills (MIT). Adapt freely.
// https://github.com/anhlamtruong/living-ui-skills
"use client";

import "lenis/dist/lenis.css";
import { useEffect, useRef } from "react";
import type Lenis from "lenis";
import { ReactLenis, type LenisRef } from "lenis/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// syncTouch stays false: phones keep native touch scrolling.
// respectReducedMotion is off: smooth scrolling is on for every visitor.
const OPTIONS = {
  autoRaf: false,
  anchors: true,
  syncTouch: false,
  respectReducedMotion: false,
};

/** Root Lenis instance driven by gsap.ticker, on for every visitor. */
export function SmoothScroll() {
  const ref = useRef<LenisRef>(null);

  useEffect(() => {
    let bound: Lenis | undefined;
    const raf = (time: number) => {
      const lenis = ref.current?.lenis;
      if (!lenis) return; // ReactLenis creates the instance after its first effect
      if (lenis !== bound) {
        bound?.off("scroll", ScrollTrigger.update);
        lenis.on("scroll", ScrollTrigger.update);
        bound = lenis;
      }
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(raf);
      bound?.off("scroll", ScrollTrigger.update);
      gsap.ticker.lagSmoothing(500, 33);
    };
  }, []);

  return <ReactLenis root options={OPTIONS} ref={ref} />;
}
