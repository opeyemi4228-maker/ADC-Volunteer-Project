import fs from "node:fs";

import { all, one, run, tx } from "./db.js";
import { seal, blind, uuid } from "./crypto.js";
import { objectPath } from "./storage.js";
import { normalizePhone, normalizeEmail, cleanName } from "./validate.js";

/**
 * Membership lists uploaded by a group (.csv, .xml or .pdf).
 *
 * CSV and XML are read into rows (name, phone, email, gender, place, role) so
 * coordinators can see and count them. A PDF can't be read reliably, so it is
 * kept as a document for coordinators to open. Phone numbers and emails in
 * the list are encrypted like every other contact in the system.
 */

export const MAX_ROWS = 20_000;

const ALIASES = {
  full_name: ["full name", "fullname", "name", "member name", "names"],
  first_name: ["first name", "firstname", "given name", "first"],
  surname: ["surname", "last name", "lastname", "family name", "last"],
  phone: ["phone", "phone number", "mobile", "mobile number", "telephone", "tel", "gsm", "whatsapp"],
  email: ["email", "email address", "e-mail"],
  gender: ["gender", "sex"],
  place: ["ward", "lga", "location", "address", "polling unit", "area"],
  role: ["role", "position", "office"],
};

function field(header) {
  const h = String(header).toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  return Object.keys(ALIASES).find((k) => ALIASES[k].includes(h)) ?? null;
}

/** RFC 4180 CSV with quoted fields; also accepts ";" or tab separators. */
export function parseCsv(text) {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/)[0] ?? "";
  const sep = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
    if (rows.length > MAX_ROWS + 1) break;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/** Simple XML: any repeated element whose children are the fields (<member><name>…</name>…</member>). */
export function parseXml(text) {
  const records = [];
  const re = /<(member|person|row|record|item)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const m of text.matchAll(re)) {
    const rec = {};
    for (const f of m[2].matchAll(/<([A-Za-z_][\w\-]*)[^>]*>([\s\S]*?)<\/\1>/g)) rec[f[1]] = decode(f[2]);
    // Attributes as fields too: <member name="…" phone="…"/>
    for (const a of m[0].slice(0, m[0].indexOf(">")).matchAll(/([A-Za-z_][\w\-]*)="([^"]*)"/g)) rec[a[1]] ??= decode(a[2]);
    records.push(rec);
    if (records.length > MAX_ROWS) break;
  }
  for (const m of text.matchAll(/<(member|person|row|record|item)\b([^>]*)\/>/gi)) {
    const rec = {};
    for (const a of m[2].matchAll(/([A-Za-z_][\w\-]*)="([^"]*)"/g)) rec[a[1]] = decode(a[2]);
    records.push(rec);
  }
  return records;
}

const decode = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();

/** Turns raw records (object per member) into clean rows, with counts of what was skipped. */
export function cleanRecords(records) {
  const rows = [];
  let skipped = 0;
  for (const raw of records) {
    const r = {};
    for (const [k, v] of Object.entries(raw)) {
      const f = field(k);
      if (f && v != null && String(v).trim()) r[f] ??= String(v).trim();
    }
    const name = cleanName(r.full_name ?? [r.first_name, r.surname].filter(Boolean).join(" ")).slice(0, 120);
    if (name.length < 2) { skipped += 1; continue; }
    rows.push({
      full_name: name,
      phone: normalizePhone(r.phone) ?? null,
      email: normalizeEmail(r.email) || null,
      gender: r.gender ? String(r.gender).slice(0, 20) : null,
      place: r.place ? String(r.place).slice(0, 120) : null,
      role: r.role ? String(r.role).slice(0, 60) : null,
    });
    if (rows.length >= MAX_ROWS) break;
  }
  return { rows, skipped };
}

/**
 * Reads an upload and stores its members against the group, replacing any
 * earlier list. Returns { kind, count, skipped } or { error }.
 */
export function importMembership(groupId, uploadId, ownerHash) {
  const upload = one("SELECT * FROM uploads WHERE id = :id AND owner_hash = :o AND done = 1 AND kind = 'document'", { id: uploadId, o: ownerHash });
  if (!upload) return { error: "The membership list didn't finish uploading. Upload it again." };
  const buffer = fs.readFileSync(objectPath(upload.storage_key));
  let records = null;
  if (upload.mime === "text/csv") {
    const table = parseCsv(buffer.toString("utf8"));
    if (table.length < 2) return { error: "The CSV file has no member rows. Put column names on the first line." };
    const [header, ...body] = table;
    records = body.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i]])));
  } else if (upload.mime === "application/xml") {
    records = parseXml(buffer.toString("utf8"));
    if (!records.length) return { error: "We couldn't find members in the XML file. Each member should be a <member> element." };
  }
  return tx(() => {
    run("DELETE FROM group_member_list WHERE group_id = :g", { g: groupId });
    let count = null;
    let skipped = 0;
    if (records) {
      const out = cleanRecords(records);
      skipped = out.skipped;
      out.rows.forEach((r, i) => {
        run(
          `INSERT INTO group_member_list (id, group_id, row_no, full_name, phone_enc, phone_hash, email_enc, gender, place, role)
           VALUES (:id, :g, :n, :name, :pe, :ph, :em, :gender, :place, :role)`,
          { id: uuid(), g: groupId, n: i + 1, name: r.full_name, pe: seal(r.phone), ph: blind(r.phone), em: seal(r.email), gender: r.gender, place: r.place, role: r.role },
        );
      });
      count = out.rows.length;
      if (!count) throw Object.assign(new Error("No members could be read. Check the file has a name column."), { user: true });
    }
    run("UPDATE support_groups SET membership_upload_id = :u, membership_count = :c WHERE id = :g", { u: upload.id, c: count, g: groupId });
    return { kind: upload.mime === "application/pdf" ? "pdf" : upload.mime === "application/xml" ? "xml" : "csv", count, skipped };
  });
}

export function memberList(groupId, limit = 500) {
  return all("SELECT row_no, full_name, gender, place, role, phone_enc FROM group_member_list WHERE group_id = :g ORDER BY row_no LIMIT :l", { g: groupId, l: limit });
}

export const TEMPLATE_CSV = "full_name,phone,email,gender,ward,role\nAmina Bello,08031234567,amina@example.com,Female,Kubwa,Member\nƊahiru Ƙabir,08061234567,,Male,Kubwa,Secretary\n";
