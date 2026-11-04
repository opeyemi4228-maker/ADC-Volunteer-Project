import Link from "next/link";
import { ArrowRight, TrendingDown, TrendingUp, Minus } from "lucide-react";

import { cx, fmt } from "@/components/ui";

/**
 * Dashboard figures. A KPI tile is the number first, then what changed and
 * a small trend; a meter is one ratio against its limit; the segmented bar
 * splits one whole into a few parts. No hooks, so all of it renders on the
 * server. Large figures use proportional digits; only aligned columns use
 * tabular ones.
 */

/** Change against the period before, with an arrow so direction never rests on colour alone. */
export function Delta({ now, before, period, invert = false }) {
  if (!before && !now) return <span className="text-ink-muted">None in the last {parseInt(period, 10) * 2} days</span>;
  if (!before) return <span className="text-ink-muted">New · none in the {period} before</span>;
  const change = Math.round(((now - before) / before) * 100);
  const good = invert ? change < 0 : change > 0;
  const Icon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      <span className={cx("inline-flex items-center gap-0.5 font-semibold", change === 0 ? "text-ink-muted" : good ? "text-success" : "text-danger")}>
        <Icon aria-hidden className="size-3.5" strokeWidth={2.5} />
        {change > 0 ? "+" : ""}{change}%
      </span>
      <span className="text-ink-muted">vs previous {period}</span>
    </span>
  );
}

/** A tiny single-series trend. Decorative: the same figures are in the main chart and its table. */
export function Sparkline({ values, label }) {
  if (!values?.length || values.every((v) => !v)) return null;
  const W = 120;
  const H = 32;
  const max = Math.max(1, ...values);
  const x = (i) => (i / Math.max(1, values.length - 1)) * (W - 4) + 2;
  const y = (v) => H - 3 - (v / max) * (H - 6);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const last = values.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-full max-w-[140px] overflow-visible" role="img" aria-label={label}>
      <path d={`${d}L${x(last)} ${H}L${x(0)} ${H}Z`} className="fill-brand-50" />
      <path d={d} fill="none" className="stroke-brand-600" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(last)} cy={y(values[last])} r="3" className="fill-brand-700 stroke-white" strokeWidth="2" />
    </svg>
  );
}

/** One ratio against a limit: track and fill from the same hue. */
export function Meter({ value, max, label, className }) {
  const share = max ? Math.min(1, value / max) : 0;
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max || 0}
      aria-valuenow={value}
      aria-label={label}
      className={cx("h-1.5 overflow-hidden rounded-full bg-brand-100", className)}
    >
      <div className="h-full rounded-full bg-brand-600" style={{ width: `${share > 0 ? Math.max(1.5, share * 100) : 0}%` }} />
    </div>
  );
}

export function KpiTile({ label, value, sub, delta, spark, sparkLabel, meter, hero = false, tone, href }) {
  const body = (
    <>
      <p className="text-[14px] font-medium text-ink-muted">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className={cx("font-bold tracking-tight", hero ? "text-[44px] leading-[48px]" : "text-[30px] leading-9", tone === "warn" && "text-warning")}>{value}</p>
        {spark && <div className="mb-1 w-[46%] min-w-0"><Sparkline values={spark} label={sparkLabel ?? label} /></div>}
      </div>
      {meter && <Meter className="mt-2" {...meter} />}
      {delta && <p className="mt-2 text-[13px]">{delta}</p>}
      {sub && <p className="mt-1 text-[13px] text-ink-muted">{sub}</p>}
    </>
  );
  const cls = "card flex flex-col p-4 sm:p-5";
  return href ? (
    <Link href={href} className={cx(cls, "group transition-colors hover:border-ink-muted")}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * One whole split into a few parts, read at a glance (at most 6). Each block
 * is separated by a 2px gap, carries its share when it fits, and the legend
 * below names every part with its count, so nothing is read from colour alone.
 */
export function SegmentedBar({ parts, total, label }) {
  const sum = total ?? parts.reduce((n, p) => n + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div>
      <div className="flex h-9 gap-[2px] overflow-hidden rounded-md" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${fmt(p.value)}`).join(", ")}`}>
        {sum === 0 ? <div className="flex-1 rounded-md bg-surface-alt" /> : shown.map((p) => {
          const share = p.value / sum;
          return (
            <div key={p.key} className={cx("grid min-w-[3px] place-items-center text-[12px] font-semibold text-white first:rounded-l-md last:rounded-r-md", p.fill)} style={{ flexGrow: p.value, flexBasis: 0 }} title={`${p.label}: ${fmt(p.value)}`}>
              {share >= 0.09 && `${Math.round(share * 100)}%`}
            </div>
          );
        })}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[14px] sm:grid-cols-4">
        {parts.map((p) => {
          const Icon = p.icon;
          const inner = (
            <>
              <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]", p.text)}>
                {Icon && <Icon aria-hidden className="size-3.5" strokeWidth={2.5} />}
                <span className="font-medium text-ink">{p.label}</span>
              </span>
              <span className="block font-bold num">{fmt(p.value)}</span>
            </>
          );
          return <li key={p.key}>{p.href ? <Link href={p.href} className="block rounded hover:bg-surface-alt">{inner}</Link> : inner}</li>;
        })}
      </ul>
    </div>
  );
}

/** A row in a "needs your attention" list. */
export function ActionRow({ href, text, count, warn }) {
  return (
    <li>
      <Link href={href} className="group flex min-h-12 items-center gap-3 py-2">
        <span className={cx("grid min-w-9 place-items-center rounded-md px-1.5 py-0.5 text-[14px] font-bold num", warn ? "bg-warning-bg text-warning" : "bg-surface-alt")}>{count}</span>
        <span className={cx("flex-1 text-[15px] leading-5", warn && "font-semibold")}>{text}</span>
        <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}
