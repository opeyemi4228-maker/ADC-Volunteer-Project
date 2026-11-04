import { redirect } from "next/navigation";

import { requireViewer } from "@/lib/guard";
import { all, scalar, getSetting } from "@/lib/db";
import { isConsoleProvider } from "@/lib/notify";
import { Card } from "@/components/ui";
import { PageHeader, Tabs, Pagination, withParams } from "@/components/workspace/ui";
import ElectionSwitch from "./ElectionSwitch";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }) {
  const viewer = await requireViewer();
  if (!viewer.powers.includes("audit")) redirect("/workspace");
  const sp = await searchParams;
  const admin = viewer.powers.includes("manage_users");
  // People and positions moved to their own page, Team and positions.
  if (["users", "positions"].includes(sp.tab)) redirect(sp.tab === "positions" ? "/workspace/team?tab=access" : "/workspace/team");
  const tab = sp.tab === "system" && admin ? "system" : "audit";
  const tabs = [
    { key: "audit", label: "Audit log", href: "/workspace/settings?tab=audit" },
    admin && { key: "system", label: "System", href: "/workspace/settings?tab=system" },
  ].filter(Boolean);

  return (
    <>
      <PageHeader title="Settings" />
      <Tabs tabs={tabs} current={tab} />
      {tab === "audit" && <Audit sp={sp} />}
      {tab === "system" && admin && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="h-section">Election day</h2>
            <p className="mt-1 text-[15px] text-ink-muted">When on, agents can check in, send results and report incidents. Switch it on on the morning of the election (and for rehearsals).</p>
            <div className="mt-4"><ElectionSwitch on={await getSetting("election_day_enabled", false)} /></div>
          </Card>
          <Card className="p-5">
            <h2 className="h-section">Channels</h2>
            <dl className="mt-3 space-y-3 text-[15px]">
              <div><dt className="font-semibold">SMS and WhatsApp sending</dt><dd className="text-ink-muted">{isConsoleProvider ? "Not connected yet: messages are recorded, not sent, and one-time codes are shown on screen. Set SMS_PROVIDER to go live." : `Provider: ${process.env.SMS_PROVIDER}`}</dd></div>
              <div><dt className="font-semibold">USSD</dt><dd className="text-ink-muted">Aggregator callback: <code className="rounded bg-surface-alt px-1">POST /api/v1/ussd/callback</code>. <a className="link" href="/workspace/settings/ussd">Open the USSD simulator</a></dd></div>
              <div><dt className="font-semibold">WhatsApp</dt><dd className="text-ink-muted">Webhook: <code className="rounded bg-surface-alt px-1">/api/v1/whatsapp/webhook</code> (verify token from WHATSAPP_VERIFY_TOKEN)</dd></div>
              <div><dt className="font-semibold">Field agent sync</dt><dd className="text-ink-muted"><code className="rounded bg-surface-alt px-1">POST /api/v1/sync/batch</code></dd></div>
            </dl>
          </Card>
        </div>
      )}
    </>
  );
}

async function Audit({ sp }) {
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q ?? "";
  const where = "(:q::text = '' OR action ILIKE :ql OR actor_name ILIKE :ql OR entity ILIKE :ql)";
  const rows = await all(`SELECT * FROM audit_log WHERE ${where} ORDER BY id DESC LIMIT 50 OFFSET ${(page - 1) * 50}`, { q, ql: `%${q}%` });
  const total = await scalar(`SELECT COUNT(*) FROM audit_log WHERE ${where}`, { q, ql: `%${q}%` });
  return (
    <>
      <form className="mb-4 flex gap-2"><input type="hidden" name="tab" value="audit" /><input className="input max-w-sm" name="q" defaultValue={q} placeholder="Search action or person (e.g. export, view)" aria-label="Search audit log" /><button className="btn btn-secondary">Search</button></form>
      <p className="t-help mb-3">Every view of a full record, edit, export, message campaign and permission change. Entries cannot be edited or deleted.</p>
      <Card className="overflow-x-auto">
        <table className="table-clean">
          <thead><tr><th>When (UTC)</th><th>Who</th><th>Action</th><th>Record</th><th>IP</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-[14px] num">{r.timestamp}</td>
                <td>{r.actor_name}</td>
                <td>{r.action.replaceAll("_", " ")}</td>
                <td className="text-[13px] text-ink-muted">{r.entity}{r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ""}</td>
                <td className="text-[13px] text-ink-muted">{r.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / 50))} total={total} hrefFor={(p) => withParams("/workspace/settings", { tab: "audit", q }, { page: p })} />
    </>
  );
}
