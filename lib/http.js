import { readLimitedBody } from "./request-body.js";
import { NextResponse } from "next/server";

import { getViewer, can } from "./auth.js";

/** JSON helpers shared by every route handler under /api/v1. */

export const ok = (data = {}, init) => NextResponse.json(data, init);

export const fail = (status, error, extra = {}) => NextResponse.json({ error, ...extra }, { status });

export async function body(request) {
  try {
    const value = JSON.parse((await readLimitedBody(request, 2 * 1024 * 1024)).toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

/**
 * Resolves the signed-in coordinator, or a 401/403 response. Usage:
 *   const { viewer, denied } = await requirePower("verify");
 *   if (denied) return denied;
 */
export async function requirePower(power) {
  const viewer = await getViewer();
  if (!viewer) return { denied: fail(401, "Sign in to continue.") };
  if (power && !can(viewer, power)) return { denied: fail(403, "Your role does not allow this.") };
  return { viewer };
}
