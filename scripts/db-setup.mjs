/**
 * Sets up (or brings up to date) the production database. Run from your own
 * machine with the owner account; safe to run again at any time.
 *
 *   npm run db:setup      migrate + create/refresh the limited app role
 *   npm run db:migrate    migrate only
 *
 * Reads DATABASE_URL (the owner, direct connection) from .env.production.
 *
 * The website never signs in as the owner. It uses `adc_app`, which can read
 * and write rows but can not create, alter or drop anything, can not change
 * or delete audit entries, and can not touch the migration history. Its
 * connection string (through Neon's pooler) is written to .env.production as
 * APP_DATABASE_URL; copy it into your host's environment variables.
 */
import crypto from "node:crypto";
import fs from "node:fs";

import { connect, migrate } from "../lib/db.js";

const APP_ROLE = "adc_app";
const ENV_FILE = ".env.production";
const migrateOnly = process.argv.includes("--migrate-only");

const ownerUrl = process.env.DATABASE_URL;
if (!ownerUrl) {
  console.error(`DATABASE_URL is not set. Add the owner connection string to ${ENV_FILE}.`);
  process.exit(1);
}

const db = await connect(ownerUrl);
try {
  const applied = await migrate(db, { log: (m) => console.log(`  ${m}`) });
  console.log(applied.length ? `Schema up to date (${applied.length} migration(s) applied).` : "Schema already up to date.");
  if (migrateOnly) process.exit(0);

  const { rows: [info] } = await db.query("SELECT current_database() AS db, current_user AS owner");
  const q = (s) => `"${s.replace(/"/g, '""')}"`;

  // A long random password, letters and digits only, so it never needs escaping in a URL.
  const password = crypto.randomBytes(24).toString("base64url").replace(/[-_]/g, "x");
  const exists = (await db.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_ROLE])).rows.length > 0;
  const lit = (s) => `'${s.replace(/'/g, "''")}'`;
  await db.exec(`${exists ? "ALTER" : "CREATE"} ROLE ${APP_ROLE} WITH LOGIN PASSWORD ${lit(password)}
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 200`);

  await db.exec(`
    -- Nobody but the owner creates objects; the app role only uses them.
    REVOKE ALL ON SCHEMA public FROM PUBLIC;
    REVOKE ALL ON DATABASE ${q(info.db)} FROM PUBLIC;
    GRANT CONNECT, TEMPORARY ON DATABASE ${q(info.db)} TO ${APP_ROLE};
    GRANT USAGE ON SCHEMA public TO ${APP_ROLE};

    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE};
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE};
    -- The audit log only grows; the migration history is read-only.
    REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM ${APP_ROLE};
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON schema_migrations FROM ${APP_ROLE};
    REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM ${APP_ROLE};

    -- Tables added by later migrations get the same rights automatically.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${APP_ROLE};

    -- Guard rails on every app session: no runaway query, no transaction left
    -- holding locks, no long wait for a lock, and times always in UTC.
    ALTER ROLE ${APP_ROLE} SET statement_timeout = '20s';
    ALTER ROLE ${APP_ROLE} SET lock_timeout = '5s';
    ALTER ROLE ${APP_ROLE} SET idle_in_transaction_session_timeout = '30s';
    ALTER ROLE ${APP_ROLE} SET timezone = 'UTC';
    ALTER ROLE ${APP_ROLE} SET search_path = public;
    ALTER DATABASE ${q(info.db)} SET timezone = 'UTC';
  `);
  // Migrations re-run by this script after an audit_log change must keep it closed.
  await db.exec(`REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM ${APP_ROLE}`);

  // The app connects through the pooler (many short-lived server instances, few real connections).
  const pooled = new URL(process.env.DATABASE_URL_POOLED || ownerUrl);
  pooled.username = APP_ROLE;
  pooled.password = password;
  pooled.searchParams.set("sslmode", "verify-full");
  pooled.searchParams.delete("channel_binding");
  const appUrl = pooled.toString();

  let env = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8") : "";
  const line = `APP_DATABASE_URL="${appUrl}"`;
  env = /^APP_DATABASE_URL=.*$/m.test(env) ? env.replace(/^APP_DATABASE_URL=.*$/m, line) : `${env.trimEnd()}\n\n# The website's own limited account (written by npm run db:setup).\n${line}\n`;
  fs.writeFileSync(ENV_FILE, env, { mode: 0o600 });

  // Prove the new account works, and that it is as limited as intended.
  const app = await connect(appUrl);
  try {
    const { rows: [me] } = await app.query("SELECT current_user AS who, current_setting('statement_timeout') AS st, current_setting('TimeZone') AS tz");
    const probes = {
      "change the schema": "CREATE TABLE should_not_exist (x int)",
      "edit the audit log": "UPDATE audit_log SET action = action WHERE false",
      "delete audit entries": "DELETE FROM audit_log WHERE false",
      "rewrite migration history": "DELETE FROM schema_migrations WHERE false",
    };
    console.log(`\nApp account "${me.who}" works (statement timeout ${me.st}, time zone ${me.tz}). It can not:`);
    for (const [what, sql] of Object.entries(probes)) {
      const blocked = await app.query(sql).then(() => false, () => true);
      console.log(`  ${blocked ? "✓" : "✗ STILL ALLOWED:"} ${what}`);
      if (!blocked) process.exitCode = 1;
    }
  } finally {
    await app.end();
  }
  console.log(`\n${exists ? "Rotated" : "Created"} the password for ${APP_ROLE} and saved APP_DATABASE_URL in ${ENV_FILE}.`);
  console.log("Next: set APP_DATABASE_URL (and APP_SECRET, SITE_URL) in your host's environment variables, then redeploy.");
} finally {
  await db.end();
}
