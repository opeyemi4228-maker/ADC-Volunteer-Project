import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth";
import { all, scalar, getSetting } from "@/lib/db";
import { open } from "@/lib/crypto";
import { areaName } from "@/lib/geo";
import { maskPhone } from "@/lib/validate";
import { ROLE_LABELS, DIRECTORATES, labelOf } from "@/lib/options";
import { isConsoleProvider } from "@/lib/notify";
import { Card, dateLabel } from "@/components/ui";
import { PageHeader, Tabs, Pagination, withParams } from "@/components/workspace/ui";
import { ApiButton } from "@/components/workspace/actions";
import AddUser from "./AddUser";
import ElectionSwitch from "./ElectionSwitch";

export const metadata = { title: "Settings" };

function roleArea(r) {
  if (r.area_type === "directorate") return `${labelOf(DIRECTORATES, r.area_code)} directorate`;
  if (r.area_type === "group") return scalar("SELECT name FROM support_groups WHERE id = :id", { id: r.area_code }) ?? "Group";
  return areaName(r.area_code);
}

export default async function SettingsPage({ searchParams }) {
  const viewer = await getViewer();
  if (!viewer.powers.includes("audit")) redirect("/workspace");
  const sp = await searchParams;
  const admin = viewer.powers.includes("manage_users");
  const tab = sp.tab ?? (admin ? "users" : "audit");
  const tabs = [
    admin && { key: "users", label: "Users and roles", href: "/workspace/settings?tab=users" },
    { key: "audit", label: "Audit log", href: "/workspace/settings?tab=audit" },
    admin && { key: "system", label: "System", href: "/workspace/settings?tab=system" },
  ].filter(Boolean);

  return (
    <>
      <PageHeader title="Settings" />
      <Tabs tabs={tabs} current={tab} />
      {tab === "users" && admin && <Users viewer={viewer} />}
      {tab === "audit" && <Audit sp={sp} />}
      {tab === "system" && admin && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="h-section">Election day</h2>
            <p className="mt-1 text-[15px] text-ink-muted">When on, agents can check in, send results and report incidents. Switch it on on the morning of the election (and for rehearsals).</p>
            <div className="mt-4"><ElectionSwitch on={getSetting("election_day_enabled", false)} /></div>
          </Card>
          <Card className="p-5">
            <h2 className="h-section">Channels</h2>
            <dl className="mt-3 space-y-3 text-[15px]">
              <div><dt className="font-semibold">SMS and WhatsApp sending</dt><dd className="text-ink-muted">{isConsoleProvider ? "Console (development): messages are logged, not sent. Set SMS_PROVIDER to go live." : `Provider: ${process.env.SMS_PROVIDER}`}</dd></div>
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

function Users({ viewer }) {
  const users = all("SELECT id, name, phone_enc, active, last_signin_at, created_at FROM users ORDER BY name");
  const roles = all("SELECT * FROM role_assignments");
  const groups = all("SELECT id, name FROM support_groups WHERE status = 'verified' ORDER BY name");
  return (
    <div className="grid gap-8 xl:grid-cols-[1.6fr_1fr]">
      <Card className="overflow-x-auto">
        <table className="table-clean">
          <thead><tr><th>Person</th><th>Roles</th><th>Last sign-in</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                <td><p className="font-semibold">{u.name}</p><p className="text-[13px] text-ink-muted num">{maskPhone(open(u.phone_enc))}</p></td>
                <td>
                  <ul className="space-y-1">
                    {roles.filter((r) => r.user_id === u.id).map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-2 text-[14px]">
                        <span>{ROLE_LABELS[r.role]} · <span className="text-ink-muted">{roleArea(r)}</span></span>
                        {u.id !== viewer.id && <ApiButton url={`/api/v1/users/${u.id}`} data={{ action: "revoke", roleId: r.id }} className="text-[13px] text-ink-muted underline" confirm="Remove this role?" doneLabel="Removed">Remove</ApiButton>}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="whitespace-nowrap text-[14px]">{u.last_signin_at ? dateLabel(u.last_signin_at) : "Never"}</td>
                <td>{u.id !== viewer.id && <ApiButton url={`/api/v1/users/${u.id}`} data={{ action: u.active ? "deactivate" : "activate" }} className="btn btn-ghost btn-sm" doneLabel="Done">{u.active ? "Deactivate" : "Reactivate"}</ApiButton>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <AddUser groups={groups} />
    </div>
  );
}

function Audit({ sp }) {
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q ?? "";
  const where = "(:q = '' OR action LIKE :ql OR actor_name LIKE :ql OR entity LIKE :ql)";
  const rows = all(`SELECT * FROM audit_log WHERE ${where} ORDER BY id DESC LIMIT 50 OFFSET ${(page - 1) * 50}`, { q, ql: `%${q}%` });
  const total = scalar(`SELECT COUNT(*) FROM audit_log WHERE ${where}`, { q, ql: `%${q}%` });
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
