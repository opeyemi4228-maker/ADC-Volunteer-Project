import { cookies } from "next/headers";

import { getRegistrant, getViewer } from "./auth.js";
import { token } from "./crypto.js";

/**
 * Who owns an upload: coordinators by their user id, phone-verified people by
 * their phone hash, and anyone else (someone mid-registration, before an
 * account exists) by a random id in an httpOnly cookie. An upload can only be
 * continued, previewed or attached by the same owner.
 */
const ANON = "adc_up";

export async function uploadOwner({ create = false } = {}) {
  const viewer = await getViewer();
  if (viewer) return `user:${viewer.id}`;
  const reg = await getRegistrant();
  if (reg) return reg.phoneHash;
  const jar = await cookies();
  let id = jar.get(ANON)?.value;
  if (!id && create) {
    id = token(18);
    jar.set(ANON, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
  }
  return id ? `anon:${id}` : null;
}
