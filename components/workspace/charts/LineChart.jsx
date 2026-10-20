"use client";

import { useMemo, useRef, useState } from "react";

import { fmt } from "@/components/ui";

/**
 * Single-series line (cumulative registrations). One series, so the title
 * names it and there is no legend; a crosshair + tooltip follows the pointer
 * or keyboard, and "Show as table" gives the same figures without the chart.
 */
export default function LineChart({ data, height = 220, label = "Volunteers registered", t = (s) => s }) {
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const ref = useRef(null);
  const W = 720;
  const H = height;
  const pad = { l: 44, r: 12, t: 12, b: 26 };

  const { points, yTicks, max } = useMemo(() => {
    const maxV = Math.max(1, ...data.map((d) => d.total));
    const step = niceStep(maxV / 4);
    const top = Math.ceil(maxV / step) * step;
    const x = (i) => pad.l + (i / Math.max(1, data.length - 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
    return {
      points: data.map((d, i) => ({ ...d, x: x(i), y: y(d.total) })),
      yTicks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => ({ v: i * step, y: y(i * step) })),
      max: top,
    };
  }, [data, H]);

  if (!data.length) return null;
  const path = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("");
  const area = `${path}L${points.at(-1).x} ${H - pad.b}L${points[0].x} ${H - pad.b}Z`;
  const months = points.filter((p, i) => i === 0 || p.day.slice(8) === "01");

  function onMove(e) {
    const box = ref.current.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i += 1) if (Math.abs(points[i].x - px) < Math.abs(points[best].x - px)) best = i;
    setHover(best);
  }
  function onKey(e) {
    if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? points.length) - 1));
    if (e.key === "ArrowRight") setHover((h) => Math.min(points.length - 1, (h ?? -1) + 1));
    if (e.key === "Escape") setHover(null);
  }
  const h = hover != null ? points[hover] : null;
  const last = points.at(-1);

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button type="button" className="text-[13px] font-semibold text-brand-700 underline underline-offset-2" onClick={() => setTable((v) => !v)}>
          {table ? t("Show as chart") : t("Show as table")}
        </button>
      </div>
      {table ? (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-line">
          <table className="table-clean">
            <thead><tr><th>{t("Date")}</th><th className="text-right">{t("New")}</th><th className="text-right">{t("Total")}</th></tr></thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.day}><td>{d.day}</td><td className="num text-right">{fmt(d.n)}</td><td className="num text-right">{fmt(d.total)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg
            ref={ref}
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full touch-none select-none"
            role="img"
            aria-label={`${t(label)}: ${fmt(last.total)} (${last.day})`}
            tabIndex={0}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKey}
          >
            {yTicks.map((tk) => (
              <g key={tk.v}>
                <line x1={pad.l} x2={W - pad.r} y1={tk.y} y2={tk.y} stroke="#e7ebe9" strokeWidth="1" />
                <text x={pad.l - 8} y={tk.y + 4} textAnchor="end" fontSize="11" fill="#5b6168">{compact(tk.v)}</text>
              </g>
            ))}
            {months.map((p) => (
              <text key={p.day} x={p.x} y={H - 6} fontSize="11" fill="#5b6168" textAnchor={p === points[0] ? "start" : "middle"}>
                {new Date(`${p.day}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}
              </text>
            ))}
            <path d={area} fill="#12a650" fillOpacity="0.1" />
            <path d={path} fill="none" stroke="#0a7338" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={last.x} cy={last.y} r="4" fill="#0a7338" stroke="#fff" strokeWidth="2" />
            {h && (
              <g>
                <line x1={h.x} x2={h.x} y1={pad.t} y2={H - pad.b} stroke="#5b6168" strokeWidth="1" strokeDasharray="3 3" />
                <circle cx={h.x} cy={h.y} r="5" fill="#0a7338" stroke="#fff" strokeWidth="2" />
              </g>
            )}
          </svg>
          {h && (
            <div
              className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-white px-3 py-2 text-[13px] shadow-lg"
              style={{ left: `${Math.min(78, Math.max(0, (h.x / W) * 100 - 10))}%` }}
            >
              <p className="font-semibold">{new Date(`${h.day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</p>
              <p className="num text-ink">{fmt(h.total)} {t("total")}</p>
              <p className="num text-ink-muted">+{fmt(h.n)} {t("that day")}</p>
            </div>
          )}
          <span className="sr-only">{t("Maximum on the axis")}: {fmt(max)}</span>
        </div>
      )}
    </div>
  );
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function compact(n) {
  return n >= 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}
