import { all, one, run, tx, nextCounter, nowIso } from "./db.js";
import { seal, blind, uuid } from "./crypto.js";
import { checkLocation, stateOf } from "./geo.js";
import {
  normalizePhone, normalizeEmail, normalizeUrl, normalizeHandle, isValidName, properCase, cleanName,
  ageOn, isFutureDate, isValidIsoDate, nameKey, nameSimilarity, SIMILAR_NAME_THRESHOLD, SOCIAL_NETWORKS, passwordProblem,
} from "./validate.js";
import {
  GROUP_CATEGORIES, OPERATING_LEVELS, CAC_STATUS, GROUP_SIZE, LEADER_POSITIONS, GENDERS, PLATFORM_TYPES,
  AUDIENCE_RANGES, ACTIVITY_FREQUENCY, VOLUNTEER_ROLES, LANGUAGES, AVAILABILITY, CONTACT_CHANNELS, PVC_STATUS,
  CATEGORY_DIRECTORATE,
} from "./options.js";

/**
 * Validation and creation of groups and volunteers. One implementation for
 * every channel (web, USSD, WhatsApp, field agent), so they all run the same
 * rules and the same duplicate checks (spec §7, §11).
 */

export const NOTICE_VERSION = "2026-09-v1";

const has = (options, v) => options.some((o) => o.value === v);
const str = (v) => (typeof v === "string" ? v.trim() : "");

/* ═════════════════════════ Support groups ═════════════════════════════ */

