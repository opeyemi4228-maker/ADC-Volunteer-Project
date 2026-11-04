import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

// A throwaway in-memory Postgres and upload folder for this run.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adc-dir-test-"));
process.env.PGLITE_DIR = "memory://";
for (const k of ["DATABASE_URL", "DATABASE_URL_POOLED", "APP_DATABASE_URL"]) delete process.env[k];
process.env.STORAGE_DIR = path.join(dir, "uploads");
process.env.APP_SECRET = "test-secret-for-unit-tests-only";

let reg, data, scope, exp, geo, db;
after(() => db?.closeDb());
before(async () => {
  db = await import("../lib/db.js");
  reg = await import("../lib/registration.js");
  data = await import("../lib/workspace-data.js");
  scope = await import("../lib/scope.js");
  exp = await import("../lib/volunteer-export.js");
  geo = await import("../lib/geo.js");

  const lagWard = geo.lgaOf("LAG-010").wards[0].code;
  const people = [
    ["Chukwuemeka", "Obi", "male", "1992-04-17", "FCT-002-09", ["pu_agent"], "+2348091110001"],
    ["Fatima", "Abdullahi", "female", "2004-09-03", "FCT-002-09", ["mobiliser"], "+2348091110002"],
    ["Adebayo", "=SUM(A1)", "male", "1960-01-01", "FCT-002-09", ["canvasser"], "+2348091110003"],
    ["Ngozi", "Eze", "female", "1985-06-11", lagWard, ["pu_agent", "legal"], "+2348091110004"],
  ];
  for (const [first, surname, gender, dob, ward, roles, phone] of people) {
    const out = await reg.createVolunteer({
      about: { first_name: first, surname, gender, dob },
      vote: { state: ward.slice(0, 3), lga: ward.slice(0, 7), ward, pu: "", pu_unknown: true, pvc: "yes" },
      help: { roles, languages: ["english"], availability: "weekends", smartphone: "yes", channel: "sms" },
      consent: { accurate: true, data: true },
    }, { phone });
    assert.ok(out.id, out.error);
  }
});

const asViewer = (role, area_code) => {
  const roles = [{ role, area_code }];
  return { id: role, name: `Test ${role}`, roles, powers: scope.powersFor(roles) };
};

test("directory filters: role, gender, age band, area and phone search", async () => {
  const admin = asViewer("national_admin", "NG");
  assert.equal((await data.volunteerRows(admin, {})).total, 4);
  assert.equal((await data.volunteerRows(admin, { role: "pu_agent" })).total, 2);
  assert.equal((await data.volunteerRows(admin, { gender: "female" })).total, 2);
  assert.equal((await data.volunteerRows(admin, { age: "18-24" })).rows[0].first_name, "Fatima");
  assert.equal((await data.volunteerRows(admin, { age: "60+" })).rows[0].first_name, "Adebayo");
  assert.equal((await data.volunteerRows(admin, { area: "LAG" })).total, 1);
  assert.equal((await data.volunteerRows(admin, { area: "NC" })).total, 3); // FCT is in North Central
  // Any way of writing the number finds the person, through the keyed hash.
  assert.equal((await data.volunteerRows(admin, { q: "0809 111 0002" })).rows[0].surname, "Abdullahi");
  assert.equal((await data.volunteerRows(admin, { q: "Eze Ngozi" })).total, 1);
  const sorted = (await data.volunteerRows(admin, { sort: "name" })).rows.map((r) => r.surname);
  assert.deepEqual(sorted, [...sorted].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
});

test("summary counts every status for the tabs but follows the other filters", async () => {
  const admin = asViewer("national_admin", "NG");
  const s = await data.volunteerSummary(admin, { status: "verified", area: "FCT" });
  assert.equal(s.all, 3);
  assert.equal(s.byStatus.pending, 3);
  assert.equal(s.total, 0);
});

test("a ward coordinator's download holds only their ward, even when asking for another", async () => {
  const ward = asViewer("ward_coordinator", "FCT-002-09");
  const mine = await exp.volunteerFile(ward, {}, { format: "csv", ref: "t" });
  assert.equal(mine.count, 3);
  const elsewhere = await exp.volunteerFile(ward, { area: "LAG" }, { format: "csv", ref: "t" });
  assert.equal(elsewhere.count, 0);
});

test("CSV downloads: UTF-8 mark, watermark on every row, formulas neutralised", async () => {
  const admin = asViewer("national_admin", "NG");
  const f = await exp.volunteerFile(admin, { area: "FCT" }, { columns: "public_id,surname,phone", format: "csv", ref: "t" });
  assert.ok(f.body.startsWith("﻿# Exported for Test national_admin"));
  const lines = f.body.trim().split("\n");
  assert.equal(lines[1], "Volunteer ID,Surname,Phone,Exported for");
  assert.equal(lines.length, 2 + 3);
  assert.ok(lines.slice(2).every((l) => l.endsWith(",Test national_admin")));
  // Registration rejects such names; free-text fields still reach the file, so escaping is the second line of defence.
  assert.match(f.body, /,'=sum\(a1\),/i);
  assert.doesNotMatch(f.body, /,=sum/i);
  assert.ok(f.personal);
});

test("Excel downloads are a valid workbook with the rows and an About sheet", async () => {
  const admin = asViewer("national_admin", "NG");
  const f = await exp.volunteerFile(admin, {}, { columns: "public_id,first_name,age", format: "xlsx", ref: "t" });
  const buf = f.body;
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  // Walk the zip's local headers and inflate each part.
  const parts = {};
  for (let at = 0; buf.readUInt32LE(at) === 0x04034b50;) {
    const size = buf.readUInt32LE(at + 18);
    const nameLen = buf.readUInt16LE(at + 26);
    const name = buf.subarray(at + 30, at + 30 + nameLen).toString();
    const start = at + 30 + nameLen + buf.readUInt16LE(at + 28);
    parts[name] = zlib.inflateRawSync(buf.subarray(start, start + size)).toString();
    at = start + size;
  }
  assert.ok(parts["[Content_Types].xml"] && parts["xl/workbook.xml"] && parts["xl/styles.xml"]);
  const sheet = parts["xl/worksheets/sheet1.xml"];
  assert.equal((sheet.match(/<row /g) ?? []).length, 1 + 4);
  assert.match(sheet, /<autoFilter ref="A1:D5"\/>/);
  assert.match(sheet, /<c r="C2"><v>\d+<\/v><\/c>/); // age stays a number
  assert.match(parts["xl/worksheets/sheet2.xml"], /Exported for/);
});
