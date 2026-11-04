import { one, run, tx } from "@/lib/db";
import { seal, open, blind, uuid, hashPassword, token } from "@/lib/crypto";
import { clientIp } from "@/lib/auth";
import { normalizePhone, cleanName } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";
import { areaTypeOf, areaName, statesInZone } from "@/lib/geo";
import { DIRECTORATES } from "@/lib/options";
import { positionOf } from "@/lib/positions";
import { NO_PASSWORD } from "@/lib/registration";

/**
 * POST /api/v1/users { role, area, volunteerId } gives a volunteer registered
 * in that area a coordinator position over it (lib/positions.js); their name
 * and phone come from their record and their existing account is used if they
 * have one. { role: "super_admin", name, phone } adds a Super Admin account.
 * An account is created if the phone is new. A new account gets a one-time
 * password shown once to the admin; the person still needs their phone for
 * the second factor. Volunteers get their accounts by registering.
 */
export async function POST(request) {
  const { viewer, denied } = await requirePower("manage_users");
  if (denied) return denied;
  const d = await body(request);
  d.role = d.role || "super_admin";
  // A position is given to a volunteer picked from the area's list; their name and phone come from their record.
  let volunteer = null;
  if (d.volunteerId) {
    volunteer = await one("SELECT id, first_name, surname, phone_enc, status, vote_state_code, vote_lga_code, vote_ward_code FROM volunteers WHERE id = :id", { id: d.volunteerId });
    if (!volunteer) return fail(404, "That volunteer could not be found.");
    if (volunteer.status === "rejected") return fail(422, "This volunteer's registration was not approved.");
  } else if (d.role !== "super_admin") {
    return fail(422, "Choose a volunteer from the list.");
  }
  const phone = volunteer ? normalizePhone(open(volunteer.phone_enc)) : normalizePhone(d.phone);
  const name = volunteer ? cleanName(`${volunteer.first_name} ${volunteer.surname}`) : cleanName(d.name);
  if (!phone) return fail(422, "Enter a Nigerian mobile number.");
  let areaType = "national";
  let area = "NG";
  if (d.role !== "super_admin") {
    const position = positionOf(d.role);
    if (!position) return fail(422, "Choose a position. Volunteers sign up through the website, USSD or WhatsApp.");
    area = String(d.area ?? "").trim();
    if (position.area === "directorate") {
      if (!DIRECTORATES.some((x) => x.value === area)) return fail(422, "Choose the directorate they will head.");
      areaType = "directorate";
    } else {
      areaType = areaTypeOf(area);
      if (areaType !== position.area || areaName(area) === area) {
        return fail(422, `Choose the ${{ ward: "ward", lga: "LGA", state: "state", zone: "zone" }[position.area]} they will cover.`);
      }
    }
    // A coordinator is picked from the volunteers registered in the area they will cover.
    if (volunteer && areaType !== "directorate") {
      const home = [volunteer.vote_ward_code, volunteer.vote_lga_code, volunteer.vote_state_code];
      const inside = areaType === "zone" ? statesInZone(area).includes(volunteer.vote_state_code) : home.includes(area);
      if (!inside) return fail(422, "This volunteer is registered outside that area.");
    }
  }
  let password = null;
  let out;
  try {
  out = await tx(async () => {
    let user = (volunteer && await one("SELECT * FROM users WHERE volunteer_id = :v", { v: volunteer.id }))
      || await one("SELECT * FROM users WHERE phone_hash = :h", { h: blind(phone) });
    if (!user) {
      if (name.length < 3) throw Object.assign(new Error(d.role === "super_admin" ? "Enter the account name, e.g. the supervising body or office." : "Enter their full name."), { status: 422 });
      password = token(9);
      const id = uuid();
      await run("INSERT INTO users (id, name, phone_enc, phone_hash, password_hash, volunteer_id) VALUES (:id, :n, :pe, :ph, :pw, :v)", { id, n: name, pe: seal(phone), ph: blind(phone), pw: hashPassword(password), v: volunteer?.id ?? null });
      user = { id, name };
    } else {
      if (volunteer && !user.volunteer_id) {
        await run("UPDATE users SET volunteer_id = :v WHERE id = :id", { v: volunteer.id, id: user.id });
      }
      // A volunteer's own account has no password (they sign in with a code),
      // but coordinator sign-in needs one: issue it now, shown once to the admin.
      if (user.password_hash === NO_PASSWORD) {
        password = token(9);
        await run("UPDATE users SET password_hash = :pw WHERE id = :id", { pw: hashPassword(password), id: user.id });
      }
    }
    if (await one("SELECT 1 AS x FROM role_assignments WHERE user_id = :u AND role = :r AND area_code = :a", { u: user.id, r: d.role, a: area })) {
      throw Object.assign(new Error("This person already holds that position here."), { status: 409 });
    }
    await run("INSERT INTO role_assignments (id, user_id, role, area_type, area_code, created_by) VALUES (:id, :u, :r, :t, :a, :by)", { id: uuid(), u: user.id, r: d.role, t: areaType, a: area, by: viewer.id });
    return user;
  });
  } catch (e) {
    return fail(e.status ?? 500, e.message);
  }
  await audit(viewer, "role_granted", "user", out.id, { role: d.role, area }, await clientIp());
  return ok({ userId: out.id, password, name: out.name });
}
