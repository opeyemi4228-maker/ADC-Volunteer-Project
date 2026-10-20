import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway database and upload folder for this run.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adc-test-"));
process.env.DATABASE_FILE = path.join(dir, "test.db");
process.env.STORAGE_DIR = path.join(dir, "uploads");
process.env.APP_SECRET = "test-secret-for-unit-tests-only";

let reg, scope, conv, db, geo;
before(async () => {
  reg = await import("../lib/registration.js");
  scope = await import("../lib/scope.js");
  conv = await import("../lib/conversation.js");
  db = await import("../lib/db.js");
  geo = await import("../lib/geo.js");
});

const volunteer = (over = {}) => ({
  about: { first_name: "Chukwuemeka", surname: "Obi", gender: "male", dob: "1992-04-17" },
  vote: { state: "FCT", lga: "FCT-002", ward: "FCT-002-09", pu: "", pu_unknown: true, pvc: "yes" },
  help: { roles: ["mobiliser"], languages: ["english"], availability: "weekends", smartphone: "yes", channel: "sms" },
  consent: { accurate: true, data: true },
  ...over,
});

test("locations must be a real INEC combination (§11)", () => {
  assert.equal(geo.checkLocation({ state: "FCT", lga: "FCT-002", ward: "FCT-002-09" }), null);
  assert.match(geo.checkLocation({ state: "LAG", lga: "FCT-002", ward: "FCT-002-09" }), /LGA/);
  assert.match(geo.checkLocation({ state: "FCT", lga: "FCT-002", ward: "FCT-003-01" }), /ward/);
  const pu = geo.wardUnits("FCT-002-09")[0].code;
  assert.equal(geo.checkLocation({ state: "FCT", lga: "FCT-002", ward: "FCT-002-09", pu }), null);
  assert.match(geo.checkLocation({ state: "FCT", lga: "FCT-002", ward: "FCT-002-01", pu }), /polling unit/);
});

test("under-18s are blocked and every step validates (§6, §11)", () => {
  const young = volunteer({ about: { first_name: "Ada", surname: "Eze", gender: "female", dob: `${new Date().getFullYear() - 16}-01-01` } });
  assert.match(reg.validateVolunteer(young)["about.dob"], /18 or older/);
  assert.deepEqual(reg.validateVolunteer(volunteer(), { channel: "ussd" }), {});
  // The website asks for the phone in step 1 (no code any more).
  assert.match(reg.validateVolunteer(volunteer())["about.phone"], /Nigerian mobile number/);
  const web = volunteer();
  web.about = { ...web.about, phone: "0809 111 0099" };
  assert.deepEqual(reg.validateVolunteer(web), {});
});

test("exact phone match blocks; similar name + same DOB + same ward is flagged (§11)", () => {
  const a = reg.createVolunteer(volunteer(), { phone: "+2348091110001" });
  assert.ok(a.publicId.startsWith("ADC-M-37-"));
  const again = reg.createVolunteer(volunteer(), { phone: "+2348091110001" });
  assert.ok(again.duplicatePhone);
  const b = reg.createVolunteer(volunteer({ about: { first_name: "Chukwuemeka", surname: "Obih", gender: "male", dob: "1992-04-17" } }), { phone: "+2348091110002" });
  const flags = db.all("SELECT * FROM duplicate_flags WHERE entity_id = :id", { id: b.id });
  assert.equal(flags.length, 1);
  assert.equal(flags[0].other_id, a.id);
});

test("phone numbers are never stored in clear (§15)", () => {
  const raw = fs.readFileSync(process.env.DATABASE_FILE).toString("latin1") + (fs.existsSync(`${process.env.DATABASE_FILE}-wal`) ? fs.readFileSync(`${process.env.DATABASE_FILE}-wal`).toString("latin1") : "");
  assert.ok(!raw.includes("+2348091110001"));
  assert.ok(!raw.includes("8091110001"));
});

test("a ward coordinator sees only their ward (§2, §20)", () => {
  reg.createVolunteer(volunteer({ vote: { state: "LAG", lga: "LAG-010", ward: geo.lgaOf("LAG-010").wards[0].code, pu_unknown: true, pvc: "yes" } }), { phone: "+2348091110003" });
  const ward = { id: "w", roles: [{ role: "ward_coordinator", area_type: "ward", area_code: "FCT-002-09" }] };
  const s = scope.scopeSql(ward, "volunteer");
  const seen = db.all(`SELECT vote_ward_code FROM volunteers WHERE ${s.sql}`, s.params);
  assert.ok(seen.length >= 2);
  assert.ok(seen.every((r) => r.vote_ward_code === "FCT-002-09"));
  const nobody = scope.scopeSql({ roles: [] }, "volunteer");
  assert.equal(nobody.sql, "0");
  const admin = scope.scopeSql({ roles: [{ role: "national_admin" }] }, "volunteer");
  assert.equal(admin.sql, "1");
});

