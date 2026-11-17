import { all, one, run, tx, nowIso } from "./db.js";
import { uuid } from "./crypto.js";
import { isSuperAdmin, isVolunteerOnly } from "./scope.js";
import { TRAINING_LANGUAGES, TRAINING_AUDIENCES } from "./options.js";

/**
 * Training videos.
 *
 * A module is one lesson ("Your role on election day"). It has one video per
 * language, uploaded to our storage or linked (YouTube and similar). Each
 * viewer sees a module only in the languages they speak:
 *
 *   volunteer       the languages they gave when they registered
 *                   (volunteer_languages), which they can change on the
 *                   Training page
 *   everyone else   the languages saved on their account (users.languages)
 *
 * With no languages set, English is assumed. Only the Super Admin
 * (manage_training) adds, replaces and removes modules and videos, and sees
 * every language when managing them.
 */

export const DEFAULT_LANGUAGES = ["english"];
const KNOWN = new Set(TRAINING_LANGUAGES.map((l) => l.value));

/** Keeps only known training languages, once each, in the list's order. */
export function cleanLanguages(list) {
  const wanted = new Set((Array.isArray(list) ? list : []).map(String));
  return TRAINING_LANGUAGES.map((l) => l.value).filter((v) => wanted.has(v));
}

const volunteerIdOf = (viewer) => viewer.roles.find((r) => r.role === "volunteer")?.area_code ?? null;

/** Which audiences a viewer belongs to: volunteers, coordinators, or (the Super Admin) both. */
export function audiencesFor(viewer) {
  if (isSuperAdmin(viewer)) return ["all", "volunteers", "coordinators"];
  return isVolunteerOnly(viewer) ? ["all", "volunteers"] : ["all", "coordinators"];
}

/** The languages this viewer watches training in. */
export async function viewerLanguages(viewer) {
  if (isVolunteerOnly(viewer)) {
    const rows = await all("SELECT language FROM volunteer_languages WHERE volunteer_id = :v", { v: volunteerIdOf(viewer) });
    const langs = cleanLanguages(rows.map((r) => r.language));
    return langs.length ? langs : DEFAULT_LANGUAGES;
  }
  const row = await one("SELECT languages FROM users WHERE id = :id", { id: viewer.id });
  let stored = [];
  try { stored = JSON.parse(row?.languages ?? "[]"); } catch { /* bad value: fall back */ }
  const langs = cleanLanguages(stored);
  return langs.length ? langs : DEFAULT_LANGUAGES;
}

/**
 * Saves the viewer's languages. For a volunteer this is their registered
 * languages (the "Other" language they may have given is kept).
 */
export async function setViewerLanguages(viewer, list) {
  const langs = cleanLanguages(list);
  if (!langs.length) return { error: "Choose at least one language." };
  if (isVolunteerOnly(viewer)) {
    const v = volunteerIdOf(viewer);
    await tx(async () => {
      await run("DELETE FROM volunteer_languages WHERE volunteer_id = :v AND language <> 'other'", { v });
      for (const l of langs) await run("INSERT INTO volunteer_languages (volunteer_id, language) VALUES (:v, :l) ON CONFLICT DO NOTHING", { v, l });
      await run("UPDATE volunteers SET updated_at = :now WHERE id = :v", { v, now: nowIso() });
    });
  } else {
    await run("UPDATE users SET languages = :l WHERE id = :id", { l: JSON.stringify(langs), id: viewer.id });
  }
  return { languages: langs };
}

/**
 * Modules for the viewer, each with the videos they may watch.
 * `everything` (Super Admin managing) returns every module and every language.
 */
export async function trainingFor(viewer, { everything = false } = {}) {
  const languages = await viewerLanguages(viewer);
  const audiences = everything ? ["all", "volunteers", "coordinators"] : audiencesFor(viewer);
  const modules = await all(
    `SELECT id, title, description, audience, sort, creator_name, created_at, updated_at FROM training_modules
     WHERE audience = ANY(:aud::text[]) ORDER BY sort ASC, created_at ASC`,
    { aud: audiences },
  );
  const videos = modules.length
    ? await all(
      `SELECT id, module_id, language, kind, mime, external_url, size, created_at FROM training_videos
       WHERE module_id = ANY(:ids::text[]) ${everything ? "" : "AND language = ANY(:langs::text[])"}`,
      { ids: modules.map((m) => m.id), langs: languages },
    )
    : [];
  const order = (l) => TRAINING_LANGUAGES.findIndex((x) => x.value === l);
  const list = modules.map((m) => ({
    ...m,
    videos: videos.filter((v) => v.module_id === m.id).sort((a, b) => order(a.language) - order(b.language)),
  }));
  return { languages, modules: everything ? list : list.filter((m) => m.videos.length > 0) };
}

