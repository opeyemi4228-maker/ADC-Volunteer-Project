import { getSetting, setSetting } from "@/lib/db";
import { clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";
import { resolveAccess, POSITION_KEYS } from "@/lib/positions";

/** GET /api/v1/positions: what each coordinator position can open (Super Admin only). */
export async function GET() {
  const { denied } = await requirePower("manage_users");
  if (denied) return denied;
  return ok({ access: resolveAccess(await getSetting("position_access", {})) });
}

/**
 * POST /api/v1/positions { access: { [position]: { features, widgets } } }:
 * sets the tabs and Overview widgets each position opens. Unknown keys are
 * dropped; a position left out keeps what it had.
 */
export async function POST(request) {
  const { viewer, denied } = await requirePower("manage_users");
  if (denied) return denied;
  const { access } = await body(request);
  if (!access || typeof access !== "object") return fail(422, "Nothing to save.");
  const before = resolveAccess(await getSetting("position_access", {}));
  const merged = resolveAccess({ ...before, ...Object.fromEntries(Object.entries(access).filter(([k]) => POSITION_KEYS.includes(k))) });
  await setSetting("position_access", merged);
  const changed = POSITION_KEYS.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(merged[k]));
  await audit(viewer, "setting_changed", "settings", "position_access", { positions: changed }, await clientIp());
  return ok({ access: merged });
}
