import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { requireViewer, isVolunteerOnly } from "@/lib/guard";
import VolunteerHome from "./VolunteerHome";
import { getT } from "@/lib/i18n/server";
import { dashboard, coverage } from "@/lib/workspace-data";
import { resolveArea, breadcrumb } from "@/lib/workspace-area";
import { VOLUNTEER_ROLES } from "@/lib/options";
import { Card, Stat, fmt, pct, timeAgo } from "@/components/ui";
import { PageHeader } from "@/components/workspace/ui";
import LineChart from "@/components/workspace/charts/LineChart";
import BarList from "@/components/workspace/charts/BarList";
import CoverageMap from "@/components/workspace/charts/CoverageMap";

export const metadata = { title: "Overview" };

const CHANNELS = { web: "Website", whatsapp: "WhatsApp", ussd: "USSD", field_agent: "Field agents" };

export default async function Overview({ searchParams }) {
  const viewer = await requireViewer({ allowVolunteer: true });
  const t = await getT();
  const sp = await searchParams;
  if (viewer.powers.includes("field_agent") && viewer.roles.length === 1) redirect("/workspace/agent");
  if (viewer.powers.includes("data_requests") && viewer.roles.length === 1) redirect("/workspace/privacy");
  // A volunteer's own account gets their dashboard (ID card, certificate), not campaign analytics.
  if (isVolunteerOnly(viewer)) return <VolunteerHome viewer={viewer} volunteerId={viewer.roles[0].area_code} />;

  const area = resolveArea(viewer, sp.area);
  const d = dashboard(viewer, area.type, area.code);
  const geo = ["national", "zone", "state", "lga", "ward"].includes(area.type);
  const map = ["national", "zone", "state"].includes(area.type) ? coverage(viewer, area.type, area.code) : null;
  const crumbs = breadcrumb(area).map((c) => ({ label: c.name, href: `/workspace?area=${c.code}` }));
  const childLabel = { state: t("State"), lga: t("LGA"), ward: t("Ward") }[d.table[0]?.type] ?? "";

  const canVerify = viewer.powers.includes("verify");
  const attention = [
    canVerify && d.pendingVolunteers > 0 && { href: "/workspace/verify?tab=volunteers", text: d.pendingVolunteers === 1 ? t("1 volunteer to verify") : t("{n} volunteers to verify", { n: fmt(d.pendingVolunteers) }) },
    canVerify && d.overdue > 0 && { href: "/workspace/verify", text: d.overdue === 1 ? t("1 record waiting more than 7 days") : t("{n} records waiting more than 7 days", { n: fmt(d.overdue) }), warn: true },
    canVerify && d.pendingMedia > 0 && { href: "/workspace/media?status=pending", text: d.pendingMedia === 1 ? t("1 photo or video to review") : t("{n} photos and videos to review", { n: fmt(d.pendingMedia) }) },
    d.volunteers - d.withPu > 0 && { href: "/workspace/volunteers?nopu=1", text: t("{n} without a polling unit", { n: fmt(d.volunteers - d.withPu) }) },
  ].filter(Boolean);

  const roleItems = VOLUNTEER_ROLES.map((r) => ({
    key: r.value,
    label: r.label,
    value: d.roles.find((x) => x.role === r.value)?.n ?? 0,
    target: r.value === "pu_agent" && d.totalPus ? d.totalPus * 2 : undefined,
  })).sort((a, b) => b.value - a.value);

  return (
    <>
      <PageHeader
        crumbs={crumbs.length > 1 ? crumbs : undefined}
        title={d.area.name}
        description={t("Verified means a coordinator has confirmed the record. Claimed figures are shown separately.")}
      />

      <section aria-labelledby="todo" className="mb-8">
        <h2 id="todo" className="h-section">{attention.length ? t("To do") : t("Nothing needs attention right now.")}</h2>
        {attention.length > 0 && (
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {attention.map((a) => (
              <li key={a.href + a.text}>
                <Link href={a.href} className="group flex min-h-12 items-center gap-3 py-2.5">
                  <span className={`flex-1 text-[15px] ${a.warn ? "font-semibold text-warning" : ""}`}>{a.text}</span>
                  <ArrowRight aria-hidden className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {d.oldestPending && <p className="t-help mt-2">{t("Oldest waiting record")}: {timeAgo(d.oldestPending)}</p>}
      </section>

      <div className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
        <Stat label={t("Volunteers")} value={fmt(d.volunteers)} sub={t("{n} with a polling unit", { n: fmt(d.withPu) })} />
        <Stat label={t("Verified")} value={fmt(d.verified)} sub={`${pct(d.verified, d.volunteers)} ${t("of volunteers")}`} />
        <Stat label={t("PVC ready")} value={pct(d.pvcReady, d.volunteers)} sub={t("{n} have collected their PVC", { n: fmt(d.pvcReady) })} />
        <Stat
          label={t("Polling unit coverage")}
          value={d.totalPus ? `${fmt(d.pusCovered)} / ${fmt(d.totalPus)}` : fmt(d.pusCovered)}
          sub={t("{n} with a confirmed agent", { n: fmt(d.pusWithAgent) })}
        />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-3">
        <Stat label={t("Waiting for verification")} value={fmt(d.pendingVolunteers)} tone={d.overdue ? "warn" : undefined} sub={d.overdue ? t("{n} over 7 days", { n: fmt(d.overdue) }) : t("None over 7 days")} />
        <Stat label={t("PU agents available")} value={fmt(d.agentsAvailable)} sub={d.totalPus ? t("{n} needed (primary and backup)", { n: fmt(d.totalPus * 2) }) : ""} />
        <Stat label={t("Media to review")} value={fmt(d.pendingMedia)} />
      </div>

      <div className="mt-10 grid gap-6">
        <Card className="p-4 sm:p-5">
          <h2 className="h-section">{t("Volunteers registered, last 90 days")}</h2>
          <p className="t-help mt-0.5">{t("Running total. Hover or use arrow keys for daily figures.")}</p>
          <div className="mt-3">
            <LineChart data={d.series} label="Volunteers registered" />
          </div>
        </Card>

      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {map && (
          <Card className="p-4 sm:p-5 lg:col-span-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h-section">{t("Volunteers by {level}", { level: map.level === "state" ? t("state") : t("LGA") })}</h2>
              <Link href={`/workspace/map${area.code !== area.home.code ? `?area=${area.code}` : ""}`} className="inline-flex min-h-10 items-center text-[14px] font-semibold text-brand-700 hover:underline">{t("Open full map")}</Link>
            </div>
            <p className="t-help mt-0.5">{t("Select an area to drill down.")}</p>
            <div className="mt-3">
              <CoverageMap level={map.level} stateCode={area.code.slice(0, 3)} values={map.values} valueKey="volunteers" metricLabel="Volunteers" hrefBase="/workspace?area=" />
            </div>
          </Card>
        )}
        <Card className="p-4 sm:p-5">
          <h2 className="h-section">{t("Registration channels")}</h2>
          <p className="t-help mt-0.5">{t("Where volunteers signed up.")}</p>
          <div className="mt-4">
            <BarList total={d.volunteers} items={d.channels.map((c) => ({ key: c.channel, label: CHANNELS[c.channel] ?? c.channel, value: c.n }))} />
          </div>
        </Card>
        <Card className="p-4 sm:p-5">
          <h2 className="h-section">{t("Role coverage")}</h2>
          <p className="t-help mt-0.5">{t("Volunteers willing to take each role. The tick shows polling unit agents needed.")}</p>
          <div className="mt-4">
            <BarList items={roleItems.slice(0, 8)} />
          </div>
        </Card>
      </div>

      {geo && d.table.length > 0 && (
        <Card className="mt-6 overflow-hidden">
          <div className="p-4 sm:p-5">
            <h2 className="h-section">{t("By {level}", { level: childLabel })}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>{childLabel}</th>
                  <th className="text-right">{t("Registered")}</th>
                  <th className="text-right">{t("Verified")}</th>
                  <th className="text-right">{t("PVC ready")}</th>
                  <th className="text-right">{t("PUs covered")}</th>
                </tr>
              </thead>
              <tbody>
                {[...d.table].sort((a, b) => b.registered - a.registered || a.name.localeCompare(b.name)).map((r) => (
                  <tr key={r.code}>
                    <td>
                      <Link className="link" href={`/workspace?area=${r.code}`}>{r.name}</Link>
                    </td>
                    <td className="num text-right">{fmt(r.registered)}</td>
                    <td className="num text-right">{fmt(r.verified)}</td>
                    <td className="num text-right">{pct(r.pvc, r.registered)}</td>
                    <td className="num text-right">{fmt(r.pus)} / {fmt(r.totalPus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!geo && (
        <p className="mt-6 text-[14px] text-ink-muted">
          {t("You see summary figures for your directorate across Nigeria.")}
        </p>
      )}
    </>
  );
}
