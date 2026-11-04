import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight, CheckCircle2, CircleHelp, Clock, Download, FileCheck2, KeyRound, LogIn, Send, ShieldAlert, UserCheck, UserPlus, XCircle, Activity,
  HandHeart, BadgeCheck, IdCard, MapPin, CalendarDays, Users, Inbox, UsersRound,
} from "lucide-react";

import { requireViewer, isVolunteerOnly } from "@/lib/guard";
import VolunteerHome from "./VolunteerHome";
import { getT } from "@/lib/i18n/server";
import { dashboard, coverage, adminOverview } from "@/lib/workspace-data";
import { resolveArea, breadcrumb } from "@/lib/workspace-area";
import { VOLUNTEER_ROLES, GENDERS, ROLE_LABELS } from "@/lib/options";
import { cx, fmt, pct, timeAgo } from "@/components/ui";
import { PageHeader } from "@/components/workspace/ui";
import SignupsCard from "@/components/workspace/charts/SignupsCard";
import ShowMore from "@/components/workspace/ShowMore";
import BarList from "@/components/workspace/charts/BarList";
import CoverageMap from "@/components/workspace/charts/CoverageMap";
import DownloadVolunteers from "@/components/workspace/DownloadVolunteers";
import { Panel, PanelLink, StatCard, DeltaPill, Meter, ColumnChart, TickGauge, BreakdownStrip, TodoRow } from "@/components/workspace/charts/Dash";

export const metadata = { title: "Overview" };

const CHANNELS = { web: "Website", whatsapp: "WhatsApp", ussd: "USSD", field_agent: "Field agents" };

/** What an audit entry means, in words, with an icon for its kind. Unlisted actions fall back to their name. */
const ACTIVITY = {
  volunteers_downloaded: [Download, (x) => `downloaded ${fmt(x?.rows ?? 0)} volunteers as ${x?.format === "xlsx" ? "Excel" : "CSV"}`],
  export_downloaded: [Download, (x) => `downloaded an approved export${x?.rows != null ? ` of ${fmt(x.rows)} rows` : ""}`],
  export_requested: [FileCheck2, () => "asked to export volunteers"],
  export_approved: [FileCheck2, () => "approved an export"],
  export_rejected: [XCircle, () => "turned down an export"],
  volunteer_registered: [UserPlus, () => "registered as a volunteer"],
  volunteer_verified: [UserCheck, () => "verified a volunteer"],
  volunteer_rejected: [XCircle, () => "rejected a volunteer"],
  certificate_downloaded: [Download, () => "downloaded their certificate"],
  role_granted: [KeyRound, (x) => `gave someone the ${ROLE_LABELS[x?.role] ?? ""} role`],
  message_campaign: [Send, () => "created a message campaign"],
  message_approved: [Send, () => "approved a message campaign"],
  setting_changed: [ShieldAlert, () => "changed a system setting"],
  password_changed: [KeyRound, () => "changed their password"],
  password_reset: [KeyRound, () => "reset their password"],
  deletion_requested: [ShieldAlert, () => "asked for their data to be deleted"],
};
const activity = (r) => {
  const [Icon, say] = ACTIVITY[r.action] ?? [Activity, () => r.action.replace(/_/g, " ")];
  let details = null;
  try { details = r.details ? JSON.parse(r.details) : null; } catch { /* free text */ }
  return { Icon, text: say(details) };
};

