/**
 * Creates (or updates) the national Super Admin in the production database.
 * Safe to run again: an existing account with that phone gets the new
 * password and the super_admin role, nothing else changes.
 *
 *   npm run admin:create -- <phone> <password> ["Display name"]
 *
 * Reads DATABASE_URL (owner) and APP_SECRET from .env.production. APP_SECRET
 * must be the one the live site uses, or the phone number won't decrypt there.
 */
import { connect, migrate } from "../lib/db.js";
import { seal, blind, hashPassword, uuid } from "../lib/crypto.js";
import { normalizePhone } from "../lib/validate.js";

const [rawPhone, password, name = "ADC Supervising Body"] = process.argv.slice(2);
const phone = normalizePhone(rawPhone);
if (!phone || !password) {
  console.error('Usage: npm run admin:create -- <phone> <password> ["Display name"]');
  process.exit(1);
}
if (String(password).length < 8) {
  console.error("Use a password of at least 8 characters.");
  process.exit(1);
}
if (!process.env.DATABASE_URL || !process.env.APP_SECRET) {
  console.error("DATABASE_URL and APP_SECRET must be set (see .env.production).");
  process.exit(1);
}

const db = await connect(process.env.DATABASE_URL);
try {
  const applied = await migrate(db, { log: (m) => console.log(`  ${m}`) });
  console.log(applied.length ? `Schema brought up to date (${applied.length} migration(s)).` : "Schema already up to date.");

  const { rows: [existing] } = await db.query("SELECT id FROM users WHERE phone_hash = $1", [blind(phone)]);
  const id = existing?.id ?? uuid();
  if (existing) {
    await db.query("UPDATE users SET password_hash = $1, active = 1, name = $2 WHERE id = $3", [hashPassword(password), name, id]);
  } else {
    await db.query(
      "INSERT INTO users (id, name, phone_enc, phone_hash, password_hash) VALUES ($1, $2, $3, $4, $5)",
      [id, name, seal(phone), blind(phone), hashPassword(password)],
    );
  }
  const { rows: [role] } = await db.query("SELECT 1 FROM role_assignments WHERE user_id = $1 AND role = 'super_admin'", [id]);
  if (!role) {
    await db.query(
      "INSERT INTO role_assignments (id, user_id, role, area_type, area_code) VALUES ($1, $2, 'super_admin', 'national', 'NG')",
      [uuid(), id],
    );
  }
  console.log(`${existing ? "Updated" : "Created"} Super Admin ${rawPhone} (${name}).`);
} finally {
  await db.end();
}
