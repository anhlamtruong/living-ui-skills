# Inspiration without copying

Living pages are usually inspired by something someone saw: a demo on social media, a site from an award gallery. That's healthy. Shipping a recreation of it is not, both legally and because the owner wanted their own site, not someone else's.

## The method

1. **Collect the references.** Note their URLs and any source repos.
2. **Check licenses** for any repo you might learn from:

   ```bash
   gh repo view owner/name --json licenseInfo --jq .licenseInfo
   ```

   A missing license means all rights are reserved: you may look, but you may not reuse code, art, audio or copy.
3. **Name the signature moves.** For each reference, list what makes it recognizable: its intro, its finale, its signature widget, its sound, its copy jokes, its names. These go on a banned list for this project.
4. **Build the general technique your own way.** "Cursors that build a page" is an idea anyone may use. A specific site's orbiting intro, or its particular badge, is that site's expression.
5. **Re-check before shipping.** Read the banned list against what you built, and change anything that drifted toward a reference.

## Example banned list

This list is from the example project. Its references were two unlicensed swarm-cursor demos. The point is the kind of things that land on such a list:

- an intro where cursors orbit the center before starting work;
- a crowd of cursors that grows with scroll speed;
- a finale where the agents flock or gather into a shape;
- headings whose font size ticks up while they are typed;
- a width×height badge riding next to a cursor;
- any "built by N agents" credit line;
- sound effects;
- agents named after famous computing pioneers;
- elements placed offset and then snapped onto a guide.

The project's own ideas replaced these: a planner that boots a mesh of spawn nodes, a live build log, an inspect mode, a deploy finale that pulses the contact button, layout agents that draw grids and boxes, and idle cursors that loop in place.

## Open source you may use

- **GSAP 3.13+:** free for commercial use, including all plugins (ScrollTrigger, SplitText, ScrambleText). It uses its own license, not MIT. Depend on it via npm; don't vendor it.
- **Lenis:** MIT.
- **HyperFrames (HeyGen):** Apache-2.0. Install its skills; don't copy them. You may adapt registry block techniques with credit.
- **Fonts:** Geist and Instrument Serif are both under the SIL Open Font License (OFL). You may ship them with your site; keep the license if you redistribute the files themselves.
