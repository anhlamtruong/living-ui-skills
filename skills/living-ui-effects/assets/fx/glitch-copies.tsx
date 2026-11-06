// Part of living-ui-skills (MIT). Adapt freely.
"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * The two colored layers the glitch slices (see .fx-glitch in fx.css). They
 * render only after hydration, so the static HTML (search engines,
 * find-in-page, screen readers) sees each heading once. Place it right after
 * the heading inside a `.fx-glitch` wrapper and give it the heading's
 * typography classes so the copies wrap exactly like the real text.
 */
export function GlitchCopies({ className = "", children }: { className?: string; children: ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(true), []);
  if (!on) return null;
  return (
    <>
      <span aria-hidden="true" className={`fx-glitch__copy fx-glitch__copy--a ${className}`}>
        {children}
      </span>
      <span aria-hidden="true" className={`fx-glitch__copy fx-glitch__copy--b ${className}`}>
        {children}
      </span>
    </>
  );
}

/**
 * Convenience wrapper: a heading that glitches when it comes into view.
 *
 *   <GlitchHeading as="h2" className="text-5xl font-semibold">Selected work</GlitchHeading>
 *
 * Extra attributes (for example a build engine's data-build-item) go on the
 * real heading through `headingProps`.
 */
export function GlitchHeading({
  as: Tag = "h2",
  className = "",
  wrapperClassName = "",
  headingProps,
  children,
}: {
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
  wrapperClassName?: string;
  headingProps?: Record<string, string | number | boolean | undefined>;
  children: ReactNode;
}) {
  return (
    <div className={`fx-glitch ${wrapperClassName}`} data-fx-glitch="">
      <Tag {...headingProps} className={`fx-glitch__base ${className}`}>
        {children}
      </Tag>
      <GlitchCopies className={className}>{children}</GlitchCopies>
    </div>
  );
}
