# Brief for one clip-rendering subagent

When a site needs several clips, give each group of clips (the hero showreel, the project cards, the bands) to its own subagent. The agents run in parallel and render in parallel. This brief is what made that work in the worked example; fill in the `<...>` and paste it as the agent's prompt.

What makes it work:

- **One shared spec** (`video/DESIGN.md`), so three agents produce one visual set.
- **Hard file ownership.** Each agent writes only its own `video/<name>/` folders and `public/videos/<name>.*` files. Agents editing the same files in parallel overwrite each other.
- **No questions.** The agent decides and renders; review happens on the site preview. A subagent that stops to ask blocks the whole fan-out.
- **The environment traps up front:** FFmpeg on PATH, the short render path, the pinned CLI. Each one cost an agent time the first time.
- **A short report** you can act on without reading its transcript.

After the agents report, tile all posters into one image and look at them together:

```bash
ffmpeg -i a.webp -i b.webp -i c.webp -i d.webp -filter_complex "[0]scale=800:-2[a];[1]scale=800:-2[b];[2]scale=800:-2[c];[3]scale=800:-2[d];[a][b]hstack[t];[c][d]hstack[u];[t][u]vstack" posters.png
```

---

You are making <N> short looping motion-graphics video(s) with HyperFrames (HTML rendered to MP4) for <site>. The owner approved rendering directly. There is no one to ask, so make good decisions yourself; review happens later on the site preview.

## Context
- <One paragraph: whose site, what it's about, its visual style, and why we're adding video (e.g. the page feels static after its intro animation).>
- Where your clip(s) play: <slot, approximate on-screen width, what sits next to or on top of them>. <What NOT to repeat, e.g. "the card already shows the title, so show the project working instead".>
- Repo: `<absolute path>`. Don't commit or switch branches. Only create or edit files in `<video/name-a/, video/name-b/>` and your outputs `<public/videos/name-a.*>`. Other agents are working in other `video/*` folders and in `src/` at the same time.
- **Read first; it's binding:** `video/DESIGN.md`. Then the HyperFrames skill files: `<path>/hyperframes/SKILL.md` and its `references/format.md`, `motion.md`, `runtimes.md`, `film.md`, plus `hyperframes-cli/SKILL.md` and `hyperframes-registry/SKILL.md`. Search the registry for useful blocks before hand-building, and adapt them to our look.
- Facts: read `<content file>`. Use only real facts from there. Never invent numbers, users or claims; illustrative UI values must look illustrative.
- FFmpeg: before rendering or encoding, run `export PATH="<dir of ffmpeg>:<dir of ffprobe>:$PATH"`. `npx -y hyperframes@<version> doctor` should then show FFmpeg ✓.
- Setup per clip: `cd video && npx -y hyperframes@<version> init <name> --skip-skills --skill=hyperframes`. Delete the generated `AGENTS.md` and `CLAUDE.md`, and copy `<video/shared/fonts/*>` into `<name>/assets/fonts/`. Always call the CLI pinned.
- Don't run `preview`, `open`, `publish`, `cloud`, `usage`, `billing` or sign in to anything. No audio. Look at frames with `snapshot` (open the PNGs) and keep snapshots inside the project.

## The brief(s)
<For each clip: name, canvas (e.g. 1280×800), length, 30 fps, seamless loop. Then what it shows, in 3–6 bullets: the idea, the main motion, what loops, where the key content sits. Then:>
- Frame 0 must already look complete (it's the poster). The state at the end must equal frame 0.
- Readability: it plays at ~<scale>× so labels ≥ <22> px and key numbers ≥ <64> px.
- Keep <these areas> free: the page draws <badge/index> there.

## Finish (per clip)
1. `npx -y hyperframes@<version> check --json` clean (fix errors, weigh warnings).
2. Snapshot several frames, look critically and iterate until it's polished and on-brand.
3. Render to a SHORT path (long Windows paths fail with ENAMETOOLONG): `npx -y hyperframes@<version> render -q delivery -w 6 -o <short-dir>/<name>.mp4`, then copy it to `video/<name>/renders/`.
4. `node <path-to>/loop-seam.mjs <short-dir>/<name>.mp4` must say seamless.
5. `node <path-to>/encode.mjs <short-dir>/<name>.mp4 <name> --out <public/videos>`. Stay within the budget in DESIGN.md (raise `--crf` / `--webm-crf` if over; if it warns that the WebM is bigger than the MP4, raise `--webm-crf`).
6. Report back briefly:
   - the files you created;
   - final sizes;
   - 2–3 lines per clip on what it shows and what frame 0 looks like;
   - the loop-seam result;
   - anything you couldn't do or decided differently from the brief.

   Don't paste whole files.
