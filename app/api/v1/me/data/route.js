import { all, one } from "@/lib/db";
import { open } from "@/lib/crypto";
import { getRegistrant } from "@/lib/auth";
import { placeLabel, areaName } from "@/lib/geo";
import { formatPhone } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { fail } from "@/lib/http";

/**
 * GET /api/v1/me/data: everything held about the verified phone, as a JSON
 * download (the "access" and "portability" rights, NDPA 2023 / spec §15).
 */
export async function GET() {
  const reg = await getRegistrant();
  if (!reg) return fail(401, "Verify your phone number to download your data.");

  const v = one("SELECT * FROM volunteers WHERE phone_hash = :h", { h: reg.phoneHash });
  const volunteer = v && {
    volunteer_id: v.public_id,
    first_name: v.first_name, middle_name: v.middle_name, surname: v.surname, gender: v.gender, date_of_birth: v.date_of_birth,
    phone: formatPhone(open(v.phone_enc)), email: open(v.email_enc) || null,
    where_you_vote: placeLabel({ state_code: v.vote_state_code, lga_code: v.vote_lga_code, ward_code: v.vote_ward_code }),
    polling_unit: v.vote_pu_code ? `${v.vote_pu_code} ${areaName(v.vote_pu_code)}` : null,
    where_you_live: v.res_state_code ? placeLabel({ state_code: v.res_state_code, lga_code: v.res_lga_code, ward_code: v.res_ward_code }) : null,
    pvc_status: v.pvc_status, occupation: v.occupation, availability: v.availability, has_smartphone: v.has_smartphone === null ? null : Boolean(v.has_smartphone),
    preferred_channel: v.preferred_channel, registration_channel: v.registration_channel, status: v.status,
    group: v.group_id ? one("SELECT public_id, name FROM support_groups WHERE id = :id", { id: v.group_id }) : null,
    roles: all("SELECT role FROM volunteer_roles WHERE volunteer_id = :id", { id: v.id }).map((r) => r.role),
    languages: all("SELECT language FROM volunteer_languages WHERE volunteer_id = :id", { id: v.id }).map((r) => r.language),
    social_accounts: all("SELECT network, handle, url FROM social_accounts WHERE owner_type = 'volunteer' AND owner_id = :id", { id: v.id }),
    registered_at: v.created_at,
  };

  const groups = all(
    `SELECT DISTINCT g.* FROM support_groups g LEFT JOIN group_leaders l ON l.group_id = g.id
     WHERE g.registrant_hash = :h OR l.phone_hash = :h`,
    { h: reg.phoneHash },
  ).map((g) => ({
    group_id: g.public_id, name: g.name, category: g.category, operating_level: g.operating_level, status: g.status,
    place: placeLabel(g), registered_at: g.created_at,
    your_role: one("SELECT position FROM group_leaders WHERE group_id = :g AND phone_hash = :h", { g: g.id, h: reg.phoneHash })?.position ?? "registrant",
  }));

  const ids = [v?.id, ...all("SELECT DISTINCT g.id FROM support_groups g LEFT JOIN group_leaders l ON l.group_id = g.id WHERE g.registrant_hash = :h OR l.phone_hash = :h", { h: reg.phoneHash }).map((r) => r.id)].filter(Boolean);
  const consents = ids.length
    ? all(`SELECT subject_type, consent_type, granted, notice_version, channel, captured_at, withdrawn_at FROM consents WHERE subject_id IN (${ids.map((_, i) => `:c${i}`).join(",")}) ORDER BY captured_at`,
      Object.fromEntries(ids.map((id, i) => [`c${i}`, id])))
      .map((c) => ({ ...c, granted: Boolean(c.granted) }))
    : [];

  audit({ name: "Registrant" }, "self_data_download", v ? "volunteer" : null, v?.id ?? null);
  const payload = { generated_at: new Date().toISOString(), phone: formatPhone(reg.phone), volunteer: volunteer ?? null, groups, consents };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="adc-my-data.json"',
      "Cache-Control": "no-store",
    },
  });
}
