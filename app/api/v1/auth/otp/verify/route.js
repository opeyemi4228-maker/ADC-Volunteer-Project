import { verifyOtp, startRegistrantSession } from "@/lib/auth";
import { normalizePhone, formatPhone } from "@/lib/validate";
import { groupManagedBy, volunteerByPhone } from "@/lib/registration";
import { one } from "@/lib/db";
import { blind } from "@/lib/crypto";
import { ok, fail, body } from "@/lib/http";

/**
 * POST /api/v1/auth/otp/verify { phone, code, purpose }
 * Starts a registrant session and tells the form what this number already has:
 * a group it coordinates, a volunteer record, or a saved draft to resume.
 */
export async function POST(request) {
  const { phone: raw, code, purpose = "register" } = await body(request);
  const phone = normalizePhone(raw);
  if (!phone) return fail(400, "Enter a Nigerian mobile number.");
  const result = verifyOtp(phone, code, purpose);
  if (!result.ok) return fail(400, result.error, { expired: result.expired });
  await startRegistrantSession(phone);

  const group = groupManagedBy(phone);
  const volunteer = volunteerByPhone(phone);
  const drafts = Object.fromEntries(
    ["group", "volunteer"].map((flow) => {
      const d = one("SELECT step, data, updated_at FROM drafts WHERE owner_hash = :h AND flow = :f", { h: blind(phone), f: flow });
      return [flow, d ? { step: d.step, data: JSON.parse(d.data), updatedAt: d.updated_at } : null];
    }),
  );
  return ok({
    phone,
    display: formatPhone(phone),
    group: group ? { name: group.name, publicId: group.public_id, status: group.status } : null,
    volunteer: volunteer ? { publicId: volunteer.public_id, firstName: volunteer.first_name, status: volunteer.status } : null,
    drafts,
  });
}
