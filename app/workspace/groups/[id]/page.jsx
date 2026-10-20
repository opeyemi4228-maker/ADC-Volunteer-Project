import Link from "next/link";
import { notFound } from "next/navigation";
import { Phone, Mail, Globe, Link2, AlertTriangle, CalendarCheck, Images, ListTodo, MapPin } from "lucide-react";

import { getViewer, clientIp } from "@/lib/auth";
import { getGroup } from "@/lib/workspace-data";
import { audit } from "@/lib/audit";
import { areaName } from "@/lib/geo";
import { SOCIAL_NETWORKS } from "@/lib/validate";
import {
  GROUP_CATEGORIES, OPERATING_LEVELS, GROUP_SIZE, CAC_STATUS, LEADER_POSITIONS, PLATFORM_TYPES, AUDIENCE_RANGES,
  ACTIVITY_FREQUENCY, ACTIVITY_TYPES, PVC_STATUS, DIRECTORATES, GROUP_SIZE_MID, labelOf,
} from "@/lib/options";
import { METHODS } from "@/lib/verify";
import { Card, EmptyState, StatusBadge, fmt, dateLabel, timeAgo } from "@/components/ui";
import { PageHeader, Tabs, DefList } from "@/components/workspace/ui";
import { DecisionPanel, ApiButton } from "@/components/workspace/actions";
import MediaGrid from "@/components/workspace/MediaGrid";
import TaskReportForm from "@/components/workspace/TaskReportForm";

export async function generateMetadata() {
  return { title: "Group profile" };
}

