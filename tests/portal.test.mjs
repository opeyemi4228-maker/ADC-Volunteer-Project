import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway in-memory Postgres and upload folder for this run.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adc-portal-test-"));
process.env.PGLITE_DIR = "memory://";
process.env.STORAGE_DIR = path.join(dir, "uploads");
process.env.APP_SECRET = "test-secret-for-unit-tests-only";
for (const k of ["DATABASE_URL", "DATABASE_URL_POOLED", "APP_DATABASE_URL"]) delete process.env[k];

let db, reg, tasks, portal, scope;
const people = {};
const superAdmin = { id: "sa", name: "ADC Supervising Body", roles: [{ role: "super_admin", area_type: "national", area_code: "NG" }] };

before(async () => {
  db = await import("../lib/db.js");
  reg = await import("../lib/registration.js");
  tasks = await import("../lib/tasks.js");
  portal = await import("../lib/volunteer-portal.js");
  scope = await import("../lib/scope.js");
  superAdmin.powers = scope.powersFor(superAdmin.roles);
  const make = async (key, first, ward, roles, phone) => {
    const v = await reg.createVolunteer({
      about: { first_name: first, surname: "Test", gender: "female", dob: "1990-01-01" },
      vote: { state: ward.slice(0, 3), lga: ward.slice(0, 7), ward, pu: "", pu_unknown: true, pvc: "yes" },
      help: { roles, languages: ["english"], availability: "weekends", smartphone: "yes", channel: "sms" },
      consent: { accurate: true, data: true },
    }, { phone });
    await db.run("UPDATE volunteers SET status = 'verified' WHERE id = :id", { id: v.id });
    people[key] = await portal.volunteerContext(v.id);
  };
  await make("kubwaAgent", "Ada", "FCT-002-09", ["pu_agent"], "+2348091110101");
  await make("kubwaMobiliser", "Bola", "FCT-002-09", ["mobiliser"], "+2348091110102");
  const lagWard = (await import("../lib/geo.js")).lgaOf("LAG-010").wards[0].code;
  await make("lagos", "Chika", lagWard, ["pu_agent"], "+2348091110103");
});
after(() => db.closeDb());

const titles = async (v) => (await portal.tasksFor(v)).map((t) => t.title).sort();

test("a task reaches exactly the volunteers in its area, and only the role it names", async () => {
  const mk = (title, area_code, role = "") => tasks.createTask(superAdmin, { title, due_date: "2030-01-01", area_code, role });
  assert.ok((await mk("Nationwide reminder", "NG")).id);
  assert.ok((await mk("Kubwa door-to-door", "FCT-002-09")).id);
  assert.ok((await mk("FCT agents only", "FCT", "pu_agent")).id);
  assert.ok((await mk("North Central rally", "NC")).id);
  assert.ok((await mk("Lagos only", "LAG")).id);

  assert.deepEqual(await titles(people.kubwaAgent), ["FCT agents only", "Kubwa door-to-door", "Nationwide reminder", "North Central rally"]);
  assert.deepEqual(await titles(people.kubwaMobiliser), ["Kubwa door-to-door", "Nationwide reminder", "North Central rally"]);
  assert.deepEqual(await titles(people.lagos), ["Lagos only", "Nationwide reminder"]);
});

test("the Super Admin sees how many volunteers each task reaches", async () => {
  const list = await tasks.visibleTasks(superAdmin);
  const reach = Object.fromEntries(list.map((t) => [t.title, t.reach]));
  assert.equal(reach["Nationwide reminder"], 3);
  assert.equal(reach["FCT agents only"], 1);
  assert.equal(reach["North Central rally"], 2);
});

test("a volunteer can only open tasks that reach them", async () => {
  const lagosTask = (await tasks.visibleTasks(superAdmin)).find((t) => t.title === "Lagos only");
  assert.equal(await portal.taskFor(people.kubwaAgent, lagosTask.id), null);
  assert.ok(await portal.taskFor(people.lagos, lagosTask.id));
});

test("progress reports roll up per volunteer and into the dashboard summary", async () => {
  const t = (await portal.tasksFor(people.kubwaAgent)).find((x) => x.title === "Kubwa door-to-door");
  await db.run("INSERT INTO task_reports (id, task_id, achieved_value, reporter_name, volunteer_id) VALUES ('r1', :t, 40, 'Ada Test', :v)", { t: t.id, v: people.kubwaAgent.id });
  const again = (await portal.tasksFor(people.kubwaAgent)).find((x) => x.title === "Kubwa door-to-door");
  assert.equal(again.mine, 40);
  assert.equal(again.volunteers, 1);
  const other = (await portal.tasksFor(people.kubwaMobiliser)).find((x) => x.title === "Kubwa door-to-door");
  assert.equal(other.mine, 0);
  assert.equal(other.achieved, 40);
  const sum = await portal.portalSummary(people.kubwaAgent);
  assert.equal(sum.reports, 1);
  assert.equal(sum.openTasks, 4);
  assert.equal(sum.todo, 3);
});

test("a coordinator can only set tasks inside their own area", async () => {
  const ward = { id: "wc", name: "Ward coordinator", roles: [{ role: "ward_coordinator", area_type: "ward", area_code: "FCT-002-09" }] };
  ward.powers = [...new Set([...scope.powersFor(ward.roles), "assign_tasks"])];
  assert.ok((await tasks.createTask(ward, { title: "Kubwa clean-up", due_date: "2030-01-01", area_code: "FCT-002-09" })).id);
  assert.ok((await tasks.createTask(ward, { title: "Everywhere", due_date: "2030-01-01", area_code: "NG" })).errors?.area_code);
  assert.ok((await tasks.createTask(ward, { title: "Lagos", due_date: "2030-01-01", area_code: "LAG" })).errors?.area_code);
});
