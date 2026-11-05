import { GraduationCap, Languages } from "lucide-react";

import { requireViewer } from "@/lib/guard";
import { scalar } from "@/lib/db";
import { trainingFor, audiencesFor, embedUrl, downloadsByModule } from "@/lib/training";
import { TRAINING_LANGUAGES, TRAINING_AUDIENCES, labelOf } from "@/lib/options";
import { EmptyState, fmt } from "@/components/ui";
import { PageHeader, Tabs } from "@/components/workspace/ui";
import LanguagePicker from "./LanguagePicker";
import TrainingPlayer from "./TrainingPlayer";
import ManageTraining from "./ManageTraining";

export const metadata = { title: "Training" };

const names = (list) => list.map((l) => labelOf(TRAINING_LANGUAGES, l)).join(", ");

/**
 * Training videos for every account. Each person sees the lessons meant for
 * them, only in the languages they speak (set on their record or here). The
 * Super Admin also has a Manage view to add lessons and each language's video.
 */
export default async function TrainingPage({ searchParams }) {
  const viewer = await requireViewer({ allowVolunteer: true });
  const sp = await searchParams;
  const canManage = viewer.powers.includes("manage_training");
  const managing = canManage && sp?.view === "manage";
  const { languages, modules } = await trainingFor(viewer, { everything: managing });
  const downloads = managing ? await downloadsByModule() : {};

  // Lessons that exist for this person, but not in any language they chose.
  const elsewhere = managing ? 0 : await scalar(
    `SELECT COUNT(*) FROM training_modules m
     WHERE m.audience = ANY(:aud::text[]) AND EXISTS (SELECT 1 FROM training_videos v WHERE v.module_id = m.id)
       AND NOT EXISTS (SELECT 1 FROM training_videos v WHERE v.module_id = m.id AND v.language = ANY(:langs::text[]))`,
    { aud: audiencesFor(viewer), langs: languages },
  );

  return (
    <>
      <PageHeader
        title="Training"
        description={managing
          ? "Add lessons and upload or link a video for each language. People only see the languages they speak. Each lesson lists who downloaded it."
          : `Lessons in the languages you speak: ${names(languages)}.`}
        actions={!managing && <LanguagePicker current={languages} options={TRAINING_LANGUAGES} />}
      />

      {canManage && (
        <Tabs
          current={managing ? "manage" : "watch"}
          tabs={[
            { key: "watch", label: "My training", href: "/workspace/training" },
            { key: "manage", label: "Manage lessons", href: "/workspace/training?view=manage" },
          ]}
        />
      )}

      {managing ? (
        <ManageTraining modules={modules} downloads={downloads} languages={TRAINING_LANGUAGES} audiences={TRAINING_AUDIENCES} />
      ) : modules.length === 0 ? (
        <EmptyState title={elsewhere ? "No training in your languages yet" : "No training yet"}>
          {elsewhere
            ? `${fmt(elsewhere)} ${elsewhere === 1 ? "lesson is" : "lessons are"} available in other languages. Use “Change languages” to add one you understand.`
            : canManage ? "Open “Manage lessons” to add the first one." : "Training videos will appear here when they are ready."}
        </EmptyState>
      ) : (
        <>
          <ul className="grid gap-4 lg:grid-cols-2">
            {modules.map((m, i) => (
              <li key={m.id} className="card overflow-hidden">
                <TrainingPlayer
                  videos={m.videos.map((v) => ({
                    id: v.id, kind: v.kind, url: v.external_url, embed: v.kind === "link" ? embedUrl(v.external_url) : null,
                    language: v.language, label: labelOf(TRAINING_LANGUAGES, v.language),
                  }))}
                  title={m.title}
                />
                <div className="p-4">
                  <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-brand-700">
                    <GraduationCap aria-hidden className="size-4" /> Lesson {i + 1}
                    {canManage && m.audience !== "all" && <span className="rounded-md bg-surface-alt px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-ink-muted">For {labelOf(TRAINING_AUDIENCES, m.audience).toLowerCase()}</span>}
                  </p>
                  <h2 className="mt-1 text-[17px] font-bold leading-6 tracking-tight">{m.title}</h2>
                  {m.description && <p className="mt-1 whitespace-pre-line text-[14px] leading-6 text-ink-muted">{m.description}</p>}
                  <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-muted"><Languages aria-hidden className="size-3.5" /> {names(m.videos.map((v) => v.language))}</p>
                </div>
              </li>
            ))}
          </ul>
          {elsewhere > 0 && (
            <p className="mt-4 text-[13px] text-ink-muted">{fmt(elsewhere)} more {elsewhere === 1 ? "lesson is" : "lessons are"} available only in other languages.</p>
          )}
        </>
      )}
    </>
  );
}
