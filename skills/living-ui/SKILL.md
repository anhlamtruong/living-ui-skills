---
name: living-ui
description: Start here to build a portfolio, personal site or launch page that feels alive instead of static, the way lamanhtruong.com does. Covers the method end to end - a distinctive design system, a page that prerenders with all content in the HTML, then three motion layers on top (an agent-swarm build animation, looping HyperFrames videos, pointer-reactive effects), performance gates so none of it janks, headless verification, and shipping through PR previews. Use this whenever someone wants a site that "wows", "stands out", "feels premium/alive/cinematic", says their page "feels static/boring", asks for an animated portfolio or landing page redesign, or wants to plan which effects to add. It routes to living-ui-swarm, living-ui-video and living-ui-effects for each layer.
---

# Living UI

A living page is a fully rendered static page with motion layered on top. People get every word in the first HTML response, and the motion is there to make them stay. This skill is the method. The three sibling skills hold the motion layers and their code:

| Layer | What the visitor sees | Skill |
| --- | --- | --- |
| Assemble | Colored agent cursors build each section as it scrolls in: frames drawn, text typed, images dragged in | `living-ui-swarm` |
| Loop | Short muted videos that show the work running: a hero showreel, project demos, strips between sections | `living-ui-video` |
| Respond | The page reacts to the pointer: a WebGL hero, hologram cards, a grid spotlight, glitch and scramble type | `living-ui-effects` |

Worked example: https://www.lamanhtruong.com, source at
https://github.com/anhlamtruong/portfolio-anh/tree/a5d165123922ea5c7fd645c4d0701554b1e4df8f.
The homepage is `src/app/(homepage)/`.

## The order of work

Build in this order. Each step stands on the one before it, and skipping ahead is how pages end up pretty but slow or broken.

1. **Content first.** Put every fact in one typed content module (see `assets/content.example.ts`): name, role, metrics, experience, projects, links. Sections render from it, and videos and OG images read from it too, so a fact changes in one place.
   - Use real facts only. A motion piece that invents a number is worse than no motion at all.
   - Ask the owner for anything you'd otherwise have to guess.
2. **Pick a visual language and write it down as tokens.** The example uses a "blueprint" language:
   - near-black ground, 1 px lines, a fixed engineering grid;
   - a grotesk for headlines, a serif italic for single accent words, mono for labels and numbers;
   - one accent color plus a role palette.
   Read `references/blueprint-design-system.md` before inventing your own. To start from it, copy `assets/blueprint.css`, `assets/decor.tsx` and `assets/parallax.tsx` into `src/components/living-ui/`.
3. **Make the page static.** It should prerender (`○` in `next build`), carry all content in the HTML, and need no client JS to be readable. Read `references/static-first-nextjs.md`, which covers the traps when a root layout calls `auth()`, reads cookies or uses `useSearchParams`.
4. **Ask which layers to add, then add them one at a time,** each behind its own gate (below). The layers are independent: a site can use only the videos, or only the effects.
5. **Verify headless, then on devices.** See `references/verification.md`. Test browsers lie about motion, so know which ones you can trust.
6. **Ship through a PR with a preview link.** Merge only when the owner says so (see "Shipping").

## Putting the page together

`assets/layout.example.tsx` and `assets/page.example.tsx` show the whole page with all three layers mounted. A fresh `create-next-app` (Next.js 15.5, React 19, Tailwind 4) builds them static with no edits. The conventions:

- Copy the skills' assets to `src/components/living-ui/` (theme), `src/components/swarm/`, `src/components/fx/` and `src/components/video/`, and the content module to `src/content/content.ts`.
- Put the font variables (`--font-geist-sans`, `--font-geist-mono`, `--font-display`) on `<body>`. The swarm engine reads the mono font from `body` for its canvas text. Instrument Serif needs `weight: "400"` in `next/font`, because it isn't a variable font.
- Mount `<BuildFlagScript />` in `<head>`. Mark `<html suppressHydrationWarning>`, because the script edits it before hydration.
- Wrap the page in `.bp-root`, with `<main>` and `<footer>` for content. Then add `<FxRoot />`, `<Parallax />` and `<SwarmRoot />` once each, after the content, inside `.bp-root`.
- Import `blueprint.css` and `swarm.css` in the page. The effects and video components import their own CSS.
- `blueprint.css` bridges its tokens into the `--swarm-*`, `--lv-*` and `--fx-*` variables, so one palette drives every layer.
- Strip the body font and background rules from `create-next-app`'s `globals.css`. They are harmless under `.bp-root`, but confusing.
- Cards opt into hologram tilt with `data-holo`.

## Ask the owner early

These choices change what you build, so ask before writing code. Offer options, and mark one as recommended:

