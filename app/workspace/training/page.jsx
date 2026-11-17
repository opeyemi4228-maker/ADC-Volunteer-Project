import { CheckCircle2, ClipboardList, GraduationCap, Languages } from "lucide-react";

import { requireViewer } from "@/lib/guard";
import { scalar } from "@/lib/db";
import { trainingFor, audiencesFor, embedUrl, questionsFor, progressFor, trainingReport } from "@/lib/training";
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
  const ids = modules.map((m) => m.id);
  const questions = await questionsFor(ids);
  const report = managing ? await trainingReport() : {};
  const progress = managing ? {} : await progressFor(viewer, ids);
  const languageLabels = Object.fromEntries(TRAINING_LANGUAGES.map((l) => [l.value, l.label]));
  const withFeedback = modules.filter((m) => questions[m.id]?.length).length;

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
          ? "Add lessons, upload or link a video for each language, and set the feedback questions. See who watched each lesson, how many times and for how long, who downloaded it and when, and what they answered."
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
        <ManageTraining modules={modules} report={report} questions={questions} languages={TRAINING_LANGUAGES} audiences={TRAINING_AUDIENCES} />
      ) : modules.length === 0 ? (
        <EmptyState title={elsewhere ? "No training in your languages yet" : "No training yet"}>
          {elsewhere
            ? `${fmt(elsewhere)} ${elsewhere === 1 ? "lesson is" : "lessons are"} available in other languages. Use “Change languages” to add one you understand.`
            : canManage ? "Open “Manage lessons” to add the first one." : "Training videos will appear here when they are ready."}
        </EmptyState>
      ) : (
        <>
          {withFeedback > 0 && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-brand-700/25 bg-brand-50 p-4 text-brand-800">
              <ClipboardList aria-hidden className="mt-0.5 size-5 shrink-0" />
              <div className="text-[14px] leading-6">
                <p className="font-bold">Please note: there is a feedback question and answer at the end of each training video.</p>
                <p>
                  When a video finishes, a few short questions appear below it. You answer once per lesson, in any of your languages:
                  if you answer in English, for example, the lesson is answered in every language and you won&apos;t be asked again.
                </p>
              </div>
            </div>
          )}
          <ul className="grid gap-4 lg:grid-cols-2">
            {modules.map((m, i) => (
              <li key={m.id} className="card overflow-hidden">
                <TrainingPlayer
                  videos={m.videos.map((v) => ({
                    id: v.id, kind: v.kind, url: v.external_url, embed: v.kind === "link" ? embedUrl(v.external_url) : null,
                    language: v.language, label: labelOf(TRAINING_LANGUAGES, v.language),
                  }))}
                  title={m.title}
                  moduleId={m.id}
                  questions={questions[m.id] ?? []}
                  progress={progress[m.id]}
                  languageLabels={languageLabels}
                />
                <div className="p-4">
                  <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-brand-700">
                    <GraduationCap aria-hidden className="size-4" /> Lesson {i + 1}
                    {canManage && m.audience !== "all" && <span className="rounded-md bg-surface-alt px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-ink-muted">For {labelOf(TRAINING_AUDIENCES, m.audience).toLowerCase()}</span>}
                  </p>
                  <h2 className="mt-1 text-[17px] font-bold leading-6 tracking-tight">{m.title}</h2>
                  {m.description && <p className="mt-1 whitespace-pre-line text-[14px] leading-6 text-ink-muted">{m.description}</p>}
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted">
                    <span className="inline-flex items-center gap-1.5"><Languages aria-hidden className="size-3.5" /> {names(m.videos.map((v) => v.language))}</span>
                    {progress[m.id]?.completed && <span className="inline-flex items-center gap-1 font-semibold text-success"><CheckCircle2 aria-hidden className="size-3.5" /> Watched</span>}
                  </p>
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
