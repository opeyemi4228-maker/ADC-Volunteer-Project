/**
 * Runs once when the server starts.
 *
 * Development: loads the demonstration data on a fresh install so the site is
 * usable immediately (set SEED_DEMO=0 to start empty).
 * Production: never loads demo data unless SEED_DEMO=1 is set explicitly, and
 * refuses to start without APP_SECRET, which encrypts every phone number.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const production = process.env.NODE_ENV === "production";
  if (production && !process.env.APP_SECRET) {
    throw new Error("APP_SECRET must be set in production (see .env.example).");
  }
  const seed = production ? process.env.SEED_DEMO === "1" : process.env.SEED_DEMO !== "0";
  if (!seed) return;
  const { seedDemo } = await import("./lib/seed.js");
  await seedDemo();
}
