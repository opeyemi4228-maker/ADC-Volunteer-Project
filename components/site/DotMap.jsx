import { dotMap } from "@/lib/dotmap";

/**
 * Nigeria in dots, lit by live data: each state's dots take a green from dim
 * to bright by verified volunteers (square-root scale, so smaller states still
 * register), and orange rings pulse over the states with the most sign-ups
 * this week. Dots are zero-length round-capped strokes, one <path> per state,
 * so ~2,700 dots cost 37 elements.
 */
const DIM = "rgb(255 255 255 / 0.13)";
const LOW = [47, 177, 99]; // brand-400
const HIGH = [205, 238, 217]; // brand-100

function ramp(t) {
  const c = LOW.map((a, i) => Math.round(a + (HIGH[i] - a) * t));
  return `rgb(${c.join(" ")})`;
}

export default function DotMap({ byState = {}, recentByState = {}, label, className = "" }) {
  const map = dotMap();
  const max = Math.max(1, ...Object.values(byState));
  const hot = Object.entries(recentByState)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code]) => map.states.find((s) => s.code === code))
    .filter(Boolean);

  const paths = map.states.map((s, i) => ({
    ...s,
    d: map.dots.filter((d) => d[2] === i).map(([x, y]) => `M${x} ${y}h0`).join(""),
    color: byState[s.code] ? ramp(Math.sqrt(byState[s.code] / max)) : DIM,
  }));

  return (
    <svg viewBox={`0 0 ${map.width} ${map.height}`} className={className} role="img" aria-label={label}>
      {paths.map((s) => (
        <path
          key={s.code}
          d={s.d}
          stroke={s.color}
          strokeWidth={map.r * 2}
          strokeLinecap="round"
          fill="none"
          className="map-state"
          style={{ animationDelay: `${((s.cy / map.height) * 0.9).toFixed(2)}s` }}
        />
      ))}
      {hot.map((s, i) => (
        <g key={s.code}>
          <circle cx={s.cx} cy={s.cy} r="16" fill="none" stroke="var(--color-accent-500)" strokeWidth="3" className="map-pulse" style={{ animationDelay: `${1 + i * 0.55}s` }} />
          <circle cx={s.cx} cy={s.cy} r="7" fill="var(--color-accent-500)" />
        </g>
      ))}
    </svg>
  );
}
