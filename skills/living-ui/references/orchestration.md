# Orchestrating a living-page build

A full build has independent parts: the engine, each video, each effect, the integration work. Running them in parallel saves hours. Running them carelessly loses work and produces a page that looks like five people made it.

## A split that worked

For one pass that added 7 videos and 4 effects, five workers ran at once:

| Worker | Owns | Must not touch |
| --- | --- | --- |
| Effects agent | `_sections/fx/**`, the theme CSS, the section files it needs for markup hooks | the page, the hero, the projects section, the engine, `video/`, `public/videos/` |
| Showreel agent | `video/showreel/`, `public/videos/showreel.*` | everything else |
| Project-clips agent | `video/proj-*/`, `public/videos/proj-*` | everything else |
| Bands agent | `video/band-*/`, `public/videos/band-*` | everything else |
| Lead (you) | the page, the hero, the projects section, the video player component, config | the agents' folders while they run |

The lead writes the shared pieces before fanning out: the spec (`video/DESIGN.md`), the encoder (`video/encode.mjs`), shared fonts and `.gitignore` entries. Every agent then uses the same palette, sizes and output format.

## Writing a brief

A subagent starts with none of your context. Each brief needs:

1. **Why the work exists:** what the owner asked for, in their words if useful.
2. **Paths:** the repo path, the branch already checked out, "do not commit or switch branches".
3. **Ownership:** the exact folders and files it may write, and the ones it must not.
4. **What to read first:** the shared spec, the relevant skill files, the content source.
5. **Environment facts:** missing tools and how to get them (for example FFmpeg via `ffmpeg-static`), known errors and their workarounds (for example `ENAMETOOLONG` on long Windows paths).
6. **What not to do:** no previews that open windows, no sign-ins, no telemetry beacons, no `next build`.
7. **The brief itself:** the creative idea, sizes, length, loop rule and readability floor.
8. **Done means:** checks pass, frames reviewed, files written to the named paths, size budgets met.
9. **Report format:** short, covering files, sizes, what it shows, and anything left undone.

When a constraint shows up mid-run (for example "the page draws a badge over the top-left corner"), message the running agent right away, before it renders.

## Rules that save the run

- **One builder of `.next`.** Two concurrent `next build` or `next dev` runs in one checkout corrupt each other. Builders type-check (`tsc --noEmit`) and lint, and the lead builds once at the end.
- **No shared files between concurrent writers.** If two workers need the same file, one of them hands its change to the lead as instructions ("add `<HeroShader/>` as the first child of the hero section").
- **Review the output, not the report.** Extract video frames, tile the posters into one image, screenshot the effects. Check the claims that matter: loop seams, file sizes, real data.
- **Forks or fresh agents.** A fork inherits the whole conversation and suits work that leans on decisions made in it. A fresh agent is cheaper and suits self-contained work, provided the brief is complete.
- **Sequence the integration.** Mount components as they arrive, build once, run the headless checks, then open one PR.

## Shipping

- One PR per pass, with a description that lists what was built, how it was checked and what was not checked.
- Send the owner a preview link. The owner merges, or tells you to; never merge on your own initiative.
- After the merge, verify production and read the logs before calling it done.
