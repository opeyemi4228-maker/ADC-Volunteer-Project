import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Users } from "lucide-react";

import { requireViewer } from "@/lib/guard";
import { all, getSetting } from "@/lib/db";
import { open } from "@/lib/crypto";
import { areaName } from "@/lib/geo";
import { maskPhone } from "@/lib/validate";
import { ROLE_LABELS, DIRECTORATES, labelOf } from "@/lib/options";
import { POSITIONS, resolveAccess } from "@/lib/positions";
import { dateLabel, cx, fmt } from "@/components/ui";
import { PageHeader, Tabs } from "@/components/workspace/ui";
import { ApiButton } from "@/components/workspace/actions";
import AssignPosition from "./AssignPosition";
import PositionsAccess from "./PositionsAccess";

export const metadata = { title: "Team and positions" };

const roleArea = (r) => (r.area_type === "directorate" ? `${labelOf(DIRECTORATES, r.area_code)} directorate` : areaName(r.area_code));

/**
 * Team and positions (Super Admin): who holds which position over which
 * area, giving a volunteer a position, and what each position can open.
 */
export default async function TeamPage({ searchParams }) {
  const viewer = await requireViewer();
  if (!viewer.powers.includes("manage_users")) redirect("/workspace");
  const sp = await searchParams;
  const tab = sp.tab === "access" ? "access" : "people";
  const access = resolveAccess(await getSetting("position_access", {}));

  // Everyone with a workspace role: positions and Super Admin accounts. Volunteer-only accounts are in the volunteer directory.
  const roles = await all("SELECT r.*, u.name, u.phone_enc, u.active, u.last_signin_at FROM role_assignments r JOIN users u ON u.id = r.user_id WHERE r.role != 'volunteer' ORDER BY u.name");
  const holders = Object.fromEntries(POSITIONS.map((p) => [p.key, roles.filter((r) => r.role === p.key && r.active).length]));
  const filter = POSITIONS.some((p) => p.key === sp.position) || sp.position === "super_admin" ? sp.position : "";
  const people = [...new Map(roles.filter((r) => !filter || r.role === filter).map((r) => [r.user_id, r])).values()];
  const supers = roles.filter((r) => ["super_admin", "national_admin"].includes(r.role) && r.active).length;

  const tabs = [
    { key: "people", label: "People", count: fmt(new Set(roles.map((r) => r.user_id)).size), href: "/workspace/team" },
    { key: "access", label: "What each position can open", href: "/workspace/team?tab=access" },
  ];
  const chip = (key, label, n) => (
    <Link
      key={key || "all"}
      href={key ? `/workspace/team?position=${key}` : "/workspace/team"}
      aria-current={filter === key ? "true" : undefined}
      className={cx("inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition-colors", filter === key ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line bg-white text-ink-muted hover:text-ink")}
    >
      {label} <span className="num opacity-70">{n}</span>
    </Link>
  );

  return (
    <>
      <PageHeader
        eyebrow="Super admin"
        title="Team and positions"
        description="Give volunteers a coordinator position over their area, and choose the tabs and dashboard widgets each position opens."
      />
      <Tabs tabs={tabs} current={tab} />

      {tab === "access" ? (
        <PositionsAccess access={access} holders={holders} initial={sp.position} />
      ) : (
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_540px]">
          <AssignPosition access={access} />
          <section className="card min-w-0 overflow-hidden 2xl:order-first" aria-labelledby="people-title">
            <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-3">
              <div>
                <h2 id="people-title" className="text-[15px] font-bold tracking-tight">People with a position</h2>
                <p className="mt-0.5 text-[13px] text-ink-muted">Removing a position closes its tabs; a volunteer keeps their own dashboard.</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-alt px-2.5 py-1 text-[12px] font-semibold text-ink-muted"><ShieldCheck aria-hidden className="size-3.5" /> {supers} Super Admin {supers === 1 ? "account" : "accounts"}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 px-5 pb-4">
              {chip("", "All", new Set(roles.map((r) => r.user_id)).size)}
              {POSITIONS.map((p) => chip(p.key, p.label, roles.filter((r) => r.role === p.key).length))}
              {chip("super_admin", "Super Admin", supers)}
            </div>
            {people.length === 0 ? (
              <p className="flex items-center gap-2.5 border-t border-line px-5 py-8 text-[14px] text-ink-muted"><Users aria-hidden className="size-5" /> Nobody holds this position yet.</p>
            ) : (
              <div className="overflow-x-auto border-t border-line">
                <table className="table-clean">
                  <thead><tr><th className="!pl-5">Person</th><th>Position and area</th><th>Last sign-in</th><th className="!pr-5"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {people.map((u) => (
                      <tr key={u.user_id} className={u.active ? "" : "opacity-55"}>
                        <td className="!pl-5">
                          <p className="whitespace-nowrap font-semibold">{u.name}</p>
                          <p className="text-[12px] text-ink-muted num">{maskPhone(open(u.phone_enc))}{!u.active && " · deactivated"}</p>
                        </td>
                        <td>
                          <ul className="space-y-1.5">
                            {roles.filter((r) => r.user_id === u.user_id && (!filter || r.role === filter)).map((r) => (
                              <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                                <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[12px] font-semibold text-brand-800">{ROLE_LABELS[r.role] ?? r.role}</span>
                                <span className="text-ink-muted">{roleArea(r)}</span>
                                {u.user_id !== viewer.id && <ApiButton url={`/api/v1/users/${u.user_id}`} data={{ action: "revoke", roleId: r.id }} className="text-[12px] font-semibold text-danger hover:underline" confirm={`Remove ${u.name} as ${ROLE_LABELS[r.role] ?? r.role}?`} doneLabel="Removed">Remove</ApiButton>}
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td className="whitespace-nowrap text-[13px] text-ink-muted">{u.last_signin_at ? dateLabel(u.last_signin_at) : "Never"}</td>
                        <td className="!pr-5 text-right">{u.user_id !== viewer.id && <ApiButton url={`/api/v1/users/${u.user_id}`} data={{ action: u.active ? "deactivate" : "activate" }} className="btn btn-ghost btn-sm" doneLabel="Done">{u.active ? "Deactivate" : "Reactivate"}</ApiButton>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
