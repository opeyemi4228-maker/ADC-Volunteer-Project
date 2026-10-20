import { one, run } from "@/lib/db";
import { getViewer, clientIp } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { passwordProblem } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { ok, fail, body } from "@/lib/http";

/** POST { current, password }: change the signed-in account's password. */
export async function POST(request) {
  const viewer = await getViewer();
  if (!viewer) return fail(401, "Sign in to continue.");
  const d = await body(request);
  const user = one("SELECT password_hash FROM users WHERE id = :id", { id: viewer.id });
  if (!verifyPassword(String(d.current ?? ""), user?.password_hash)) return fail(422, "Your current password isn't right.", { errors: { current: "Your current password isn't right." } });
  const problem = passwordProblem(d.password);
  if (problem) return fail(422, problem, { errors: { password: problem } });
  run("UPDATE users SET password_hash = :pw WHERE id = :id", { pw: hashPassword(String(d.password)), id: viewer.id });
  audit(viewer, "password_changed", "user", viewer.id, null, await clientIp());
  return ok({ done: true });
}
