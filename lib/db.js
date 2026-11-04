import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";

import { DATA_DIR } from "./paths.js";
import { MIGRATIONS } from "./migrations.js";

/**
 * The database: PostgreSQL.
 *
 *   Production   Neon (or any Postgres) through a connection pool, signed in
 *                as a limited app role that can read and write rows but can
 *                not change the schema (see scripts/db-setup.mjs).
 *   Development  An embedded Postgres (PGlite) in data/pglite, so the site
 *                runs with nothing to install and never touches live data.
 *   Tests        The same embedded Postgres, in memory.
 *
 * All three run the same SQL. Queries keep named parameters (:name), which
 * are compiled to $1, $2 … and always sent separately from the SQL text, so
 * nothing a person types is ever spliced into a statement.
 *
 * Phone numbers and emails are never stored in clear: *_enc holds the sealed
 * value and *_hash a keyed hash for lookups (see lib/crypto.js).
 */

const SCHEMA_LOCK = 727_001; // pg_advisory_lock key: one migrator at a time

/* ── Connection settings ───────────────────────────────────────────────── */

/** The URL the website connects with: the limited app role first, the pooler next. */
export function runtimeUrl() {
  return process.env.APP_DATABASE_URL || process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL || null;
}

function pgliteDir() {
  if (process.env.PGLITE_DIR) return process.env.PGLITE_DIR;
  return path.join(/* turbopackIgnore: true */ DATA_DIR, "pglite");
}

/*
 * Postgres returns counts as 64-bit integers and timestamps as Date objects.
 * The site works with plain numbers and "YYYY-MM-DD HH:MM:SS" UTC strings
 * (the format nowIso() writes), so values read back are converted once here.
 * JSON columns come back as their text, exactly as they were written.
 */
const OID = { int8: 20, numeric: 1700, date: 1082, timestamp: 1114, timestamptz: 1184, json: 114, jsonb: 3802 };
const asTimestamp = (v) => (v == null ? v : String(v).replace("T", " ").slice(0, 19));
const PARSERS = {
  [OID.int8]: (v) => (v == null ? v : Number(v)),
  [OID.numeric]: (v) => (v == null ? v : Number(v)),
  [OID.date]: (v) => v,
  [OID.timestamp]: asTimestamp,
  [OID.timestamptz]: asTimestamp,
  [OID.json]: (v) => v,
  [OID.jsonb]: (v) => v,
};

/* ── Drivers ───────────────────────────────────────────────────────────── */

const g = globalThis;

async function pgDriver(url) {
  const { default: pg } = await import("pg");
  // Certificates are always checked in full (verify-full), whatever sslmode the URL says.
  const u = new URL(url);
  const channelBinding = u.searchParams.get("channel_binding") === "require";
  for (const k of ["sslmode", "channel_binding", "uselibpqcompat"]) u.searchParams.delete(k);
  const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
  const pool = new pg.Pool({
    connectionString: u.toString(),
    ssl: local && process.env.DATABASE_SSL === "0" ? false : { rejectUnauthorized: true },
    enableChannelBinding: channelBinding,
    max: Number(process.env.DB_POOL_MAX) || 10,
    idleTimeoutMillis: 10_000,
    // Neon pauses idle databases; waking one can take a few seconds.
    connectionTimeoutMillis: 15_000,
    query_timeout: Number(process.env.DB_QUERY_TIMEOUT_MS) || 30_000,
    keepAlive: true,
    application_name: "adc-volunteers",
    types: { getTypeParser: (oid, format) => PARSERS[oid] ?? pg.types.getTypeParser(oid, format) },
  });
  // A connection dropped while idle must not crash the server; the pool replaces it.
  pool.on("error", (e) => console.error("[db] idle connection closed:", e.message));
  return {
    kind: "postgres",
    query: (text, values) => pool.query(text, values),
    exec: (text) => pool.query(text),
    async session(fn) {
      const client = await pool.connect();
      let broken = null;
      try {
        return await fn({ query: (t, v) => client.query(t, v), exec: (t) => client.query(t) });
      } catch (e) {
        if (isTransient(e)) broken = e;
        throw e;
      } finally {
        client.release(broken ?? undefined);
      }
    },
    end: () => pool.end(),
  };
}

