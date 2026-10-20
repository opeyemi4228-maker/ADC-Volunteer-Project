import crypto from "node:crypto";

import { one, run } from "@/lib/db";
import { uuid } from "@/lib/crypto";
import { normalizePhone } from "@/lib/validate";
import { openSession, answer } from "@/lib/conversation";
import { volunteerByPhone } from "@/lib/registration";
import { storePhotoBuffer } from "@/lib/storage";
import { send } from "@/lib/notify";

/**
 * WhatsApp Business Platform webhook (spec §7.2).
 *   GET   verification handshake (hub.verify_token = WHATSAPP_VERIFY_TOKEN)
 *   POST  incoming messages, signed with WHATSAPP_APP_SECRET
 *
 * Text drives the same registration conversation as USSD. Photos from a
 * verified volunteer go into their group's media library, pending review.
 */
export async function GET(request) {
  const q = new URL(request.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && process.env.WHATSAPP_VERIFY_TOKEN && q.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(q.get("hub.challenge"));
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request) {
  const raw = await request.text();
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (secret) {
    const expected = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
    const got = request.headers.get("x-hub-signature-256") ?? "";
    if (got.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return new Response("Bad signature", { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    return new Response("WHATSAPP_APP_SECRET is not set", { status: 503 });
  }

  let payload;
  try { payload = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
  const messages = payload.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];

  for (const m of messages) {
    const phone = normalizePhone(m.from);
    if (!phone) continue;
    if (m.type === "text") {
      const text = m.text?.body ?? "";
      const out = /^(hi|hello|menu|start|join|sannu|bawo|ndewo)\b/i.test(text.trim()) ? openSession("whatsapp", phone) : answer("whatsapp", phone, text);
      await send({ channel: "whatsapp", to: phone, body: out.text });
    } else if (m.type === "image") {
      await send({ channel: "whatsapp", to: phone, body: await takePhoto(phone, m.image) });
    }
  }
  return new Response("OK");
}

async function takePhoto(phone, image) {
  const v = volunteerByPhone(phone);
  if (!v || v.status !== "verified" || !v.group_id) return "Thanks. Photos can be sent once you are a verified member of a group.";
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return "Thanks. Photo uploads by WhatsApp are not switched on yet. Please use the website.";
  const meta = await fetch(`https://graph.facebook.com/v20.0/${image.id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const buffer = Buffer.from(await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.arrayBuffer()));
  const keys = await storePhotoBuffer(buffer);
  const g = one("SELECT state_code, lga_code, ward_code FROM support_groups WHERE id = :id", { id: v.group_id });
  run(
    `INSERT INTO media_items (id, owner_type, owner_id, group_id, uploaded_by, uploader_name, kind, storage_key, medium_key, thumbnail_key, mime,
       event_name, event_date, state_code, lga_code, ward_code, caption, people_consent_confirmed, file_hash, phash)
     VALUES (:id, 'group', :g, :g, :by, :name, 'photo', :sk, :mk, :tk, :mime, 'Sent on WhatsApp', date('now'), :s, :l, :w, :cap, 0, :fh, :ph)`,
    { id: uuid(), g: v.group_id, by: v.phone_hash, name: `${v.first_name} ${v.surname}`, sk: keys.storage_key, mk: keys.medium_key, tk: keys.thumbnail_key, mime: keys.mime, s: g.state_code, l: g.lga_code, w: g.ward_code, cap: String(image.caption ?? "").slice(0, 200) || null, fh: keys.file_hash, ph: keys.phash },
  );
  return "Thanks. Your photo is in your group's gallery, waiting for review. Please make sure no children can be identified.";
}
