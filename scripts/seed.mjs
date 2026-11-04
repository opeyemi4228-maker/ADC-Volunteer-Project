/**
 * Loads the demonstration data into the local development database
 * (the embedded Postgres in data/pglite). Stop `npm run dev` first: only one
 * process can open that database at a time.
 *   npm run seed            (refuses if data exists)
 *   npm run seed -- --reset (deletes data/pglite and uploads first)
 *
 * For the production database use `npm run db:seed`.
 */
import fs from "node:fs";
import path from "node:path";

for (const k of ["DATABASE_URL", "DATABASE_URL_POOLED", "APP_DATABASE_URL"]) {
  if (process.env[k]) {
    console.error(`${k} is set: this script only resets the local development database. Use npm run db:seed for a real one.`);
    process.exit(1);
  }
}
const data = path.join(process.cwd(), "data");
if (process.argv.includes("--reset")) {
  fs.rmSync(path.join(data, "pglite"), { recursive: true, force: true });
  fs.rmSync(path.join(data, "uploads"), { recursive: true, force: true });
  console.log("Removed the local database and uploads.");
}
const { seedDemo } = await import("../lib/seed.js");
const { closeDb } = await import("../lib/db.js");
const seeded = await seedDemo();
if (!seeded) console.log("Data already present. Use `npm run seed -- --reset` to start again.");
await closeDb();
