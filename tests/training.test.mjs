import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway in-memory Postgres and upload folder for this run.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adc-training-test-"));
process.env.PGLITE_DIR = "memory://";
process.env.STORAGE_DIR = path.join(dir, "uploads");
process.env.APP_SECRET = "test-secret-for-unit-tests-only";
for (const k of ["DATABASE_URL", "DATABASE_URL_POOLED", "APP_DATABASE_URL"]) delete process.env[k];

let db, reg, training, scope, options;
const superAdmin = { id: "sa", name: "ADC Supervising Body", roles: [{ role: "super_admin", area_type: "national", area_code: "NG" }] };
const coordinator = { id: "wc", name: "Ward Coordinator", roles: [{ role: "ward_coordinator", area_type: "ward", area_code: "FCT-002-09" }] };
let opeyemi;

const volunteerViewer = (v) => ({ id: `u-${v.id}`, name: "Opeyemi", roles: [{ role: "volunteer", area_type: "volunteer", area_code: v.id }], powers: ["volunteer"] });

before(async () => {
  db = await import("../lib/db.js");
  reg = await import("../lib/registration.js");
  training = await import("../lib/training.js");
  scope = await import("../lib/scope.js");
  options = await import("../lib/options.js");
  superAdmin.powers = scope.powersFor(superAdmin.roles);
  coordinator.powers = scope.powersFor(coordinator.roles);
  for (const u of [superAdmin, coordinator]) {
    await db.run("INSERT INTO users (id, name, phone_enc, phone_hash, password_hash) VALUES (:id, :n, 'x', :h, 'x')", { id: u.id, n: u.name, h: `h-${u.id}` });
  }
  const v = await reg.createVolunteer({
    about: { first_name: "Opeyemi", surname: "Test", gender: "male", dob: "1990-01-01" },
    vote: { state: "FCT", lga: "FCT-002", ward: "FCT-002-09", pu: "", pu_unknown: true, pvc: "yes" },
    help: { roles: ["mobiliser"], languages: ["english", "yoruba"], availability: "weekends", smartphone: "yes", channel: "whatsapp" },
    consent: { accurate: true, data: true },
  }, { phone: "+2348091112201" });
  opeyemi = volunteerViewer(v);

  // Three lessons: one in English, Yoruba and Hausa; one in Hausa only; one for coordinators only.
  const lesson = async (id, title, audience, langs) => {
    await db.run("INSERT INTO training_modules (id, title, audience) VALUES (:id, :t, :a)", { id, t: title, a: audience });
    for (const l of langs) {
      await db.run("INSERT INTO training_videos (id, module_id, language, kind, external_url) VALUES (:id, :m, :l, 'link', 'https://youtu.be/abcdefghijk')", { id: `${id}-${l}`, m: id, l });
    }
  };
  await lesson("m1", "Polling unit basics", "all", ["english", "yoruba", "hausa"]);
  await lesson("m2", "Hausa-only lesson", "all", ["hausa"]);
  await lesson("m3", "Running your ward", "coordinators", ["english"]);
});
after(() => db.closeDb());

test("a volunteer sees training only in the languages they registered with", async () => {
  const { languages, modules } = await training.trainingFor(opeyemi);
  assert.deepEqual(languages, ["english", "yoruba"]);
  assert.deepEqual(modules.map((m) => m.title), ["Polling unit basics"]);
  assert.deepEqual(modules[0].videos.map((v) => v.language), ["english", "yoruba"]);
});

test("a volunteer can not open a video in another language, or one meant for coordinators", async () => {
  assert.ok(await training.videoFor(opeyemi, "m1-yoruba"));
  assert.equal(await training.videoFor(opeyemi, "m1-hausa"), null);
  assert.equal(await training.videoFor(opeyemi, "m3-english"), null);
});