/** One video, only if this viewer may watch it (their audience and languages; any of it for the Super Admin). */
export async function videoFor(viewer, videoId) {
  const v = await one(
    `SELECT tv.*, tm.audience, tm.title AS module_title FROM training_videos tv JOIN training_modules tm ON tm.id = tv.module_id WHERE tv.id = :id`,
    { id: videoId },
  );
  if (!v) return null;
  if (viewer.powers.includes("manage_training")) return v;
  if (!audiencesFor(viewer).includes(v.audience)) return null;
  return (await viewerLanguages(viewer)).includes(v.language) ? v : null;
}

/** Turns a YouTube link into its privacy-friendly embed URL; anything else is opened as a link. */
export function embedUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    let id = null;
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host === "youtube.com") id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
    if (id && /^[\w-]{6,20}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
  } catch { /* not a URL */ }
  return null;
}

/** A link a training video may point at: http(s) only. Returns the normalised URL or null. */
export function cleanVideoUrl(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (!["http:", "https:"].includes(u.protocol) || !u.hostname.includes(".")) return null;
    return u.toString().slice(0, 500);
  } catch {
    return null;
  }
}

/** Checks a module's title, description and audience. Used when a module is added or edited. */
export function moduleErrors(d) {
  const e = {};
  const title = String(d.title ?? "").trim();
  if (!title) e.title = "Give the training a title.";
  else if (title.length > 160) e.title = "Keep the title to 160 characters.";
  if (String(d.description ?? "").length > 2000) e.description = "Keep the description to 2,000 characters.";
  if (d.audience && !TRAINING_AUDIENCES.some((a) => a.value === d.audience)) e.audience = "Choose who it is for.";
  return e;
}

/** Records that this viewer downloaded a video. */
export async function recordDownload(viewer, video) {
  const volunteerId = isVolunteerOnly(viewer) ? volunteerIdOf(viewer) : null;
  await run(
    `INSERT INTO training_downloads (id, video_id, module_id, language, user_id, volunteer_id, person_name, downloaded_at)
     VALUES (:id, :v, :m, :l, :u, :vol, :name, :now)`,
    { id: uuid(), v: video.id, m: video.module_id, l: video.language, u: viewer.id, vol: volunteerId, name: viewer.name, now: nowIso() },
  );
}

/**
 * For the Super Admin: everyone who downloaded each module, one row per
 * person and language, with how many times and when they last did.
 * Returns { [moduleId]: [{ name, publicId, volunteerId, language, times, last, isVolunteer }] }.
 */
export async function downloadsByModule() {
  const rows = await all(
    `SELECT d.module_id, d.language, d.volunteer_id, COALESCE(d.volunteer_id, d.user_id) AS who,
       MAX(COALESCE(v.first_name || ' ' || v.surname, u.name, d.person_name)) AS name, MAX(v.public_id) AS public_id,
       MAX(v.photo_updated_at) AS photo_updated_at, BOOL_OR(v.photo_thumb_key IS NOT NULL) AS has_photo,
       COUNT(*) AS times, MAX(d.downloaded_at) AS last
     FROM training_downloads d
     LEFT JOIN volunteers v ON v.id = d.volunteer_id
     LEFT JOIN users u ON u.id = d.user_id
     GROUP BY d.module_id, d.language, d.volunteer_id, COALESCE(d.volunteer_id, d.user_id)
     ORDER BY MAX(d.downloaded_at) DESC`,
  );
  const out = {};
  for (const r of rows) {
    (out[r.module_id] ??= []).push({
      name: r.name ?? "Unknown", publicId: r.public_id, volunteerId: r.volunteer_id, language: r.language,
      times: r.times, last: r.last, isVolunteer: Boolean(r.volunteer_id), hasPhoto: Boolean(r.has_photo), photoUpdatedAt: r.photo_updated_at,
    });
  }
  return out;
}

/* ── Watching ──────────────────────────────────────────────────────────── */

const MAX_SECONDS = 6 * 3600;
const seconds = (x) => Math.max(0, Math.min(MAX_SECONDS, Math.round(Number(x) || 0)));
/** Watched to the end: at least 90% of the video actually played (skipping ahead does not count). */
const COMPLETE_SHARE = 0.9;

