import { VOLUNTEER_ROLES, PVC_STATUS, GENDERS, AVAILABILITY, LANGUAGES, CONTACT_CHANNEL_LABELS, VOLUNTEER_STATUS, REGISTRATION_CHANNELS, AGE_BANDS, labelOf } from "./options.js";
import { ageOn, formatPhone } from "./validate.js";

/**
 * Columns a volunteer download can carry. The download dialog shows the
 * labels and presets; the server reads `value` from rows built by
 * `volunteerExport()` (place names are resolved there, so nothing here
 * touches the disk and this file also loads in the browser).
 *
 * `personal` columns are contact details: the dialog marks them and the audit
 * log records whether a download included any.
 */

const list = (values, options) => (values ?? []).map((v) => labelOf(options, v)).join("; ");
const yesNo = (v) => (v == null ? "" : v ? "Yes" : "No");
const day = (v) => (v ? String(v).slice(0, 10) : "");

export const VOLUNTEER_COLUMNS = [
  { key: "public_id", label: "Volunteer ID", group: "Person", width: 16, value: (v) => v.public_id },
  { key: "first_name", label: "First name", group: "Person", width: 16, value: (v) => v.first_name },
  { key: "middle_name", label: "Middle name", group: "Person", width: 14, value: (v) => v.middle_name ?? "" },
  { key: "surname", label: "Surname", group: "Person", width: 16, value: (v) => v.surname },
  { key: "gender", label: "Gender", group: "Person", width: 10, value: (v) => labelOf(GENDERS, v.gender) },
  { key: "age", label: "Age", group: "Person", width: 6, number: true, value: (v) => (v.date_of_birth ? ageOn(v.date_of_birth) : "") },
  { key: "date_of_birth", label: "Date of birth", group: "Person", width: 12, value: (v) => v.date_of_birth ?? "" },
  { key: "occupation", label: "Occupation", group: "Person", width: 16, value: (v) => v.occupation ?? "" },

  { key: "phone", label: "Phone", group: "Contact", personal: true, width: 15, value: (v) => formatPhone(v.phone) },
  { key: "email", label: "Email", group: "Contact", personal: true, width: 24, value: (v) => v.email ?? "" },
  { key: "phone_confirmed", label: "Phone confirmed", group: "Contact", width: 10, value: (v) => yesNo(Boolean(v.phone_verified_at)) },
  { key: "preferred_channel", label: "Best way to reach", group: "Contact", width: 14, value: (v) => labelOf(CONTACT_CHANNEL_LABELS, v.preferred_channel) },

  { key: "state", label: "State", group: "Where they vote", width: 16, value: (v) => v.state_name },
  { key: "lga", label: "LGA", group: "Where they vote", width: 18, value: (v) => v.lga_name },
  { key: "ward", label: "Ward", group: "Where they vote", width: 18, value: (v) => v.ward_name },
  { key: "pu_code", label: "Polling unit code", group: "Where they vote", width: 16, value: (v) => v.vote_pu_code ?? "" },
  { key: "pu_name", label: "Polling unit", group: "Where they vote", width: 28, value: (v) => v.pu_name ?? "" },
  { key: "pvc", label: "PVC", group: "Where they vote", width: 14, value: (v) => labelOf(PVC_STATUS, v.pvc_status) },

  { key: "roles", label: "Roles", group: "How they help", width: 28, value: (v) => list(v.roles, VOLUNTEER_ROLES) },
  { key: "languages", label: "Languages", group: "How they help", width: 18, value: (v) => list(v.languages, LANGUAGES) },
  { key: "availability", label: "Availability", group: "How they help", width: 14, value: (v) => labelOf(AVAILABILITY, v.availability) },
  { key: "smartphone", label: "Smartphone", group: "How they help", width: 10, value: (v) => yesNo(v.has_smartphone) },
  { key: "group", label: "Support group", group: "How they help", width: 24, value: (v) => v.group_name ?? "" },
  { key: "group_id", label: "Group ID", group: "How they help", width: 16, value: (v) => v.group_public_id ?? "" },

  { key: "status", label: "Status", group: "Record", width: 12, value: (v) => labelOf(VOLUNTEER_STATUS, v.status) },
  { key: "verified_on", label: "Verified on", group: "Record", width: 12, value: (v) => day(v.verified_at) },
  { key: "verification_method", label: "Verified by", group: "Record", width: 14, value: (v) => (v.verification_method ?? "").replace(/_/g, " ") },
  { key: "channel", label: "Registered through", group: "Record", width: 14, value: (v) => labelOf(REGISTRATION_CHANNELS, v.registration_channel) },
  { key: "registered_on", label: "Registered on", group: "Record", width: 12, value: (v) => day(v.created_at) },
];

