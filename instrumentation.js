/**
 * Runs once when the server starts.
 *
 * Refuses to start in production without APP_SECRET, which encrypts every
 * phone number. With the embedded development database (no DATABASE_URL),
 * loads the demonstration data on a fresh install only when SEED_DEMO=1 is
 * set; by default the system starts empty. A real database is never
 * seeded from here: many server instances may start at once, so demo data
 * goes in once, deliberately, with `npm run db:seed`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const production = process.env.NODE_ENV === "production";
  if (production && !process.env.APP_SECRET) {
    throw new Error("APP_SECRET must be set in production (see .env.example).");
  }
  const { runtimeUrl } = await import("./lib/db.js");
  if (runtimeUrl() || production || process.env.SEED_DEMO !== "1") return;
  const { seedDemo } = await import("./lib/seed.js");
  await seedDemo();
}
