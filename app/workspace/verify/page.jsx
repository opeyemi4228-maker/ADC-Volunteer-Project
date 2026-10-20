import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Phone, Images, Clock, ShieldCheck } from "lucide-react";

import { requireViewer } from "@/lib/guard";
import { all, scalar } from "@/lib/db";
import { open } from "@/lib/crypto";
import { groupRows, volunteerRows } from "@/lib/workspace-data";
import { scopeSql } from "@/lib/scope";
import { areaName } from "@/lib/geo";
import { ageOn, formatPhone } from "@/lib/validate";
import { GROUP_CATEGORIES, OPERATING_LEVELS, GROUP_SIZE, VOLUNTEER_ROLES, PVC_STATUS, labelOf } from "@/lib/options";
import { Card, EmptyState, StatusBadge, timeAgo, dateLabel } from "@/components/ui";
import { PageHeader, Tabs, Pagination, withParams } from "@/components/workspace/ui";
import { DecisionPanel, ApiButton } from "@/components/workspace/actions";

export const metadata = { title: "Verification" };

const CHANNEL = { web: "Website", whatsapp: "WhatsApp", ussd: "USSD", field_agent: "Field agent" };

function Waiting({ since }) {
  const days = Math.floor((Date.now() - Date.parse(`${since.replace(" ", "T")}Z`)) / 86400000);
  const late = days >= 7;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${late ? "bg-danger-bg text-danger" : "bg-surface-alt text-ink-muted"}`}>
      <Clock aria-hidden className="size-3.5" /> {late ? `Waiting ${days} days (over target)` : `Waiting ${days ? `${days} day${days === 1 ? "" : "s"}` : "since today"}`}
    </span>
  );
}

function Flags({ flags, kind, id }) {
  if (!flags.length) return null;
  return (
    <div className="rounded-xl border border-warning/30 bg-warning-bg p-3">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-warning"><AlertTriangle aria-hidden className="size-4" /> Possible duplicate</p>
      <ul className="mt-2 space-y-2">
        {flags.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
            <span>
              {f.reason}{" "}
              <Link className="link" href={`/workspace/${kind === "group" ? "groups" : "volunteers"}/${f.other_id}`}>Compare</Link>
            </span>
            <ApiButton url={`/api/v1/${kind === "group" ? "groups" : "volunteers"}/${id}/resolve-flag`} data={{ flagId: f.id }} className="btn btn-ghost btn-sm" doneLabel="Marked not a duplicate">
              Not a duplicate
            </ApiButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function VerifyPage({ searchParams }) {
  const viewer = await requireViewer();
  if (!viewer.powers.includes("verify")) redirect("/workspace");
  const sp = await searchParams;
  const tab = "volunteers";
  const page = Number(sp.page) || 1;

  const vs = scopeSql(viewer, "volunteer");
  const volCount = scalar(`SELECT COUNT(*) FROM volunteers WHERE status IN ('pending','info_requested') AND ${vs.sql}`, vs.params);

  const list = tab === "groups" ? groupRows(viewer, { queue: 1, page, area: sp.area }) : volunteerRows(viewer, { queue: 1, page, area: sp.area, flagged: sp.flagged });
  const ids = list.rows.map((r) => r.id);
  const inList = ids.map((_, i) => `:i${i}`).join(",") || "''";
  const idParams = Object.fromEntries(ids.map((id, i) => [`i${i}`, id]));
  const flags = all(`SELECT * FROM duplicate_flags WHERE resolved_at IS NULL AND entity_type = :t AND entity_id IN (${inList})`, { t: tab === "groups" ? "group" : "volunteer", ...idParams });
  const leaders = tab === "groups" ? all(`SELECT group_id, position, first_name, surname, phone_enc FROM group_leaders WHERE group_id IN (${inList}) ORDER BY sort`, idParams) : [];
  const media = tab === "groups" ? all(`SELECT id, group_id, kind, event_name FROM media_items WHERE kind = 'photo' AND group_id IN (${inList})`, idParams) : [];
  const vRows = tab === "volunteers" ? all(`SELECT id, date_of_birth, phone_enc, phone_verified_at FROM volunteers WHERE id IN (${inList})`, idParams) : [];
  const vMap = new Map(vRows.map((v) => [v.id, v]));

  return (
    <>
      <PageHeader
        title="Verification"
        description="Oldest first. Confirm each record by phone, in person, or because you know them. Target: nobody waits more than 7 days."
      />
      <Tabs
        current={tab}
        tabs={[
          { key: "volunteers", label: "Volunteers", count: volCount, href: "/workspace/verify?tab=volunteers" },
        ]}
      />
      {tab === "volunteers" && (
        <div className="mb-4 flex flex-wrap gap-2 text-[14px]">
          <Link href="/workspace/verify?tab=volunteers" className="chip" aria-pressed={!sp.flagged}>All waiting</Link>
          <Link href="/workspace/verify?tab=volunteers&flagged=1" className="chip" aria-pressed={Boolean(sp.flagged)}>Possible duplicates only</Link>
        </div>
      )}

      {list.rows.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Nothing to verify">New registrations in your area will appear here.</EmptyState>
      ) : (
        <ul className="space-y-4">
          {list.rows.map((r) => {
            const f = flags.filter((x) => x.entity_id === r.id);
            if (tab === "groups") {
              const ls = leaders.filter((l) => l.group_id === r.id);
              const pics = media.filter((m) => m.group_id === r.id);
              return (
                <li key={r.id}>
                  <Card className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/workspace/groups/${r.id}`} className="inline-flex min-h-10 items-center break-words text-[17px] font-bold hover:underline">{r.name}</Link>
                          <StatusBadge status={r.status} />
                        </div>
                        <p className="mt-0.5 text-[14px] text-ink-muted">
                          {r.public_id} · {labelOf(GROUP_CATEGORIES, r.category)} · {labelOf(OPERATING_LEVELS, r.operating_level)} level · {labelOf(GROUP_SIZE, r.estimated_size_range)} members (claimed)
                        </p>
                        <p className="text-[14px]">{r.place}</p>
                      </div>
                      <Waiting since={r.created_at} />
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {ls.slice(0, 2).map((l) => {
                        const phone = open(l.phone_enc);
                        return (
                          <div key={l.position + l.first_name} className="flex items-center justify-between gap-2 rounded-lg bg-surface-alt px-3 py-2 text-[14px]">
                            <span><span className="font-semibold">{l.first_name} {l.surname}</span> <span className="text-ink-muted">· {l.position.replace("_", " ")}</span></span>
                            {phone && <a href={`tel:${phone}`} className="inline-flex min-h-10 items-center gap-1 font-semibold text-brand-700"><Phone aria-hidden className="size-4" /> {formatPhone(phone)}</a>}
                          </div>
                        );
                      })}
                    </div>
                    {pics.length > 0 && (
                      <div className="mt-3 flex items-center gap-2">
                        <Images aria-hidden className="size-4 text-ink-muted" />
                        <div className="flex gap-2 overflow-x-auto">
                          {pics.slice(0, 5).map((m) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={m.id} src={`/api/v1/media/${m.id}/file?size=thumb`} alt={m.event_name ?? "Group photo"} className="size-16 rounded-lg object-cover" loading="lazy" />
                          ))}
                        </div>
                      </div>
                    )}
                    {r.status === "info_requested" && <p className="mt-3 text-[14px] text-info">More information was requested. Waiting for the group to respond.</p>}
                    <div className="mt-3 space-y-3">
                      <Flags flags={f} kind="group" id={r.id} />
                      <DecisionPanel kind="group" id={r.id} status={r.status} compact />
                    </div>
                  </Card>
                </li>
              );
            }
            const v = vMap.get(r.id);
            const phone = open(v?.phone_enc);
            return (
              <li key={r.id}>
                <Card className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/workspace/volunteers/${r.id}`} className="inline-flex min-h-10 items-center break-words text-[17px] font-bold hover:underline">{r.first_name} {r.middle_name ? `${r.middle_name} ` : ""}{r.surname}</Link>
                        <StatusBadge status={r.status} />
                        {!r.phone_verified_at && <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[12px] font-semibold text-warning">Phone not confirmed</span>}
                      </div>
                      <p className="mt-0.5 text-[14px] text-ink-muted">
                        {r.public_id} · {v ? `${ageOn(v.date_of_birth)} years` : ""} · {r.gender === "undisclosed" ? "gender not given" : r.gender} · via {CHANNEL[r.registration_channel] ?? r.registration_channel} · {timeAgo(r.created_at)}
                      </p>
                    </div>
                    <Waiting since={r.created_at} />
                  </div>
                  <dl className="mt-3 grid gap-x-6 gap-y-2 text-[14px] sm:grid-cols-2 lg:grid-cols-4 [&>div]:min-w-0 [&_dd]:break-words">
                    <div><dt className="text-ink-muted">Votes in</dt><dd className="font-medium">{r.place}</dd></div>
                    <div><dt className="text-ink-muted">Polling unit</dt><dd className="font-medium">{r.vote_pu_code ? areaName(r.vote_pu_code) : <span className="text-warning">Not given</span>}</dd></div>
                    <div><dt className="text-ink-muted">PVC</dt><dd className="font-medium">{labelOf(PVC_STATUS, r.pvc_status)}</dd></div>
                    <div className="sm:col-span-2 lg:col-span-3"><dt className="text-ink-muted">Can help as</dt><dd className="font-medium">{r.roles.map((x) => labelOf(VOLUNTEER_ROLES, x)).join(", ")}</dd></div>
                    <div><dt className="text-ink-muted">Phone</dt><dd>{phone && <a href={`tel:${phone}`} className="inline-flex min-h-10 items-center gap-1 font-semibold text-brand-700"><Phone aria-hidden className="size-4" />{formatPhone(phone)}</a>}</dd></div>
                  </dl>
                  <div className="mt-3 space-y-3">
                    <Flags flags={f} kind="volunteer" id={r.id} />
                    <DecisionPanel kind="volunteer" id={r.id} status={r.status} compact />
                  </div>
                  <p className="sr-only">Registered {dateLabel(r.created_at)}</p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={list.page} pages={list.pages} total={list.total} hrefFor={(p) => withParams("/workspace/verify", { tab, flagged: sp.flagged }, { page: p })} />
    </>
  );
}
