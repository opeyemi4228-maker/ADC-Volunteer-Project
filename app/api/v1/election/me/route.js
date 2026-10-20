import { getRegistrant } from "@/lib/auth";
import { agentFor, isLive } from "@/lib/election";
import { ok, fail } from "@/lib/http";

/** GET /api/v1/election/me: the signed-in volunteer's polling unit assignment. */
export async function GET() {
  const reg = await getRegistrant();
  if (!reg) return fail(401, "Verify your phone number first.");
  return ok({ live: isLive(), ...(agentFor(reg.phoneHash) ?? { volunteer: null, assignment: null }) });
}
