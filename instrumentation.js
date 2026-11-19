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
  if (production && process.env.VERCEL) {
    if (!process.env.APP_DATABASE_URL) throw new Error("APP_DATABASE_URL is required on Vercel.");
    if (process.env.STORAGE_BACKEND !== "r2") throw new Error("STORAGE_BACKEND=r2 is required on Vercel; local disk is temporary.");
    for (const key of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) {
      if (!process.env[key]) throw new Error(`${key} must be configured on Vercel.`);
    }
  }
  const { runtimeUrl } = await import("./lib/db.js");
  if (runtimeUrl() || production || process.env.SEED_DEMO !== "1") return;
  const { seedDemo } = await import("./lib/seed.js");
  await seedDemo();
}