async function pgliteDriver(dir) {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = await PGlite.create(dir === "memory://" ? undefined : dir, { parsers: PARSERS });
  await db.exec("SET TIME ZONE 'UTC'");
  const wrap = (t) => ({
    query: async (text, values) => {
      const r = await t.query(text, values);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
    exec: (text) => t.exec(text),
  });
  const root = wrap(db);
  return {
    kind: "pglite",
    query: root.query,
    exec: root.exec,
    // One connection: a "session" is the database itself; transactions use PGlite's own API.
    session: (fn) => fn(root),
    transaction: (fn) => db.transaction((t) => fn(wrap(t))),
    end: () => db.close(),
  };
}

/** The driver, created once per process and shared across hot reloads. */
function driver() {
  if (!g.__adcDb) {
    g.__adcDb = (async () => {
      const url = runtimeUrl();
      if (!url && process.env.NODE_ENV === "production" && !process.env.PGLITE_DIR) {
        throw new Error("DATABASE_URL (or APP_DATABASE_URL) must be set in production. See README, Database.");
      }
      const d = url ? await pgDriver(url) : await pgliteDriver(pgliteDir());
      // The embedded database is ours to set up. A real server is migrated by
      // `npm run db:migrate` with the owner account; the app role cannot change
      // the schema, so it only checks that the schema is current.
      if (d.kind === "pglite") await migrate(d);
      else await checkSchema(d);
      return d;
    })().catch((e) => {
      g.__adcDb = null; // let the next request try again
      throw e;
    });
    g.__adcDbSchema = MIGRATIONS.at(-1).id;
  } else if (g.__adcDbSchema !== MIGRATIONS.at(-1).id) {
    // Hot reload brought in a new migration: the cached embedded database
    // must catch up, or queries hit columns it does not have yet.
    g.__adcDbSchema = MIGRATIONS.at(-1).id;
    g.__adcDb = g.__adcDb.then(async (d) => {
      if (d.kind === "pglite") await migrate(d);
      return d;
    }).catch((e) => {
      g.__adcDb = null;
      g.__adcDbSchema = null;
      throw e;
    });
  }
  return g.__adcDb;
}

/* ── Named parameters ──────────────────────────────────────────────────── */

const compiled = new Map();

/**
 * ":name" -> "$n". String literals, quoted identifiers, comments and "::"
 * casts are left alone. A repeated name reuses its number.
 */
export function compile(sql) {
  let hit = compiled.get(sql);
  if (hit) return hit;
  const names = [];
  const seen = new Map();
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) { j += 2; continue; }
          break;
        }
        j += 1;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      const j = end < 0 ? sql.length : end;
      out += sql.slice(i, j);
      i = j;
      continue;
    }
    if (c === ":") {
      if (sql[i + 1] === ":") { out += "::"; i += 2; continue; }
      const m = /^[A-Za-z_]\w*/.exec(sql.slice(i + 1, i + 65));
      if (m && !/\w/.test(sql[i - 1] ?? "")) {
        if (!seen.has(m[0])) { names.push(m[0]); seen.set(m[0], names.length); }
        out += `$${seen.get(m[0])}`;
        i += 1 + m[0].length;
        continue;
      }
    }
    out += c;
    i += 1;
  }
  hit = { text: out, names };
  if (compiled.size > 5000) compiled.clear();
  compiled.set(sql, hit);
  return hit;
}

function bind(names, params) {
  return names.map((n) => {
    if (!Object.hasOwn(params, n)) throw new Error(`SQL parameter :${n} was not given.`);
    const v = params[n];
    if (v === undefined) return null;
    // Flags are stored as 0/1, so true/false can be passed straight through.
    if (typeof v === "boolean") return v ? 1 : 0;
    return v;
  });
}

/* ── Resilience ────────────────────────────────────────────────────────── */

const TRANSIENT_CODES = new Set([
  "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "EAI_AGAIN", "ENOTFOUND",
  "57P01", "57P02", "57P03", // server shutting down / restarting / not yet accepting
  "08000", "08001", "08003", "08004", "08006", // connection failures
  "53300", // too many connections
]);
const TRANSIENT_TEXT = /Connection terminated|timeout exceeded when trying to connect|Couldn't connect to compute node|terminating connection|connection is insecure|Client has encountered a connection error/i;

export function isTransient(e) {
  return TRANSIENT_CODES.has(e?.code) || TRANSIENT_TEXT.test(e?.message ?? "");
}
const RETRY_TX = new Set(["40001", "40P01"]); // serialization failure, deadlock
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Retries a step that failed because the connection did, not because of the query. */
async function withRetry(step, attempts = 4) {
  for (let n = 1; ; n += 1) {
    try {
      return await step();
    } catch (e) {
      if (n >= attempts || !isTransient(e)) throw e;
      await sleep(250 * 3 ** (n - 1)); // 250ms, 750ms, 2.25s
    }
  }
}

/* ── Queries ───────────────────────────────────────────────────────────── */

// The transaction a query belongs to, if any. Set by tx(); nested calls join it.
const current = new AsyncLocalStorage();

async function query(sql, params = {}) {
  const { text, names } = compile(sql);
  const values = bind(names, params);
  const t = current.getStore();
  try {
    if (t) return await t.query(text, values);
    return await withRetry(async () => (await driver()).query(text, values));
  } catch (e) {
    // Name the statement in the server log so a failure can be traced. Only
    // the SQL text, never the values: those can be personal data.
    if (!isTransient(e) && !e.logged) {
      e.logged = true;
      console.error(`[db] ${e.code ?? "error"}: ${e.message}\n  in: ${text.replace(/\s+/g, " ").slice(0, 400)}`);
    }
    throw e;
  }
}