export default async function GroupProfile({ params, searchParams }) {
  const viewer = await getViewer();
  const { id } = await params;
  const sp = await searchParams;
  const g = getGroup(viewer, id);
  if (!g) notFound();
  audit(viewer, "view", "group", g.id, null, await clientIp());

  const tab = sp.tab ?? "overview";
  const base = `/workspace/groups/${g.id}`;
  const can = (p) => viewer.powers.includes(p);
  const pendingMembers = g.members.filter((m) => m.group_status === "pending");
  const expected = GROUP_SIZE_MID[g.estimated_size_range];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Groups", href: "/workspace/groups" }, { label: g.name }]}
        title={g.name}
        description={`${g.public_id} · ${labelOf(GROUP_CATEGORIES, g.category)}${g.category_other ? ` (${g.category_other})` : ""} · ${labelOf(OPERATING_LEVELS, g.operating_level)} level · ${g.place}`}
        actions={<StatusBadge status={g.status} className="!text-[14px]" />}
      />

      {g.flags.some((f) => !f.resolved_at) && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning-bg p-4">
          <p className="flex items-center gap-2 font-semibold text-warning"><AlertTriangle aria-hidden className="size-4" /> Possible duplicate</p>
          <ul className="mt-2 space-y-2 text-[14px]">
            {g.flags.filter((f) => !f.resolved_at).map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{f.reason}. <Link className="link" href={`/workspace/groups/${f.other_id}`}>Open {f.other_public_id}</Link></span>
                {can("verify") && <ApiButton url={`/api/v1/groups/${g.id}/resolve-flag`} data={{ flagId: f.id }} doneLabel="Resolved">Not a duplicate</ApiButton>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Tabs
        current={tab}
        tabs={[
          { key: "overview", label: "Overview", href: base },
          { key: "members", label: "Members", count: g.members.length, href: `${base}?tab=members` },
          { key: "online", label: "Online presence", href: `${base}?tab=online` },
          { key: "activities", label: "Activities", count: g.activities.length, href: `${base}?tab=activities` },
          { key: "gallery", label: "Gallery", count: g.media.length, href: `${base}?tab=gallery` },
          { key: "tasks", label: "Tasks", count: g.tasks.length, href: `${base}?tab=tasks` },
          { key: "history", label: "History", href: `${base}?tab=history` },
        ]}
      />

      {tab === "overview" && (
        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <div className="space-y-6">
            <Card className="p-5">
              <h2 className="h-section mb-4">Details</h2>
              <DefList
                items={[
                  ["Group ID", g.public_id],
                  ["Join code", <span key="j" className="font-mono font-semibold tracking-wider">{g.join_code}</span>],
                  ["Date formed", dateLabel(g.date_formed)],
                  ["Estimated members (claimed)", labelOf(GROUP_SIZE, g.estimated_size_range)],
                  ["Membership list", g.membership_upload_id ? <a key="ml" className="link" href={`/api/v1/groups/${g.id}/members-file`}>{g.membership_count != null ? `${fmt(g.membership_count)} members · download` : "PDF uploaded · download"}</a> : ""],
                  ["Logo", g.logo_key ? <img key="lg" src={`/api/v1/groups/${g.id}/logo`} alt={`${g.name} logo`} className="size-16 rounded-lg border border-line object-cover" /> : ""],
                  ["CAC registration", g.cac_status ? `${labelOf(CAC_STATUS, g.cac_status)}${g.cac_number ? ` · ${g.cac_number}` : ""}` : ""],
                  ["Directorate", labelOf(DIRECTORATES, g.directorate)],
                  ["Meeting place", g.address],
                  ["Map pin", g.latitude ? <a key="m" className="link" href={`https://www.openstreetmap.org/?mlat=${g.latitude}&mlon=${g.longitude}#map=17/${g.latitude}/${g.longitude}`} target="_blank" rel="noreferrer">View on map</a> : ""],
                  g.areas.length > 0 && ["Areas covered", g.areas.map((a) => a.name).join(", ")],
                  ["Registered", `${dateLabel(g.created_at)} via ${g.registration_channel}`],
                  g.verified_at && ["Verified", `${dateLabel(g.verified_at)} · ${METHODS[g.verification_method] ?? g.verification_method ?? ""}`],
                  g.status === "verified" && ["Certificate", <a key="ct" className="link" href={`/api/v1/groups/${g.id}/certificate`}>{g.certificate_no ?? "Download PDF"}</a>],
                  g.status_reason && ["Note", g.status_reason],
                ]}
              />
              {g.description && <p className="mt-4 rounded-lg bg-surface-alt p-3 text-[15px]">{g.description}</p>}
            </Card>

            <Card className="p-5">
              <h2 className="h-section mb-3">Leaders</h2>
              <ul className="divide-y divide-line">
                {g.leaders.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="font-semibold">{l.first_name} {l.surname}</p>
                      <p className="text-[14px] text-ink-muted">{l.position === "other" ? l.position_other : labelOf(LEADER_POSITIONS, l.position)}</p>
                    </div>
                    <div className="flex flex-wrap gap-3 text-[14px]">
                      {l.phone && (l.phoneE164 ? <a href={`tel:${l.phoneE164}`} className="inline-flex items-center gap-1 font-semibold text-brand-700"><Phone aria-hidden className="size-4" />{l.phone}</a> : <span>{l.phone}</span>)}
                      {l.email && <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1 font-semibold text-brand-700"><Mail aria-hidden className="size-4" />{l.email}</a>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="space-y-6">
            {can("verify") && <DecisionPanel kind="group" id={g.id} status={g.status} />}
            <Card className="p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="h-section">Group health</h2>
                <p className="text-3xl font-bold num">{g.health.score}<span className="text-[15px] font-semibold text-ink-muted">/100</span></p>
              </div>
              <div className="mt-3 h-2.5 rounded-full bg-surface-alt" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.health.score} aria-label="Group health score">
                <div className={`h-2.5 rounded-full ${g.health.score >= 60 ? "bg-brand-600" : g.health.score >= 35 ? "bg-accent-500" : "bg-danger"}`} style={{ width: `${g.health.score}%` }} />
              </div>
              <ul className="mt-4 space-y-2 text-[14px]">
                {[
                  ["Verified members vs. estimate", g.health.parts.members, 30, `${fmt(g.verifiedMembers)} verified; about ${fmt(expected)} claimed`],
                  ["Activities in the last 30 days", g.health.parts.activity, 25],
                  ["Response to tasks", g.health.parts.tasks, 15],
                  ["Approved media", g.health.parts.media, 10],
                  ["Profile completeness", g.health.parts.profile, 12],
                  ["Online presence", g.health.parts.online, 8],
                ].map(([label, v, max, note]) => (
                  <li key={label} className="flex justify-between gap-3">
                    <span>{label}{note && <span className="block text-[13px] text-ink-muted">{note}</span>}</span>
                    <span className="num shrink-0 font-semibold">{v}/{max}</span>
                  </li>
                ))}
              </ul>
              <p className="t-help mt-3">Online presence and media add points, but their absence never blocks verification.</p>
            </Card>
          </div>
        </div>
      )}

      {tab === "members" && (
        <div className="space-y-4">
          <p className="text-[15px]"><strong className="num">{fmt(g.verifiedMembers)}</strong> verified of <strong className="num">{fmt(g.members.length)}</strong> joined · claimed size {labelOf(GROUP_SIZE, g.estimated_size_range)}</p>
          {pendingMembers.length > 0 && (can("approve_members") || can("verify")) && (
            <Card className="p-4">
              <h2 className="font-semibold">Waiting for the group to approve ({pendingMembers.length})</h2>
              <ul className="mt-2 divide-y divide-line">
                {pendingMembers.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{m.first_name} {m.surname} <span className="text-[13px] text-ink-muted">· {areaName(m.vote_ward_code)} · joined {timeAgo(m.created_at)}</span></span>
                    <span className="flex gap-2">
                      <ApiButton url={`/api/v1/volunteers/${m.id}/approve-member`} className="btn btn-primary btn-sm" doneLabel="Approved">Approve</ApiButton>
                      <ApiButton url={`/api/v1/volunteers/${m.id}/decline-member`} className="btn btn-ghost btn-sm" confirm="Remove this person from the group?" doneLabel="Removed">Not a member</ApiButton>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {g.members.length === 0 ? (
            <EmptyState title="No members yet">Share the join code {g.join_code} so members can register.</EmptyState>
          ) : (
            <Card className="overflow-x-auto">
              <table className="table-clean">
                <thead><tr><th>Name</th><th>Ward</th><th>Polling unit</th><th>PVC</th><th>Status</th></tr></thead>
                <tbody>
                  {g.members.map((m) => (
                    <tr key={m.id}>
                      <td><Link className="font-semibold text-brand-800 hover:underline" href={`/workspace/volunteers/${m.id}`}>{m.first_name} {m.surname}</Link><div className="text-[13px] text-ink-muted">{m.public_id}</div></td>
                      <td>{areaName(m.vote_ward_code)}</td>
                      <td className="text-[14px]">{m.vote_pu_code ? areaName(m.vote_pu_code) : <span className="text-warning">Not given</span>}</td>
                      <td>{labelOf(PVC_STATUS, m.pvc_status)}</td>
                      <td><StatusBadge status={m.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {tab === "online" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="h-section mb-3">Online mobilisation platforms</h2>
            {g.platforms.length === 0 ? (
              <p className="text-ink-muted">{g.has_online_platform === 0 ? "The group said it does not run an online platform." : "Not given. This step was optional."}</p>
            ) : (
              <ul className="space-y-3">
                {g.platforms.map((p) => (
                  <li key={p.id} className="rounded-xl border border-line p-3">
                    <p className="font-semibold">{p.platform_name ?? "Unnamed platform"}</p>
                    <p className="text-[14px] text-ink-muted">{p.platform_types.map((x) => labelOf(PLATFORM_TYPES, x)).join(", ")}</p>
                    <p className="mt-1 text-[14px]">Audience: <strong>{labelOf(AUDIENCE_RANGES, p.audience_range) || "not given"}</strong> · Activity: <strong>{labelOf(ACTIVITY_FREQUENCY, p.activity_frequency) || "not given"}</strong></p>
                    {p.link_url && !viewer.powers.includes("summary_only") && <p className="mt-1 text-[14px]"><Link2 aria-hidden className="mr-1 inline size-4" /><a className="link break-all" href={p.link_url} target="_blank" rel="noreferrer">{p.link_url}</a> <span className="text-ink-muted">(coordinators only)</span></p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="h-section mb-3">Website and social media</h2>
            {g.website_url || g.social.length ? (
              <ul className="space-y-2">
                {g.website_url && <li className="flex items-center gap-2"><Globe aria-hidden className="size-4 text-ink-muted" /><span className="w-24 text-[14px] text-ink-muted">Website</span><a className="link break-all" href={g.website_url} target="_blank" rel="noreferrer">{g.website_url.replace(/^https?:\/\//, "")}</a></li>}
                {g.social.map((s) => (
                  <li key={s.network + (s.url ?? s.handle)} className="flex items-center gap-2">
                    <Globe aria-hidden className="size-4 text-ink-muted" />
                    <span className="w-24 text-[14px] text-ink-muted">{s.network === "other" ? s.label ?? "Other" : SOCIAL_NETWORKS[s.network]?.label}</span>
                    {s.url ? <a className="link break-all" href={s.url} target="_blank" rel="noreferrer">{s.handle ? `@${s.handle}` : s.url}</a> : <span>{s.handle}</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-ink-muted">Not given. This step was optional.</p>}
          </Card>
        </div>
      )}

      {tab === "activities" && (
        <div className="space-y-3">
          {(can("log_activity")) && <Link href={`/workspace/activities/new?group=${g.id}`} className="btn btn-primary btn-sm"><CalendarCheck aria-hidden className="size-4" /> Report an activity</Link>}
          {g.activities.length === 0 ? <EmptyState icon={CalendarCheck} title="No activities logged yet">Activities the group reports will appear here.</EmptyState> : (
            <ul className="space-y-3">
              {g.activities.map((a) => (
                <li key={a.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="font-semibold">{a.title ?? labelOf(ACTIVITY_TYPES, a.type)} <span className="font-normal text-ink-muted">· {labelOf(ACTIVITY_TYPES, a.type)}</span></p>
                      <p className="text-[14px] text-ink-muted">{dateLabel(a.date)}</p>
                    </div>
                    <p className="mt-1 text-[14px] text-ink-muted"><MapPin aria-hidden className="mr-1 inline size-3.5" />{[a.ward_code && areaName(a.ward_code), areaName(a.lga_code)].filter(Boolean).join(", ")}</p>
                    <p className="mt-2 text-[14px] num">Attendance {fmt(a.attendance)}{a.households_reached ? ` · ${fmt(a.households_reached)} households` : ""} · {fmt(a.new_signups)} new volunteers</p>
                    {a.incident_type && a.incident_type !== "none" && <p className="mt-2 rounded-lg bg-danger-bg px-3 py-2 text-[14px] text-danger"><AlertTriangle aria-hidden className="mr-1 inline size-4" />Incident: {a.incident_type.replace("_", " ")}. {a.incident_details}</p>}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "gallery" && (g.media.length ? <MediaGrid items={g.media} canModerate={can("moderate_media")} canPublicity={can("publicity")} /> : <EmptyState icon={Images} title="No pictures yet">Add photos from your next meeting or outreach.</EmptyState>)}

      {tab === "tasks" && (
        g.tasks.length === 0 ? <EmptyState icon={ListTodo} title="No tasks assigned">Tasks coordinators assign to this group will appear here.</EmptyState> : (
          <ul className="space-y-3">
            {g.tasks.map((t) => (
              <li key={t.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="font-semibold">{t.title}</p>
                    <p className="text-[14px] text-ink-muted">Due {dateLabel(t.due_date)}</p>
                  </div>
                  {t.description && <p className="mt-1 text-[14px]">{t.description}</p>}
                  {t.target_value && (
                    <div className="mt-3">
                      <p className="text-[14px] num"><strong>{fmt(t.achieved)}</strong> of {fmt(t.target_value)} {t.target_unit}</p>
                      <div className="mt-1 h-2 rounded-full bg-surface-alt"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.min(100, (t.achieved / t.target_value) * 100)}%` }} /></div>
                    </div>
                  )}
                  {(can("report_task") || can("assign_tasks")) && <TaskReportForm taskId={t.id} unit={t.target_unit} />}
                </Card>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === "history" && (
        <Card className="overflow-x-auto">
          <table className="table-clean">
            <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
            <tbody>
              {g.history.map((h) => (
                <tr key={h.id}><td className="whitespace-nowrap text-[14px]">{dateLabel(h.timestamp, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td>{h.actor_name}</td><td>{h.action.replaceAll("_", " ")}</td></tr>
              ))}
              {g.consents.map((c) => (
                <tr key={c.consent_type + c.captured_at}><td className="whitespace-nowrap text-[14px]">{dateLabel(c.captured_at)}</td><td>Registrant</td><td>Consent ({c.consent_type}): {c.granted ? "given" : "not given"} · notice {c.notice_version} · {c.channel}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
