import { getViewer, clientIp } from "@/lib/auth";
import { getLang } from "@/lib/i18n/server";
import { scalar } from "@/lib/db";
import { normalizePhone } from "@/lib/validate";
import { validateVolunteer, createVolunteer, createVolunteerAccount, registrationPhoto } from "@/lib/registration";
import { uploadOwner } from "@/lib/owner";
import { queueObjectDeletion } from "@/lib/storage-cleanup";
import { listVolunteers } from "@/lib/queries";
import { send } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { ok, fail, body } from "@/lib/http";
import { captchaDenied } from "@/lib/captcha";

/**
 * POST /api/v1/volunteers: register a volunteer (Flow B, fast version).
 * No phone code: the number is typed in step 1 and must be unique. There is
 * no password: they sign in later with a one-time code sent to that number. The ward
 * coordinator confirms it by calling before verifying, so the record starts
 * as "phone not confirmed". A photo of the person is required: they upload it
 * first (purpose "profile", at most 5 MB) and send its upload id here.
 */
export async function POST(request) {
  const ip = await clientIp();
  const recent = await scalar(`SELECT COUNT(*) FROM audit_log WHERE action = 'volunteer_registered' AND ip = :ip AND "timestamp" > now() - interval '1 hour'`, { ip });
  if (recent >= 30 && ip !== "local") return fail(429, "Too many registrations from this connection. Try again in an hour.");
  const denied = await captchaDenied(request, "register", ip);
  if (denied) return denied;

  const d = await body(request);
  const errors = await validateVolunteer(d, { channel: "web" });
  const photo = await registrationPhoto(d?.about?.photo_upload_id, await uploadOwner());
  if (photo.error) errors["about.photo_upload_id"] = photo.error;
  if (Object.keys(errors).length) {
    const dup = errors["about.phone"]?.includes("already registered");
    return fail(dup ? 409 : 422, dup ? errors["about.phone"] : "Some answers need attention.", { errors, duplicatePhone: dup || undefined });
  }
  const phone = normalizePhone(d.about.phone);
  let v;
  try {
    v = await createVolunteer(d, { phone, channel: "web", phoneVerified: false, photo: photo.upload });
  } catch (error) {
    if (error?.code !== "photo_used") throw error;
    return fail(409, "This photo was already used. Upload your photo again.", { errors: { "about.photo_upload_id": "Upload your photo again." } });
  }
  if (v.error) return fail(409, v.error, { duplicatePhone: true, errors: { "about.phone": v.error } });
  // Only the 960px and 320px copies are kept for a profile photo.
  if (photo.upload.storage_key) await queueObjectDeletion(photo.upload.storage_key);
  // Their sign-in for the volunteer dashboard (ID card and certificate).
  await createVolunteerAccount(v.id, { name: `${v.firstName} ${String(d.about.surname ?? "").trim()}`.trim(), phone, email: d.about.email });
  await audit({ name: "Registrant" }, "volunteer_registered", "volunteer", v.id, { publicId: v.publicId }, ip);
  await send({ to: phone, template: "volunteer_submitted", lang: await getLang(), vars: { name: v.firstName, id: v.publicId } });
  return ok(v);
}

/** GET /api/v1/volunteers?area=&role=&status=&pvc=&q= (coordinators, scoped) */
export async function GET(request) {
  const viewer = await getViewer();
  if (!viewer) return fail(401, "Sign in to continue.");
  const q = Object.fromEntries(new URL(request.url).searchParams);
  return ok(await listVolunteers(viewer, q));
}
