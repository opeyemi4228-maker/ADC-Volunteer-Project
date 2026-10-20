import Link from "next/link";
import { headers } from "next/headers";
import { Check, Clock, CircleHelp, XCircle, Download, Users, ShieldCheck, ArrowRight } from "lucide-react";

import { all, one, scalar } from "@/lib/db";
import { open } from "@/lib/crypto";
import { placeLabel } from "@/lib/geo";
import { GROUP_CATEGORIES, labelOf } from "@/lib/options";
import { Card, StatusBadge, dateLabel, fmt, cx } from "@/components/ui";
import { InviteBox, LogoUpdate, MembershipUpdate } from "./GroupHomeClient";
import UpdateComposer from "./UpdateComposer";
import { ACTIVITY_TYPES } from "@/lib/options";

/**
 * The dashboard a support group sees after signing in with its email and
 * password. It answers, in order: where is our approval, where is our
 * certificate, and what can we do now (post photos, invite members, keep the
 * membership list up to date).
 */
export default async function GroupHome({ viewer, groupId }) {
  const g = one("SELECT * FROM support_groups WHERE id = :id", { id: groupId });
  if (!g) return <p>Group not found.</p>;
  const account = one("SELECT email_enc FROM users WHERE id = :id", { id: viewer.id });
  const email = open(account?.email_enc);
  const members = one(
    `SELECT COUNT(*) AS joined, SUM(status = 'verified') AS verified, SUM(group_status = 'pending') AS waiting FROM volunteers WHERE group_id = :g`,
    { g: g.id },
  );
  const activities = scalar("SELECT COUNT(*) FROM activities WHERE group_id = :g", { g: g.id });
  const updates = all("SELECT id, type, title, description, date, attendance, households_reached, created_at FROM activities WHERE group_id = :g ORDER BY date DESC, created_at DESC LIMIT 10", { g: g.id });
  const media = updates.length
    ? all(`SELECT id, owner_id, kind, moderation_status FROM media_items WHERE owner_type = 'activity' AND owner_id IN (${updates.map((_, i) => `:u${i}`).join(",")})`, Object.fromEntries(updates.map((u, i) => [`u${i}`, u.id])))
    : [];
  const listFile = g.membership_upload_id ? one("SELECT mime, created_at FROM uploads WHERE id = :id", { id: g.membership_upload_id }) : null;
  const verified = g.status === "verified";
  const h = await headers();
  const origin = process.env.SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  const steps = [
    { label: "Registered", done: true, when: dateLabel(g.created_at) },
    { label: "Under review", done: verified, current: ["pending", "info_requested"].includes(g.status) },
    { label: "Approved", done: verified, when: verified ? dateLabel(g.verified_at) : null },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center gap-4">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface-alt">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {g.logo_key ? <img src={`/api/v1/groups/${g.id}/logo`} alt="" className="size-full object-cover" /> : <Users aria-hidden className="size-7 text-ink-muted" />}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="h-page">{g.name}</h1>
          <p className="mt-0.5 text-[15px] text-ink-muted">{g.public_id} · {labelOf(GROUP_CATEGORIES, g.category)} · {placeLabel(g)}</p>
        </div>
        <StatusBadge status={g.status} className="!text-[14px]" />
      </header>

      {/* Approval and certificate: the reason most people sign in. */}
      <Card className="p-5 sm:p-7">
        <ol className="grid gap-3 sm:grid-cols-3" aria-label="Registration progress">
          {steps.map((st, i) => (
            <li key={st.label} className="flex items-center gap-3">
              <span className={cx("grid size-8 shrink-0 place-items-center rounded-full text-[14px] font-bold", st.done ? "bg-brand-700 text-white" : st.current ? "border-2 border-brand-700 text-brand-800" : "border border-line text-ink-muted")}>
                {st.done ? <Check aria-hidden className="size-4" strokeWidth={3} /> : i + 1}
              </span>
              <span>
                <span className={cx("block text-[15px] font-semibold", !st.done && !st.current && "text-ink-muted")}>{st.label}</span>
                {st.when && <span className="block text-[13px] text-ink-muted">{st.when}</span>}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-6 border-t border-line pt-6">
          {verified && (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <ShieldCheck aria-hidden className="mt-0.5 size-6 shrink-0 text-success" />
                <div>
                  <p className="text-[17px] font-semibold">Your group is approved. Your certificate is ready.</p>
                  <p className="mt-1 text-[14px] text-ink-muted">
                    {g.certificate_no ? `Certificate No. ${g.certificate_no}. ` : ""}Anyone can check it is genuine by scanning its QR code, or at{" "}
                    <Link className="link" href={`/verify/${g.public_id}`}>/verify/{g.public_id}</Link>.
                  </p>
                </div>
              </div>
              <a href={`/api/v1/groups/${g.id}/certificate`} className="btn btn-primary btn-lg"><Download aria-hidden className="size-5" /> Download certificate (PDF)</a>
            </div>
          )}
          {g.status === "pending" && (
            <p className="flex items-start gap-3 text-[15px]">
              <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
              <span>A coordinator for your area is reviewing your registration, usually within 7 days. We&apos;ll email {email ? <strong>{email}</strong> : "you"} as soon as it&apos;s approved, and your certificate will appear here.</span>
            </p>
          )}
          {g.status === "info_requested" && (
            <div className="flex items-start gap-3 text-[15px]">
              <CircleHelp aria-hidden className="mt-0.5 size-5 shrink-0 text-info" />
              <div>
                <p className="font-semibold">Your coordinator needs a little more information.</p>
                {g.status_reason && <p className="mt-1">&ldquo;{g.status_reason}&rdquo;</p>}
                <p className="mt-1 text-ink-muted">Reply to the email we sent, or contact your ward coordinator.</p>
              </div>
            </div>
          )}
          {["rejected", "suspended"].includes(g.status) && (
            <p className="flex items-start gap-3 text-[15px]">
              <XCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
              <span>{g.status === "rejected" ? "This registration was not approved." : "This group is suspended."} {g.status_reason && <>Reason: {g.status_reason}</>}</span>
            </p>
          )}
        </div>
      </Card>

      {/* Post updates on the group's work: the main reason to come back. */}
      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <UpdateComposer group={{ id: g.id, state_code: g.state_code, lga_code: g.lga_code, ward_code: g.ward_code }} />
        <section aria-labelledby="updates" className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="updates" className="h-section">Your updates</h2>
            <span className="text-[14px] text-ink-muted num">{fmt(activities)} posted</span>
          </div>
          {updates.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-6 text-[15px] text-ink-muted">Nothing posted yet. Your first update shows coordinators your group is active.</p>
          ) : (
            <ol className="divide-y divide-line border-y border-line">
              {updates.map((u) => {
                const pics = media.filter((m) => m.owner_id === u.id);
                return (
                  <li key={u.id} className="py-4">
                    <p className="text-[13px] text-ink-muted">{dateLabel(u.date)} · {labelOf(ACTIVITY_TYPES, u.type)}{u.attendance ? ` · ${fmt(u.attendance)} people` : ""}{u.households_reached ? ` · ${fmt(u.households_reached)} homes` : ""}</p>
                    <p className="mt-1 whitespace-pre-line text-[15px]">{u.description ?? u.title}</p>
                    {pics.length > 0 && (
                      <ul className="mt-2 flex gap-2 overflow-x-auto">
                        {pics.map((m) => (
                          <li key={m.id} className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-surface-alt">
                            {m.kind === "photo" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`/api/v1/media/${m.id}/file?size=thumb`} alt="" className="size-full object-cover" loading="lazy" />
                            ) : <span className="grid size-full place-items-center text-[12px] text-ink-muted">{m.kind}</span>}
                            {m.moderation_status === "pending" && <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[10px] font-semibold text-white">In review</span>}
                            {m.moderation_status === "rejected" && <span className="absolute inset-x-0 bottom-0 bg-danger py-0.5 text-center text-[10px] font-semibold text-white">Not approved</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <Link href={`/workspace/groups/${g.id}?tab=gallery`} className="inline-flex items-center gap-1 text-[15px] font-semibold text-brand-700">See all photos <ArrowRight aria-hidden className="size-4" /></Link>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h2 className="h-section">Invite members</h2>
          <p className="mt-1 text-[15px] text-ink-muted">Members register as volunteers with your code. You approve them here.</p>
          <InviteBox code={g.join_code} origin={origin} />
          <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4">
            <div><dt className="text-[13px] text-ink-muted">Joined</dt><dd className="text-2xl font-bold num">{fmt(members.joined)}</dd></div>
            <div><dt className="text-[13px] text-ink-muted">Verified</dt><dd className="text-2xl font-bold num">{fmt(members.verified ?? 0)}</dd></div>
            <div><dt className="text-[13px] text-ink-muted">Waiting for you</dt><dd className={cx("text-2xl font-bold num", members.waiting ? "text-warning" : "")}>{fmt(members.waiting ?? 0)}</dd></div>
          </dl>
          {members.waiting > 0 && <Link href="/workspace/volunteers" className="mt-3 inline-flex items-center gap-1 text-[15px] font-semibold text-brand-700">Approve members <ArrowRight aria-hidden className="size-4" /></Link>}
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="h-section">Membership list</h2>
          <p className="mt-1 text-[15px] text-ink-muted">
            {listFile
              ? g.membership_count != null
                ? `${fmt(g.membership_count)} members from your ${listFile.mime.includes("xml") ? "XML" : "CSV"} file, uploaded ${dateLabel(listFile.created_at)}.`
                : `PDF uploaded ${dateLabel(listFile.created_at)}. Coordinators can open it.`
              : "No list yet. Upload a CSV, PDF or XML file of your members."}
          </p>
          <MembershipUpdate groupId={g.id} hasList={Boolean(listFile)} />
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="h-section">Group logo</h2>
          <p className="mt-1 text-[15px] text-ink-muted">It appears on your certificate and your public group page.</p>
          <LogoUpdate groupId={g.id} hasLogo={Boolean(g.logo_key)} />
        </Card>
      </div>

      <p className="text-[14px] text-ink-muted">
        Signed in as {email || viewer.name}. <Link href={`/workspace/groups/${g.id}`} className="link">Full group profile</Link> · <Link href="/reset" className="link">Change password</Link>
      </p>
    </div>
  );
}
