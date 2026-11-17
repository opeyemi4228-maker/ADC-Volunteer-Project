"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, Clock, Download, Eye, MessageSquareText } from "lucide-react";

import { cx, dateTimeLabel, durationLabel, fmt } from "@/components/ui";
import { Avatar, photoUrl } from "@/components/workspace/Avatar";

const SHOWN = 5;
const textIn = (map, lang = "english") => (map ? map[lang] || map.english || Object.values(map).find(Boolean) || "" : "");

/**
 * The Super Admin's view of one lesson's activity, in three tabs:
 *   Watched     each person: how many times, how long in total, whether they
 *               finished, first and last time; open a row for every viewing
 *   Downloaded  each person: how many times, and the date and time of each
 *   Feedback    the answers to each question, counted across every language,
 *               and each person's answers
 * Times are West Africa Time.
 */
export default function LessonActivity({ report, questions, languages }) {
  const r = report ?? { views: [], downloads: [], responses: [], totals: {} };
  const t = r.totals ?? {};
  const [tab, setTab] = useState("views");
  const lang = (l) => languages.find((x) => x.value === l)?.label ?? l;

  const tabs = [
    ["views", Eye, "Watched", t.viewers ?? 0],
    ["downloads", Download, "Downloaded", t.downloaders ?? 0],
    ["feedback", MessageSquareText, "Feedback", t.responses ?? 0],
  ];

  return (
    <section className="mt-4 border-t border-line pt-3" aria-label="Lesson activity">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Activity">
        {tabs.map(([key, Icon, label, n]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cx("inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors", tab === key ? "bg-ink text-white" : "bg-surface-alt text-ink-muted hover:text-ink")}
          >
            <Icon aria-hidden className="size-4" /> {label} <span className={cx("rounded-full px-1.5 text-[11px] num", tab === key ? "bg-white/20" : "bg-white")}>{fmt(n)}</span>
          </button>
        ))}
      </div>

      {tab === "views" && (
        <>
          <Stats items={[
            ["People", t.viewers], ["Times watched", t.views], ["Watched to the end", t.completed],
            ["Total time watched", null, durationLabel(t.seconds)],
          ]} />
          <People
            rows={r.views}
            empty="Nobody has watched this lesson yet."
            right={(p) => (
              <>
                <span className="font-semibold text-ink">{fmt(p.times)} {p.times === 1 ? "time" : "times"} · {durationLabel(p.seconds)}</span>
                <span className="block">Last {dateTimeLabel(p.last)}</span>
              </>
            )}
            badge={(p) => p.completed && <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 aria-hidden className="size-3.5" /> Finished</span>}
            sub={(p) => [...new Set(p.sessions.map((s) => lang(s.language)))].join(", ")}
            details={(p) => (
              <>
                <p className="mb-1 text-[12px] text-ink-muted">First watched {dateTimeLabel(p.first)}</p>
                <ol className="space-y-1">
                  {p.sessions.map((s, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]">
                      <span className="inline-flex items-center gap-1 font-medium num"><Clock aria-hidden className="size-3.5 text-ink-muted" /> {dateTimeLabel(s.at)}</span>
                      <span className="text-ink-muted">{lang(s.language)}</span>
                      <span className="num">{durationLabel(s.seconds)}{s.duration ? ` of ${durationLabel(s.duration)}` : ""} watched</span>
                      {s.completed && <span className="font-semibold text-success">Finished</span>}
                    </li>
                  ))}
                </ol>
                {p.times > p.sessions.length && <p className="mt-1 text-[12px] text-ink-muted">Showing the latest {p.sessions.length} of {fmt(p.times)}. The report has the totals.</p>}
              </>
            )}
          />
        </>
      )}

      {tab === "downloads" && (
        <>
          <Stats items={[["People", t.downloaders], ["Downloads", t.downloads]]} />
          <People
            rows={r.downloads}
            empty="Nobody has downloaded this lesson yet."
            right={(p) => (
              <>
                <span className="font-semibold text-ink">{fmt(p.times)} {p.times === 1 ? "time" : "times"}</span>
                <span className="block">Last {dateTimeLabel(p.last)}</span>
              </>
            )}
            sub={(p) => [...new Set(p.sessions.map((s) => lang(s.language)))].join(", ")}
            details={(p) => (
              <ol className="space-y-1">
                {p.sessions.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-3 text-[12px]">
                    <span className="inline-flex items-center gap-1 font-medium num"><Download aria-hidden className="size-3.5 text-ink-muted" /> {dateTimeLabel(s.at)}</span>
                    <span className="text-ink-muted">{lang(s.language)}</span>
                  </li>
                ))}
              </ol>
            )}
          />
        </>
      )}

      {tab === "feedback" && <Feedback r={r} questions={questions} lang={lang} />}
    </section>
  );
}

