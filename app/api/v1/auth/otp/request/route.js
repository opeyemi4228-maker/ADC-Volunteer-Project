import { requestOtp } from "@/lib/auth";
import { normalizePhone } from "@/lib/validate";
import { ok, fail, body } from "@/lib/http";

const PURPOSES = ["register", "status"];

/** POST /api/v1/auth/otp/request { phone, purpose, lang } */
export async function POST(request) {
  const { phone: raw, purpose = "register", lang } = await body(request);
  const phone = normalizePhone(raw);
  if (!phone) return fail(400, "Enter a Nigerian mobile number, e.g. 0803 123 4567.", { field: "phone" });
  if (!PURPOSES.includes(purpose)) return fail(400, "Unknown purpose.");
  const result = await requestOtp(phone, purpose, lang);
  if (!result.ok) return fail(429, result.error, { retryAfter: result.retryAfter });
  return ok({ phone, retryAfter: result.retryAfter, devCode: result.devCode });
}
