import { Mail, MessageCircle, Smartphone } from "lucide-react";

import { requireVolunteer } from "@/lib/guard";
import { messagesFor } from "@/lib/volunteer-portal";
import { EmptyState, timeAgo } from "@/components/ui";
import { PageHeader } from "@/components/workspace/ui";

export const metadata = { title: "Messages" };

const CHANNEL = { sms: ["SMS", Smartphone], whatsapp: ["WhatsApp", MessageCircle], email: ["Email", Mail] };

/** Campaign messages the Super Admin sent this volunteer, kept here as well as on their phone. */
export default async function MyMessages() {
  const { volunteerId } = await requireVolunteer();
  const list = await messagesFor(volunteerId);
  return (
    <>
      <PageHeader title="Messages" description="Messages from the Super Admin. They also reach you by SMS, WhatsApp or email, as you chose when you registered." />
      {list.length === 0 ? (
        <EmptyState title="No messages yet">Announcements and instructions for volunteers in your area will appear here.</EmptyState>
      ) : (
        <ol className="space-y-3">
          {list.map((m) => {
            const [label, Icon] = CHANNEL[m.channel] ?? ["Message", Mail];
            return (
              <li key={m.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-muted">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-ink"><Icon aria-hidden className="size-4 text-brand-700" /> {m.creator_name ?? "Super Admin"}</span>
                  <span>{label} · {timeAgo(m.sent_at)}</span>
                </div>
                {m.subject && <p className="mt-2 font-semibold">{m.subject}</p>}
                <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{m.body}</p>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
