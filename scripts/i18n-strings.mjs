/**
 * Lists every string passed to t("…") in the site, and which ones each
 * language still lacks.   node scripts/i18n-strings.mjs [--missing ha]
 */
import fs from "node:fs";
import path from "node:path";

const roots = ["app", "components", "lib"];
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|mjs)$/.test(e.name) && !p.includes("lib/i18n/")) files.push(p);
  }
};
roots.forEach(walk);

const strings = new Set();
const re = /\bt\(\s*"((?:[^"\\]|\\.)*)"/g;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(re)) strings.add(JSON.parse(`"${m[1]}"`));
  // Arrays of labels translated later with t(item.label)
  for (const m of src.matchAll(/label: "((?:[^"\\]|\\.)*)"/g)) if (f.includes("site/") || f.includes("(site)")) strings.add(JSON.parse(`"${m[1]}"`));
}
// Option labels and hints (shown through t(o.label) / t(o.hint)).
const options = await import("../lib/options.js");
for (const v of Object.values(options)) {
  if (Array.isArray(v)) for (const o of v) { if (o?.label) strings.add(o.label); if (o?.hint) strings.add(o.hint); }
}
// Validation messages the server sends back and forms show through t().
for (const f of ["lib/registration.js", "lib/auth.js", "lib/storage.js"]) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/(?:error|e\[[^\]]+\])\s*[:=]\s*"([A-Z][^"]{6,})"/g)) strings.add(m[1]);
  for (const m of src.matchAll(/`([A-Z][^`$]{10,}\.)`/g)) strings.add(m[1]);
}
const all = [...strings].sort();
const lang = process.argv[process.argv.indexOf("--missing") + 1];
if (process.argv.includes("--missing")) {
  const dict = (await import(`../lib/i18n/${lang}.js`)).default;
  const missing = all.filter((s) => !dict[s]);
  console.log(JSON.stringify(missing, null, 1));
  console.error(`${missing.length} of ${all.length} strings missing for ${lang}`);
} else {
  console.log(JSON.stringify(all, null, 1));
  console.error(`${all.length} strings`);
}