function Stats({ items }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([label, n, text]) => (
        <div key={label} className="rounded-xl bg-surface-alt px-3 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
          <dd className="text-[17px] font-bold num">{text ?? fmt(n ?? 0)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Person({ p }) {
  return (
    <>
      <Avatar src={p.hasPhoto && p.volunteerId ? photoUrl(p.volunteerId, p.photoUpdatedAt) : null} name={p.name} className="size-8 text-[11px]" />
      <span className="min-w-0">
        {p.volunteerId ? (
          <Link href={`/workspace/volunteers/${p.volunteerId}`} className="font-semibold text-brand-800 hover:underline">{p.name}</Link>
        ) : <span className="font-semibold">{p.name}</span>}
      </span>
    </>
  );
}

/** A list of people, five at first, each row opening to show its details. */
function People({ rows, empty, right, sub, badge, details }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(null);
  if (!rows.length) return <p className="mt-3 text-[13px] text-ink-muted">{empty}</p>;
  const shown = all ? rows : rows.slice(0, SHOWN);
  return (
    <>
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
        {shown.map((p) => (
          <li key={p.key} className="text-[13px]">
            <div className="flex items-center gap-3 px-3 py-2">
              <Person p={p} />
              <span className="hidden min-w-0 flex-1 truncate text-[12px] text-ink-muted sm:block">
                {p.publicId ?? (p.isVolunteer ? "Volunteer" : "Coordinator or admin")} · {sub(p)} {badge?.(p) && <> · {badge(p)}</>}
              </span>
              <span className="ml-auto shrink-0 text-right text-[12px] text-ink-muted num">{right(p)}</span>
              <button
                type="button"
                onClick={() => setOpen(open === p.key ? null : p.key)}
                className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-surface-alt"
                aria-expanded={open === p.key}
                aria-label={`Details for ${p.name}`}
              >
                <ChevronDown aria-hidden className={cx("size-4 transition-transform", open === p.key && "rotate-180")} />
              </button>
            </div>
            {open === p.key && (
              <div className="border-t border-line bg-surface-alt/50 px-3 py-2">
                <p className="mb-1 text-[12px] text-ink-muted sm:hidden">{p.publicId ?? (p.isVolunteer ? "Volunteer" : "Coordinator or admin")} · {sub(p)}</p>
                {details(p)}
              </div>
            )}
          </li>
        ))}
      </ul>
      {rows.length > SHOWN && (
        <button type="button" onClick={() => setAll((o) => !o)} className="btn btn-ghost btn-sm mt-1">
          <ChevronDown aria-hidden className={cx("size-4 transition-transform", all && "rotate-180")} /> {all ? "Show fewer" : `Show all ${fmt(rows.length)}`}
        </button>
      )}
    </>
  );
}

/** Answers counted across every language, then each person's answers. */
function Feedback({ r, questions, lang }) {
  const responses = r.responses ?? [];
  const viewers = r.totals?.viewers ?? 0;
  if (!questions.length) return <p className="mt-3 text-[13px] text-ink-muted">This lesson has no feedback questions yet. Use “Add questions” above.</p>;
  if (!responses.length) return <p className="mt-3 text-[13px] text-ink-muted">No feedback yet. Answers appear here as soon as someone finishes the video and answers.</p>;
  const byLanguage = Object.entries(responses.reduce((o, a) => ({ ...o, [a.language]: (o[a.language] ?? 0) + 1 }), {}));

  return (
    <div className="mt-3 space-y-4">
      <p className="text-[13px] text-ink-muted">
        <strong className="text-ink">{fmt(responses.length)}</strong> of {fmt(viewers)} {viewers === 1 ? "viewer" : "viewers"} answered
        {" "}({byLanguage.map(([l, n]) => `${fmt(n)} in ${lang(l)}`).join(", ")}). Each person answers once per lesson, whichever language they choose.
      </p>
      <ol className="space-y-4">
        {questions.map((q, i) => {
          const given = responses.filter((a) => a.answers[q.id] !== undefined);
          return (
            <li key={q.id} className="rounded-xl border border-line p-3">
              <p className="text-[14px] font-semibold">{i + 1}. {textIn(q.prompt)}</p>
              {q.kind === "choice" ? (
                <ul className="mt-2 space-y-1.5">
                  {(q.options ?? []).map((o, n) => {
                    const count = given.filter((a) => a.answers[q.id] === n).length;
                    const share = given.length ? Math.round((count / given.length) * 100) : 0;
                    return (
                      <li key={n} className="text-[13px]">
                        <div className="flex justify-between gap-2"><span>{textIn(o)}</span><span className="shrink-0 text-ink-muted num">{fmt(count)} · {share}%</span></div>
                        <div className="mt-0.5 h-2 rounded-full bg-surface-alt"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${share}%` }} /></div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {given.map((a) => (
                    <li key={a.key} className="rounded-lg bg-surface-alt px-3 py-2 text-[13px]">
                      <p className="whitespace-pre-line">{a.answers[q.id]}</p>
                      <p className="mt-1 text-[11px] text-ink-muted">{a.name} · {lang(a.language)} · {dateTimeLabel(a.at)}</p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1.5 text-[11px] text-ink-muted">{fmt(given.length)} {given.length === 1 ? "answer" : "answers"}</p>
            </li>
          );
        })}
      </ol>
      <People
        rows={responses}
        empty=""
        right={(p) => <span>{dateTimeLabel(p.at)}</span>}
        sub={(p) => `answered in ${lang(p.language)}`}
        details={(p) => (
          <ol className="space-y-1 text-[12px]">
            {questions.map((q, i) => {
              const v = p.answers[q.id];
              return (
                <li key={q.id}>
                  <span className="text-ink-muted">{i + 1}. {textIn(q.prompt)}</span>
                  <span className="block font-semibold">{v === undefined ? "—" : q.kind === "choice" ? textIn(q.options?.[v], p.language) : v}</span>
                </li>
              );
            })}
          </ol>
        )}
      />
    </div>
  );
}
