/**
 * Empties the database for launch: removes every volunteer, group, account,
 * task, activity, photo and message, keeps the schema, system settings and
 * the append-only audit log (the reset is recorded in it), and creates the first Super Admin account so someone can sign in
 * and run the system.
 *
 *   npm run clean          the local development database (stop `npm run dev` first)
 *   npm run db:clean       the production database (.env.production, owner account)
 *
 * Asks for the Super Admin's name, phone number, email (optional) and
 * password, then for the word DELETE before anything is removed. It cannot be
 * undone: take a backup first if any of the data might be real.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import { connect, migrate } from "../lib/db.js";
import { seal, blind, uuid, hashPassword } from "../lib/crypto.js";
import { normalizePhone, normalizeEmail, passwordProblem } from "../lib/validate.js";

const target = process.env.DATABASE_URL || null;
if (target && !process.env.APP_SECRET) {
  console.error("APP_SECRET is not set. It must be the same secret the live site uses, or the admin's phone number will not decrypt.");
  process.exit(1);
}
const where = target ? `the PRODUCTION database (${new URL(target).hostname})` : "the local development database (data/pglite)";

/* ── Prompts ───────────────────────────────────────────────────────────── */

// Lines are queued, so answers piped in all at once are not lost.
const tty = Boolean(process.stdin.isTTY);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: tty });
const lines = rl[Symbol.asyncIterator]();
let muted = false; // typed passwords are not echoed
rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); };
async function line(q, hidden = false) {
  process.stdout.write(q);
  muted = hidden && tty;
  const { value, done } = await lines.next();
  if (muted) process.stdout.write("\n");
  muted = false;
  if (done) {
    console.log("\nNo answer given. Nothing was changed.");
    process.exit(1);
  }
  if (!tty) process.stdout.write(hidden ? "\n" : `${value}\n`);
  return value;
}
const ask = async (q) => (await line(q)).trim();
const secret = (q) => line(q, true);
async function until(q, check, hidden = false) {
  for (;;) {
    const a = hidden ? await secret(q) : await ask(q);
    const r = check(a);
    if (r.ok) return r.value;
    console.log(`  ${r.error}`);
  }
}

console.log(`\nThis removes ALL data from ${where}`);
console.log("and creates one Super Admin account. The schema, system settings and audit log are kept.\n");

const name = await until("Super Admin name (e.g. ADC Supervising Body): ", (a) => (a.length >= 3 ? { ok: true, value: a } : { ok: false, error: "Enter at least 3 characters." }));
const phone = await until("Super Admin phone number (sign-in codes go here): ", (a) => {
  const p = normalizePhone(a);
  return p ? { ok: true, value: p } : { ok: false, error: "Enter a Nigerian mobile number, e.g. 0803 123 4567." };
});
const email = await until("Email (optional, press Enter to skip): ", (a) => {
  if (!a) return { ok: true, value: null };
  const e = normalizeEmail(a);
  return e ? { ok: true, value: e } : { ok: false, error: "That doesn't look like an email address." };
});
const password = await until("Password (at least 8 characters): ", (a) => {
  const problem = passwordProblem(a);
  return problem ? { ok: false, error: problem } : { ok: true, value: a };
}, true);
await until("Type the password again: ", (a) => (a === password ? { ok: true } : { ok: false, error: "The passwords don't match." }), true);
const confirm = await ask(`\nType DELETE to empty ${where}: `);
rl.close();
if (confirm !== "DELETE") {
  console.log("Nothing was changed.");
  process.exit(0);
}

/* ── Clean ─────────────────────────────────────────────────────────────── */

let db;
try {
  db = await connect(target);
} catch (e) {
  console.error(target ? `Could not connect: ${e.message}` : `Could not open the local database. Stop \`npm run dev\` first, then try again.\n(${e.message})`);
  process.exit(1);
}
await migrate(db);

// The audit log is append-only by design (a trigger refuses deletes), so it
// is kept: its old entries name demo accounts but hold no personal data, and
// the reset itself is recorded in it.
const KEEP = new Set(["schema_migrations", "settings", "audit_log"]);
const tables = (await db.query(
  "SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
)).rows.map((r) => r.t).filter((t) => !KEEP.has(t));

const before = {};
for (const t of ["users", "volunteers", "support_groups", "media_items", "activities", "tasks"]) {
  if (tables.includes(t)) before[t] = Number((await db.query(`SELECT count(*) AS n FROM "${t}"`)).rows[0].n);
}

await db.session(async (s) => {
  await s.query("BEGIN");
  try {
    await s.query(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
    const id = uuid();
    await s.query(
      "INSERT INTO users (id, name, phone_enc, phone_hash, email_enc, email_hash, password_hash) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [id, name, seal(phone), blind(phone), email ? seal(email) : null, email ? blind(email) : null, hashPassword(password)],
    );
    await s.query(
      "INSERT INTO role_assignments (id, user_id, role, area_type, area_code) VALUES ($1, $2, 'super_admin', 'national', 'NG')",
      [uuid(), id],
    );
    await s.query(
      "INSERT INTO audit_log (actor, actor_name, action, entity, entity_id, details) VALUES ($1, $2, 'system_reset', 'user', $1, $3)",
      [id, name, JSON.stringify({ removed: before })],
    );
    await s.query("COMMIT");
  } catch (e) {
    await s.query("ROLLBACK").catch(() => {});
    throw e;
  }
});
await db.end();

// Local uploads belong to the removed records.
if (!target) {
  const uploads = process.env.STORAGE_DIR ?? path.join(process.cwd(), "data", "uploads");
  fs.rmSync(uploads, { recursive: true, force: true });
}

console.log(`\nDone. Removed ${Object.entries(before).map(([t, n]) => `${n} ${t}`).join(", ")}.`);
console.log(`Sign in at /signin with ${phone}${email ? ` or ${email}` : ""} and your password.`);
