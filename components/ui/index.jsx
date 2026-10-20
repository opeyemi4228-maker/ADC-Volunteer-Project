import { CheckCircle2, Clock, AlertTriangle, XCircle, Info, CircleHelp, Ban, Megaphone } from "lucide-react";

/**
 * Presentational building blocks. No hooks in this file, so every component
 * here renders on the server as well as inside client components.
 */

export function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

/* ── Status badge: colour is never the only signal (spec §3.1) ─────────── */

const STATUS = {
  verified: { label: "Verified", icon: CheckCircle2, cls: "bg-success-bg text-success border-success/25" },
  approved: { label: "Approved", icon: CheckCircle2, cls: "bg-success-bg text-success border-success/25" },
  publicity: { label: "Approved for publicity", icon: Megaphone, cls: "bg-success-bg text-success border-success/25" },
  sent: { label: "Sent", icon: CheckCircle2, cls: "bg-success-bg text-success border-success/25" },
  done: { label: "Completed", icon: CheckCircle2, cls: "bg-success-bg text-success border-success/25" },
  pending: { label: "Pending verification", icon: Clock, cls: "bg-warning-bg text-warning border-warning/25" },
  awaiting_approval: { label: "Awaiting approval", icon: Clock, cls: "bg-warning-bg text-warning border-warning/25" },
  info_requested: { label: "More info requested", icon: CircleHelp, cls: "bg-info-bg text-info border-info/25" },
  open: { label: "Open", icon: Clock, cls: "bg-info-bg text-info border-info/25" },
  rejected: { label: "Rejected", icon: XCircle, cls: "bg-danger-bg text-danger border-danger/25" },
  suspended: { label: "Suspended", icon: Ban, cls: "bg-danger-bg text-danger border-danger/25" },
  expired: { label: "Expired", icon: XCircle, cls: "bg-surface-alt text-ink-muted border-line" },
  cancelled: { label: "Cancelled", icon: XCircle, cls: "bg-surface-alt text-ink-muted border-line" },
};

export function StatusBadge({ status, label, className, t = (s) => s }) {
  const s = STATUS[status] ?? { label: status, icon: Info, cls: "bg-surface-alt text-ink-muted border-line" };
  const Icon = s.icon;
  const text = label ?? (status === "pending" ? "Pending" : s.label);
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[13px] font-semibold whitespace-nowrap", s.cls, className)}>
      <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
      {t(text)}
    </span>
  );
}

/* ── Alerts ────────────────────────────────────────────────────────────── */

const ALERT = {
  info: { icon: Info, cls: "bg-info-bg border-info/25 text-info" },
  success: { icon: CheckCircle2, cls: "bg-success-bg border-success/25 text-success" },
  warning: { icon: AlertTriangle, cls: "bg-warning-bg border-warning/30 text-warning" },
  danger: { icon: XCircle, cls: "bg-danger-bg border-danger/25 text-danger" },
};

export function Alert({ tone = "info", title, children, className, role }) {
  const a = ALERT[tone];
  const Icon = a.icon;
  return (
    <div role={role ?? (tone === "danger" ? "alert" : "status")} className={cx("flex gap-3 rounded-xl border p-4", a.cls, className)}>
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 text-[15px] text-ink">
        {title && <p className={cx("font-semibold", a.cls.split(" ").find((c) => c.startsWith("text-")))}>{title}</p>}
        {children && <div className={title ? "mt-1" : ""}>{children}</div>}
      </div>
    </div>
  );
}

/* ── Layout helpers ────────────────────────────────────────────────────── */

export function Card({ as: Tag = "div", className, children, ...rest }) {
  return (
    <Tag className={cx("card", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function SectionHeader({ title, description, action, className }) {
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="h-section">{title}</h2>
        {description && <p className="mt-1 text-[15px] text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10">
      <p className="font-semibold">{title}</p>
      {children && <p className="mt-1 max-w-lg text-[15px] text-ink-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ── Form field wrapper: visible label, hint, error (spec §13) ─────────── */

export function Field({ id, label, hint, error, optional, required, children, className, optionalText = "Optional" }) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-error` : undefined;
  return (
    <div className={cx("space-y-1.5", className)}>
      {label && (
        <label htmlFor={id} className="t-label flex flex-wrap items-baseline gap-x-2">
          <span>{label}</span>
          {optional && <span className="text-[13px] font-normal text-ink-muted">({optionalText})</span>}
          {required && <span className="sr-only">(required)</span>}
        </label>
      )}
      {hint && (
        <p id={hintId} className="t-help">
          {hint}
        </p>
      )}
      {typeof children === "function" ? children({ id, "aria-describedby": [hintId, errId].filter(Boolean).join(" ") || undefined, "aria-invalid": error ? "true" : undefined }) : children}
      {error && (
        <p id={errId} className="flex items-start gap-1.5 text-[14px] font-medium text-danger" role="alert">
          <XCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

/** A single figure: the number is the headline, the label says what it counts. */
export function Stat({ label, value, sub, tone }) {
  return (
    <div className="border-t-2 border-ink pt-3">
      <p className="text-[14px] font-medium text-ink-muted">{label}</p>
      <p className={cx("mt-1 text-[28px] font-bold leading-9 num tracking-tight", tone === "warn" && "text-warning")}>{value}</p>
      {sub && <p className="mt-0.5 text-[13px] text-ink-muted">{sub}</p>}
    </div>
  );
}

export function Logo({ size = 44, className }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/adc-logo-192.png" alt="ADC logo" width={size} height={Math.round(size * 0.917)} className={cx("shrink-0", className)} />
  );
}

export function fmt(n) {
  return new Intl.NumberFormat("en-NG").format(n ?? 0);
}

export function pct(part, whole) {
  if (!whole) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

export function dateLabel(value, opts = { day: "numeric", month: "short", year: "numeric" }) {
  if (!value) return "";
  const d = new Date(value.length === 7 ? `${value}-01T00:00:00` : value.includes(" ") ? `${value.replace(" ", "T")}Z` : value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", value.length === 7 ? { month: "long", year: "numeric" } : opts);
}

export function timeAgo(value) {
  if (!value) return "";
  const d = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return dateLabel(value);
}
