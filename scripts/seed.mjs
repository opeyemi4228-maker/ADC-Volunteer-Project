/**
 * Resets the database and loads the demonstration data.
 *   npm run seed            (refuses if data exists)
 *   npm run seed -- --reset (deletes data/adc.db and uploads first)
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
if (process.argv.includes("--reset")) {
  for (const f of ["adc.db", "adc.db-wal", "adc.db-shm"]) fs.rmSync(path.join(root, "data", f), { force: true });
  fs.rmSync(path.join(root, "data", "uploads"), { recursive: true, force: true });
  console.log("Removed existing database and uploads.");
}
const { seedDemo } = await import("../lib/seed.js");
const seeded = await seedDemo();
if (!seeded) console.log("Data already present. Use `npm run seed -- --reset` to start again.");