export default async function Overview({ searchParams }) {
  const viewer = await requireViewer({ allowVolunteer: true });
  const t = await getT();
  const sp = await searchParams;
  // A field agent whose position shows no Overview widgets starts on their registration form.
  if (viewer.powers.includes("field_agent") && !viewer.widgets?.length && viewer.roles.length === 1) redirect("/workspace/agent");
  // A volunteer's own account gets their dashboard (ID card, certificate), not campaign analytics.
  if (isVolunteerOnly(viewer)) return <VolunteerHome viewer={viewer} volunteerId={viewer.roles[0].area_code} />;

  const area = resolveArea(viewer, sp.area);
  // Which Overview widgets this viewer is shown (all for the Super Admin; set per position in Settings).
  const show = (k) => (viewer.widgets ?? []).includes(k);
  const isSuper = viewer.powers.includes("manage_users");
  const [d, map, admin] = await Promise.all([
    dashboard(viewer, area.type, area.code),
    ["national", "zone", "state"].includes(area.type) ? coverage(viewer, area.type, area.code) : null,
    isSuper ? adminOverview() : null,
  ]);
  const geo = ["national", "zone", "state", "lga", "ward"].includes(area.type);
  const crumbs = breadcrumb(area).map((c) => ({ label: c.name, href: `/workspace?area=${c.code}` }));
  const childLabel = { state: t("State"), lga: t("LGA"), ward: t("Ward") }[d.table[0]?.type] ?? "";

  const canVerify = viewer.powers.includes("verify");
  const downloadMode = viewer.powers.includes("approve_export") ? "direct" : viewer.powers.includes("request_export") ? "request" : null;
  const areaFilter = geo && area.code !== "NG" ? { area: area.code } : {};
  const topRole = ["zonal_coordinator", "state_coordinator", "lga_coordinator", "ward_coordinator", "directorate_head", "field_agent"].find((r) => viewer.roles.some((x) => x.role === r));
  // Most urgent first: overdue records, then approvals only the super admin can give, then routine queues.
  const nopu = d.volunteers - d.withPu;
  const attention = [
    canVerify && d.overdue > 0 && { href: "/workspace/verify", count: fmt(d.overdue), text: d.overdue === 1 ? "Record waiting more than 7 days" : "Records waiting more than 7 days", warn: true },
    admin?.approvals.exports > 0 && { href: "/workspace/exports", count: fmt(admin.approvals.exports), text: admin.approvals.exports === 1 ? "Export request to approve" : "Export requests to approve", warn: true },
    admin?.approvals.messages > 0 && { href: "/workspace/messages", count: fmt(admin.approvals.messages), text: admin.approvals.messages === 1 ? "Message campaign to approve" : "Message campaigns to approve", warn: true },
    canVerify && d.pendingVolunteers > 0 && { href: "/workspace/verify?tab=volunteers", count: fmt(d.pendingVolunteers), text: "Volunteers to verify" },
    canVerify && d.pendingMedia > 0 && { href: "/workspace/media?status=pending", count: fmt(d.pendingMedia), text: "Photos and videos to review" },
    nopu > 0 && { href: `/workspace/volunteers?nopu=1${areaFilter.area ? `&area=${areaFilter.area}` : ""}`, count: fmt(nopu), text: "Volunteers without a polling unit" },
  ].filter(Boolean);

  const roleItems = VOLUNTEER_ROLES.map((r) => ({
    key: r.value,
    label: r.label,
    value: d.roles.find((x) => x.role === r.value)?.n ?? 0,
    target: r.value === "pu_agent" && d.totalPus ? d.totalPus * 2 : undefined,
  })).sort((a, b) => b.value - a.value);

  const asOf = new Date().toLocaleString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const needed = d.totalPus ? d.totalPus * 2 : 0;
  const rows = [...d.table].sort((a, b) => b.registered - a.registered || a.name.localeCompare(b.name));
  const active = rows.filter((r) => r.registered > 0);
  const empty = rows.filter((r) => r.registered === 0);
  const v = (status) => `/workspace/volunteers?status=${status}${areaFilter.area ? `&area=${areaFilter.area}` : ""}`;

  // Sign-ups by day of the week over the last 90 days, Monday first.
  const WEEK = [["Mon", "Monday"], ["Tue", "Tuesday"], ["Wed", "Wednesday"], ["Thu", "Thursday"], ["Fri", "Friday"], ["Sat", "Saturday"], ["Sun", "Sunday"]];
  const byWeekday = Array(7).fill(0);
  for (const x of d.series) byWeekday[(new Date(`${x.day}T00:00:00Z`).getUTCDay() + 6) % 7] += x.n;
  const weekdays = WEEK.map(([short, label], i) => ({ key: short, short, label, value: byWeekday[i] }));
  const busiest = weekdays.reduce((b, x) => (x.value > b.value ? x : b), weekdays[0]);
  const TOP = 8;
  const showMap = Boolean(map) && show("map");
  const leftMain = show("signups") || (show("table") && geo && rows.length > 0);
  const rightMain = show("todo") || show("weekdays") || show("gauge");
  const row2 = ["readiness", "channels", "roles"].filter(show).length;
  const COLS = { 1: "", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3" };

  return (
    <>
      <PageHeader
        crumbs={crumbs.length > 1 ? crumbs : undefined}
        eyebrow={isSuper ? "Super admin" : topRole ? ROLE_LABELS[topRole] : undefined}
        title={d.area.name}
        description={`${t("Verified means a coordinator has confirmed the record. Claimed figures are shown separately.")}`}
        actions={
          <>
            <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3 text-[13px] font-medium text-ink-muted">
              <CalendarDays aria-hidden className="size-4" /> As of {asOf}
            </span>
            {geo && <Link href={`/workspace/volunteers${areaFilter.area ? `?area=${areaFilter.area}` : ""}`} className="btn btn-secondary btn-sm bg-white"><Users aria-hidden className="size-4" /> Directory</Link>}
            {geo && downloadMode && (
              <DownloadVolunteers
                mode={downloadMode}
                filters={areaFilter}
                count={d.volunteers}
                described={[{ label: "Area", value: d.area.name }]}
                label={downloadMode === "direct" ? "Download" : "Request export"}
                className="btn btn-primary btn-sm shadow-[0_6px_16px_-8px_rgb(10_115_56/0.7)]"
              />
            )}
          </>
        }
      />

      {show("kpis") && <section aria-label="Key figures" className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("Volunteers")}
          icon={HandHeart}
          value={fmt(d.volunteers)}
          delta={<DeltaPill now={d.growth.d30} before={d.growth.p30} />}
          sub={`+${fmt(d.growth.d30)} in 30 days, vs. ${fmt(d.growth.p30)} the 30 before · ${fmt(d.growth.today)} today`}
          href={`/workspace/volunteers${areaFilter.area ? `?area=${areaFilter.area}` : ""}`}
        />
        <StatCard
          label={t("Verified")}
          icon={BadgeCheck}
          tone="info"
          value={fmt(d.verified)}
          delta={<DeltaPill now={d.growth.verified7} before={d.growth.verifiedP7} />}
          sub={`${pct(d.verified, d.volunteers)} ${t("of volunteers")} · ${fmt(d.growth.verified7)} this week, vs. ${fmt(d.growth.verifiedP7)} last week`}
          href={v("verified")}
        />
        <StatCard
          label={t("PVC ready")}
          icon={IdCard}
          tone="accent"
          value={pct(d.pvcReady, d.volunteers)}
          meter={{ value: d.pvcReady, max: d.volunteers, label: "Share of volunteers with a PVC", tone: "bg-accent-500", track: "bg-accent-100" }}
          sub={t("{n} have collected their PVC", { n: fmt(d.pvcReady) })}
        />
        <StatCard
          label={t("Polling unit coverage")}
          icon={MapPin}
          tone="warning"
          value={d.totalPus ? pct(d.pusCovered, d.totalPus) : fmt(d.pusCovered)}
          meter={d.totalPus ? { value: d.pusCovered, max: d.totalPus, label: "Polling units with at least one volunteer", tone: "bg-warning", track: "bg-warning-bg" } : undefined}
          sub={`${fmt(d.pusCovered)}${d.totalPus ? ` of ${fmt(d.totalPus)}` : ""} have a volunteer · ${fmt(d.pusWithAgent)} a confirmed agent`}
        />
      </section>}

      <div className={cx("grid grid-cols-1 gap-4", leftMain && rightMain && "lg:grid-cols-3")}>
        {leftMain && <div className={cx("min-w-0 max-lg:contents lg:space-y-4", rightMain && "lg:col-span-2")}>
          {show("signups") && <SignupsCard series={d.series} title={t("Volunteer sign-ups")}>
            <div className="rounded-xl border border-line p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-bold">Verification status</h3>
                {canVerify && <PanelLink href="/workspace/verify?tab=volunteers">Open the queue</PanelLink>}
              </div>
              <BreakdownStrip
                parts={[
                  { key: "verified", label: "Verified", value: d.byStatus.verified ?? 0, fill: "bg-success", text: "text-success", icon: CheckCircle2, href: v("verified") },
                  { key: "pending", label: "Pending", value: d.byStatus.pending ?? 0, fill: "bg-accent-500", text: "text-accent-700", icon: Clock, href: v("pending") },
                  { key: "info_requested", label: "Info requested", value: d.byStatus.info_requested ?? 0, fill: "bg-info", text: "text-info", icon: CircleHelp, href: v("info_requested") },
                  { key: "rejected", label: "Rejected", value: d.byStatus.rejected ?? 0, fill: "bg-danger", text: "text-danger", icon: XCircle, href: v("rejected") },
                ]}
              />
            </div>
          </SignupsCard>}

          {show("table") && geo && rows.length > 0 && (
            <Panel
              title={t("By {level}", { level: childLabel })}
              sub="Largest first. Select a name to drill down."
              action={<span className="inline-flex h-8 items-center rounded-lg bg-surface-alt px-2.5 text-[12px] font-semibold text-ink-muted num">{fmt(active.length)} of {fmt(rows.length)} active</span>}
              bodyClassName="!px-0 !pb-0"
            >
              <ShowMore hidden={Math.max(0, active.length - TOP)} label={childLabel === t("State") ? "states" : "areas"}>
                <div className="overflow-x-auto">
                  <table className="table-clean">
                    <thead>
                      <tr>
                        <th className="!pl-5">{childLabel}</th>
                        <th className="text-right">{t("Registered")}</th>
                        <th className="text-right">{t("Verified")}</th>
                        <th className="text-right">Waiting</th>
                        <th className="text-right">{t("PVC ready")}</th>
                        <th className="!pr-5">PU coverage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.map((r, i) => (
                        <tr key={r.code} className={i >= TOP ? "group-data-[collapsed]:hidden" : undefined}>
                          <td className="!pl-5">
                            <Link className="group/row flex items-center gap-3 font-semibold text-ink hover:text-brand-700" href={`/workspace?area=${r.code}`}>
                              <span aria-hidden className={cx("grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold num", i < 3 ? "bg-brand-50 text-brand-800" : "bg-surface-alt text-ink-muted")}>{i + 1}</span>
                              <span className="min-w-0 truncate group-hover/row:underline">{r.name}</span>
                            </Link>
                          </td>
                          <td className="num text-right font-semibold">{fmt(r.registered)}</td>
                          <td className="num whitespace-nowrap text-right">{fmt(r.verified)} <span className="text-[12px] text-ink-muted">{pct(r.verified, r.registered)}</span></td>
                          <td className="num text-right">
                            {r.waiting ? <span className="inline-flex rounded-md bg-warning-bg px-1.5 py-0.5 text-[13px] font-semibold text-warning">{fmt(r.waiting)}</span> : <span className="text-ink-muted">0</span>}
                          </td>
                          <td className="num text-right">{pct(r.pvc, r.registered)}</td>
                          <td className="!pr-5">
                            <div className="flex items-center gap-2.5" title={`${fmt(r.pus)} of ${fmt(r.totalPus)} polling units`}>
                              <Meter className="w-16 shrink-0" value={r.pus} max={r.totalPus} label={`${r.name} polling unit coverage`} />
                              <span className="w-9 shrink-0 text-right text-[12px] font-semibold text-ink-muted num">{pct(r.pus, r.totalPus)}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ShowMore>
              {empty.length > 0 && (
                <p className="border-t border-line px-5 py-3.5 text-[13px] leading-5 text-ink-muted">
                  <span className="font-semibold text-warning">No volunteers yet in {fmt(empty.length)}:</span>{" "}
                  {empty.map((r, i) => (
                    <span key={r.code}>{i > 0 && ", "}<Link className="hover:text-ink hover:underline" href={`/workspace?area=${r.code}`}>{r.name}</Link></span>
                  ))}
                </p>
              )}
            </Panel>
          )}
        </div>}

        {rightMain && <div className="min-w-0 max-lg:contents lg:space-y-4">
          {show("todo") && <Panel
            id="todo"
            title={t("To do")}
            sub={attention.length ? `${attention.length} ${attention.length === 1 ? "thing needs" : "things need"} you, most urgent first` : undefined}
            className="max-lg:order-first"
          >
            {attention.length ? (
              <ul className="space-y-0.5">
                {attention.map((a) => <TodoRow key={a.href + a.text} {...a} />)}
              </ul>
            ) : (
              <p className="flex items-center gap-2.5 rounded-xl bg-success-bg px-3 py-3 text-[14px] font-medium text-success"><CheckCircle2 aria-hidden className="size-5" /> {t("Nothing needs attention right now.")}</p>
            )}
            {d.oldestPending && <p className="mt-3 border-t border-line pt-3 text-[12px] text-ink-muted">{t("Oldest waiting record")}: <span className="font-semibold text-ink">{timeAgo(d.oldestPending)}</span></p>}
          </Panel>}

          {show("weekdays") && <Panel title="Busiest sign-up days" sub={busiest.value ? `${busiest.label}s bring the most volunteers. Last 90 days.` : "Sign-ups by day of the week, last 90 days."}>
            <ColumnChart items={weekdays} />
          </Panel>}

          {show("gauge") && <Panel title="Verification rate" sub="Share of all volunteers a coordinator has confirmed.">
            <TickGauge value={d.verified} max={d.volunteers} label="Volunteers verified" caption={`${fmt(d.verified)} of ${fmt(d.volunteers)} verified`} />
            <dl className="mt-5 grid grid-cols-3 divide-x divide-line rounded-xl border border-line text-center">
              <div className="px-2 py-2.5"><dt className="text-[11px] font-medium text-ink-muted">Over 7 days</dt><dd className={cx("text-[16px] font-bold num", d.overdue > 0 && "text-warning")}>{fmt(d.overdue)}</dd></div>
              <div className="px-2 py-2.5"><dt className="text-[11px] font-medium text-ink-muted">This week</dt><dd className="text-[16px] font-bold num">{fmt(d.growth.verified7)}</dd></div>
              <div className="px-2 py-2.5"><dt className="text-[11px] font-medium text-ink-muted">Media to review</dt><dd className="text-[16px] font-bold num">{fmt(d.pendingMedia)}</dd></div>
            </dl>
            {canVerify && (
              <Link href="/workspace/verify?tab=volunteers" className="mt-4 flex h-10 items-center justify-center rounded-xl border border-line text-[13px] font-semibold transition-colors hover:border-brand-600 hover:bg-brand-50 hover:text-brand-800">
                Verify volunteers
              </Link>
            )}
          </Panel>}
        </div>}
      </div>

      {row2 > 0 && <div className={cx("mt-4 grid grid-cols-1 gap-4", COLS[row2])}>
        {show("readiness") && <Panel
          title="Election-day readiness"
          sub="Each polling unit needs a primary and a backup agent."
          action={viewer.powers.includes("election") && <PanelLink href="/workspace/election">Roster</PanelLink>}
        >
          <ul className="space-y-5">
            {[
              { label: "Willing to be PU agents", value: d.agentsAvailable, max: needed, of: needed ? `of ${fmt(needed)} needed` : "" },
              { label: "PUs with a confirmed agent", value: d.pusWithAgent, max: d.totalPus, of: d.totalPus ? `of ${fmt(d.totalPus)}` : "" },
              { label: "Linked to a polling unit", value: d.withPu, max: d.volunteers, of: `of ${fmt(d.volunteers)}` },
            ].map((m) => (
              <li key={m.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium">{m.label}</span>
                  <span className="shrink-0 text-[13px] font-bold num">{m.max ? pct(m.value, m.max) : fmt(m.value)}</span>
                </div>
                <Meter className="mt-2 !h-2" value={m.value} max={m.max} label={m.label} />
                <p className="mt-1 text-[12px] text-ink-muted num">{fmt(m.value)} {m.of}</p>
              </li>
            ))}
          </ul>
        </Panel>}
        {show("channels") && <Panel title={t("Registration channels")} sub={t("Where volunteers signed up.")}>
          <BarList total={d.volunteers} items={d.channels.map((c) => ({ key: c.channel, label: CHANNELS[c.channel] ?? c.channel, value: c.n }))} />
        </Panel>}
        {show("roles") && <Panel title={t("Role coverage")} sub="Volunteers willing to take each role.">
          <BarList items={roleItems.slice(0, 7).map(({ target: _t, ...r }) => r)} />
        </Panel>}
      </div>}

      {(showMap || show("demographics")) && <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {showMap && (
          <Panel
            className="lg:col-span-2"
            title={t("Volunteers by {level}", { level: map.level === "state" ? t("state") : t("LGA") })}
            sub={t("Select an area to drill down.")}
            action={<PanelLink href={`/workspace/map${area.code !== area.home.code ? `?area=${area.code}` : ""}`}>{t("Open full map")}</PanelLink>}
          >
            <CoverageMap level={map.level} stateCode={area.code.slice(0, 3)} values={map.values} valueKey="volunteers" metricLabel="Volunteers" hrefBase="/workspace?area=" />
          </Panel>
        )}
        {show("demographics") && <Panel title="Who has volunteered" sub="Gender and age of everyone registered." className={showMap ? undefined : "lg:col-span-3"}>
          <div className={cx("grid gap-6", !showMap && "md:grid-cols-2 md:gap-10")}>
            <div>
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">Gender</h3>
              <BarList total={d.volunteers} items={GENDERS.map((g) => ({ key: g.value, label: g.label, value: d.genders.find((x) => x.gender === g.value)?.n ?? 0 }))} />
            </div>
            <div>
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">Age</h3>
              <BarList total={d.volunteers} items={d.ages.map((b) => ({ key: b.value, label: b.label, value: b.n }))} />
            </div>
          </div>
        </Panel>}
      </div>}

      {!viewer.widgets?.length && (
        <p className="card p-5 text-[14px] text-ink-muted">Your Overview has no widgets switched on. Use the menu to open your pages.</p>
      )}

      {admin && <Administration admin={admin} />}

      {!geo && (
        <p className="mt-6 text-[14px] text-ink-muted">
          {t("You see summary figures for your directorate across Nigeria.")}
        </p>
      )}
    </>
  );
}

/** The national admin's own panel: what is waiting on them, who works in the workspace, and what just happened. */
function Administration({ admin }) {
  const { approvals, team, recent } = admin;
  const total = approvals.exports + approvals.messages + approvals.dataRequests;
  const waiting = [
    { label: "Export requests", n: approvals.exports, href: "/workspace/exports", icon: Download },
    { label: "Message campaigns", n: approvals.messages, href: "/workspace/messages", icon: Send },
    { label: "Data requests", n: approvals.dataRequests, href: "/workspace/privacy", icon: ShieldAlert },
  ];
  const maxRole = Math.max(1, ...team.roles.map((r) => r.n));
  return (
    <section aria-labelledby="admin" className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="admin" className="text-[17px] font-bold tracking-tight">Administration</h2>
        <PanelLink href="/workspace/team">Team and positions</PanelLink>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Waiting for your approval" action={<span className="grid size-9 place-items-center rounded-xl bg-warning-bg text-warning"><Inbox aria-hidden className="size-[18px]" /></span>}>
          <p className="flex items-baseline gap-2"><span className={cx("text-[30px] font-bold leading-9 tracking-tight", total ? "text-warning" : "text-ink")}>{fmt(total)}</span> <span className="text-[13px] text-ink-muted">{total === 1 ? "item" : "items"}</span></p>
          <ul className="mt-3 space-y-0.5">
            {waiting.map((w) => {
              const Icon = w.icon;
              return (
                <li key={w.label}>
                  <Link href={w.href} className="group -mx-2 flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-surface-alt">
                    <Icon aria-hidden className="size-4 text-ink-muted" />
                    <span className="flex-1 text-[14px]">{w.label}</span>
                    <span className={cx("rounded-md px-1.5 py-0.5 text-[13px] font-bold num", w.n ? "bg-warning-bg text-warning" : "text-ink-muted")}>{fmt(w.n)}</span>
                    <ArrowRight aria-hidden className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title="Team" action={<span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-700"><UsersRound aria-hidden className="size-[18px]" /></span>}>
          <p className="flex items-baseline gap-2"><span className="text-[30px] font-bold leading-9 tracking-tight">{fmt(team.users)}</span> <span className="text-[13px] text-ink-muted">active accounts · {fmt(team.active7)} signed in this week</span></p>
          <ul className="mt-3 space-y-2.5">
            {team.roles.map((r) => (
              <li key={r.role}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]"><span>{ROLE_LABELS[r.role] ?? r.role}</span><span className="font-bold num">{fmt(r.n)}</span></div>
                <Meter className="mt-1" value={r.n} max={maxRole} label={ROLE_LABELS[r.role] ?? r.role} />
              </li>
            ))}
          </ul>
          <Link href="/workspace/settings?tab=audit" className={cx("mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px]", admin.failedSignins ? "bg-warning-bg text-warning" : "bg-surface-alt text-ink-muted")}>
            <LogIn aria-hidden className="size-4 shrink-0" />
            <span className="flex-1"><span className="font-bold">{fmt(admin.failedSignins)}</span> failed {admin.failedSignins === 1 ? "sign-in" : "sign-ins"} in the last 24 hours</span>
            <ArrowRight aria-hidden className="size-4 shrink-0" />
          </Link>
        </Panel>
        <Panel title="Recent activity" action={<PanelLink href="/workspace/settings?tab=audit">Audit log</PanelLink>}>
          {recent.length === 0 ? <p className="text-[14px] text-ink-muted">Nothing recorded yet.</p> : (
            <ol className="relative space-y-4 before:absolute before:inset-y-2 before:left-[15px] before:w-px before:bg-line">
              {recent.map((r, i) => {
                const { Icon, text } = activity(r);
                return (
                  <li key={i} className="relative flex gap-3 text-[13px] leading-5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-white"><Icon aria-hidden className="size-3.5 text-ink-muted" /></span>
                    <span className="min-w-0 pt-1.5">
                      <span className="font-semibold">{r.actor_name ?? "System"}</span> {text}
                      <span className="block text-[12px] text-ink-muted">{timeAgo(r.timestamp)}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>
    </section>
  );
}