export const COLUMN_GROUPS = [...new Set(VOLUNTEER_COLUMNS.map((c) => c.group))];

export const COLUMN_PRESETS = [
  { key: "standard", label: "Standard", columns: ["public_id", "first_name", "surname", "gender", "age", "phone", "state", "lga", "ward", "pu_name", "pvc", "roles", "status", "registered_on"] },
  { key: "contact", label: "Contact list", columns: ["public_id", "first_name", "surname", "phone", "preferred_channel", "ward", "pu_name", "languages"] },
  { key: "agents", label: "Polling unit agents", columns: ["public_id", "first_name", "surname", "phone", "lga", "ward", "pu_code", "pu_name", "pvc", "smartphone", "status"] },
  { key: "all", label: "Everything", columns: VOLUNTEER_COLUMNS.map((c) => c.key) },
];

/** Known column keys from a comma list, in table order; the standard set when none are valid. */
export function pickColumns(value) {
  const want = new Set(String(value ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const cols = VOLUNTEER_COLUMNS.filter((c) => want.has(c.key));
  return cols.length ? cols : VOLUNTEER_COLUMNS.filter((c) => COLUMN_PRESETS[0].columns.includes(c.key));
}

/** Every query-string key the directory filters on (paging and sorting aside). */
export const FILTER_KEYS = [
  "q", "area", "status", "queue", "role", "pvc", "gender", "age", "availability", "language", "smartphone",
  "phone", "affiliation", "channel", "from", "to", "nopu", "flagged", "unaffiliated", "group", "ids",
];

/**
 * Active filters in words, for the chips above the list and the "About this
 * export" sheet. `place` names an area code (the server passes `areaName`).
 */
export function describeFilters(f = {}, place = (code) => code) {
  const out = [];
  const add = (key, label, value) => value && out.push({ key, label, value });
  if (f.q) add("q", "Search", `“${f.q}”`);
  if (f.area) add("area", "Area", place(f.area));
  if (f.status) add("status", "Status", labelOf(VOLUNTEER_STATUS, f.status));
  if (f.queue) add("queue", "Status", "Waiting for verification");
  if (f.role) add("role", "Role", labelOf(VOLUNTEER_ROLES, f.role));
  if (f.pvc) add("pvc", "PVC", labelOf(PVC_STATUS, f.pvc));
  if (f.gender) add("gender", "Gender", labelOf(GENDERS, f.gender));
  if (f.age) add("age", "Age", AGE_BANDS.find((b) => b.value === f.age)?.label);
  if (f.availability) add("availability", "Availability", labelOf(AVAILABILITY, f.availability));
  if (f.language) add("language", "Language", labelOf(LANGUAGES, f.language));
  if (f.smartphone) add("smartphone", "Smartphone", f.smartphone === "yes" ? "Has one" : "None");
  if (f.phone) add("phone", "Phone", f.phone === "confirmed" ? "Confirmed" : "Not confirmed");
  if (f.affiliation) add("affiliation", "Group", f.affiliation === "none" ? "Not in a group" : "In a support group");
  if (f.unaffiliated) add("unaffiliated", "Group", "Not in a group");
  if (f.group) add("group", "Group", "One group");
  if (f.channel) add("channel", "Registered through", labelOf(REGISTRATION_CHANNELS, f.channel));
  if (f.from) add("from", "Registered from", f.from);
  if (f.to) add("to", "Registered to", f.to);
  if (f.nopu) add("nopu", "Polling unit", "None given");
  if (f.flagged) add("flagged", "Duplicates", "Possible duplicates");
  if (f.ids) add("ids", "Selection", `${String(f.ids).split(",").filter(Boolean).length} chosen`);
  return out;
}

/** Just the filter keys from a query string or stored export, dropping empty values. */
export function onlyFilters(params = {}) {
  return Object.fromEntries(FILTER_KEYS.filter((k) => params[k] != null && params[k] !== "").map((k) => [k, String(params[k])]));
}
