import { tx, run, nowIso } from "@/lib/db";
import { clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { bankAccountProblems } from "@/lib/banks";
import { saveBankAccounts, bankAccountsOf } from "@/lib/registration";
import { ok, fail, body, requirePower } from "@/lib/http";

const ownVolunteer = (viewer) => viewer.roles.find((r) => r.role === "volunteer")?.area_code ?? null;

/** GET /api/v1/me/bank-accounts: the signed-in volunteer's own accounts, in full. */
export async function GET() {
  const { viewer, denied } = await requirePower("volunteer");
  if (denied) return denied;
  const volunteerId = ownVolunteer(viewer);
  if (!volunteerId) return fail(403, "Only volunteers have bank details here.");
  return ok({ accounts: await bankAccountsOf(volunteerId, { full: true }) }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * PUT /api/v1/me/bank-accounts { accounts: [{ bank, other?, number, name }] }:
 * a volunteer adds or changes their accounts (the main one and an optional
 * second). Same checks as registration. Every change is audited, so a
 * coordinator can see when payment details last changed.
 */
export async function PUT(request) {
  const { viewer, denied } = await requirePower("volunteer");
  if (denied) return denied;
  const volunteerId = ownVolunteer(viewer);
  if (!volunteerId) return fail(403, "Only volunteers can change bank details here.");
  const { accounts } = await body(request);
  const problems = bankAccountProblems(accounts);
  if (Object.keys(problems).length) {
    return fail(422, "Some bank details need attention.", { errors: Object.fromEntries(Object.entries(problems).map(([k, v]) => [`bank.accounts.${k}`, v])) });
  }
  const count = await tx(async () => {
    const n = await saveBankAccounts(volunteerId, accounts);
    await run("UPDATE volunteers SET updated_at = :now WHERE id = :v", { v: volunteerId, now: nowIso() });
    return n;
  });
  await audit(viewer, "bank_details_changed", "volunteer", volunteerId, { accounts: count }, await clientIp());
  return ok({ accounts: await bankAccountsOf(volunteerId, { full: true }) });
}