/** Starts a viewing of a video the viewer may watch. Returns the view's id. */
export async function startView(viewer, video) {
  const id = uuid();
  const now = nowIso();
  await run(
    `INSERT INTO training_views (id, video_id, module_id, language, user_id, volunteer_id, person_name, started_at, last_seen_at)
     VALUES (:id, :v, :m, :l, :u, :vol, :name, :now, :now)`,
    { id, v: video.id, m: video.module_id, l: video.language, u: viewer.id, vol: isVolunteerOnly(viewer) ? volunteerIdOf(viewer) : null, name: viewer.name, now },
  );
  return id;
}

/**
 * Progress from the player: seconds actually played so far in this viewing,
 * the current position, the video's length, and whether it reached the end.
 * Only the viewer who started it can update it, and values never go down.
 */
export async function updateView(viewer, viewId, p = {}) {
  const row = await one("SELECT * FROM training_views WHERE id = :id AND user_id = :u", { id: String(viewId ?? ""), u: viewer.id });
  if (!row) return null;
  const duration = seconds(p.duration) || row.duration || null;
  const watched = Math.max(row.seconds_watched, Math.min(seconds(p.seconds), duration ? duration * 3 : MAX_SECONDS));
  const furthest = Math.max(row.furthest, duration ? Math.min(seconds(p.position), duration) : seconds(p.position));
  const completed = row.completed === 1
    || (duration ? watched >= duration * COMPLETE_SHARE : Boolean(p.ended));
  await run(
    `UPDATE training_views SET seconds_watched = :s, furthest = :f, duration = :d, completed = :c, last_seen_at = :now WHERE id = :id`,
    { id: row.id, s: watched, f: furthest, d: duration, c: completed ? 1 : 0, now: nowIso() },
  );
  return { completed };
}

/* ── Feedback questions ────────────────────────────────────────────────── */

