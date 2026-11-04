"use client";

import { useMemo, useRef, useState } from "react";
import { Table2, LineChart as ChartIcon } from "lucide-react";

import { cx, fmt } from "@/components/ui";
import { DeltaPill } from "./Dash";

const RANGES = [
  { key: 7, label: "7D", name: "7 days" },
  { key: 30, label: "30D", name: "30 days" },
  { key: 90, label: "90D", name: "90 days" },
];

const day = (s, opts = { day: "numeric", month: "short" }) => new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });

/**
 * Sign-ups over a chosen range: the period's total and its change on the
 * period before, beside a running-total line for this period (solid) and the
 * one before (dashed), so pace is compared day for day. Hover, touch or arrow
 * keys show each day; "table" gives the same figures without the chart.
 * `series` is 90 days of { day, n } oldest first. `children` renders under the chart.
 */
export default function SignupsCard({ series, title = "Sign-ups", children }) {
  const [range, setRange] = useState(30);
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const ref = useRef(null);

  const W = 560;
  const H = 210;
  const pad = { l: 36, r: 10, t: 14, b: 26 };

  const m = useMemo(() => {
    const cur = series.slice(-range);
    const prev = range * 2 <= series.length ? series.slice(-range * 2, -range) : null;
    const run = (rows) => { let s = 0; return rows.map((r) => (s += r.n)); };
    const a = run(cur);
    const b = prev ? run(prev) : null;
    const { top, step } = niceScale(Math.max(1, a.at(-1) ?? 0, b?.at(-1) ?? 0));
    const x = (i) => pad.l + (i / Math.max(1, cur.length - 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
    const line = (vals) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
    const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
    const xTicks = Array.from({ length: 5 }, (_, i) => Math.round((i / 4) * (cur.length - 1)));
    return {
      cur, prev, a, b, top, x, y, ticks, xTicks,
      pathA: line(a),
      areaA: `${line(a)}L${x(a.length - 1)} ${H - pad.b}L${x(0)} ${H - pad.b}Z`,
      pathB: b ? line(b) : null,
      total: a.at(-1) ?? 0,
      before: b ? b.at(-1) : null,
    };
  }, [series, range]);

  const r = RANGES.find((x) => x.key === range);

  function onMove(e) {
    const box = ref.current.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (m.cur.length - 1));
    setHover(Math.max(0, Math.min(m.cur.length - 1, i)));
  }
  function onKey(e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); setHover((h) => Math.max(0, (h ?? m.cur.length) - 1)); }
    if (e.key === "ArrowRight") { e.preventDefault(); setHover((h) => Math.min(m.cur.length - 1, (h ?? -1) + 1)); }
    if (e.key === "Escape") setHover(null);
  }
  const h = hover != null && hover < m.cur.length ? hover : null;

  return (
    <section className="card p-5" aria-labelledby="signups-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="signups-title" className="text-[15px] font-bold leading-6 tracking-tight">{title}</h2>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Range" className="flex rounded-xl border border-line bg-surface-alt p-0.5">
            {RANGES.map((x) => (
              <button
                key={x.key}
                type="button"
                aria-pressed={range === x.key}
                onClick={() => { setRange(x.key); setHover(null); }}
                className={cx("h-8 min-w-11 rounded-[10px] px-2.5 text-[12px] font-bold transition-colors", range === x.key ? "bg-white text-ink shadow-[0_1px_3px_rgb(16_24_20/0.12)]" : "text-ink-muted hover:text-ink")}
                aria-label={`Last ${x.name}`}
              >
                {x.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setTable((v) => !v)}
            className="grid size-9 place-items-center rounded-xl border border-line text-ink-muted hover:bg-surface-alt hover:text-ink"
            aria-label={table ? "Show as chart" : "Show as table"}
            title={table ? "Show as chart" : "Show as table"}
          >
            {table ? <ChartIcon aria-hidden className="size-4" /> : <Table2 aria-hidden className="size-4" />}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-5 md:grid-cols-[176px_minmax(0,1fr)] md:items-center">
        <div>
          <p className="text-[13px] font-medium text-ink-muted">Volunteers joined, last {r.name}</p>
          <p className="mt-1 text-[38px] font-bold leading-[44px] tracking-tight">{fmt(m.total)}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-muted">
            {m.before != null ? <><DeltaPill now={m.total} before={m.before} /> <span>vs. {fmt(m.before)} the {r.name} before</span></> : <span>Running total over the range</span>}
          </p>
          {m.prev && (
            <ul className="mt-4 hidden space-y-1.5 text-[12px] md:block">
              <li className="flex items-center gap-2"><span aria-hidden className="h-[3px] w-4 rounded-full bg-brand-600" /> This period</li>
              <li className="flex items-center gap-2"><span aria-hidden className="w-4 border-t-2 border-dashed border-[#9aa39f]" /> Previous period</li>
            </ul>
          )}
        </div>

        {table ? (
          <div className="max-h-56 overflow-y-auto rounded-xl border border-line">
            <table className="table-clean">
              <thead><tr><th>Date</th><th className="text-right">Joined</th><th className="text-right">Running total</th>{m.prev && <th className="text-right">Period before</th>}</tr></thead>
              <tbody>
                {m.cur.map((d, i) => ({ d, i })).reverse().map(({ d, i }) => (
                  <tr key={d.day}>
                    <td>{day(d.day)}</td>
                    <td className="num text-right">{fmt(d.n)}</td>
                    <td className="num text-right">{fmt(m.a[i])}</td>
                    {m.prev && <td className="num text-right text-ink-muted">{fmt(m.b[i])}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="relative min-w-0">
            <svg
              ref={ref}
              viewBox={`0 0 ${W} ${H}`}
              className="h-auto w-full touch-pan-y select-none outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-accent-500"
              role="img"
              aria-label={`Volunteers joined in the last ${r.name}: ${fmt(m.total)}${m.before != null ? `, against ${fmt(m.before)} in the ${r.name} before` : ""}. Use arrow keys for each day.`}
              tabIndex={0}
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setHover(null)}
              onKeyDown={onKey}
              onBlur={() => setHover(null)}
            >
              <defs>
                <linearGradient id="signups-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#12a650" stopOpacity="0.22" />
                  <stop offset="1" stopColor="#12a650" stopOpacity="0" />
                </linearGradient>
              </defs>
              {m.ticks.map((v) => (
                <g key={v}>
                  <line x1={pad.l} x2={W - pad.r} y1={m.y(v)} y2={m.y(v)} stroke="#edf0ef" strokeWidth="1" />
                  <text x={pad.l - 8} y={m.y(v) + 3.5} textAnchor="end" fontSize="10" fill="#7b8380">{compact(v)}</text>
                </g>
              ))}
              {m.xTicks.map((i, k) => (
                <text key={i} x={m.x(i)} y={H - 6} fontSize="10" fill="#7b8380" textAnchor={k === 0 ? "start" : k === 4 ? "end" : "middle"}>{day(m.cur[i].day)}</text>
              ))}
              <path d={m.areaA} fill="url(#signups-fill)" />
              {m.pathB && <path d={m.pathB} fill="none" stroke="#a3aba7" strokeWidth="1.75" strokeDasharray="4 4" strokeLinejoin="round" />}
              <path d={m.pathA} fill="none" stroke="#0b8a41" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {h == null && <circle cx={m.x(m.a.length - 1)} cy={m.y(m.total)} r="4" fill="#0a7338" stroke="#fff" strokeWidth="2" />}
              {h != null && (
                <g>
                  <line x1={m.x(h)} x2={m.x(h)} y1={pad.t} y2={H - pad.b} stroke="#9aa39f" strokeWidth="1" strokeDasharray="3 3" />
                  {m.b && <circle cx={m.x(h)} cy={m.y(m.b[h])} r="3.5" fill="#fff" stroke="#9aa39f" strokeWidth="2" />}
                  <circle cx={m.x(h)} cy={m.y(m.a[h])} r="5" fill="#0a7338" stroke="#fff" strokeWidth="2" />
                </g>
              )}
            </svg>
            {h != null && (
              <div
                className="pointer-events-none absolute top-0 z-10 w-max min-w-[150px] rounded-xl border border-line bg-white px-3 py-2.5 text-[12px] shadow-[0_12px_28px_-12px_rgb(16_24_20/0.3)]"
                style={{ left: `${(m.x(h) / W) * 100}%`, transform: `translateX(${m.x(h) / W > 0.6 ? "calc(-100% - 12px)" : "12px"})` }}
              >
                <p className="font-bold">{day(m.cur[h].day, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p>
                <p className="mt-1.5 flex items-center gap-2"><span aria-hidden className="h-[3px] w-3 rounded-full bg-brand-600" /><span className="font-bold num">{fmt(m.a[h])}</span> <span className="text-ink-muted">so far (+{fmt(m.cur[h].n)})</span></p>
                {m.b && <p className="mt-1 flex items-center gap-2"><span aria-hidden className="w-3 border-t-2 border-dashed border-[#9aa39f]" /><span className="font-bold num">{fmt(m.b[h])}</span> <span className="text-ink-muted">period before</span></p>}
              </div>
            )}
          </div>
        )}
      </div>

      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}

function niceScale(v) {
  const raw = v / 4;
  const p = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  const n = raw / p;
  const step = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p);
  return { step, top: Math.max(step * 2, Math.ceil(v / step) * step) };
}

function compact(n) {
  return n >= 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n));
}
