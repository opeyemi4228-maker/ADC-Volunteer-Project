import Link from "next/link";
import { notFound } from "next/navigation";
import { Phone, Mail, MessageCircle, AlertTriangle } from "lucide-react";

import { clientIp } from "@/lib/auth";
import { requireViewer } from "@/lib/guard";
import { getVolunteer } from "@/lib/workspace-data";
import { audit } from "@/lib/audit";
import { ageOn } from "@/lib/validate";
import { METHODS } from "@/lib/verify";
import { VOLUNTEER_ROLES, LANGUAGES, AVAILABILITY, CONTACT_CHANNELS, PVC_STATUS, GENDERS, ACTIVITY_TYPES, labelOf } from "@/lib/options";
import { Card, StatusBadge, dateLabel, fmt, timeAgo } from "@/components/ui";
import { PageHeader, DefList } from "@/components/workspace/ui";
import { DecisionPanel, ApiButton } from "@/components/workspace/actions";
import AccountControl from "@/components/workspace/AccountControl";
import { volunteerActivity } from "@/lib/volunteer-portal";

export const metadata = { title: "Volunteer" };

const CHANNEL = { web: "Website", whatsapp: "WhatsApp", ussd: "USSD", field_agent: "Field agent" };

export default async function VolunteerProfile({ params }) {
  const viewer = await requireViewer();
  const { id } = await params;
  const v = await getVolunteer(viewer, id);
  if (!v) notFound();
  await audit(viewer, "view", "volunteer", v.id, null, await clientIp());
  const can = (p) => viewer.powers.includes(p);
  const act = await volunteerActivity(v.id);
  const REVIEW = { submitted: ["pending", "Waiting for review"], approved: ["approved", "Accepted"], rejected: ["rejected", "Not accepted"] };
  const flags = v.flags.filter((f) => !f.resolved_at);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Volunteers", href: "/workspace/volunteers" }, { label: `${v.first_name} ${v.surname}` }]}
        title={`${v.first_name} ${v.middle_name ? `${v.middle_name} ` : ""}${v.surname}`}
        description={`${v.public_id} · ${v.place}`}
        actions={<StatusBadge status={v.status} className="!text-[14px]" />}
      />

      {flags.length > 0 && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning-bg p-4">
          <p className="flex items-center gap-2 font-semibold text-warning"><AlertTriangle aria-hidden className="size-4" /> Possible duplicate</p>
          <ul className="mt-2 space-y-2 text-[14px]">
            {flags.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{f.reason}. <Link className="link" href={`/workspace/volunteers/${f.other_id}`}>Open {f.other_public_id}</Link></span>
                {can("verify") && <ApiButton url={`/api/v1/volunteers/${v.id}/resolve-flag`} data={{ flagId: f.id }} doneLabel="Resolved">Not a duplicate</ApiButton>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {v.deletion_requested_at && <p className="mb-4 rounded-xl bg-info-bg p-3 text-[14px] text-info">This person asked for their data to be deleted on {dateLabel(v.deletion_requested_at)}. It is in Data requests.</p>}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="h-section mb-4">About</h2>
            <DefList
              items={[
                ["Gender", labelOf(GENDERS, v.gender)],
                ["Age", `${ageOn(v.date_of_birth)} (born ${dateLabel(v.date_of_birth)})`],
                ["Occupation", v.occupation],
                ["Phone", v.phoneE164 ? <a key="p" href={`tel:${v.phoneE164}`} className="inline-flex items-center gap-1 font-semibold text-brand-700"><Phone aria-hidden className="size-4" />{v.phone}</a> : v.phone],
                ["Phone confirmed", v.phone_verified_at ? `Yes, ${dateLabel(v.phone_verified_at)}` : "No. Confirm by calling before verifying."],
                ["Email", v.email ? <a key="e" href={`mailto:${v.email}`} className="inline-flex items-center gap-1 font-semibold text-brand-700"><Mail aria-hidden className="size-4" />{v.email}</a> : ""],
                ["Best way to reach", labelOf(CONTACT_CHANNELS, v.preferred_channel)],
                ["Registered", `${dateLabel(v.created_at)} via ${CHANNEL[v.registration_channel] ?? v.registration_channel}`],
                v.verified_at && ["Verified", `${dateLabel(v.verified_at)} · ${METHODS[v.verification_method] ?? ""}`],
                v.status_reason && ["Note", v.status_reason],
              ]}
            />
            {v.phoneE164 && (
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={`tel:${v.phoneE164}`} className="btn btn-secondary btn-sm"><Phone aria-hidden className="size-4" /> Call</a>
                <a href={`https://wa.me/${v.phoneE164.slice(1)}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm"><MessageCircle aria-hidden className="size-4" /> WhatsApp</a>
              </div>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="h-section mb-4">Where they vote</h2>
            <DefList
              items={[
                ["State, LGA, ward", v.place],
                ["Polling unit", v.vote_pu_code ? `${v.pu_name} (${v.vote_pu_code})` : <span key="n" className="text-warning">Not given. Ask them to check their PVC.</span>],
                ["Lives in", v.residence ?? "Same as where they vote"],
                ["PVC", labelOf(PVC_STATUS, v.pvc_status)],
                ["PVC reminder", v.pvc_reminder ? "Asked for a reminder" : "No"],
              ]}
            />
          </Card>
          <Card className="p-5">
            <h2 className="h-section mb-4">How they can help</h2>
            <div className="flex flex-wrap gap-2">
              {v.roles.map((r) => <span key={r} className="rounded-full bg-brand-50 px-3 py-1 text-[14px] font-semibold text-brand-800">{labelOf(VOLUNTEER_ROLES, r)}</span>)}
            </div>
            <div className="mt-4">
              <DefList
                items={[
                  ["Languages", v.languages.map((l) => labelOf(LANGUAGES, l)).join(", ")],
                  ["Availability", labelOf(AVAILABILITY, v.availability)],
                  ["Smartphone", v.has_smartphone == null ? "" : v.has_smartphone ? "Yes" : "No"],
                  v.social.length > 0 && ["Social media", v.social.map((s) => `${s.network}: ${s.handle}`).join(" · ")],
                  v.agent.length > 0 && ["Polling unit agent", v.agent.map((a) => `${a.is_backup ? "Backup" : "Primary"} at ${a.pu_code} · accreditation ${a.accreditation_status.replace("_", " ")}`).join("; ")],
                ]}
              />
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          {can("verify") && <DecisionPanel kind="volunteer" id={v.id} status={v.status} />}
          <Card className="p-5">
            <h2 className="h-section mb-1">Sign-in account</h2>
            {act.account ? (
              <>
                <p className="text-[14px] text-ink-muted">
                  {act.account.active ? "Active" : <span className="font-semibold text-danger">Suspended</span>}
                  {" · "}{act.account.last_signin_at ? `last signed in ${timeAgo(act.account.last_signin_at)}` : "has not signed in yet"}
                </p>
                {can("manage_volunteers") && <div className="mt-3"><AccountControl volunteerId={v.id} active={Boolean(act.account.active)} /></div>}
              </>
            ) : <p className="text-[14px] text-ink-muted">Registered by USSD, WhatsApp or a field agent, so there is no sign-in account.</p>}
          </Card>
          <Card className="p-5">
            <h2 className="h-section mb-3">Consent and history</h2>
            <ul className="space-y-2 text-[14px]">
              {v.consents.map((c) => (
                <li key={c.consent_type}>{c.consent_type === "messaging" ? "Campaign messages" : c.consent_type === "data" ? "Data use" : "Accuracy"}: <strong>{c.granted ? "yes" : "no"}</strong> <span className="text-ink-muted">· {c.channel} · notice {c.notice_version}</span></li>
              ))}
            </ul>
            <ul className="mt-4 space-y-1 border-t border-line pt-3 text-[13px] text-ink-muted">
              {v.history.slice(0, 12).map((h) => <li key={h.id}>{dateLabel(h.timestamp)} · {h.actor_name} · {h.action.replaceAll("_", " ")}</li>)}
            </ul>
          </Card>
        </div>
      </div>

      <section aria-labelledby="activity" className="mt-8">
        <h2 id="activity" className="h-section">Activity</h2>
        <p className="t-help mt-0.5">What this volunteer has done: task reports, activities, photos and the messages they received.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Task reports", act.reports.length],
            ["Activities", act.activities.length],
            ["Photos and videos", act.media.length],
            ["Messages received", act.messages.length],
          ].map(([label, n]) => (
            <div key={label} className="card p-4"><p className="text-[13px] text-ink-muted">{label}</p><p className="mt-1 text-[24px] font-bold">{fmt(n)}{n >= 20 ? "+" : ""}</p></div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Card className="p-5">
            <h3 className="text-[15px] font-bold">Task reports</h3>
            {act.reports.length === 0 ? <p className="mt-2 text-[14px] text-ink-muted">None yet.</p> : (
              <ul className="mt-2 divide-y divide-line">
                {act.reports.map((r) => (
                  <li key={r.id} className="py-2 text-[14px]">
                    <Link href="/workspace/tasks" className="font-semibold hover:underline">{r.title}</Link>: {fmt(r.achieved_value)}{r.target_unit ? ` ${r.target_unit}` : ""}
                    {r.media > 0 && <span className="text-ink-muted"> · {r.media} photo{r.media === 1 ? "" : "s"}</span>}
                    <span className="text-ink-muted"> · {timeAgo(r.created_at)}</span>
                    {r.notes && <span className="block text-[13px] text-ink-muted">“{r.notes}”</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <h3 className="text-[15px] font-bold">Activities reported</h3>
            {act.activities.length === 0 ? <p className="mt-2 text-[14px] text-ink-muted">None yet.</p> : (
              <ul className="mt-2 divide-y divide-line">
                {act.activities.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[14px]">
                    <span><span className="font-semibold">{a.title || labelOf(ACTIVITY_TYPES, a.type)}</span> <span className="text-ink-muted">· {dateLabel(a.date)} · {a.place}</span></span>
                    <StatusBadge status={REVIEW[a.review_status]?.[0] ?? "pending"} label={REVIEW[a.review_status]?.[1]} />
                  </li>
                ))}
              </ul>
            )}
            {act.activities.some((a) => a.review_status === "submitted") && <Link href="/workspace/activities?review=submitted" className="link mt-2 inline-block text-[14px]">Review in Activities</Link>}
          </Card>
          <Card className="p-5">
            <h3 className="text-[15px] font-bold">Photos and videos</h3>
            {act.media.length === 0 ? <p className="mt-2 text-[14px] text-ink-muted">None yet.</p> : (
              <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {act.media.map((m) => (
                  <li key={m.id} className="overflow-hidden rounded-lg border border-line">
                    {m.kind === "photo"
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={`/api/v1/media/${m.id}/file?size=thumb`} alt={m.event_name ?? "Photo"} className="aspect-square w-full object-cover" loading="lazy" />
                      : <div className="grid aspect-square place-items-center bg-surface-alt text-[12px] text-ink-muted">{m.kind}</div>}
                    <p className="truncate px-1.5 py-1 text-[11px] text-ink-muted">{m.moderation_status === "pending" ? "Waiting" : m.moderation_status === "rejected" ? "Not accepted" : "Accepted"}</p>
                  </li>
                ))}
              </ul>
            )}
            {act.media.some((m) => m.moderation_status === "pending") && <Link href="/workspace/media?status=pending" className="link mt-2 inline-block text-[14px]">Review in Media library</Link>}
          </Card>
          <Card className="p-5">
            <h3 className="text-[15px] font-bold">Messages received</h3>
            {act.messages.length === 0 ? <p className="mt-2 text-[14px] text-ink-muted">None yet.</p> : (
              <ul className="mt-2 divide-y divide-line">
                {act.messages.map((m) => (
                  <li key={m.id} className="py-2 text-[14px]">
                    <span className="line-clamp-2">{m.body}</span>
                    <span className="text-[12px] text-ink-muted">{m.channel.toUpperCase()} · {timeAgo(m.sent_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>
    </>
  );
}