- Which pages get the treatment: usually the homepage plus a links page. App routes stay plain.
- Which motion layers, and which effects inside each.
- Whether motion respects `prefers-reduced-motion`. The example owner chose to play it for everyone, because the animation is the point of the site. That is a legitimate call, but it is theirs to make. Each sibling skill shows where the switch lives.
- Exact name and copy, such as how a name with a native-language part is written. Never guess names.
- How each section builds: once when it scrolls into view (recommended), or everything on load.

## The gates that keep it smooth

Every motion layer obeys the same rules. They exist because each one replaces a hitch we actually shipped once:

- **Content never waits for JS.** Items are hidden only after a head script confirms the engine will run (`html[data-build="on"]`). With JS off, or `?build=off`, the page is complete.
- **Mobile LCP stays visible.** The hero name renders at first paint on phones (`data-build-keep="mobile"`), and the build effects play around it.
- **One timeline owner per element.** Effects touch an element only after the build engine marks it `[data-built]`; before that, transforms would corrupt the engine's measurements. Parallax moves decoration only, never items the engine measures.
- **Only transform and opacity animate.** Layout properties never do. One shared `requestAnimationFrame` loop sleeps when nothing is moving.
- **Off-screen work stops.** The shader pauses outside the viewport and in hidden tabs. Videos play only while visible.
- **Heavy assets load when the page is idle.** Video posters paint first. Clips then download one at a time in page order once the page is idle, and the warm-up is skipped on Save-Data or 2G.
- **Let animations finish instead of cutting them off.** The worst feedback we got was a hitch at the end of each section, caused by a deadline that force-completed everything at 5× speed. The fix was faster cursors and no deadline. If something is late, it finishes late but smoothly.
- **Budgets.** Fewer agents and half-resolution shaders on phones. The pixel budget drops on touch devices. Each video gets a size budget: about 1.5 MB for a hero loop and under 1 MB for a card loop.

## Orchestrating the work

A full living page runs to thousands of lines across independent pieces, so split it up. What worked, and why, is in `references/orchestration.md`. In short:

- Write one shared spec file before fanning out, such as the video `DESIGN.md`. Five agents can't agree on a palette any other way.
- Give each subagent a folder or file set it owns, and name the files it must not touch. Two writers on one file lose work.
- Never run `next build` from two agents at once, because they share `.next`. Builders type-check and lint; one agent builds at the end.
- Look at what agents produce: extract frames from their videos and screenshot their effects. Reports are claims, not proof.

## Originality

Inspiration is fine; cloning is not. Before building, list what each reference site does distinctively (its signature intro, its signature finale, its odd little badges) and keep that list as off-limits for this project. Check the reference's license with `gh repo view <repo> --json licenseInfo`. No license means no permission to reuse code or art. `references/originality.md` has the method and an example list.

## Shipping

- Work on a branch and open a PR whose description lists what changed, what was verified and what was not, such as Safari or real phones.
- Hand the owner a preview link. On Vercel with protection on, create a share link for the preview deployment.
- Merge only when the owner explicitly asks ("Merge PR #N"). Merging to main deploys production.
- After the merge, check the live site: it still prerenders, the assets serve with the right content type and cache headers, other routes still work, and the production logs are clean.

## Pitfalls we hit (so you don't)

- When the root layout turns static, routes that read search params break the build with a prerender error. Wrap `useSearchParams` users in `<Suspense>`, and give auth or dashboard route groups `export const dynamic = "force-dynamic"`.
- `next/og` images failed to build on Windows ("Invalid URL"). Set `export const runtime = "edge"`. Also add `/opengraph-image` to any auth middleware's public routes, or link previews redirect to the login page.
- Fonts imported with `@import url(...)` in global CSS block rendering. Use `next/font`, load only the faces you use, and set `preload: false` on rarely used ones.
- The engine's swap from a mono draft to the real font only reads well if the real font is clearly different. Pair a grotesk with a serif italic accent.
- Test browsers mislead you. The user's Chrome may report `prefers-reduced-motion` and throttle background tabs to 2 fps. An agent's Playwright MCP browser can be a visible, throttled window (about 2 frames per second was measured), and an embedded preview pane may have no `requestAnimationFrame` at all. For motion checks, launch headless Playwright yourself (`playwright-core` with `channel: "chrome"` needs no browser download), and measure the frame rate first.
- Vercel previews can arrive many minutes late. Check before concluding that the integration is broken.

## Files in this skill

- `references/blueprint-design-system.md`: tokens, grid, type scale, decor components, and how to make your own language.
- `references/static-first-nextjs.md`: Next.js App Router setup for a prerendered page with client-only motion.
- `references/verification.md`: Playwright scripts for motion, videos, effects and phones; what to check after deploy.
- `references/orchestration.md`: fan-out patterns, brief templates and file ownership.
- `references/originality.md`: the inspiration-versus-copying method.
- `assets/blueprint.css`, `assets/decor.tsx`, `assets/parallax.tsx`: the theme.
- `assets/content.example.ts`: the single content module.
- `assets/layout.example.tsx`, `assets/page.example.tsx`: the assembled page.