export const MAX_QUESTIONS = 10;
const MAX_OPTIONS = 6;
const parse = (v, fallback) => {
  if (v == null) return fallback;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

/**
 * Text in the wanted language, else English, else whichever language it was
 * written in. `map` is { english: "...", yoruba: "..." }.
 */
export function localized(map, language) {
  if (!map) return "";
  if (typeof map === "string") return map;
  return map[language] || map.english || Object.values(map).find((t) => String(t ?? "").trim()) || "";
}

/** The languages a question is fully written in (its wording and every option). */
export function questionLanguages(q) {
  return [...KNOWN].filter((l) => String(q.prompt?.[l] ?? "").trim() && (q.kind !== "choice" || (q.options ?? []).every((o) => String(o?.[l] ?? "").trim())));
}

/** A lesson's questions, in order: { [moduleId]: [{ id, kind, prompt, options, required }] }. */
export async function questionsFor(moduleIds) {
  if (!moduleIds.length) return {};
  const rows = await all(
    "SELECT id, module_id, kind, prompt, options, required FROM training_questions WHERE module_id = ANY(:ids::text[]) ORDER BY sort ASC, created_at ASC",
    { ids: moduleIds },
  );
  const out = {};
  for (const r of rows) {
    (out[r.module_id] ??= []).push({ id: r.id, kind: r.kind, prompt: parse(r.prompt, {}), options: parse(r.options, null), required: r.required === 1 });
  }
  return out;
}

/** Keeps only known languages with some text, trimmed to `max` characters. */
function cleanTexts(map, max) {
  const out = {};
  for (const l of KNOWN) {
    const t = String(map?.[l] ?? "").trim().replace(/\s+/g, " ");
    if (t) out[l] = t.slice(0, max);
  }
  return out;
}

/**
 * Checks the Super Admin's questions for a lesson. Each needs its wording in
 * at least one language; a choice question needs 2 to 6 options, each written
 * in at least one language. Returns { errors, questions } (cleaned).
 */
export function questionErrors(list) {
  const errors = {};
  if (!Array.isArray(list)) return { errors: { questions: "Send a list of questions." }, questions: [] };
  if (list.length > MAX_QUESTIONS) return { errors: { questions: `Keep it to ${MAX_QUESTIONS} questions.` }, questions: [] };
  const questions = list.map((q, i) => {
    const kind = q?.kind === "text" ? "text" : "choice";
    const prompt = cleanTexts(q?.prompt, 300);
    const options = kind === "choice" ? (Array.isArray(q?.options) ? q.options : []).map((o) => cleanTexts(o, 120)).filter((o) => Object.keys(o).length) : null;
    if (!Object.keys(prompt).length) errors[`q${i}`] = `Question ${i + 1}: write the question in at least one language.`;
    else if (kind === "choice" && (options.length < 2 || options.length > MAX_OPTIONS)) errors[`q${i}`] = `Question ${i + 1}: give between 2 and ${MAX_OPTIONS} answers to choose from.`;
    const id = /^[\w-]{6,64}$/.test(String(q?.id ?? "")) ? String(q.id) : uuid();
    return { id, kind, prompt, options, required: q?.required !== false };
  });
  return { errors, questions };
}

/** Replaces a lesson's questions. Questions that keep their id keep their answers. */
export async function saveQuestions(moduleId, questions) {
  await tx(async () => {
    await run("DELETE FROM training_questions WHERE module_id = :m", { m: moduleId });
    for (const [i, q] of questions.entries()) {
      await run(
        "INSERT INTO training_questions (id, module_id, sort, kind, prompt, options, required) VALUES (:id, :m, :s, :k, :p, :o, :r)",
        { id: q.id, m: moduleId, s: i, k: q.kind, p: JSON.stringify(q.prompt), o: q.options ? JSON.stringify(q.options) : null, r: q.required ? 1 : 0 },
      );
    }
  });
}

/**
 * This viewer's part in each lesson: whether they have started watching it,
 * finished it, and answered its feedback (once per lesson, in any language).
 * Returns { [moduleId]: { watched, completed, answered: { language, at } | null } }.
 */
export async function progressFor(viewer, moduleIds) {
  if (!moduleIds.length) return {};
  const views = await all(
    "SELECT module_id, BOOL_OR(completed = 1) AS completed FROM training_views WHERE user_id = :u AND module_id = ANY(:ids::text[]) GROUP BY module_id",
    { u: viewer.id, ids: moduleIds },
  );
  const answers = await all(
    "SELECT module_id, language, submitted_at FROM training_responses WHERE user_id = :u AND module_id = ANY(:ids::text[])",
    { u: viewer.id, ids: moduleIds },
  );
  const out = Object.fromEntries(moduleIds.map((id) => [id, { watched: false, completed: false, answered: null }]));
  for (const v of views) Object.assign(out[v.module_id], { watched: true, completed: Boolean(v.completed) });
  for (const a of answers) out[a.module_id].answered = { language: a.language, at: a.submitted_at };
  return out;
}

/**
 * Saves the viewer's answers to a lesson's feedback. One set per person per
 * lesson: answering in English counts for the lesson in every language.
 * A choice is stored as the option's position, so it means the same in every
 * language. Returns { ok } or { error, errors?, answered? }.
 */
export async function submitFeedback(viewer, moduleId, language, answers = {}) {
  if (!KNOWN.has(language)) return { error: "Choose the language you are answering in." };
  const questions = (await questionsFor([moduleId]))[moduleId] ?? [];
  if (!questions.length) return { error: "This lesson has no feedback questions." };
  const before = await one("SELECT language, submitted_at FROM training_responses WHERE module_id = :m AND user_id = :u", { m: moduleId, u: viewer.id });
  if (before) return { error: "You have already answered the feedback for this lesson.", answered: { language: before.language, at: before.submitted_at } };
  const watched = await one("SELECT 1 FROM training_views WHERE module_id = :m AND user_id = :u LIMIT 1", { m: moduleId, u: viewer.id });
  if (!watched) return { error: "Watch the video first, then answer the feedback questions." };

  const clean = {};
  const errors = {};
  for (const q of questions) {
    const a = answers?.[q.id];
    if (q.kind === "choice") {
      const n = Number(a);
      if (a !== undefined && a !== null && a !== "" && Number.isInteger(n) && n >= 0 && n < (q.options ?? []).length) clean[q.id] = n;
      else if (q.required) errors[q.id] = "Choose an answer.";
    } else {
      const t = String(a ?? "").trim().slice(0, 1000);
      if (t) clean[q.id] = t;
      else if (q.required) errors[q.id] = "Write an answer.";
    }
  }
  if (Object.keys(errors).length) return { error: "Answer every question to finish.", errors };

  try {
    await run(
      `INSERT INTO training_responses (id, module_id, user_id, volunteer_id, person_name, language, answers, submitted_at)
       VALUES (:id, :m, :u, :vol, :name, :l, :a, :now)`,
      { id: uuid(), m: moduleId, u: viewer.id, vol: isVolunteerOnly(viewer) ? volunteerIdOf(viewer) : null, name: viewer.name, l: language, a: JSON.stringify(clean), now: nowIso() },
    );
  } catch (e) {
    if (e.code === "23505") return { error: "You have already answered the feedback for this lesson." };
    throw e;
  }
  return { ok: true };
}

/* ── The Super Admin's report ──────────────────────────────────────────── */

const SESSIONS_SHOWN = 25;

/**
 * Everything the Super Admin sees about each lesson: who watched it (how many
 * times, for how long, the time of each viewing, whether they finished), who
 * downloaded it (the time of each download), and the feedback answers.
 * Returns { [moduleId]: { views, downloads, responses, totals } }.
 */
export async function trainingReport() {
  const person = `MAX(COALESCE(v.first_name || ' ' || v.surname, u.name, x.person_name)) AS name, MAX(v.public_id) AS public_id,
       MAX(v.photo_updated_at) AS photo_updated_at, BOOL_OR(v.photo_thumb_key IS NOT NULL) AS has_photo`;
  const views = await all(
    `SELECT x.module_id, x.volunteer_id, COALESCE(x.volunteer_id, x.user_id) AS who, ${person},
       COUNT(*) AS times, SUM(x.seconds_watched) AS seconds, BOOL_OR(x.completed = 1) AS completed,
       MIN(x.started_at) AS first, MAX(x.last_seen_at) AS last,
       json_agg(json_build_object('at', x.started_at, 'language', x.language, 'seconds', x.seconds_watched,
         'duration', x.duration, 'completed', x.completed = 1) ORDER BY x.started_at DESC) AS sessions
     FROM training_views x
     LEFT JOIN volunteers v ON v.id = x.volunteer_id
     LEFT JOIN users u ON u.id = x.user_id
     GROUP BY x.module_id, x.volunteer_id, COALESCE(x.volunteer_id, x.user_id)
     ORDER BY MAX(x.last_seen_at) DESC`,
  );
  const downloads = await all(
    `SELECT x.module_id, x.volunteer_id, COALESCE(x.volunteer_id, x.user_id) AS who, ${person},
       COUNT(*) AS times, MIN(x.downloaded_at) AS first, MAX(x.downloaded_at) AS last,
       json_agg(json_build_object('at', x.downloaded_at, 'language', x.language) ORDER BY x.downloaded_at DESC) AS sessions
     FROM training_downloads x
     LEFT JOIN volunteers v ON v.id = x.volunteer_id
     LEFT JOIN users u ON u.id = x.user_id
     GROUP BY x.module_id, x.volunteer_id, COALESCE(x.volunteer_id, x.user_id)
     ORDER BY MAX(x.downloaded_at) DESC`,
  );
  const responses = await all(
    `SELECT x.module_id, x.volunteer_id, x.user_id AS who, x.language, x.answers, x.submitted_at,
       COALESCE(v.first_name || ' ' || v.surname, u.name, x.person_name) AS name, v.public_id,
       v.photo_updated_at, v.photo_thumb_key IS NOT NULL AS has_photo
     FROM training_responses x
     LEFT JOIN volunteers v ON v.id = x.volunteer_id
     LEFT JOIN users u ON u.id = x.user_id
     ORDER BY x.submitted_at DESC`,
  );

  const who = (r) => ({
    key: r.who, name: r.name ?? "Unknown", publicId: r.public_id ?? null, volunteerId: r.volunteer_id ?? null,
    isVolunteer: Boolean(r.volunteer_id), hasPhoto: Boolean(r.has_photo), photoUpdatedAt: r.photo_updated_at ?? null,
  });
  const stamp = (t) => (t == null ? t : String(t).replace("T", " ").slice(0, 19));
  const sessions = (raw) => parse(raw, []).slice(0, SESSIONS_SHOWN).map((s) => ({ ...s, at: stamp(s.at) }));
  const out = {};
  const of = (m) => (out[m] ??= { views: [], downloads: [], responses: [] });

  for (const r of views) {
    of(r.module_id).views.push({ ...who(r), times: r.times, seconds: r.seconds ?? 0, completed: Boolean(r.completed), first: r.first, last: r.last, sessions: sessions(r.sessions) });
  }
  for (const r of downloads) {
    of(r.module_id).downloads.push({ ...who(r), times: r.times, first: r.first, last: r.last, sessions: sessions(r.sessions) });
  }
  for (const r of responses) {
    of(r.module_id).responses.push({ ...who(r), language: r.language, answers: parse(r.answers, {}), at: r.submitted_at });
  }
  for (const m of Object.values(out)) {
    m.totals = {
      viewers: m.views.length,
      views: m.views.reduce((n, r) => n + r.times, 0),
      completed: m.views.filter((r) => r.completed).length,
      seconds: m.views.reduce((n, r) => n + r.seconds, 0),
      downloaders: m.downloads.length,
      downloads: m.downloads.reduce((n, r) => n + r.times, 0),
      responses: m.responses.length,
    };
  }
  return out;
}
