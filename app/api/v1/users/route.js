import { one, run, tx } from "@/lib/db";
import { seal, blind, uuid, hashPassword, token } from "@/lib/crypto";
import { clientIp } from "@/lib/auth";
import { normalizePhone, cleanName } from "@/lib/validate";
import { areaTypeOf, areaName, ZONES } from "@/lib/geo";
import { ROLE_LABELS, DIRECTORATES } from "@/lib/options";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

/**
 * POST /api/v1/users { name, phone, role, area }: adds a role, creating the
 * account if the phone is new. A new account gets a one-time password shown
 * once to the admin; the person still needs their phone for the second factor.
 */
export async function POST(request) {
  const { viewer, denied } = await requirePower("manage_users");
  if (denied) return denied;
  const d = await body(request);
  const phone = normalizePhone(d.phone);
  const name = cleanName(d.name);
  if (!phone) return fail(422, "Enter a Nigerian mobile number.");
  if (!ROLE_LABELS[d.role]) return fail(422, "Choose a role.");
  let areaType;
  let area = String(d.area ?? "").trim();
  if (["national_admin", "dpo"].includes(d.role)) { areaType = "national"; area = "NG"; }
  else if (d.role === "directorate_head") { areaType = "directorate"; if (!DIRECTORATES.some((x) => x.value === area)) return fail(422, "Choose a directorate."); }
  else if (d.role === "zonal_coordinator") { areaType = "zone"; if (!ZONES[area]) return fail(422, "Choose a zone."); }
  else if (d.role === "group_coordinator") { areaType = "group"; if (!one("SELECT 1 AS x FROM support_groups WHERE id = :id", { id: area })) return fail(422, "Unknown group."); }
  else {
    areaType = areaTypeOf(area);
    const need = { state_coordinator: "state", lga_coordinator: "lga", ward_coordinator: "ward", field_agent: "lga" }[d.role];
    if (areaType !== need || areaName(area) === area) return fail(422, `Choose a valid ${need}.`);
  }
  let password = null;
  let out;
  try {
  out = tx(() => {
    let user = one("SELECT * FROM users WHERE phone_hash = :h", { h: blind(phone) });
    if (!user) {
      if (name.length < 3) throw Object.assign(new Error("Enter the person's full name."), { status: 422 });
      password = token(9);
      const id = uuid();
      run("INSERT INTO users (id, name, phone_enc, phone_hash, password_hash) VALUES (:id, :n, :pe, :ph, :pw)", { id, n: name, pe: seal(phone), ph: blind(phone), pw: hashPassword(password) });
      user = { id, name };
    }
    if (one("SELECT 1 AS x FROM role_assignments WHERE user_id = :u AND role = :r AND area_code = :a", { u: user.id, r: d.role, a: area })) {
      throw Object.assign(new Error("This person already has that role."), { status: 409 });
    }
    run("INSERT INTO role_assignments (id, user_id, role, area_type, area_code, created_by) VALUES (:id, :u, :r, :t, :a, :by)", { id: uuid(), u: user.id, r: d.role, t: areaType, a: area, by: viewer.id });
    return user;
  });
  } catch (e) {
    return fail(e.status ?? 500, e.message);
  }
  audit(viewer, "role_granted", "user", out.id, { role: d.role, area }, await clientIp());
  return ok({ userId: out.id, password });
}
