import { fmt } from "@/components/ui";

/**
 * Horizontal bars for a ranked list (channel mix, role coverage). One hue:
 * bars encode magnitude only, and every bar carries its number, so nothing is
 * read from colour. An optional `target` draws a tick for "needed".
 */
export default function BarList({ items, total, t = (s) => s }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.key}>
          <div className="flex items-baseline justify-between gap-3 text-[14px]">
            <span className="min-w-0 truncate font-medium">{t(i.label)}</span>
            <span className="num shrink-0 text-ink-muted">
              <span className="font-semibold text-ink">{fmt(i.value)}</span>
              {i.target != null && <> / {fmt(i.target)} {t("needed")}</>}
              {total ? ` · ${Math.round((i.value / total) * 100)}%` : ""}
            </span>
          </div>
          <div className="relative mt-1.5 h-2 rounded-full bg-surface-alt" aria-hidden>
            <div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.max(1.5, (i.value / max) * 100)}%` }} />
            {i.target != null && i.target <= max && <div className="absolute -top-1 h-4 w-0.5 rounded bg-ink" style={{ left: `${Math.min(99.5, (i.target / max) * 100)}%` }} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
