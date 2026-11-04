import Link from "next/link";
import { ArrowRight, TrendingDown, TrendingUp, Minus } from "lucide-react";

import { cx, fmt } from "@/components/ui";

/**
 * Dashboard building blocks for the overview pages: a panel with a header,
 * figure cards, a change pill, a weekday column chart, a tick gauge and a
 * proportional breakdown strip. No hooks, so all of it renders on the server.
 */

/** A white card with a title row. `action` sits at the right of the title. */
export function Panel({ title, sub, action, className, bodyClassName, children, as: Tag = "section", id }) {
  return (
    <Tag className={cx("card flex flex-col", className)} aria-labelledby={id}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            {title && <h2 id={id} className="text-[15px] font-bold leading-6 tracking-tight">{title}</h2>}
            {sub && <p className="mt-0.5 text-[13px] leading-5 text-ink-muted">{sub}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cx("flex-1 px-5 pb-5", title ? "pt-4" : "pt-5", bodyClassName)}>{children}</div>
    </Tag>
  );
}

/** A small text link for a panel's header. */
export function PanelLink({ href, children }) {
  return (
    <Link href={href} className="group inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-brand-700 hover:bg-brand-50">
      {children}
      <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Change against the period before, as a pill. The arrow carries direction, so it never rests on colour alone. */
export function DeltaPill({ now, before, invert = false, className }) {
  if (!before) {
    if (!now) return null;
    return <span className={cx("inline-flex items-center rounded-md bg-success-bg px-1.5 py-0.5 text-[12px] font-bold text-success", className)}>New</span>;
  }
  const change = ((now - before) / before) * 100;
  const shown = Math.abs(change) >= 10 ? Math.round(change) : Math.round(change * 10) / 10;
  const good = invert ? change < 0 : change > 0;
  const Icon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-bold num",
        change === 0 ? "bg-surface-alt text-ink-muted" : good ? "bg-success-bg text-success" : "bg-danger-bg text-danger",
        className,
      )}
    >
      <Icon aria-hidden className="size-3" strokeWidth={2.75} />
      <span className="sr-only">{change > 0 ? "up" : change < 0 ? "down" : "unchanged"}</span>
      {Math.abs(shown)}%
    </span>
  );
}

const TONES = {
  brand: "bg-brand-50 text-brand-700",
  success: "bg-success-bg text-success",
  danger: "bg-danger-bg text-danger",
  accent: "bg-accent-50 text-accent-700",
  info: "bg-info-bg text-info",
  warning: "bg-warning-bg text-warning",
};

/** One headline figure: label and icon, the number with its change, and one line of context. */
export function StatCard({ label, icon: Icon, tone = "brand", value, delta, sub, meter, href, valueClassName }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[14px] font-semibold text-ink">{label}</p>
        {Icon && <span className={cx("grid size-9 shrink-0 place-items-center rounded-xl", TONES[tone])}><Icon aria-hidden className="size-[18px]" strokeWidth={2} /></span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <p className={cx("font-bold tracking-tight", valueClassName ?? "text-[30px] leading-9")}>{value}</p>
        {delta}
      </div>
      {meter && <Meter className="mt-3" {...meter} />}
      {sub && <p className="mt-auto pt-2 text-[12px] leading-[18px] text-ink-muted">{sub}</p>}
    </>
  );
  const cls = "card flex min-h-[148px] flex-col p-5 transition-[border-color,box-shadow]";
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** One ratio against its limit. */
export function Meter({ value, max, label, className, tone = "bg-brand-600", track = "bg-brand-100" }) {
  const share = max ? Math.min(1, value / max) : 0;
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={max || 0} aria-valuenow={value} aria-label={label} className={cx("h-1.5 overflow-hidden rounded-full", track, className)}>
      <div className={cx("h-full rounded-full", tone)} style={{ width: `${share > 0 ? Math.max(2, share * 100) : 0}%` }} />
    </div>
  );
}

/**
 * Columns for a short series (days of the week). Every column shows its
 * track; the tallest is filled in brand green and labelled, so the answer to
 * "which day?" is read before anything else. Values are listed for screen readers.
 */
