import { getViewer, clientIp } from "@/lib/auth";
import { getLang } from "@/lib/i18n/server";
import { scalar } from "@/lib/db";
import { normalizePhone } from "@/lib/validate";
import { validateVolunteer, createVolunteer, createVolunteerAccount } from "@/lib/registration";
import { listVolunteers } from "@/lib/queries";
import { send } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { ok, fail, body } from "@/lib/http";

/**
 * POST /api/v1/volunteers: register a volunteer (Flow B, fast version).
 * No phone code: the number is typed in step 1 and must be unique. The
 * password chosen on the last screen opens their volunteer dashboard. The ward
 * coordinator confirms it by calling before verifying, so the record starts
 * as "phone not confirmed".
 */
export async function POST(request) {
  const ip = await clientIp();
  const recent = scalar("SELECT COUNT(*) FROM audit_log WHERE action = 'volunteer_registered' AND ip = :ip AND timestamp > datetime('now', '-1 hour')", { ip });
  if (recent >= 30 && ip !== "local") return fail(429, "Too many registrations from this connection. Try again in an hour.");

  const d = await body(request);
  const errors = validateVolunteer(d, { channel: "web" });
  if (Object.keys(errors).length) {
    const dup = errors["about.phone"]?.includes("already registered");
    return fail(dup ? 409 : 422, dup ? errors["about.phone"] : "Some answers need attention.", { errors, duplicatePhone: dup || undefined });
  }
  const phone = normalizePhone(d.about.phone);
  const v = createVolunteer(d, { phone, channel: "web", phoneVerified: false });
  if (v.error) return fail(409, v.error, { duplicatePhone: true, errors: { "about.phone": v.error } });
  // Their sign-in for the volunteer dashboard (ID card and certificate).
  createVolunteerAccount(v.id, { name: `${v.firstName} ${String(d.about.surname ?? "").trim()}`.trim(), phone, email: d.about.email, password: d.account.password });
  audit({ name: "Registrant" }, "volunteer_registered", "volunteer", v.id, { publicId: v.publicId }, ip);
  await send({ to: phone, template: "volunteer_submitted", lang: await getLang(), vars: { name: v.firstName, id: v.publicId } });
  return ok(v);
}

/** GET /api/v1/volunteers?area=&role=&status=&pvc=&q= (coordinators, scoped) */
export async function GET(request) {
  const viewer = await getViewer();
  if (!viewer) return fail(401, "Sign in to continue.");
  const q = Object.fromEntries(new URL(request.url).searchParams);
  return ok(listVolunteers(viewer, q));
}
