import { setSetting } from "@/lib/db";
import { clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

const KEYS = { election_day_enabled: "boolean" };

/** POST /api/v1/settings { key, value } (national admin) */
export async function POST(request) {
  const { viewer, denied } = await requirePower("settings");
  if (denied) return denied;
  const { key, value } = await body(request);
  if (!KEYS[key] || typeof value !== KEYS[key]) return fail(422, "Unknown setting.");
  setSetting(key, value);
  audit(viewer, "setting_changed", "setting", key, { value }, await clientIp());
  return ok({ ok: true });
}