function groupSection(step, d = {}) {
  const e = {};
  const about = d.about ?? {};
  const loc = d.location ?? {};

  if (step === 2) {
    const name = cleanName(about.name);
    if (name.length < 3 || name.length > 100) e["about.name"] = "Enter the group name (3 to 100 characters).";
    if (!has(GROUP_CATEGORIES, about.category)) e["about.category"] = "Choose a category.";
    if (about.category === "other" && !str(about.category_other)) e["about.category_other"] = "Tell us the category.";
    if (!has(OPERATING_LEVELS, about.operating_level)) e["about.operating_level"] = "Choose the level your group works at.";
    if (!/^\d{4}-\d{2}$/.test(about.date_formed ?? "")) e["about.date_formed"] = "Choose the month and year the group was formed.";
    else if (isFutureDate(about.date_formed)) e["about.date_formed"] = "The date formed cannot be in the future.";
    if (str(about.description).length > 500) e["about.description"] = "Keep the description to 500 characters.";
    if (about.cac_status && !has(CAC_STATUS, about.cac_status)) e["about.cac_status"] = "Choose a CAC status.";
    if (!has(GROUP_SIZE, about.size)) e["about.size"] = "Choose the estimated number of members.";
  }

  if (step === 3) {
    const level = about.operating_level;
    const needWard = level === "ward" || level === "lga";
    const err = checkLocation({ state: loc.state, lga: loc.lga, ward: loc.ward }, { needLga: true, needWard });
    if (err) e[!loc.state ? "location.state" : !loc.lga || err.includes("LGA") ? "location.lga" : "location.ward"] = err;
    const areas = Array.isArray(loc.areas) ? loc.areas : [];
    if (["lga", "state", "zonal"].includes(level) && areas.length === 0) {
      e["location.areas"] = level === "zonal" ? "Choose the states your group covers." : level === "state" ? "Choose the LGAs your group covers." : "Choose the wards your group covers.";
    }
    if (str(loc.address).length > 200) e["location.address"] = "Keep the address to 200 characters.";
    if (loc.lat != null && (Math.abs(loc.lat) > 90 || Math.abs(loc.lng) > 180)) e["location.pin"] = "That map pin is not valid.";
  }

  if (step === 4) {
    const leaders = Array.isArray(d.leaders) ? d.leaders : [];
    const phones = new Set();
    leaders.forEach((l, i) => {
      if (!has(LEADER_POSITIONS, l.position)) e[`leaders.${i}.position`] = "Choose a position.";
      if (!isValidName(l.first_name)) e[`leaders.${i}.first_name`] = "Enter a first name using letters only.";
      if (!isValidName(l.surname)) e[`leaders.${i}.surname`] = "Enter a surname using letters only.";
      const needsPhone = l.position === "coordinator" || l.position === "secretary";
      const phone = normalizePhone(l.phone);
      if (str(l.phone) && !phone) e[`leaders.${i}.phone`] = "Enter a Nigerian mobile number, e.g. 0803 123 4567.";
      else if (needsPhone && !phone) e[`leaders.${i}.phone`] = "A phone number is required for this position.";
      if (phone) phones.add(phone);
      if (str(l.email) && normalizeEmail(l.email) === null) e[`leaders.${i}.email`] = "Enter a valid email address.";
      if (l.gender && !has(GENDERS, l.gender)) e[`leaders.${i}.gender`] = "Choose an option.";
    });
    const coordinators = leaders.filter((l) => l.position === "coordinator");
    if (coordinators.length === 0) e.leaders = "Add the group's coordinator.";
    else if (leaders.length < 2) e.leaders = "Add at least one other leader as a backup contact.";
    else if (phones.size < 2) e.leaders = "At least two leaders need different phone numbers, so we have a backup contact.";
  }

  if (step === 5) {
    const online = d.online ?? {};
    (online.platforms ?? []).slice(0, 5).forEach((p, i) => {
      if (str(p.link) && normalizeUrl(p.link) === null) e[`online.platforms.${i}.link`] = "That link doesn't look right. Check it, or leave it blank.";
    });
    if (str(online.website) && normalizeUrl(online.website) === null) e["online.website"] = "That website address doesn't look right. Check it, or leave it blank.";
  }

  if (step === 6) {
    (d.media ?? []).forEach((m, i) => {
      if (!str(m.event_name)) e[`media.${i}.event_name`] = "Enter the event name.";
      if (!isValidIsoDate(m.event_date)) e[`media.${i}.event_date`] = "Enter the event date.";
      else if (isFutureDate(m.event_date)) e[`media.${i}.event_date`] = "The event date cannot be in the future.";
      if (checkLocation({ state: m.state, lga: m.lga, ward: m.ward }, { needWard: false })) e[`media.${i}.location`] = "Choose where the event took place.";
      if (str(m.caption).length > 200) e[`media.${i}.caption`] = "Keep the caption to 200 characters.";
      if (!m.consent) e[`media.${i}.consent`] = "Confirm that people shown agreed and no children are identifiable.";
      if (m.kind === "link" && !normalizeUrl(m.external_url)) e[`media.${i}.external_url`] = "Paste a valid video link.";
    });
  }

  if (step === 7) {
    if (!d.consent?.accurate) e["consent.accurate"] = "Please confirm the information is accurate.";
    if (!d.consent?.data) e["consent.data"] = "Please agree to how the campaign uses this information.";
  }
  return e;
}

/**
 * The group form's five steps (fast registration, no phone code):
 *   1 About the group (name, logo, category, level, size…)
 *   2 Where it is based and the areas it covers
 *   3 Leaders
 *   4 Members and extras, all optional (membership list, online presence, photos)
 *   5 Account (email + password) and consent
 */
export const GROUP_STEPS = { 1: [2], 2: [3], 3: [4], 4: [5, 6], 5: [7] };

export function validateGroupStep(step, d = {}) {
  let e = {};
  for (const section of GROUP_STEPS[step] ?? []) e = { ...e, ...groupSection(section, d) };
  if (step === 1 && d.about?.logo_upload_id && typeof d.about.logo_upload_id !== "string") e["about.logo"] = "Upload the logo again.";
  if (step === 4 && d.membership?.upload_id && typeof d.membership.upload_id !== "string") e.membership = "Upload the membership list again.";
  if (step === 5) e = { ...e, ...accountErrors(d.account) };
  return e;
}

export function accountErrors(account = {}) {
  const e = {};
  const email = normalizeEmail(account.email);
  if (!email) e["account.email"] = "Enter the email address the group will sign in with.";
  else if (one("SELECT 1 AS x FROM users WHERE email_hash = :h", { h: blind(email) })) e["account.email"] = "This email already has an account. Sign in instead, or use another email.";
  const pw = passwordProblem(account.password);
  if (pw) e["account.password"] = pw;
  return e;
}

