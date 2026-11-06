// Part of living-ui-skills (MIT). Adapt freely.
// Decorative blueprint layers. All aria-hidden, pointer-events none, and
// moved by <Parallax /> through data-parallax attributes. Needs Tailwind for
// the utility classes (or swap them for your own CSS).

type Pos = string; // Tailwind position classes, e.g. "left-0 top-10"

export function SectionNumeral({ value, speed = 0.35 }: { value: string; speed?: number }) {
  return (
    <span
      aria-hidden="true"
      data-parallax={speed}
      className="bp-numeral pointer-events-none absolute -top-16 right-0 select-none"
    >
      {value}
    </span>
  );
}

// Crosshair with a coordinate readout.
export function CrossMark({
  at,
  label,
  speed = 0.2,
  className = "",
}: {
  at: Pos;
  label: string;
  speed?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-parallax={speed}
      className={`bp-mark pointer-events-none absolute hidden items-center gap-2 md:flex ${at} ${className}`}
    >
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M7.5 0v15M0 7.5h15" stroke="currentColor" />
        <circle cx="7.5" cy="7.5" r="3" stroke="currentColor" />
      </svg>
      {label}
    </span>
  );
}

// Horizontal dimension line with end ticks and a centered measure.
export function DimLine({
  at,
  width,
  label,
  speed = 0.12,
}: {
  at: Pos;
  width: string;
  label: string;
  speed?: number;
}) {
  return (
    <span
      aria-hidden="true"
      data-parallax={speed}
      className={`bp-mark pointer-events-none absolute hidden md:block ${at}`}
      style={{ width }}
    >
      <span className="absolute inset-x-0 top-1/2 h-px bg-current opacity-60" />
      <span className="absolute left-0 top-0 h-full w-px bg-current" />
      <span className="absolute right-0 top-0 h-full w-px bg-current" />
      <span className="relative mx-auto block w-fit bg-[var(--bp-bg)] px-2">
        {label}
      </span>
    </span>
  );
}

// Corner bracket, like a frame selection fragment.
export function Bracket({
  at,
  speed = 0.28,
  flip = false,
}: {
  at: Pos;
  speed?: number;
  flip?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      data-parallax={speed}
      className={`bp-mark pointer-events-none absolute hidden md:block ${at}`}
      style={{ transform: flip ? "scaleX(-1)" : undefined }}
    >
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
        <path d="M1 33V1h32" stroke="currentColor" />
        <rect x="0" y="0" width="5" height="5" fill="currentColor" />
      </svg>
    </span>
  );
}

// Role colors, matching the agents' palette in the living-ui-swarm engine.
const ROLE_COLOR = {
  planner: "#a78bfa",
  coder: "#34d399",
  designer: "#f472b6",
  tester: "#60a5fa",
  reviewer: "#fbbf24",
  deployer: "#fb923c",
  layout: "#a3e635",
} as const;
type Role = keyof typeof ROLE_COLOR;

// Ring nodes clockwise from the top. The engine spawns each agent from a
// node of its role (data-swarm-spawn) and lights them up (data-lit).
const RING: Role[] = ["coder", "designer", "layout", "tester", "reviewer", "coder", "deployer", "layout"];

// Faint agent-mesh schematic behind the hero (≥1024 px).
export function HeroSchematic() {
  return (
    <div
      aria-hidden="true"
      data-parallax="0.55"
      className="pointer-events-none absolute -right-24 top-10 hidden h-[620px] w-[620px] opacity-[0.6] lg:block"
    >
      <svg viewBox="0 0 620 620" className="h-full w-full" fill="none">
        <g stroke="#1c2431">
          <circle cx="310" cy="310" r="300" />
          <circle cx="310" cy="310" r="220" strokeDasharray="2 6" />
          <circle cx="310" cy="310" r="140" />
          <path d="M310 0v620M0 310h620" strokeDasharray="4 8" />
        </g>
        {RING.map((role, i) => {
          const a = (i / RING.length) * Math.PI * 2 - Math.PI / 2;
          const x = 310 + Math.cos(a) * 220;
          const y = 310 + Math.sin(a) * 220;
          const c = ROLE_COLOR[role];
          return (
            <g key={i}>
              <path
                d={`M310 310 L${x.toFixed(1)} ${y.toFixed(1)}`}
                stroke={c}
                strokeOpacity="0.25"
                strokeDasharray={i % 2 ? "3 5" : undefined}
              />
              <g data-swarm-spawn={role} style={{ color: c }}>
                <circle className="swarm-node-halo" cx={x} cy={y} r="16" stroke={c} strokeOpacity="0.5" />
                <circle cx={x} cy={y} r="7" fill="#07090d" stroke={c} strokeOpacity="0.6" />
                <circle cx={x} cy={y} r="2" fill={c} fillOpacity="0.8" />
              </g>
              <text
                x={x}
                y={y + (y > 310 ? 30 : -22)}
                textAnchor="middle"
                fill="#3a4657"
                fontSize="9"
                fontFamily="ui-monospace, monospace"
              >
                {role}
              </text>
            </g>
          );
        })}
        <g data-swarm-spawn="planner" style={{ color: ROLE_COLOR.planner }}>
          <circle className="swarm-node-halo" cx="310" cy="310" r="52" stroke={ROLE_COLOR.planner} strokeOpacity="0.4" />
          <rect x="270" y="296" width="80" height="28" rx="6" fill="#07090d" stroke={ROLE_COLOR.planner} strokeOpacity="0.55" />
          <text x="310" y="314" textAnchor="middle" fill={ROLE_COLOR.planner} fillOpacity="0.8" fontSize="11" fontFamily="ui-monospace, monospace">
            planner
          </text>
        </g>
        <text x="20" y="606" fill="#5b6676" fontSize="10" fontFamily="ui-monospace, monospace">
          agent-mesh · 9 nodes · r=220
        </text>
      </svg>
    </div>
  );
}

// Two rows of huge outline words drifting in opposite directions.
export function WordBand() {
  // Replace with words from your own world.
  const rowA = "plan · build · review · ship · route · orchestrate · ";
  const rowB = "agents · tests · latency · cost · worktrees · merge · ";
  return (
    <div
      aria-hidden="true"
      data-parallax-scope
      className="pointer-events-none select-none overflow-hidden py-10"
    >
      <p data-parallax-x="-0.6" className="bp-band whitespace-nowrap">
        {rowA.repeat(3)}
      </p>
      <p data-parallax-x="0.6" className="bp-band bp-band-alt whitespace-nowrap">
        {rowB.repeat(3)}
      </p>
    </div>
  );
}
