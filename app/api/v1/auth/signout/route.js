import { endUserSession, endRegistrantSession } from "@/lib/auth";
import { ok, body } from "@/lib/http";

export async function POST(request) {
  const { which = "all" } = await body(request);
  if (which !== "registrant") await endUserSession();
  if (which !== "user") await endRegistrantSession();
  return ok({ done: true });
}
