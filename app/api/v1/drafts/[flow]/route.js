import { one, run, nowIso } from "@/lib/db";
import { getRegistrant } from "@/lib/auth";
import { ok, fail, body } from "@/lib/http";

/**
 * Saved progress (spec §5: "Progress saves after each step"). The draft is
 * keyed by the verified phone, so signing in again with the same number on any
 * device picks up where the person stopped.
 */
const FLOWS = ["group", "volunteer"];

async function ctx(params) {
  const { flow } = await params;
  if (!FLOWS.includes(flow)) return { error: fail(404, "Unknown form.") };
  const reg = await getRegistrant();
  if (!reg) return { error: fail(401, "Verify your phone number first.") };
  return { flow, reg };
}

export async function GET(_request, { params }) {
  const { flow, reg, error } = await ctx(params);
  if (error) return error;
  const d = one("SELECT step, data, updated_at FROM drafts WHERE owner_hash = :h AND flow = :f", { h: reg.phoneHash, f: flow });
  return ok({ draft: d ? { step: d.step, data: JSON.parse(d.data), updatedAt: d.updated_at } : null });
}

export async function PUT(request, { params }) {
  const { flow, reg, error } = await ctx(params);
  if (error) return error;
  const { step, data } = await body(request);
  const json = JSON.stringify(data ?? {});
  if (json.length > 200_000) return fail(413, "The form is too large to save.");
  run(
    `INSERT INTO drafts (owner_hash, flow, step, data, updated_at) VALUES (:h, :f, :s, :d, :now)
     ON CONFLICT(owner_hash, flow) DO UPDATE SET step = :s, data = :d, updated_at = :now`,
    { h: reg.phoneHash, f: flow, s: Math.max(1, Math.min(9, Number(step) || 1)), d: json, now: nowIso() },
  );
  return ok({ saved: true, at: nowIso() });
}

export async function DELETE(_request, { params }) {
  const { flow, reg, error } = await ctx(params);
  if (error) return error;
  run("DELETE FROM drafts WHERE owner_hash = :h AND flow = :f", { h: reg.phoneHash, f: flow });
  return ok({ deleted: true });
}
