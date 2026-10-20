import Link from "next/link";
import { notFound } from "next/navigation";
import { Phone, Mail, MessageCircle, AlertTriangle } from "lucide-react";

import { getViewer, clientIp } from "@/lib/auth";
import { getVolunteer } from "@/lib/workspace-data";
import { audit } from "@/lib/audit";
import { ageOn } from "@/lib/validate";
import { METHODS } from "@/lib/verify";
import { VOLUNTEER_ROLES, LANGUAGES, AVAILABILITY, CONTACT_CHANNELS, PVC_STATUS, GENDERS, labelOf } from "@/lib/options";
import { Card, StatusBadge, dateLabel } from "@/components/ui";
import { PageHeader, DefList } from "@/components/workspace/ui";
import { DecisionPanel, ApiButton } from "@/components/workspace/actions";

export const metadata = { title: "Volunteer" };

const CHANNEL = { web: "Website", whatsapp: "WhatsApp", ussd: "USSD", field_agent: "Field agent" };

export default async function VolunteerProfile({ params }) {
  const viewer = await getViewer();
  const { id } = await params;
  const v = getVolunteer(viewer, id);
  if (!v) notFound();
  audit(viewer, "view", "volunteer", v.id, null, await clientIp());
  const can = (p) => viewer.powers.includes(p);
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
      {v.deletion_requested_at && <p className="mb-4 rounded-xl bg-info-bg p-3 text-[14px] text-info">This person asked for their data to be deleted on {dateLabel(v.deletion_requested_at)}. The data protection officer is handling it.</p>}

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
                  ["Support group", v.group ? <Link key="g" className="link" href={`/workspace/groups/${v.group.id}`}>{v.group.name}</Link> : "Not in a group (ward pool)"],
                  v.group && ["Group approval", v.group_status === "approved" ? "Approved by the group" : "Waiting for the group"],
                  v.social.length > 0 && ["Social media", v.social.map((s) => `${s.network}: ${s.handle}`).join(" · ")],
                  v.agent.length > 0 && ["Polling unit agent", v.agent.map((a) => `${a.is_backup ? "Backup" : "Primary"} at ${a.pu_code} · accreditation ${a.accreditation_status.replace("_", " ")}`).join("; ")],
                ]}
              />
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          {can("verify") && <DecisionPanel kind="volunteer" id={v.id} status={v.status} />}
          {v.group && v.group_status === "pending" && (can("approve_members") || can("verify")) && (
            <Card className="p-4">
              <p className="font-semibold">Joined {v.group.name}</p>
              <p className="text-[14px] text-ink-muted">The group has not approved this member yet.</p>
              <div className="mt-3"><ApiButton url={`/api/v1/volunteers/${v.id}/approve-member`} className="btn btn-primary btn-sm" doneLabel="Approved">Approve member</ApiButton></div>
            </Card>
          )}
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
    </>
  );
}
