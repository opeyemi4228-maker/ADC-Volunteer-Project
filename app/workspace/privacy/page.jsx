import { redirect } from "next/navigation";

import { requireViewer } from "@/lib/guard";
import { all, one } from "@/lib/db";
import { Card, EmptyState, StatusBadge, dateLabel } from "@/components/ui";
import { PageHeader } from "@/components/workspace/ui";
import { ApiButton } from "@/components/workspace/actions";

export const metadata = { title: "Data requests" };

export default async function PrivacyPage() {
  const viewer = await requireViewer();
  if (!viewer.powers.includes("data_requests")) redirect("/workspace");
  const list = all("SELECT * FROM data_requests ORDER BY status = 'open' DESC, created_at ASC LIMIT 100");
  return (
    <>
      <PageHeader title="Data requests" description="Requests from people to delete their data (NDPA 2023). Deleting removes their personal details and anonymises the record, so totals and history stay consistent. It cannot be undone." />
      {list.length === 0 ? <EmptyState title="No requests">Requests people make from “Check my registration” appear here.</EmptyState> : (
        <ul className="space-y-3">
          {list.map((r) => {
            const d = JSON.parse(r.details ?? "{}");
            const v = one("SELECT public_id, first_name, surname FROM volunteers WHERE phone_hash = :h", { h: r.subject_hash });
            const g = all("SELECT g.public_id, g.name FROM group_leaders l JOIN support_groups g ON g.id = l.group_id WHERE l.phone_hash = :h", { h: r.subject_hash });
            return (
              <li key={r.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{d.reference ?? r.id.slice(0, 8)} · {r.kind}</p>
                    <StatusBadge status={r.status === "open" ? "open" : r.status === "completed" ? "done" : "cancelled"} label={r.status === "declined" ? "Declined" : undefined} />
                  </div>
                  <p className="mt-1 text-[14px] text-ink-muted">Received {dateLabel(r.created_at)}{r.handled_at ? ` · handled ${dateLabel(r.handled_at)}` : ""}</p>
                  <p className="mt-2 text-[15px]">Records held: {v ? `volunteer ${v.public_id} (${v.first_name} ${v.surname})` : "no volunteer record"}{g.length ? `; leader of ${g.map((x) => x.name).join(", ")}` : ""}</p>
                  {d.details && <p className="mt-1 text-[15px]">&ldquo;{d.details}&rdquo;</p>}
                  {g.length > 0 && r.status === "open" && <p className="mt-2 text-[14px] text-warning">This person leads a group. Ask the group to name a new contact before deleting.</p>}
                  {r.status === "open" && (
                    <div className="mt-3 flex gap-2">
                      <ApiButton url={`/api/v1/data-requests/${r.id}`} data={{ action: "erase" }} className="btn btn-danger btn-sm" confirm="Delete this person's data permanently?" doneLabel="Deleted">Delete their data</ApiButton>
                      <ApiButton url={`/api/v1/data-requests/${r.id}`} data={{ action: "decline" }} className="btn btn-ghost btn-sm" doneLabel="Declined">Decline</ApiButton>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
