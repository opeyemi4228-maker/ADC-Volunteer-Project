import { one, run, scalar, tx } from "@/lib/db";
import { seal, blind, uuid, hashPassword } from "@/lib/crypto";
import { getViewer, clientIp, startUserSession } from "@/lib/auth";
import { uploadOwner } from "@/lib/owner";
import { getLang } from "@/lib/i18n/server";
import { normalizePhone, normalizeEmail, properCase } from "@/lib/validate";
import { validateGroup, createGroup, groupManagedBy } from "@/lib/registration";
import { importMembership } from "@/lib/members";
import { listGroups } from "@/lib/queries";
import { send, sendEmail } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { ok, fail, body } from "@/lib/http";

const SITE = process.env.SITE_URL ?? "http://localhost:3000";

/**
 * POST /api/v1/groups: register a support group (Flow A, fast version).
 *
 * No phone code. The group gives an email and password, which become its
 * sign-in for the group dashboard (certificate, photos of activities,
 * members). Everything else runs the same checks as before: real INEC
 * location, two leaders with different numbers, duplicate names flagged for
 * the coordinator. The person is signed in straight away.
 */
export async function POST(request) {
  const ip = await clientIp();
  const recent = scalar("SELECT COUNT(*) FROM audit_log WHERE action = 'group_registered' AND ip = :ip AND timestamp > datetime('now', '-1 hour')", { ip });
  if (recent >= 10 && ip !== "local") return fail(429, "Too many registrations from this connection. Try again in an hour.");

  const d = await body(request);
  const errors = validateGroup(d);
  if (Object.keys(errors).length) return fail(422, "Some answers need attention.", { errors });

  const coordinator = (d.leaders ?? []).find((l) => l.position === "coordinator");
  const phone = normalizePhone(coordinator?.phone);
  const email = normalizeEmail(d.account.email);
  const existing = groupManagedBy(phone);
  if (existing) {
    return fail(409, `The coordinator's number already manages ${existing.name}. Sign in to that group's dashboard, or use a different coordinator.`, { errors: { "leaders.0.phone": "This number already coordinates a registered group." } });
  }
  if (one("SELECT 1 AS x FROM users WHERE phone_hash = :h", { h: blind(phone) })) {
    return fail(409, "The coordinator's number already has an account. Sign in, or use a different coordinator number.", { errors: { "leaders.0.phone": "This number already has an account." } });
  }

  const owner = await uploadOwner();
  let logoKey = null;
  if (d.about?.logo_upload_id && owner) {
    const u = one("SELECT medium_key FROM uploads WHERE id = :id AND owner_hash = :o AND done = 1 AND kind = 'photo'", { id: d.about.logo_upload_id, o: owner });
    logoKey = u?.medium_key ?? null;
  }

  let g;
  let userId;
  try {
    ({ g, userId } = tx(() => {
      const created = createGroup(d, { registrantPhone: phone, channel: "web", mediaItems: d.media ?? [], uploaderOwner: owner, logoKey });
      const uid = uuid();
      run("INSERT INTO users (id, name, phone_enc, phone_hash, email_enc, email_hash, password_hash) VALUES (:id, :n, :pe, :ph, :ee, :eh, :pw)", {
        id: uid, n: `${properCase(coordinator.first_name)} ${properCase(coordinator.surname)}`, pe: seal(phone), ph: blind(phone),
        ee: seal(email), eh: blind(email), pw: hashPassword(String(d.account.password)),
      });
      run("INSERT INTO role_assignments (id, user_id, role, area_type, area_code) VALUES (:id, :u, 'group_coordinator', 'group', :g)", { id: uuid(), u: uid, g: created.id });
      return { g: created, userId: uid };
    }));
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return fail(409, "This email already has an account. Sign in instead, or use another email.", { errors: { "account.email": "This email already has an account." } });
    throw e;
  }

  let membership = null;
  if (d.membership?.upload_id && owner) {
    try {
      membership = importMembership(g.id, d.membership.upload_id, owner);
    } catch (e) {
      membership = { error: e.user ? e.message : "The membership list couldn't be read. You can upload it again from your dashboard." };
    }
  }

  audit({ id: userId, name: "Registrant" }, "group_registered", "group", g.id, { publicId: g.publicId, membership: membership?.count ?? null }, ip);
  await startUserSession(userId, { mfa: true });

  await send({ to: phone, template: "group_submitted", lang: await getLang(), vars: { group: g.name, id: g.publicId } });
  await sendEmail({
    to: email,
    subject: `${g.name} is registered (${g.publicId})`,
    heading: `${g.name} is registered`,
    paragraphs: [
      `Thank you for registering your support group. Your group ID is ${g.publicId} and your members' invite code is ${g.joinCode}.`,
      "A coordinator for your area will review the registration, usually within 7 days. We'll email you as soon as it is approved, and your certificate will then be ready to download from your dashboard.",
      "In the meantime you can sign in with this email address to add photos of your activities and share the invite code with members.",
    ],
    button: { label: "Open my group dashboard", href: `${SITE}/workspace` },
    template: "group_registered",
  });
  const secretary = (d.leaders ?? []).find((l) => l.position === "secretary");
  const secPhone = normalizePhone(secretary?.phone);
  if (secPhone && secPhone !== phone) {
    await send({ to: secPhone, body: `You were listed as secretary of ${g.name.slice(0, 50)} (${g.publicId}) on the ADC support group register. Not you? Reply NO.` });
  }

  return ok({ id: g.id, publicId: g.publicId, joinCode: g.joinCode, name: g.name, dashboard: "/workspace", membership });
}

/** GET /api/v1/groups?state=&lga=&status=&category=&q= (coordinators, scoped) */
export async function GET(request) {
  const viewer = await getViewer();
  if (!viewer) return fail(401, "Sign in to continue.");
  const q = Object.fromEntries(new URL(request.url).searchParams);
  return ok(listGroups(viewer, q));
}
