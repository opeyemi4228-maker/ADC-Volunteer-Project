import { getRegistrant } from "@/lib/auth";
import { agentFor, isLive } from "@/lib/election";
import { ok } from "@/lib/http";

/** GET /api/v1/election/me: the signed-in volunteer's polling unit assignment. */
export async function GET() {
  const reg = await getRegistrant();
  if (!reg) return ok({ signedIn: false });
  return ok({ live: isLive(), ...(agentFor(reg.phoneHash) ?? { volunteer: null, assignment: null }) });
}
