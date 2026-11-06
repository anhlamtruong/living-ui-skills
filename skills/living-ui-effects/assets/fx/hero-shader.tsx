// Part of living-ui-skills (MIT). Adapt freely.
"use client";

import { useEffect, useRef, useState } from "react";
import { createAurora, type AuroraPalette } from "./aurora";
import { prefersReducedMotion } from "./built";
import "./fx.css";

type HeroShaderProps = {
  palette?: Partial<AuroraPalette>;
  /** 1 = default; lower is calmer. */
  intensity?: number;
  /** "always" plays for everyone; "respect-reduced" renders nothing for reduced-motion users. */
  motion?: "always" | "respect-reduced";
  className?: string;
};

/**
 * WebGL "liquid light" behind a hero. Mount it as the first child of the hero
 * <section> (which must be position: relative). It fades in once the section
 * is built (right away when no build animation runs), only renders while it is
 * on screen, and renders nothing when WebGL is unavailable.
 */
export function HeroShader({ palette, intensity, motion = "always", className = "" }: HeroShaderProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  // Palette and intensity are read once: they are compiled into the shader.
  const opts = useRef({ palette, intensity });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (motion === "respect-reduced" && prefersReducedMotion()) {
      setFailed(true);
      return;
    }
    const scope =
      canvas.closest<HTMLElement>("[data-build-section]") ?? canvas.parentElement ?? document.body;
    let aurora: ReturnType<typeof createAurora> = null;
    try {
      aurora = createAurora(canvas, scope, opts.current);
    } catch {
      aurora = null;
    }
    if (!aurora) {
      setFailed(true);
      return;
    }
    return () => aurora?.destroy();
  }, [motion]);

  if (failed) return null;
  return <canvas ref={ref} className={`fx-shader ${className}`} aria-hidden="true" />;
}
