import { dbInfo, scalar } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/health: for uptime monitors. 200 when the database answers and
 * its schema matches this release, 503 otherwise. Says nothing about data.
 */
export async function GET() {
  const t = Date.now();
  try {
    await scalar("SELECT 1");
    const info = await dbInfo();
    const ok = info.schema === info.latest;
    return Response.json({ ok, database: info.kind, schema: info.schema, latencyMs: Date.now() - t }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, database: "unreachable", latencyMs: Date.now() - t }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
