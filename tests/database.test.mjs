import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway in-memory Postgres for this run.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adc-db-test-"));
process.env.PGLITE_DIR = "memory://";
process.env.STORAGE_DIR = path.join(dir, "uploads");
process.env.APP_SECRET = "test-secret-for-unit-tests-only";
for (const k of ["DATABASE_URL", "DATABASE_URL_POOLED", "APP_DATABASE_URL"]) delete process.env[k];

let db;
before(async () => {
  db = await import("../lib/db.js");
});
after(() => db.closeDb());

test("named parameters compile to numbered ones; strings, comments and casts are left alone", () => {
  const { text, names } = db.compile("SELECT ':not_a_param', x::text -- :nor_this\nFROM t WHERE a = :a AND b = :b AND c = :a");
  assert.equal(text, "SELECT ':not_a_param', x::text -- :nor_this\nFROM t WHERE a = $1 AND b = $2 AND c = $1");
  assert.deepEqual(names, ["a", "b"]);
});

test("values are always sent separately from the SQL, so input can not change a statement", async () => {
  const evil = "x'); DROP TABLE users; --";
  assert.equal(await db.scalar("SELECT :v::text", { v: evil }), evil);
  assert.ok(await db.scalar("SELECT count(*) FROM users") >= 0, "users table still exists");
});

test("a missing parameter is an error, not a silent NULL", async () => {
  await assert.rejects(db.one("SELECT :a AS a", {}), /parameter :a was not given/);
});

test("the audit log can not be edited, deleted or truncated", async () => {
  await db.run("INSERT INTO audit_log (action) VALUES ('test')");
  await assert.rejects(db.run("UPDATE audit_log SET action = 'changed'"), /append-only/);
  await assert.rejects(db.run("DELETE FROM audit_log"), /append-only/);
  await assert.rejects(db.run("TRUNCATE audit_log"), /append-only/);
  assert.equal(await db.scalar("SELECT count(*) FROM audit_log WHERE action = 'test'"), 1);
});

test("fixed lists are enforced by the database (statuses, roles, flags, JSON)", async () => {
  const user = { id: "u1", n: "Test", pe: "x", ph: "h1", pw: "p" };
  await db.run("INSERT INTO users (id, name, phone_enc, phone_hash, password_hash) VALUES (:id, :n, :pe, :ph, :pw)", user);
  await assert.rejects(db.run("INSERT INTO role_assignments (id, user_id, role, area_type, area_code) VALUES ('r1', 'u1', 'god_mode', 'national', 'NG')"), /check constraint/);
  await assert.rejects(db.run("UPDATE users SET active = 7 WHERE id = 'u1'"), /check constraint/);
  await assert.rejects(db.run("INSERT INTO settings (key, value) VALUES ('k', 'not json')"), /json/i);
  await assert.rejects(db.run("INSERT INTO users (id, name, phone_enc, phone_hash, password_hash) VALUES ('u2', 'Other', 'x', 'h1', 'p')"), /unique/i);
});

test("nobody can approve their own export, even by writing to the table directly", async () => {
  await assert.rejects(
    db.run("INSERT INTO exports (id, kind, filters, requested_by, approved_by, status) VALUES ('e1', 'volunteers', '{}', 'u1', 'u1', 'approved')"),
    /check constraint/,
  );
});

test("a transaction commits everything or nothing", async () => {
  await assert.rejects(db.tx(async () => {
    await db.run("INSERT INTO counters (name, value) VALUES ('tx-test', 1)");
    throw new Error("stop halfway");
  }), /stop halfway/);
  assert.equal(await db.scalar("SELECT count(*) FROM counters WHERE name = 'tx-test'"), 0);
  // Nested calls join the outer transaction.
  await db.tx(async () => {
    await db.run("INSERT INTO counters (name, value) VALUES ('tx-a', 1)");
    await db.tx(() => db.run("INSERT INTO counters (name, value) VALUES ('tx-b', 1)"));
  });
  assert.equal(await db.scalar("SELECT count(*) FROM counters WHERE name IN ('tx-a', 'tx-b')"), 2);
});

test("counters never hand out the same number twice, even under concurrent requests", async () => {
  const got = await Promise.all(Array.from({ length: 50 }, () => db.nextCounter("race")));
  assert.equal(new Set(got).size, 50);
  assert.equal(Math.max(...got), 50);
});

test("timestamps and dates come back in the formats the site uses", async () => {
  const row = await db.one("SELECT :t::timestamptz AS t, :d::date AS d, count(*) AS n FROM users", { t: "2026-11-03 19:52:07", d: "1990-02-03" });
  assert.equal(row.t, "2026-11-03 19:52:07");
  assert.equal(row.d, "1990-02-03");
  assert.equal(typeof row.n, "number");
});
