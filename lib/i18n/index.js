import ha from "./ha.js";
import yo from "./yo.js";
import ig from "./ig.js";
import pcm from "./pcm.js";

/**
 * Interface text (spec §13). Strings are written in English in the code and
 * looked up here by their English text, gettext-style; a string with no
 * translation falls back to English rather than showing a key.
 *
 * The four translation files are first drafts. Every string must be reviewed
 * by a native speaker before launch; `scripts/i18n-missing.mjs` lists the
 * strings each language still lacks.
 */

export const LANGS = [
  { code: "en", label: "English", short: "EN" },
  { code: "ha", label: "Hausa", short: "HA" },
  { code: "yo", label: "Yorùbá", short: "YO" },
  { code: "ig", label: "Igbo", short: "IG" },
  { code: "pcm", label: "Pidgin", short: "PCM" },
];

export const DICTS = { en: {}, ha, yo, ig, pcm };

export const LANG_COOKIE = "adc_lang";

export function normalizeLang(value) {
  return DICTS[value] ? value : "en";
}

export function translate(lang, text, vars) {
  let out = DICTS[lang]?.[text] ?? text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
  return out;
}

/** Bound translator for one language: t("Hello {name}", { name }). */
export function translator(lang) {
  const l = normalizeLang(lang);
  return (text, vars) => translate(l, text, vars);
}
