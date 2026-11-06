"use client";
// Part of living-ui-skills (MIT). Adapt freely.

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// Scroll-linked depth for decorative layers. Only decoration and image
// contents move, never build items themselves, so the agents' measured
// targets stay put.
//
//   data-parallax="0.3"     vertical drift; higher = moves more (negative = opposite)
//   data-parallax-x="-0.5"  horizontal drift (for big outline words)
//   data-parallax-img       image inside an overflow-hidden frame: zoomed slightly
//                           and panned as the frame crosses the viewport
//   data-parallax-scope     optional ancestor to use as the scroll trigger
const RANGE = 140; // px of travel at speed 1 across the trigger's scroll span

export function Parallax() {
  useGSAP(() => {
    const mm = gsap.matchMedia();

    mm.add(
      { phone: "(max-width: 767px)", wide: "(min-width: 768px)" },
      (ctx) => {
        const scale = ctx.conditions?.phone ? 0.45 : 1;

        const triggerFor = (el: HTMLElement) =>
          (el.closest("[data-parallax-scope]") as HTMLElement | null) ?? el;

        gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
          const speed = parseFloat(el.dataset.parallax ?? "0.2") * scale;
          gsap.fromTo(
            el,
            { y: -speed * RANGE },
            {
              y: speed * RANGE,
              ease: "none",
              force3D: true,
              scrollTrigger: {
                trigger: triggerFor(el),
                start: "top bottom",
                end: "bottom top",
                scrub: true,
              },
            },
          );
        });

        gsap.utils.toArray<HTMLElement>("[data-parallax-x]").forEach((el) => {
          const speed = parseFloat(el.dataset.parallaxX ?? "0.3") * scale;
          gsap.fromTo(
            el,
            { x: -speed * RANGE * 2 },
            {
              x: speed * RANGE * 2,
              ease: "none",
              force3D: true,
              scrollTrigger: {
                trigger: triggerFor(el),
                start: "top bottom",
                end: "bottom top",
                scrub: true,
              },
            },
          );
        });

        gsap.utils.toArray<HTMLElement>("[data-parallax-img]").forEach((el) => {
          gsap.set(el, { scale: 1.14, transformOrigin: "50% 50%" });
          gsap.fromTo(
            el,
            { yPercent: -6 * scale },
            {
              yPercent: 6 * scale,
              ease: "none",
              force3D: true,
              scrollTrigger: {
                trigger: el.parentElement ?? el,
                start: "top bottom",
                end: "bottom top",
                scrub: true,
              },
            },
          );
        });
      },
    );

    return () => mm.revert();
  });

  return null;
}
