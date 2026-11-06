// Part of living-ui-skills (MIT). Adapt freely.
// One typed module holds every fact on the page. Sections render from it,
// videos and the OG image read from it, so a fact changes in one place.
// Replace every placeholder with real, owner-confirmed facts: a motion piece
// that shows an invented number is worse than no motion at all.

import type { StaticImageData } from "next/image";

export const profile = {
  name: "Your Name",
  role: "Your Role",
  company: "Company",
  location: "City, Region",
  summary:
    "One or two sentences on what you build and why it matters. Specific beats clever.",
  email: "you@example.com",
  /** Shown by the swarm's deploy finale: data-deploy-text={`live at ${profile.site}`} */
  site: "example.com",
} as const;

// Short, countable claims. Each one should survive "says who?".
// `color` lets the swarm's designer agent pick it from the color wheel
// (data-build-color="text" on the value).
export const metrics = [
  { value: "100+", label: "what the number counts", color: "#5eead4" },
  { value: "3×", label: "what got faster or cheaper", color: "#a78bfa" },
] as const;

export type Link = {
  label: string;
  href: string;
  kind: "github" | "linkedin" | "email" | "resume" | "web";
};

export const socialLinks: Link[] = [
  { label: "GitHub", href: "https://github.com/you", kind: "github" },
  { label: "Email", href: "mailto:you@example.com", kind: "email" },
];

export type Project = {
  title: string;
  tagline: string;
  dates: string;
  description: string;
  stack: string[];
  /** A measurable outcome, shown with an accent rule. */
  result?: string;
  /** Small chip on the media, e.g. "Prize". */
  badge?: string;
  links: { label: string; href: string }[];
  image?: StaticImageData;
  /** Looping clip in public/videos/<video>.{webm,mp4,webp} (see living-ui-video). */
  video?: string;
  featured?: boolean;
};

export const projects: Project[] = [
  {
    title: "Project name",
    tagline: "What it is · where it came from",
    dates: "Jan – Mar 2026",
    description: "What it does, for whom, and the one interesting technical choice.",
    stack: ["TypeScript", "Next.js"],
    result: "The outcome in numbers",
    links: [{ label: "Live", href: "https://example.com" }],
    video: "proj-example",
    featured: true,
  },
];
