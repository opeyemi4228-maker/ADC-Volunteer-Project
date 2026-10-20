"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { fmt } from "@/components/ui";

/**
 * Choropleth of states (national / zone) or LGAs (state), drawn from the
 * outlines in /geo/map. The shapes are fetched by the browser (and cached)
 * rather than embedded, so the dashboard HTML stays small.
 *
 * Sequential single-hue ramp, light -> dark = low -> high; "none" is a
 * separate neutral so an empty area never reads as "a little". Every area has
 * a text tooltip, keyboard focus, and the table beside it carries the numbers.
 */

const RAMP = ["#dcf1e3", "#a6dbb9", "#5fbf86", "#239a55", "#0a6a33"];
const NONE = "#eceeed";

const cache = new Map();
function loadShapes(file) {
  if (!cache.has(file)) cache.set(file, fetch(`/geo/map/${file}`).then((r) => r.json()).catch(() => null));
  return cache.get(file);
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");

export default function CoverageMap({ level, stateCode, values, metricLabel, format = "number", valueKey = "value", hrefBase, t = (s) => s }) {
  const router = useRouter();
  const [shapes, setShapes] = useState(null);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    let live = true;
    loadShapes(level === "state" ? "states.json" : `${stateCode}.json`).then((d) => live && setShapes(d));
    return () => { live = false; };
  }, [level, stateCode]);

  const byKey = useMemo(() => {
    const m = new Map();
    for (const v of values) {
      m.set(v.code, v);
      m.set(norm(v.name), v);
    }
    return m;
  }, [values]);

  const bins = useMemo(() => {
    const vals = values.map((v) => v[valueKey]).filter((x) => x > 0).sort((a, b) => a - b);
    if (!vals.length) return [];
    const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
    const edges = [q(0.2), q(0.4), q(0.6), q(0.8)];
    return [...new Set(edges)];
  }, [values, valueKey]);

  const colour = (v) => {
    if (!v || !v[valueKey]) return NONE;
    const i = bins.findIndex((e) => v[valueKey] <= e);
    return RAMP[i === -1 ? RAMP.length - 1 : Math.round((i / Math.max(1, bins.length)) * (RAMP.length - 1))];
  };
  const show = (x) => (format === "percent" ? `${Math.round(x * 100)}%` : fmt(x));

  const units = useMemo(() => {
    if (!shapes) return [];
    const list = level === "state" ? shapes.states : shapes.lgas;
    return list
      .map((s) => ({ ...s, data: byKey.get(s.code) ?? byKey.get(norm(s.name)) }))
      .filter((s) => level !== "state" || s.data);
  }, [shapes, byKey, level]);

  const viewBox = useMemo(() => {
    if (!units.length) return "0 0 1000 812";
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const u of units) {
      for (const m of u.d.matchAll(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g)) {
        const x = +m[1], y = +m[2];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    const pad = Math.max(x1 - x0, y1 - y0) * 0.03;
    return `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`;
  }, [units]);

  if (!shapes) {
    return <div className="grid aspect-[5/4] place-items-center rounded-xl bg-surface-alt text-[14px] text-ink-muted">{t("Loading map…")}</div>;
  }

  const h = hover ? units.find((u) => u.name === hover) : null;
  const stroke = level === "state" ? 1.2 : 0.35;

  return (
    <div>
      <div className="relative">
        <svg viewBox={viewBox} className="h-auto max-h-[440px] w-full" role="group" aria-label={`${t(metricLabel)} ${t("map")}`}>
          {units.map((u) => {
            const href = u.data && hrefBase ? `${hrefBase}${u.data.code}` : null;
            return (
              <path
                key={u.name}
                d={u.d}
                fill={colour(u.data)}
                stroke="#fff"
                strokeWidth={hover === u.name ? stroke * 3 : stroke}
                vectorEffect="non-scaling-stroke"
                className={href ? "cursor-pointer outline-none" : "outline-none"}
                tabIndex={0}
                role={href ? "link" : "img"}
                aria-label={`${u.name}: ${u.data ? show(u.data[valueKey]) : t("no data")}`}
                onPointerEnter={() => setHover(u.name)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(u.name)}
                onBlur={() => setHover(null)}
                onClick={() => href && router.push(href)}
                onKeyDown={(e) => e.key === "Enter" && href && router.push(href)}
              />
            );
          })}
        </svg>
        {h && (
          <div className="pointer-events-none absolute left-2 top-2 rounded-lg border border-line bg-white/95 px-3 py-2 text-[13px] shadow-lg">
            <p className="font-semibold">{h.name}</p>
            {h.data ? (
              <>
                <p className="num">{t(metricLabel)}: <strong>{show(h.data[valueKey])}</strong></p>
                <p className="num text-ink-muted">{fmt(h.data.volunteers)} {t("volunteers")} · {fmt(h.data.groups)} {t("groups")}</p>
                <p className="num text-ink-muted">{fmt(h.data.pus)} / {fmt(h.data.totalPus)} {t("polling units")}</p>
              </>
            ) : (
              <p className="text-ink-muted">{t("No volunteers yet")}</p>
            )}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-ink-muted" aria-label={t("Legend")}>
        <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm border border-line" style={{ background: NONE }} /> {t("None")}</span>
        <span className="flex items-center gap-1">
          {t("Low")}
          {RAMP.map((c) => <span key={c} className="inline-block h-3 w-5 first:rounded-l-sm last:rounded-r-sm" style={{ background: c }} />)}
          {t("High")}
        </span>
        {bins.length > 0 && <span className="num">({show(bins[0])} … {show(bins.at(-1))}+)</span>}
      </div>
    </div>
  );
}
