import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronRight as Sep } from "lucide-react";

import { cx } from "@/components/ui";

/** Server-safe workspace building blocks: headers, tabs, filters, paging. */

export function PageHeader({ title, description, actions, crumbs, eyebrow }) {
  return (
    <div className="mb-6">
      {crumbs?.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-[13px] text-ink-muted">
            {crumbs.map((c, i) => (
              <li key={c.href ?? c.label} className="flex items-center gap-1">
                {i > 0 && <Sep aria-hidden className="size-3.5" />}
                {c.href && i < crumbs.length - 1 ? (
                  <Link href={c.href} className="font-semibold text-brand-700 hover:underline">{c.label}</Link>
                ) : (
                  <span aria-current={i === crumbs.length - 1 ? "page" : undefined}>{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="text-[13px] font-bold uppercase tracking-wider text-brand-700">{eyebrow}</p>}
          <h1 className="h-page">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-[15px] text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, current }) {
  return (
    <div className="mb-5 overflow-x-auto border-b border-line">
      <nav className="flex min-w-max gap-1" aria-label="Sections">
        {tabs.map((tab) => {
          const active = tab.key === current;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "-mb-px flex min-h-11 items-center gap-2 border-b-[3px] px-3 text-[15px] font-semibold",
                active ? "border-brand-700 text-brand-800" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {tab.label}
              {tab.count != null && (
                <span className={cx("rounded-full px-2 text-[12px] num", active ? "bg-brand-50 text-brand-800" : "bg-surface-alt")}>{tab.count}</span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Plain GET form, so filters work without JavaScript and survive a refresh. */
export function FilterBar({ children, action, reset }) {
  return (
    <form action={action} method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-3 sm:p-4">
      {children}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm">Apply</button>
        {reset && <Link href={reset} className="btn btn-ghost btn-sm">Clear</Link>}
      </div>
    </form>
  );
}

export function FilterSelect({ name, label, value, options, all = "All" }) {
  return (
    <label className="flex min-w-36 flex-col gap-1">
      <span className="text-[13px] font-semibold text-ink-muted">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="input !min-h-10 !py-1.5 text-[15px]">
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export function FilterSearch({ name = "q", label = "Search", value, placeholder }) {
  return (
    <label className="flex min-w-48 flex-1 flex-col gap-1">
      <span className="text-[13px] font-semibold text-ink-muted">{label}</span>
      <input type="search" name={name} defaultValue={value ?? ""} placeholder={placeholder} className="input !min-h-10 !py-1.5" />
    </label>
  );
}

export function Pagination({ page, pages, total, hrefFor }) {
  if (pages <= 1) return <p className="mt-3 text-[13px] text-ink-muted num">{total} {total === 1 ? "record" : "records"}</p>;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[14px]">
      <p className="text-ink-muted num">Page {page} of {pages} · {total} records</p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className="btn btn-secondary btn-sm"><ChevronLeft aria-hidden className="size-4" /> Previous</Link>
        ) : null}
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className="btn btn-secondary btn-sm">Next <ChevronRight aria-hidden className="size-4" /></Link>
        ) : null}
      </div>
    </div>
  );
}

/** Builds a URL keeping the current filters and replacing some. */
export function withParams(base, params, changes) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...changes })) if (v != null && v !== "") q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export function DefList({ items }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[13px] font-semibold text-ink-muted">{k}</dt>
          <dd className="mt-0.5 break-words text-[15px]">{v || <span className="text-ink-muted">Not given</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