export function ColumnChart({ items, height = 132, unit = "sign-ups" }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const top = items.reduce((b, i) => (i.value > b.value ? i : b), items[0]);
  const any = items.some((i) => i.value > 0);
  return (
    <div>
      <ul className="flex items-end justify-between gap-2 sm:gap-3" style={{ height: height + 52 }}>
        {items.map((i) => {
          const peak = any && i === top;
          const h = any ? Math.max(14, (i.value / max) * height) : 14;
          return (
            <li key={i.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2" aria-label={`${i.label}: ${fmt(i.value)} ${unit}`}>
              <span aria-hidden className={cx("text-[12px] font-bold num", peak ? "text-ink" : "invisible")}>{fmt(i.value)}</span>
              <span
                aria-hidden
                title={`${i.label}: ${fmt(i.value)}`}
                className={cx(
                  "w-full max-w-[38px] rounded-[10px] transition-colors",
                  peak ? "bg-gradient-to-b from-brand-400 to-brand-700 shadow-[0_8px_18px_-8px_rgb(10_115_56/0.7)]" : "bg-[#e9edeb] hover:bg-[#dbe1de]",
                )}
                style={{ height: h }}
              />
              <span aria-hidden className={cx("text-[12px]", peak ? "font-bold text-brand-700" : "font-medium text-ink-muted")}>{i.short}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A half-circle of ticks, filled up to the share. */
export function TickGauge({ value, max, label, caption }) {
  const share = max ? Math.min(1, value / max) : 0;
  const n = 44;
  const lit = Math.round(share * n);
  const cx0 = 120;
  const cy0 = 118;
  const pctText = max ? `${Math.round(share * 100)}%` : "0%";
  return (
    <div className="relative mx-auto w-full max-w-[260px]">
      <svg viewBox="0 0 240 128" className="w-full" role="img" aria-label={`${label}: ${pctText}`}>
        <defs>
          <linearGradient id="gauge-lit" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#62c589" />
            <stop offset="1" stopColor="#0a7338" />
          </linearGradient>
        </defs>
        {Array.from({ length: n }, (_, i) => {
          const a = Math.PI - (i / (n - 1)) * Math.PI;
          const r1 = 84;
          const r2 = i < lit ? 112 : 106;
          return (
            <line
              key={i}
              x1={cx0 + r1 * Math.cos(a)}
              y1={cy0 - r1 * Math.sin(a)}
              x2={cx0 + r2 * Math.cos(a)}
              y2={cy0 - r2 * Math.sin(a)}
              stroke={i < lit ? "url(#gauge-lit)" : "#e3e8e5"}
              strokeWidth="4.5"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="text-[34px] font-bold leading-10 tracking-tight">{pctText}</p>
        {caption && <p className="text-[12px] text-ink-muted">{caption}</p>}
      </div>
    </div>
  );
}

/**
 * One whole split into parts, each a column whose width follows its share,
 * with its figure, name and a coloured base line. Each part can link to its list.
 */
export function BreakdownStrip({ parts }) {
  const sum = parts.reduce((n, p) => n + p.value, 0);
  return (
    <ul className="grid grid-cols-2 gap-3 sm:flex sm:gap-2">
      {parts.map((p) => {
        const Icon = p.icon;
        const inner = (
          <>
            <span className="flex items-center gap-1.5">
              {Icon && <Icon aria-hidden className={cx("size-4 shrink-0", p.text)} strokeWidth={2.25} />}
              <span className="text-[17px] font-bold leading-6 num">{fmt(p.value)}</span>
            </span>
            <span className="mt-0.5 block truncate text-[12px] text-ink-muted">{p.label}{sum ? ` · ${Math.round((p.value / sum) * 100)}%` : ""}</span>
            <span aria-hidden className={cx("mt-3 block h-1.5 rounded-full", p.fill)} />
          </>
        );
        return (
          <li key={p.key} className="min-w-0 sm:min-w-[104px]" style={{ flexGrow: Math.max(p.value, sum * 0.06, 1), flexBasis: 0 }}>
            {p.href ? <Link href={p.href} className="block rounded-lg p-1 -m-1 hover:bg-surface-alt">{inner}</Link> : inner}
          </li>
        );
      })}
    </ul>
  );
}

/** A row in a "needs your attention" list. */
export function TodoRow({ href, text, count, warn }) {
  return (
    <li>
      <Link href={href} className="group -mx-2 flex min-h-12 items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-alt">
        <span className={cx("grid h-8 min-w-10 shrink-0 place-items-center rounded-lg px-2 text-[13px] font-bold num", warn ? "bg-warning-bg text-warning" : "bg-brand-50 text-brand-800")}>{count}</span>
        <span className={cx("min-w-0 flex-1 text-[14px] leading-5", warn && "font-semibold")}>{text}</span>
        <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}
