/**
 * Coordinator positions and what each one can open.
 *
 * The Super Admin gives someone a position (ward, LGA, state or zonal
 * coordinator, directorate head, field agent) over one area. A position
 * opens a set of workspace tabs ("features") and dashboard widgets. Each
 * position starts from the defaults below; the Super Admin can switch any tab
 * or widget on or off in Settings → Positions and access, and the choice is
 * kept in the `position_access` setting. Records are still limited to the
 * person's own area by `scopeSql` whatever they can open.
 */

/** Workspace tabs a position can be given, and the powers each one grants. */
export const FEATURES = [
  { key: "verify", label: "Verification", help: "Call new volunteers to confirm their details, then verify or reject them.", powers: ["verify"] },
  { key: "volunteers", label: "Volunteer directory", help: "Search, filter and open volunteer records in their area.", powers: ["view_volunteers"] },
  { key: "contact", label: "Phone numbers", help: "See volunteers' phone numbers. Off means names and figures only.", powers: [], requires: "volunteers" },
  { key: "field", label: "Field registration", help: "Register volunteers on their behalf, out in the field.", powers: ["field_agent"] },
  { key: "map", label: "Map and coverage", help: "The coverage map, drilled down to their area.", powers: ["view_map"] },
  { key: "activities", label: "Activities and media", help: "Log activities and upload photos and videos.", powers: ["view_media", "log_activity", "upload_media"] },
  { key: "moderate", label: "Review media", help: "Approve or reject photos and videos before they are used.", powers: ["view_media", "moderate_media"] },
  { key: "tasks", label: "Tasks", help: "Set tasks for volunteers and follow their reports.", powers: ["view_media", "assign_tasks"] },
  { key: "messages", label: "Messages", help: "Write SMS and WhatsApp campaigns. The Super Admin approves them before they go.", powers: ["message"] },
  { key: "election", label: "Election day", help: "Assign polling unit agents and follow results and incidents.", powers: ["election", "assign_agents"] },
  { key: "exports", label: "Reports and exports", help: "Ask for volunteer lists. The Super Admin approves each download.", powers: ["request_export"] },
];

/** Overview dashboard widgets a position can be shown. */
export const WIDGETS = [
  { key: "kpis", label: "Headline figures", help: "Volunteers, verified, PVC ready and polling unit coverage." },
  { key: "signups", label: "Sign-ups chart", help: "Sign-ups over 7, 30 or 90 days, with the verification breakdown." },
  { key: "todo", label: "To do", help: "What is waiting on them, most urgent first." },
  { key: "weekdays", label: "Busiest sign-up days", help: "Sign-ups by day of the week." },
  { key: "gauge", label: "Verification rate", help: "Share of volunteers verified, and the backlog." },
  { key: "table", label: "By area table", help: "Every area below theirs, largest first." },
  { key: "readiness", label: "Election-day readiness", help: "PU agents against those needed." },
  { key: "channels", label: "Registration channels", help: "Website, WhatsApp, USSD and field agents." },
  { key: "roles", label: "Role coverage", help: "Volunteers willing to take each role." },
  { key: "map", label: "Coverage map", help: "Volunteers by state or LGA. Shown for state and zone areas." },
  { key: "demographics", label: "Gender and age", help: "Who has volunteered." },
];

const ALL_WIDGETS = WIDGETS.map((w) => w.key);

/** The positions, the area each one covers, and what each opens by default. */
export const POSITIONS = [
  {
    key: "ward_coordinator", label: "Ward coordinator", area: "ward",
    summary: "Runs one ward: verifies its volunteers, sets tasks and lines up polling unit agents.",
    features: ["verify", "volunteers", "contact", "activities", "moderate", "tasks", "election"],
    widgets: ALL_WIDGETS,
  },
  {
    key: "lga_coordinator", label: "LGA coordinator", area: "lga",
    summary: "Oversees the wards of one LGA and can message its volunteers.",
    features: ["verify", "volunteers", "contact", "activities", "moderate", "tasks", "messages", "election"],
    widgets: ALL_WIDGETS,
  },
  {
    key: "state_coordinator", label: "State coordinator", area: "state",
    summary: "Oversees a whole state, with the map and export requests.",
    features: ["verify", "volunteers", "contact", "map", "activities", "moderate", "tasks", "messages", "election", "exports"],
    widgets: ALL_WIDGETS,
  },
  {
    key: "zonal_coordinator", label: "Zonal coordinator", area: "zone",
    summary: "Oversees the states of one geopolitical zone.",
    features: ["verify", "volunteers", "contact", "map", "moderate", "tasks", "messages", "election", "exports"],
    widgets: ALL_WIDGETS,
  },
  {
    key: "directorate_head", label: "Directorate head", area: "directorate",
    summary: "Follows one directorate's figures nationwide, without contact details.",
    features: ["volunteers", "activities", "messages"],
    widgets: ["kpis", "signups", "weekdays", "gauge", "channels", "roles", "demographics"],
  },
  {
    key: "field_agent", label: "Field agent", area: "lga",
    summary: "Registers volunteers in person and sees only the people they registered.",
    features: ["field"],
    widgets: ["kpis", "signups", "weekdays"],
  },
];

export const POSITION_KEYS = POSITIONS.map((p) => p.key);
export const positionOf = (key) => POSITIONS.find((p) => p.key === key) ?? null;

/** The stored overrides merged over the defaults: { [position]: { features, widgets } }. */
export function resolveAccess(stored = {}) {
  const featureKeys = new Set(FEATURES.map((f) => f.key));
  const widgetKeys = new Set(ALL_WIDGETS);
  return Object.fromEntries(POSITIONS.map((p) => {
    const s = stored?.[p.key];
    const features = (Array.isArray(s?.features) ? s.features : p.features).filter((k) => featureKeys.has(k));
    const widgets = (Array.isArray(s?.widgets) ? s.widgets : p.widgets).filter((k) => widgetKeys.has(k));
    return [p.key, { features, widgets }];
  }));
}

/** Powers one position grants with the given features. Without "contact", volunteers are shown without phone numbers. */
export function positionPowers(features) {
  const set = new Set(["workspace"]);
  for (const k of features) for (const p of FEATURES.find((f) => f.key === k)?.powers ?? []) set.add(p);
  if (features.includes("volunteers") && !features.includes("contact")) set.add("summary_only");
  return [...set];
}

export { ALL_WIDGETS };
