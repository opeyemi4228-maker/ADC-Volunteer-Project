import { redirect } from "next/navigation";

import { requireViewer } from "@/lib/guard";
import { all } from "@/lib/db";
import { open } from "@/lib/crypto";
import { scopeSql } from "@/lib/scope";
import { areaName, childAreas, statesInZone, stateList } from "@/lib/geo";
import { maskPhone } from "@/lib/validate";
import { isConsoleProvider } from "@/lib/notify";
import { APPROVAL_THRESHOLD } from "@/lib/messages";
import { Card, StatusBadge, fmt, dateLabel } from "@/components/ui";
import { PageHeader } from "@/components/workspace/ui";
import { ApiButton } from "@/components/workspace/actions";
import Composer from "./Composer";

export const metadata = { title: "Messages" };

function areaOptions(viewer) {
  const out = [];
  for (const r of viewer.roles) {
    if (r.role === "national_admin") out.push(...stateList.map((s) => ({ value: s.code, label: s.name })));
    if (r.role === "zonal_coordinator") out.push(...statesInZone(r.area_code).map((c) => ({ value: c, label: areaName(c) })));
    if (["state_coordinator", "lga_coordinator", "ward_coordinator"].includes(r.role)) {
      for (const c of childAreas(r.area_type, r.area_code).filter((c) => c.type !== "pu")) out.push({ value: c.code, label: c.name });
    }
  }
  return out;
}

export default async function MessagesPage() {
  const viewer = await requireViewer();
  if (!viewer.powers.includes("message")) redirect("/workspace");
  const s = scopeSql(viewer, "group", "g");
  const groups = all(`SELECT g.id, g.name FROM support_groups g WHERE g.status = 'verified' AND ${s.sql} ORDER BY g.name LIMIT 500`, s.params);
  const approver = viewer.powers.includes("approve_messages");
  const history = all(`SELECT * FROM messages WHERE created_by = :u OR :admin = 1 ORDER BY created_at DESC LIMIT 30`, { u: viewer.id, admin: approver ? 1 : 0 });
  const waiting = history.filter((m) => m.status === "awaiting_approval");
  const outbox = approver && isConsoleProvider
    ? all("SELECT channel, to_enc, template, body, status, created_at FROM outbox WHERE template IS NULL OR template != 'otp' ORDER BY created_at DESC LIMIT 15")
    : [];

  return (
    <>
      <PageHeader title="Messages" description={`Send SMS, WhatsApp or email to volunteers in your area. Only people who agreed to campaign messages receive them. Anything to more than ${fmt(APPROVAL_THRESHOLD)} people needs a second approver.`} />
      <div className="grid gap-8 xl:grid-cols-[1.25fr_1fr]">
        <Composer areas={areaOptions(viewer)} groups={groups} />
        <div className="space-y-8">
          {approver && waiting.length > 0 && (
            <section>
              <h2 className="h-section">Waiting for your approval</h2>
              <ul className="mt-3 space-y-3">
                {waiting.map((m) => (
                  <li key={m.id}>
                    <Card className="p-4">
                      <p className="text-[14px] text-ink-muted">{m.creator_name} · {m.channel.toUpperCase()} · {m.audience_label}</p>
                      <p className="mt-2 whitespace-pre-wrap text-[15px]">{m.body}</p>
                      <p className="mt-2 text-[14px] num"><strong>{fmt(m.recipient_count)}</strong> people · about ₦{fmt(m.estimated_cost)}</p>
                      <div className="mt-3 flex gap-2">
                        <ApiButton url={`/api/v1/messages/${m.id}/approve`} data={{ decision: "approve" }} className="btn btn-primary btn-sm" doneLabel="Sent">Approve and send</ApiButton>
                        <ApiButton url={`/api/v1/messages/${m.id}/approve`} data={{ decision: "cancel" }} className="btn btn-ghost btn-sm" doneLabel="Cancelled">Cancel</ApiButton>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h2 className="h-section">Sent</h2>
            {history.filter((m) => m.status !== "awaiting_approval").length === 0 ? (
              <p className="mt-2 text-ink-muted">No messages yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {history.filter((m) => m.status !== "awaiting_approval").map((m) => (
                  <li key={m.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-muted">
                      <span>{dateLabel(m.sent_at ?? m.created_at)} · {m.channel.toUpperCase()} · {m.creator_name}</span>
                      <StatusBadge status={m.status} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-[15px]">{m.body}</p>
                    <p className="mt-1 text-[13px] text-ink-muted num">{fmt(m.recipient_count)} people · {m.audience_label} · ₦{fmt(m.estimated_cost)}{m.approver_name ? ` · approved by ${m.approver_name}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {outbox.length > 0 && (
            <section>
              <h2 className="h-section">Outbox (development)</h2>
              <p className="t-help mt-1">SMS_PROVIDER is "console", so nothing leaves this computer. One-time codes are hidden.</p>
              <ul className="mt-3 space-y-2 text-[13px]">
                {outbox.map((o, i) => (
                  <li key={i} className="rounded-lg bg-surface-alt p-2.5"><span className="text-ink-muted">{o.channel} → {maskPhone(open(o.to_enc)) || "email"} · {dateLabel(o.created_at, { hour: "2-digit", minute: "2-digit" })}</span><br />{o.body}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