test("groups: duplicate names in the same LGA are flagged, join codes are unique", () => {
  const group = (name, phone) => ({
    about: { name, category: "youth", operating_level: "ward", date_formed: "2025-03", size: "51-200" },
    location: { state: "FCT", lga: "FCT-002", ward: "FCT-002-09", areas: [] },
    leaders: [
      { position: "coordinator", first_name: "Abdul", surname: "Musa", phone },
      { position: "secretary", first_name: "Grace", surname: "Nwosu", phone: `${phone.slice(0, -1)}9` },
    ],
    account: { email: `${phone.slice(-4)}@example.com`, password: "kubwa-2027" },
    consent: { accurate: true, data: true },
  });
  assert.deepEqual(reg.validateGroup(group("Kubwa Youth Vanguard", "+2348031230000")), {});
  const weak = group("Weak", "+2348031230009");
  weak.account.password = "12345678";
  assert.match(reg.validateGroup(weak)["account.password"], /letters/);
  const g1 = reg.createGroup(group("Kubwa Youth Vanguard", "+2348031230000"), { registrantPhone: "+2348031230000" });
  const g2 = reg.createGroup(group("Kubwa Youths Vanguard", "+2348031230001"), { registrantPhone: "+2348031230001" });
  assert.notEqual(g1.joinCode, g2.joinCode);
  assert.match(g1.publicId, /^ADC-SG-37-\d{4}$/);
  const flags = db.all("SELECT reason FROM duplicate_flags WHERE entity_id = :id", { id: g2.id });
  assert.ok(flags.some((f) => /Similar name/.test(f.reason)));
  const one = group("Solo", "+2348031230002");
  one.leaders = [one.leaders[0]];
  assert.match(reg.validateGroupStep(3, one).leaders, /other leader/);
});

test("every USSD screen fits in 160 characters (§7.1)", () => {
  const lang = "en";
  for (const s of geo.stateList) {
    for (const l of geo.stateTree(s.code).lgas) {
      const items = l.wards.map((w) => ({ value: w.code, label: w.name }));
      const first = conv.pageOf("Ward where you vote", items, 0, lang);
      for (let p = 0; p < first.pages; p += 1) assert.ok(conv.pageOf("Ward where you vote", items, p, lang).text.length <= 160, `${l.name} page ${p}`);
    }
  }
});

test("USSD registration completes and resumes after a dropped session (§7.1)", () => {
  const phone = "+2348099990001";
  let out = conv.openSession("ussd", phone);
  for (const input of ["1", "Ọlá", "Bello"]) out = conv.answer("ussd", phone, input);
  // The network drops here. Redialling offers to continue.
  out = conv.openSession("ussd", phone);
  assert.match(out.text, /Continue where I stopped/);
  for (const input of ["1", "2", "1995", "0", "0", "0", "0", "1", "3", "6", "1", "1", "0", "1", "1"]) out = conv.answer("ussd", phone, input);
  assert.ok(out.end, out.text);
  assert.match(out.text, /Volunteer ID ADC-M-37-/);
  const v = reg.volunteerByPhone(phone);
  assert.equal(v.registration_channel, "ussd");
  assert.equal(v.vote_ward_code, "FCT-002-09"); // option 6 in Bwari is Kubwa
});

test("membership lists: CSV with quotes and XML are read; rows without a name are skipped", async () => {
  const members = await import("../lib/members.js");
  const csv = members.parseCsv('Full Name,Phone,Gender\n"Bello, Amina",0803 222 3333,Female\nƊahiru Ƙabir,08061112222,Male\n,08000000000,\n');
  const [header, ...rows] = csv;
  const out = members.cleanRecords(rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]]))));
  assert.equal(out.rows.length, 2);
  assert.equal(out.skipped, 1);
  assert.equal(out.rows[0].full_name, "Bello, Amina".replace(",", ",") );
  assert.equal(out.rows[1].phone, "+2348061112222");
  const xml = members.parseXml('<?xml version="1.0"?><members><member><name>Ngozi Eze</name><phone>08031110000</phone></member><member name="Tunde Bello" phone="08031110001"/></members>');
  assert.equal(members.cleanRecords(xml).rows.length, 2);
});

test("certificates are only issued to verified groups, and carry a number", async () => {
  const cert = await import("../lib/certificate.js");
  const g = db.one("SELECT id FROM support_groups LIMIT 1");
  assert.equal(await cert.buildCertificate(g.id), null);
  db.run("UPDATE support_groups SET status = 'verified', verified_at = datetime('now') WHERE id = :id", { id: g.id });
  const c = await cert.buildCertificate(g.id);
  assert.match(c.number, /^ADC-CERT-\d{4}-\d+$/);
  assert.equal(Buffer.from(c.bytes).subarray(0, 5).toString(), "%PDF-");
});
