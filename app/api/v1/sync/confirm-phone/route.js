import { requestOtp } from "@/lib/auth";
import { normalizePhone } from "@/lib/validate";
import { volunteerByPhone } from "@/lib/registration";
import { ok, fail, body, requirePower } from "@/lib/http";

/**
 * POST /api/v1/sync/confirm-phone { phone }: field agent sends a code to the
 * person being registered, who reads it out. The code travels with the record
 * in the next sync and is checked there.
 */
export async function POST(request) {
  const { denied } = await requirePower("field_agent");
  if (denied) return denied;
  const phone = normalizePhone((await body(request)).phone);
  if (!phone) return fail(422, "Enter a Nigerian mobile number.");
  if (volunteerByPhone(phone)) return fail(409, "This number is already registered.");
  const r = await requestOtp(phone, "agent_confirm");
  if (!r.ok) return fail(429, r.error);
  return ok({ sent: true, devCode: r.devCode });
}