export function validateGroup(d) {
  let errors = {};
  for (const step of [1, 2, 3, 4, 5]) errors = { ...errors, ...validateGroupStep(step, d) };
  return errors;
}

/** Existing groups the new name may duplicate: same state, similar name. */
export function similarGroups(name, stateCode, lgaCode = null, excludeId = null) {
  if (!name || !stateCode) return [];
  const rows = all("SELECT id, public_id, name, lga_code, ward_code, status FROM support_groups WHERE state_code = :s AND status != 'rejected'", { s: stateCode });
  return rows
    .filter((r) => r.id !== excludeId)
    .map((r) => ({ ...r, score: nameSimilarity(name, r.name), sameLga: lgaCode ? r.lga_code === lgaCode : false }))
    .filter((r) => r.score >= SIMILAR_NAME_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/** The group a coordinator phone already manages, if any. */
export function groupManagedBy(phone) {
  return one(
    `SELECT g.id, g.public_id, g.name, g.status FROM group_leaders l JOIN support_groups g ON g.id = l.group_id
     WHERE l.phone_hash = :h AND l.position = 'coordinator' AND g.status != 'rejected' LIMIT 1`,
    { h: blind(phone) },
  );
}

function makeJoinCode(name, n) {
  const letters = cleanName(name).normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase();
  const consonants = letters.replace(/[AEIOU]/g, "");
  const base = (consonants.length >= 3 ? consonants : `${letters}XXX`).slice(0, 3);
  const digits = String(n % 1000).padStart(3, "0");
  for (let i = 0; i < 50; i += 1) {
    const code = i === 0 ? `${base}${digits}` : `${base.slice(0, 2)}${String.fromCharCode(65 + ((i - 1) % 26))}${digits}${i > 26 ? i : ""}`;
    if (!one("SELECT 1 FROM support_groups WHERE join_code = :c", { c: code })) return code;
  }
  return `${base}${uuid().slice(0, 5).toUpperCase()}`;
}

/**
 * Creates the group and everything hanging off it in one transaction.
 * `registrant` is the phone that proved itself by OTP (or USSD network).
 */
export function createGroup(d, { registrantPhone, channel = "web", mediaItems = [], uploaderOwner = null, logoKey = null }) {
  const about = d.about;
  const loc = d.location;
  const state = stateOf(loc.state);
  return tx(() => {
    const n = nextCounter(`group:${loc.state}`, 1);
    const publicId = `ADC-SG-${state.inec}-${String(n).padStart(4, "0")}`;
    const id = uuid();
    const joinCode = makeJoinCode(about.name, n);
    const online = d.online ?? {};
    const platforms = online.has_platform === "yes" ? (online.platforms ?? []).slice(0, 5) : [];

    run(
      `INSERT INTO support_groups (id, public_id, name, name_key, category, category_other, operating_level, date_formed,
        description, cac_status, cac_number, estimated_size_range, state_code, lga_code, ward_code, address, latitude, longitude,
        directorate, has_online_platform, website_url, join_code, registrant_hash, registration_channel, created_at, updated_at)
       VALUES (:id, :pid, :name, :key, :cat, :cat_other, :level, :formed, :desc, :cac, :cacno, :size, :s, :l, :w, :addr, :lat, :lng,
        :dir, :hasp, :web, :join, :reg, :channel, :now, :now)`,
      {
        id, pid: publicId, name: cleanName(about.name), key: nameKey(about.name), cat: about.category,
        cat_other: about.category === "other" ? str(about.category_other) : null, level: about.operating_level,
        formed: about.date_formed, desc: str(about.description) || null, cac: about.cac_status || null,
        cacno: about.cac_status === "registered" ? str(about.cac_number) || null : null, size: about.size,
        s: loc.state, l: loc.lga || null, w: loc.ward || null, addr: str(loc.address) || null,
        lat: loc.lat ?? null, lng: loc.lng ?? null, dir: CATEGORY_DIRECTORATE[about.category] ?? "mobilisation",
        hasp: online.has_platform === "yes" ? 1 : online.has_platform === "no" ? 0 : null,
        web: normalizeUrl(online.website) || null, join: joinCode, reg: blind(registrantPhone), channel, now: nowIso(),
      },
    );

    const areaType = { zonal: "state", state: "lga", lga: "ward" }[about.operating_level];
    for (const code of areaType ? loc.areas ?? [] : []) {
      run("INSERT OR IGNORE INTO group_areas_covered (group_id, area_type, area_code) VALUES (:g, :t, :c)", { g: id, t: areaType, c: code });
    }

    (d.leaders ?? []).forEach((l, i) => {
      const phone = normalizePhone(l.phone);
      run(
        `INSERT INTO group_leaders (id, group_id, position, position_other, first_name, surname, phone_enc, phone_hash, email_enc, gender, sort)
         VALUES (:id, :g, :pos, :other, :f, :s, :pe, :ph, :em, :gender, :sort)`,
        {
          id: uuid(), g: id, pos: l.position, other: l.position === "other" ? str(l.position_other) || null : null,
          f: properCase(l.first_name), s: properCase(l.surname), pe: seal(phone), ph: blind(phone),
          em: seal(normalizeEmail(l.email) || null), gender: l.gender || null, sort: i,
        },
      );
    });

    for (const p of platforms) {
      const types = (p.types ?? []).filter((t) => has(PLATFORM_TYPES, t));
      if (!types.length && !str(p.name)) continue;
      run(
        `INSERT INTO group_online_platforms (id, group_id, platform_types, platform_name, audience_range, activity_frequency, link_url)
         VALUES (:id, :g, :types, :name, :aud, :freq, :link)`,
        {
          id: uuid(), g: id, types: JSON.stringify(types), name: str(p.name) || null,
          aud: has(AUDIENCE_RANGES, p.audience) ? p.audience : null, freq: has(ACTIVITY_FREQUENCY, p.frequency) ? p.frequency : null,
          link: normalizeUrl(p.link) || null,
        },
      );
    }

    saveSocial("group", id, online.social ?? {}, online.other ?? []);
    recordConsents("group", id, d.consent ?? {}, channel);
    if (logoKey) run("UPDATE support_groups SET logo_key = :k WHERE id = :id", { k: logoKey, id });
    attachMedia(mediaItems, { ownerType: "group", ownerId: id, groupId: id, uploadedBy: uploaderOwner ?? blind(registrantPhone), uploaderName: `${properCase(d.leaders?.[0]?.first_name ?? "")} ${properCase(d.leaders?.[0]?.surname ?? "")}`.trim() });

    // Duplicate flags for the verification queue (spec §11).
    for (const s of similarGroups(about.name, loc.state, loc.lga, id).filter((r) => r.sameLga)) {
      flagDuplicate("group", id, s.id, `Similar name to ${s.name} (${s.public_id}) in the same LGA`);
    }
    for (const l of d.leaders ?? []) {
      if (l.position !== "coordinator") continue;
      const other = one(
        `SELECT g.id, g.public_id, g.name FROM group_leaders gl JOIN support_groups g ON g.id = gl.group_id
         WHERE gl.phone_hash = :h AND gl.position = 'coordinator' AND g.id != :id LIMIT 1`,
        { h: blind(normalizePhone(l.phone)), id },
      );
      if (other) flagDuplicate("group", id, other.id, `Same coordinator phone as ${other.name} (${other.public_id})`);
    }

    return { id, publicId, joinCode, name: cleanName(about.name) };
  });
}

export function saveSocial(ownerType, ownerId, social, other = []) {
  run("DELETE FROM social_accounts WHERE owner_type = :t AND owner_id = :id", { t: ownerType, id: ownerId });
  for (const network of Object.keys(SOCIAL_NETWORKS)) {
    const raw = social?.[network];
    if (!str(raw)) continue;
    const { handle, url } = normalizeHandle(network, raw);
    run("INSERT INTO social_accounts (id, owner_type, owner_id, network, handle, url) VALUES (:id, :t, :o, :n, :h, :u)", {
      id: uuid(), t: ownerType, o: ownerId, n: network, h: handle || str(raw), u: url || null,
    });
  }
  for (const o of (other ?? []).slice(0, 3)) {
    const url = normalizeUrl(o.url);
    if (!url) continue;
    run("INSERT INTO social_accounts (id, owner_type, owner_id, network, label, url) VALUES (:id, :t, :o, 'other', :l, :u)", {
      id: uuid(), t: ownerType, o: ownerId, l: str(o.label) || null, u: url,
    });
  }
}

export function recordConsents(subjectType, subjectId, consent, channel) {
  const rows = [
    ["accuracy", Boolean(consent.accurate)],
    ["data", Boolean(consent.data)],
    ["messaging", Boolean(consent.messaging)],
  ];
  for (const [type, granted] of rows) {
    run(
      `INSERT INTO consents (id, subject_type, subject_id, consent_type, granted, notice_version, channel)
       VALUES (:id, :st, :sid, :ct, :g, :v, :ch)`,
      { id: uuid(), st: subjectType, sid: subjectId, ct: type, g: granted ? 1 : 0, v: NOTICE_VERSION, ch: channel },
    );
  }
}

export function flagDuplicate(entityType, entityId, otherId, reason) {
  run("INSERT INTO duplicate_flags (id, entity_type, entity_id, other_id, reason) VALUES (:id, :t, :e, :o, :r)", {
    id: uuid(), t: entityType, e: entityId, o: otherId, r: reason,
  });
}

/**
 * Turns finished uploads (and pasted links) into media items awaiting
 * moderation. Uploads that belong to someone else, or are unfinished, are
 * skipped rather than trusted.
 */
export function attachMedia(items, { ownerType, ownerId, groupId = null, uploadedBy, uploaderName = null }) {
  const created = [];
  for (const m of items ?? []) {
    if (!m?.consent) continue;
    let upload = null;
    if (m.kind !== "link") {
      upload = one("SELECT * FROM uploads WHERE id = :id AND done = 1 AND owner_hash = :o", { id: m.upload_id, o: uploadedBy });
      if (!upload) continue;
    }
    const url = m.kind === "link" ? normalizeUrl(m.external_url) : null;
    if (m.kind === "link" && !url) continue;
    const dup = upload?.file_hash
      ? one("SELECT id FROM media_items WHERE file_hash = :h OR (phash IS NOT NULL AND phash = :p) LIMIT 1", { h: upload.file_hash, p: upload.phash ?? "" })
      : null;
    const id = uuid();
    run(
      `INSERT INTO media_items (id, owner_type, owner_id, group_id, uploaded_by, uploader_name, kind, storage_key, medium_key, thumbnail_key,
         mime, external_url, event_name, event_date, state_code, lga_code, ward_code, caption, attendance, people_consent_confirmed,
         file_hash, phash, duplicate_of)
       VALUES (:id, :ot, :oid, :gid, :by, :byname, :kind, :sk, :mk, :tk, :mime, :url, :ev, :date, :s, :l, :w, :cap, :att, 1, :fh, :ph, :dup)`,
      {
        id, ot: ownerType, oid: ownerId, gid: groupId, by: uploadedBy, byname: uploaderName, kind: m.kind === "link" ? "link" : upload.kind,
        sk: upload?.storage_key ?? null, mk: upload?.medium_key ?? null, tk: upload?.thumbnail_key ?? null, mime: upload?.mime ?? null,
        url, ev: str(m.event_name).slice(0, 120), date: m.event_date, s: m.state, l: m.lga || null, w: m.ward || null,
        cap: str(m.caption).slice(0, 200) || null, att: Number.isFinite(Number(m.attendance)) && m.attendance !== "" ? Math.max(0, Math.round(Number(m.attendance))) : null,
        fh: upload?.file_hash ?? null, ph: upload?.phash ?? null, dup: dup?.id ?? null,
      },
    );
    created.push(id);
  }
  return created;
}

/* ═════════════════════════ Volunteers ═════════════════════════════════ */

function volunteerSection(step, d = {}, { channel = "web" } = {}) {
  const e = {};
  const a = d.about ?? {};
  const v = d.vote ?? {};
  const h = d.help ?? {};

  if (step === 2) {
    if (!isValidName(a.first_name)) e["about.first_name"] = "Enter your first name using letters only.";
    if (str(a.middle_name) && !isValidName(a.middle_name)) e["about.middle_name"] = "Use letters only.";
    if (!isValidName(a.surname)) e["about.surname"] = "Enter your surname using letters only.";
    if (!has(GENDERS, a.gender)) e["about.gender"] = "Choose an option.";
    if (!isValidIsoDate(a.dob)) e["about.dob"] = "Enter your date of birth.";
    else if (ageOn(a.dob) < 18) e["about.dob"] = "You must be 18 or older to register as a volunteer.";
    else if (ageOn(a.dob) > 110) e["about.dob"] = "Check the year of birth.";
    if (str(a.email) && normalizeEmail(a.email) === null) e["about.email"] = "Enter a valid email address.";
  }

  if (step === 3) {
    const err = checkLocation({ state: v.state, lga: v.lga, ward: v.ward, pu: v.pu_unknown ? null : v.pu });
    if (err) e[!v.state ? "vote.state" : !v.lga || err.includes("LGA") ? "vote.lga" : err.includes("polling") ? "vote.pu" : "vote.ward"] = err;
    if (v.lives_elsewhere) {
      const rerr = checkLocation({ state: v.res_state, lga: v.res_lga, ward: v.res_ward }, { needWard: false });
      if (rerr) e["vote.residence"] = rerr;
    }
    if (!has(PVC_STATUS, v.pvc)) e["vote.pvc"] = "Tell us whether you have your PVC.";
  }

  if (step === 4) {
    const roles = (h.roles ?? []).filter((r) => has(VOLUNTEER_ROLES, r));
    if (roles.length === 0) e["help.roles"] = "Choose at least one way you can help.";
    if (channel === "web" || channel === "field_agent") {
      if (!(h.languages ?? []).some((l) => has(LANGUAGES, l))) e["help.languages"] = "Choose at least one language.";
      if (!has(AVAILABILITY, h.availability)) e["help.availability"] = "Choose when you are available.";
      if (!["yes", "no"].includes(h.smartphone)) e["help.smartphone"] = "Tell us whether you have a smartphone.";
      if (!has(CONTACT_CHANNELS, h.channel)) e["help.channel"] = "Choose the best way to reach you.";
      if (h.channel === "email" && !normalizeEmail(a.email)) e["help.channel"] = "Add an email address in step 2, or choose another way to reach you.";
    }
    if (str(h.group_code) && !groupByCode(h.group_code)) e["help.group_code"] = "We couldn't find a group with that code. Check it, or choose \"I'm not in a group yet\".";
  }

  if (step === 5) {
    if (!d.consent?.accurate) e["consent.accurate"] = "Please confirm the information is accurate.";
    if (!d.consent?.data) e["consent.data"] = "Please agree to how the campaign uses this information.";
  }
  return e;
}

/**
 * The volunteer form's four steps (no phone code):
 *   1 About you, including your phone number
 *   2 Where you vote   3 How you can help   4 Review and consent
 * USSD, WhatsApp and field agents supply the phone from the channel itself.
 */
export function validateVolunteerStep(step, d = {}, opts = {}) {
  const e = volunteerSection(step + 1, d, opts);
  if (step === 1 && (opts.channel ?? "web") === "web") {
    const phone = normalizePhone(d.about?.phone);
    if (!phone) e["about.phone"] = "Enter a Nigerian mobile number, e.g. 0803 123 4567.";
    else if (volunteerByPhone(phone)) e["about.phone"] = "This number is already registered. Check your registration instead.";
  }
  return e;
}

export function validateVolunteer(d, opts) {
  let errors = {};
  for (const step of [1, 2, 3, 4]) errors = { ...errors, ...validateVolunteerStep(step, d, opts) };
  return errors;
}

export function groupByCode(code) {
  const c = String(code ?? "").trim().toUpperCase().replace(/\s/g, "");
  if (!c) return null;
  return one("SELECT id, public_id, name, join_code, state_code, lga_code, ward_code, status FROM support_groups WHERE join_code = :c AND status NOT IN ('rejected','suspended')", { c });
}

export function volunteerByPhone(phone) {
  return one("SELECT * FROM volunteers WHERE phone_hash = :h", { h: blind(phone) });
}

/**
 * Creates a volunteer. Exact phone match is refused (the caller offers
 * "sign in to update"); a similar name with the same date of birth in the same
 * ward is created but flagged for the coordinator.
 */
export function createVolunteer(d, { phone, channel = "web", agentId = null, agentLat = null, agentLng = null, phoneVerified = true }) {
  const a = d.about;
  const v = d.vote;
  const h = d.help ?? {};
  if (volunteerByPhone(phone)) return { error: "This number is already registered. Sign in to update your details.", duplicatePhone: true };
  const state = stateOf(v.state);
  const group = str(h.group_code) && !h.no_group ? groupByCode(h.group_code) : null;

  return tx(() => {
    const n = nextCounter(`volunteer:${v.state}`, 1);
    const publicId = `ADC-M-${state.inec}-${String(n).padStart(6, "0")}`;
    const id = uuid();
    run(
      `INSERT INTO volunteers (id, public_id, first_name, middle_name, surname, name_key, gender, date_of_birth, phone_enc, phone_hash,
        phone_verified_at, email_enc, vote_state_code, vote_lga_code, vote_ward_code, vote_pu_code, res_state_code, res_lga_code, res_ward_code,
        pvc_status, pvc_reminder, group_id, group_status, occupation, availability, has_smartphone, preferred_channel, registration_channel,
        registered_by_agent, agent_latitude, agent_longitude, created_at, updated_at)
       VALUES (:id, :pid, :f, :m, :s, :key, :g, :dob, :pe, :ph, :pv, :em, :vs, :vl, :vw, :vpu, :rs, :rl, :rw, :pvc, :rem, :gid, :gst,
        :occ, :av, :sp, :ch, :channel, :agent, :alat, :alng, :now, :now)`,
      {
        id, pid: publicId, f: properCase(a.first_name), m: str(a.middle_name) ? properCase(a.middle_name) : null, s: properCase(a.surname),
        key: nameKey(`${a.first_name} ${a.surname}`), g: a.gender, dob: a.dob, pe: seal(phone), ph: blind(phone),
        pv: phoneVerified ? nowIso() : null, em: seal(normalizeEmail(a.email) || null),
        vs: v.state, vl: v.lga, vw: v.ward, vpu: !v.pu_unknown && v.pu ? v.pu : null,
        rs: v.lives_elsewhere ? v.res_state || null : null, rl: v.lives_elsewhere ? v.res_lga || null : null, rw: v.lives_elsewhere ? v.res_ward || null : null,
        pvc: v.pvc, rem: v.pvc_reminder ? 1 : 0, gid: group?.id ?? null, gst: group ? "pending" : null,
        occ: str(a.occupation) || null, av: h.availability || null, sp: h.smartphone === "yes" ? 1 : h.smartphone === "no" ? 0 : null,
        ch: h.channel || (channel === "ussd" ? "sms" : null), channel, agent: agentId, alat: agentLat, alng: agentLng, now: nowIso(),
      },
    );
    for (const r of new Set((h.roles ?? []).filter((x) => has(VOLUNTEER_ROLES, x)))) run("INSERT INTO volunteer_roles VALUES (:v, :r)", { v: id, r });
    for (const l of new Set((h.languages ?? []).filter((x) => has(LANGUAGES, x)))) run("INSERT INTO volunteer_languages VALUES (:v, :l)", { v: id, l });
    if ((h.roles ?? []).includes("social_media")) saveSocial("volunteer", id, h.social ?? {});
    recordConsents("volunteer", id, d.consent ?? {}, channel);

    const similar = all(
      "SELECT id, public_id, first_name, surname FROM volunteers WHERE vote_ward_code = :w AND date_of_birth = :dob AND id != :id",
      { w: v.ward, dob: a.dob, id },
    ).filter((r) => nameSimilarity(`${r.first_name} ${r.surname}`, `${a.first_name} ${a.surname}`) >= 0.6);
    for (const r of similar) flagDuplicate("volunteer", id, r.id, `Similar name and same date of birth as ${r.first_name} ${r.surname} (${r.public_id}) in the same ward`);

    return { id, publicId, group: group ? { name: group.name, publicId: group.public_id } : null, firstName: properCase(a.first_name) };
  });
}