export async function all(sql, params = {}) {
  return (await query(sql, params)).rows;
}

export async function one(sql, params = {}) {
  return (await query(sql, params)).rows[0] ?? null;
}

export async function run(sql, params = {}) {
  const r = await query(sql, params);
  return { changes: r.rowCount ?? 0 };
}

export async function scalar(sql, params = {}) {
  const row = (await query(sql, params)).rows[0];
  return row ? Object.values(row)[0] : null;
}

/**
 * Runs fn inside one transaction: everything in it commits together or not at
 * all. Nested calls join the outer transaction. A transaction that lost a
 * race with another (deadlock or serialization failure) is retried whole.
 */
export async function tx(fn) {
  if (current.getStore()) return fn();
  const d = await driver();
  for (let n = 1; ; n += 1) {
    try {
      if (d.transaction) return await d.transaction((t) => current.run(t, fn));
      return await withRetry(() => d.session(async (s) => {
        await s.query("BEGIN");
        try {
          const out = await current.run(s, fn);
          await s.query("COMMIT");
          return out;
        } catch (e) {
          await s.query("ROLLBACK").catch(() => {});
          throw e;
        }
      }), 2);
    } catch (e) {
      if (n >= 3 || !RETRY_TX.has(e?.code)) throw e;
      await sleep(50 * n);
    }
  }
}

/** Atomic sequence, e.g. next group number within a state. One statement, so two requests never get the same number. */
export async function nextCounter(name, start = 1) {
  return scalar(
    `INSERT INTO counters (name, value) VALUES (:name, :start)
     ON CONFLICT (name) DO UPDATE SET value = counters.value + 1
     RETURNING value`,
    { name, start },
  );
}

export async function getSetting(key, fallback = null) {
  const row = await one("SELECT value FROM settings WHERE key = :key", { key });
  return row ? JSON.parse(row.value) : fallback;
}

export async function setSetting(key, value) {
  await run("INSERT INTO settings (key, value) VALUES (:key, :value) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", {
    key,
    value: JSON.stringify(value),
  });
}

export const nowIso = () => new Date().toISOString().replace("T", " ").slice(0, 19);

/** Which database this process uses, for health checks and scripts. */
export async function dbInfo() {
  const d = await driver();
  const version = await scalar("SELECT max(id) FROM schema_migrations");
  return { kind: d.kind, schema: version, latest: MIGRATIONS.at(-1).id };
}

/** Closes the connection (scripts and tests). */
export async function closeDb() {
  if (!g.__adcDb) return;
  const d = await g.__adcDb.catch(() => null);
  g.__adcDb = null;
  await d?.end();
}

/* ── Schema ────────────────────────────────────────────────────────────── */

/**
 * Applies every migration not yet recorded, each in its own transaction,
 * holding an advisory lock so two processes never migrate at once.
 * Migrations are append-only: a released one is never edited.
 */
export async function migrate(d, { log = () => {} } = {}) {
  return d.session(async (s) => {
    await s.query(`SELECT pg_advisory_lock(${SCHEMA_LOCK})`);
    try {
      await s.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
      const done = new Set((await s.query("SELECT id FROM schema_migrations")).rows.map((r) => r.id));
      const applied = [];
      for (const m of MIGRATIONS) {
        if (done.has(m.id)) continue;
        await s.query("BEGIN");
        try {
          await s.exec(m.sql);
          await s.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
          await s.query("COMMIT");
        } catch (e) {
          await s.query("ROLLBACK").catch(() => {});
          throw new Error(`Migration ${m.id} failed: ${e.message}`, { cause: e });
        }
        applied.push(m.id);
        log(`applied ${m.id}`);
      }
      return applied;
    } finally {
      await s.query(`SELECT pg_advisory_unlock(${SCHEMA_LOCK})`).catch(() => {});
    }
  });
}

async function checkSchema(d) {
  const latest = MIGRATIONS.at(-1).id;
  let have = null;
  try {
    have = (await d.query("SELECT max(id) AS v FROM schema_migrations")).rows[0]?.v ?? null;
  } catch (e) {
    if (e.code !== "42P01") throw e; // anything but "table does not exist"
  }
  if (have !== latest) {
    throw new Error(`The database schema is ${have ? `at ${have}` : "missing"}; this release needs ${latest}. Run \`npm run db:migrate\` before deploying.`);
  }
}

/** For scripts: a driver on an explicit URL (the owner account), outside the app's shared pool. */
export async function connect(url) {
  return url ? pgDriver(url) : pgliteDriver(pgliteDir());
}
