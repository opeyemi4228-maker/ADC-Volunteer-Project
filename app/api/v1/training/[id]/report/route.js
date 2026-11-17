import { one } from "@/lib/db";
import { questionsFor, trainingReport, localized } from "@/lib/training";
import { TRAINING_LANGUAGES, labelOf } from "@/lib/options";
import { fail, requirePower } from "@/lib/http";

/**
 * GET /api/v1/training/{id}/report
 * The Super Admin's spreadsheet (CSV) for one lesson: one row per person, with
 * how many times and for how long they watched, when, whether they finished,
 * their downloads, and their feedback answers (one column per question).
 * Times are West Africa Time.
 */
export async function GET(_request, { params }) {
  const { denied } = await requirePower("manage_training");
  if (denied) return denied;
  const { id } = await params;
  const m = await one("SELECT id, title FROM training_modules WHERE id = :id", { id });
  if (!m) return fail(404, "Training not found.");

  const r = (await trainingReport())[id] ?? { views: [], downloads: [], responses: [] };
  const questions = (await questionsFor([id]))[id] ?? [];
  const lang = (l) => labelOf(TRAINING_LANGUAGES, l) || l || "";
  const wat = (t) => {
    if (!t) return "";
    const d = new Date(`${String(t).replace(" ", "T").slice(0, 19)}Z`);
    return Number.isNaN(d.getTime()) ? String(t) : d.toLocaleString("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });
  };
  const hms = (s) => {
    const n = Math.round(s ?? 0);
    return `${Math.floor(n / 3600)}:${String(Math.floor((n % 3600) / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  };

  const people = new Map();
  const row = (p) => {
    if (!people.has(p.key)) people.set(p.key, { name: p.name, id: p.publicId ?? (p.isVolunteer ? "Volunteer" : "Coordinator or admin") });
    return people.get(p.key);
  };
  for (const v of r.views) {
    Object.assign(row(v), {
      views: v.times, watched: hms(v.seconds), completed: v.completed ? "Yes" : "No", first: wat(v.first), last: wat(v.last),
      languages: [...new Set(v.sessions.map((s) => lang(s.language)))].join(", "),
    });
  }
  for (const d of r.downloads) Object.assign(row(d), { downloads: d.times, lastDownload: wat(d.last) });
  for (const a of r.responses) {
    const p = row(a);
    p.feedbackLanguage = lang(a.language);
    p.feedbackAt = wat(a.at);
    for (const q of questions) {
      const v = a.answers[q.id];
      p[`q:${q.id}`] = v === undefined ? "" : q.kind === "choice" ? localized(q.options?.[v], "english") : v;
    }
  }

  const header = ["Name", "Volunteer ID", "Times watched", "Time watched (h:mm:ss)", "Watched to the end", "Languages watched", "First watched", "Last watched",
    "Times downloaded", "Last downloaded", "Feedback language", "Feedback sent", ...questions.map((q, i) => `Q${i + 1}. ${localized(q.prompt, "english")}`)];
  const lines = [...people.values()].map((p) => [p.name, p.id, p.views ?? 0, p.watched ?? "0:00:00", p.completed ?? "No", p.languages ?? "", p.first ?? "", p.last ?? "",
    p.downloads ?? 0, p.lastDownload ?? "", p.feedbackLanguage ?? "", p.feedbackAt ?? "", ...questions.map((q) => p[`q:${q.id}`] ?? "")]);
  // Quoted, and a leading = + - @ is neutralised so a spreadsheet never runs it as a formula.
  const cell = (v) => {
    const s = String(v ?? "");
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const csv = `﻿${[header, ...lines].map((l) => l.map(cell).join(",")).join("\r\n")}\r\n`;
  const name = m.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "training";
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-report.csv"`, "Cache-Control": "private, no-store" },
  });
}
