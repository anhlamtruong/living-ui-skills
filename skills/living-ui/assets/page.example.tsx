// Part of living-ui-skills (MIT). Adapt freely.
// app/page.tsx: the whole living page put together. A static server
// component; every motion layer is a client component that only decorates
// HTML already rendered here. Paths assume the skills' assets were copied to
// src/components/{living-ui,swarm,fx,video} and content.example.ts to
// src/content/content.ts.

import "@/components/living-ui/blueprint.css"; // living-ui theme (also bridges --swarm-*, --lv-*, --fx-*)
import "@/components/swarm/swarm.css"; // living-ui-swarm
import { SwarmRoot } from "@/components/swarm/swarm-root";
import { FxRoot } from "@/components/fx/fx-root"; // living-ui-effects (imports fx.css itself)
import { HeroShader } from "@/components/fx/hero-shader";
import { GlitchHeading } from "@/components/fx/glitch-copies";
import { ScrambleText } from "@/components/fx/scramble-text";
import { LoopVideo } from "@/components/video/loop-video"; // living-ui-video (imports video.css itself)
import { Parallax } from "@/components/living-ui/parallax";
import { HeroSchematic, SectionNumeral } from "@/components/living-ui/decor";
import { metrics, profile, projects } from "@/content/content";

export const revalidate = 86400; // static, refreshed daily if any data is cached

export default function HomePage() {
  return (
    // .bp-root: theme scope, fixed grid (::before), z-index layering.
    <div className="bp-root">
      <main id="main">
        {/* Hero: builds on load; the name stays visible at first paint on phones. */}
        <section id="top" data-build-section="hero" data-build-start="load" className="relative pb-20 pt-32">
          <HeroShader />
          <HeroSchematic />
          <div className="bp-container">
            <h1
              data-build-item
              data-build="type"
              data-build-font
              data-build-keep="mobile"
              data-build-order="-1"
              className="bp-h1"
            >
              {profile.name}
            </h1>
            <p data-build-item data-build="reveal" className="bp-muted mt-6 max-w-xl">
              {profile.summary}
            </p>
            <dl data-build-grid className="mt-12 grid grid-cols-2 gap-3">
              {metrics.map((m) => (
                <div key={m.label} data-build-item data-build="frame" data-holo className="bp-card p-5">
                  <dd data-build-item data-build="type" data-build-scale className="bp-h2">{m.value}</dd>
                  <dt className="bp-muted text-sm">{m.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Projects: header and each card build when they scroll in. */}
        <section id="projects" className="bp-section">
          <div className="bp-container">
            <SectionNumeral value="01" />
            <div data-build-section="projects-header">
              <GlitchHeading
                as="h2"
                className="bp-h2"
                headingProps={{ "data-build-item": "", "data-build": "type", "data-build-font": "" }}
              >
                Selected <em className="bp-serif">builds</em>
              </GlitchHeading>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-2">
              {projects.map((p, i) => (
                <div key={p.title} data-build-section={`project-${i + 1}`} className="flex">
                  <article data-build-item data-build="frame" data-holo className="bp-card flex w-full flex-col overflow-hidden">
                    {p.video ? (
                      <div data-build-item data-build="image" data-build-label={`${p.video}.mp4`} className="aspect-[16/10]">
                        <LoopVideo name={p.video} label={`${p.title}: animated preview`} width={1280} height={800} toggle className="h-full w-full" />
                      </div>
                    ) : null}
                    <div className="p-6">
                      <h3 data-build-item data-build="type" className="bp-h3">{p.title}</h3>
                      <p data-build-item data-build="reveal" className="bp-muted mt-3">{p.description}</p>
                      {p.links.map((l) => (
                        <a key={l.href} href={l.href} className="bp-link mt-4 inline-flex">
                          <ScrambleText>{l.label}</ScrambleText>
                        </a>
                      ))}
                    </div>
                  </article>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Motion layers: once per page, inside .bp-root, after the content. */}
      <FxRoot />
      <Parallax />
      <SwarmRoot />
    </div>
  );
}
