import { all, one, run, tx, nowIso } from "./db.js";
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
    `SELECT tv.*, tm.audience FROM training_videos tv JOIN training_modules tm ON tm.id = tv.module_id WHERE tv.id = :id`,
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