test("changing languages changes what a volunteer sees, and updates their record", async () => {
  await training.setViewerLanguages(opeyemi, ["hausa"]);
  const { modules } = await training.trainingFor(opeyemi);
  assert.deepEqual(modules.map((m) => m.title), ["Polling unit basics", "Hausa-only lesson"]);
  assert.deepEqual(modules[0].videos.map((v) => v.language), ["hausa"]);
  const rows = await db.all("SELECT language FROM volunteer_languages WHERE volunteer_id = :v", { v: opeyemi.roles[0].area_code });
  assert.deepEqual(rows.map((r) => r.language), ["hausa"]);
  assert.ok((await training.setViewerLanguages(opeyemi, ["klingon"])).error);
});

test("coordinators default to English, see coordinator lessons, and can choose their own languages", async () => {
  let out = await training.trainingFor(coordinator);
  assert.deepEqual(out.languages, ["english"]);
  assert.deepEqual(out.modules.map((m) => m.title), ["Polling unit basics", "Running your ward"]);
  await training.setViewerLanguages(coordinator, ["yoruba", "english"]);
  out = await training.trainingFor(coordinator);
  assert.deepEqual(out.languages, ["english", "yoruba"]);
});

test("the Super Admin manages every lesson in every language", async () => {
  const { modules } = await training.trainingFor(superAdmin, { everything: true });
  assert.equal(modules.length, 3);
  assert.equal(modules[0].videos.length, 3);
  assert.ok(await training.videoFor(superAdmin, "m2-hausa"));
});

test("YouTube links embed; other links do not; only web links are accepted", () => {
  assert.equal(training.embedUrl("https://www.youtube.com/watch?v=abcdefghijk"), "https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0");
  assert.equal(training.embedUrl("https://youtu.be/abcdefghijk"), "https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0");
  assert.equal(training.embedUrl("https://vimeo.com/123"), null);
  assert.equal(training.cleanVideoUrl("javascript:alert(1)"), null);
  assert.equal(training.cleanVideoUrl("youtube.com/watch?v=x"), "https://youtube.com/watch?v=x");
});

test("downloads are recorded, and the Super Admin sees who downloaded each lesson", async () => {
  await db.run("INSERT INTO training_videos (id, module_id, language, kind, storage_key, mime) VALUES ('m1-file', 'm2', 'english', 'video', 'media/x.mp4', 'video/mp4')");
  const video = await training.videoFor(superAdmin, "m1-file");
  await training.recordDownload(opeyemi, video);
  await training.recordDownload(opeyemi, video);
  await training.recordDownload(coordinator, video);
  const list = (await training.downloadsByModule()).m2;
  assert.equal(list.length, 2);
  const ope = list.find((r) => r.isVolunteer);
  assert.equal(ope.name, "Opeyemi Test");
  assert.equal(ope.times, 2);
  assert.match(ope.publicId, /\S/);
  assert.equal(list.find((r) => !r.isVolunteer).name, "Ward Coordinator");
});

test("phone call is no longer offered as a way to be reached at registration", async () => {
  assert.ok(!options.CONTACT_CHANNELS.some((c) => c.value === "call"));
  const errors = await reg.validateVolunteer({
    about: { first_name: "Ada", surname: "Test", gender: "female", dob: "1990-01-01" },
    vote: { state: "FCT", lga: "FCT-002", ward: "FCT-002-09", pu: "", pu_unknown: true, pvc: "yes" },
    help: { roles: ["mobiliser"], languages: ["english"], availability: "weekends", smartphone: "yes", channel: "call" },
    consent: { accurate: true, data: true },
  });
  assert.ok(errors["help.channel"]);
});

test("phone numbers and volunteer IDs are unique keys", async () => {
  const cols = await db.all(
    `SELECT a.attname AS col FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = 'volunteers'::regclass AND i.indisunique`,
  );
  const unique = cols.map((c) => c.col);
  for (const c of ["id", "phone_hash", "public_id"]) assert.ok(unique.includes(c), `${c} should be unique`);
});
