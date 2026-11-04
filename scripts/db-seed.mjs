/**
 * Loads the demonstration data into the production database, once.
 *
 *   npm run db:seed
 *
 * The data is built in an in-memory Postgres on this machine and then copied
 * across in a single transaction with large batched inserts, so it takes
 * seconds rather than the tens of thousands of round trips building it
 * remotely would need. It is sealed with the production APP_SECRET, so phone
 * numbers decrypt on the live site. Refuses if the database already has
 * accounts: it never overwrites real data.
 */
import { connect, migrate } from "../lib/db.js";

const target = process.env.DATABASE_URL;
if (!target) {
  console.error("DATABASE_URL is not set (see .env.production).");
  process.exit(1);
}
if (!process.env.APP_SECRET) {
  console.error("APP_SECRET is not set. It must be the same secret the live site uses.");
  process.exit(1);
}

const remote = await connect(target);
try {
  await migrate(remote);
  const { rows: [{ n }] } = await remote.query("SELECT count(*)::int AS n FROM users");
  if (n > 0) {
    console.log(`The database already has ${n} account(s). Nothing was changed.`);
    process.exit(0);
  }

  // Build the demo in memory, through the app's own code paths.
  process.env.PGLITE_DIR = "memory://";
  for (const k of ["DATABASE_URL", "DATABASE_URL_POOLED", "APP_DATABASE_URL"]) delete process.env[k];
  const local = await import("../lib/db.js");
  const { seedDemo } = await import("../lib/seed.js");
  const t0 = Date.now();
  await seedDemo({ log: (m) => console.log(`  ${m}`) });
  console.log(`Built in ${((Date.now() - t0) / 1000).toFixed(1)} s. Copying…`);

  // Tables in the order they were created, which respects every foreign key.
  const tables = (await local.all(
    `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'schema_migrations' ORDER BY c.oid`,
  )).map((r) => r.name);

  const t1 = Date.now();
  let total = 0;
  await remote.session(async (s) => {
    await s.query("BEGIN");
    try {
      for (const table of tables) {
        // Identity columns (the audit log's id) are numbered by the target.
        const cols = (await local.all(
          "SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = :t AND is_identity = 'NO' ORDER BY ordinal_position",
          { t: table },
        )).map((r) => r.c);
        const rows = await local.all(`SELECT ${cols.map((c) => `"${c}"`).join(", ")} FROM "${table}"`);
        const batch = Math.max(1, Math.floor(30000 / cols.length));
        for (let i = 0; i < rows.length; i += batch) {
          const chunk = rows.slice(i, i + batch);
          const values = [];
          const tuples = chunk.map((r) => `(${cols.map((c) => { values.push(r[c]); return `$${values.length}`; }).join(", ")})`);
          await s.query(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES ${tuples.join(", ")}`, values);
        }
        total += rows.length;
      }
      await s.query("COMMIT");
    } catch (e) {
      await s.query("ROLLBACK").catch(() => {});
      throw e;
    }
  });
  console.log(`Copied ${total} rows across ${tables.length} tables in ${((Date.now() - t1) / 1000).toFixed(1)} s.`);
  console.log("Demo sign-ins use the password Adc2027!demo. Uploaded demo images stay on this machine (see README, Media files).");
  await local.closeDb();
} finally {
  await remote.end();
}
