/**
 * Every fixed list the forms offer. The stored value is the key; the label is
 * what people read (and what translations override as `opt.<list>.<value>`).
 * Changing a key changes stored data, so add new keys rather than rename.
 */

const list = (pairs) => pairs.map(([value, label, hint]) => ({ value, label, hint }));

export const GROUP_CATEGORIES = list([
  ["youth", "Youth"],
  ["women", "Women"],
  ["students", "Students"],
  ["artisans_traders", "Artisans & traders"],
  ["transport", "Transport"],
  ["professionals", "Professionals"],
  ["farmers", "Farmers"],
  ["pwd", "Persons with disabilities"],
  ["diaspora", "Diaspora"],
  ["community", "Community-based"],
  ["other", "Other"],
]);

export const OPERATING_LEVELS = list([
  ["ward", "Ward"],
  ["lga", "LGA"],
  ["state", "State"],
  ["zonal", "Zonal"],
  ["national", "National"],
]);

export const CAC_STATUS = list([
  ["registered", "Registered"],
  ["in_progress", "In progress"],
  ["not_registered", "Not registered"],
]);

export const GROUP_SIZE = list([
  ["1-50", "1–50"],
  ["51-200", "51–200"],
  ["201-500", "201–500"],
  ["501-1000", "501–1,000"],
  ["1001-5000", "1,001–5,000"],
  ["5000+", "Above 5,000"],
]);

/** Lower bound and midpoint of each size range, for the dashboard comparison. */
export const GROUP_SIZE_MID = { "1-50": 25, "51-200": 125, "201-500": 350, "501-1000": 750, "1001-5000": 3000, "5000+": 7500 };

export const LEADER_POSITIONS = list([
  ["coordinator", "Coordinator"],
  ["secretary", "Secretary"],
  ["financial_secretary", "Financial secretary"],
  ["publicity_secretary", "Publicity secretary"],
  ["women_leader", "Women leader"],
  ["youth_leader", "Youth leader"],
  ["other", "Other"],
]);

export const GENDERS = list([
  ["male", "Male"],
  ["female", "Female"],
  ["undisclosed", "Prefer not to say"],
]);

export const PLATFORM_TYPES = list([
  ["whatsapp_group", "WhatsApp group"],
  ["whatsapp_community", "WhatsApp community"],
  ["whatsapp_channel", "WhatsApp channel"],
  ["telegram", "Telegram group or channel"],
  ["facebook", "Facebook group or page"],
  ["x", "X (Twitter) community or Spaces"],
  ["tiktok", "TikTok"],
  ["instagram", "Instagram"],
  ["youtube", "YouTube"],
  ["own_app", "Own app or website"],
  ["sms_list", "SMS broadcast list"],
  ["other", "Other"],
]);

export const AUDIENCE_RANGES = list([
  ["0-100", "Under 100"],
  ["100-500", "100–500"],
  ["501-1000", "501–1,000"],
  ["1001-5000", "1,001–5,000"],
  ["5001-20000", "5,001–20,000"],
  ["20000+", "Above 20,000"],
]);

export const AUDIENCE_MID = { "0-100": 50, "100-500": 300, "501-1000": 750, "1001-5000": 3000, "5001-20000": 12500, "20000+": 30000 };

export const ACTIVITY_FREQUENCY = list([
  ["daily", "Daily"],
  ["several_weekly", "Several times a week"],
  ["weekly", "Weekly"],
  ["occasionally", "Occasionally"],
]);

export const VOLUNTEER_ROLES = list([
  ["pu_agent", "Polling unit agent", "Represent the party at your polling unit on election day."],
  ["ward_collation", "Ward collation agent", "Witness and record results at the ward collation centre."],
  ["mobiliser", "Mobiliser", "Bring people out to meetings, rallies and to vote."],
  ["canvasser", "Door-to-door canvasser", "Visit homes in your area to talk with voters."],
  ["social_media", "Social media and content", "Create and share campaign content online."],
  ["logistics", "Driver or logistics", "Move people and materials where they are needed."],
  ["events", "Event support", "Help set up and run meetings and rallies."],
  ["legal", "Legal (election monitoring)", "Lawyers and paralegals who monitor the process."],
  ["medical", "Medical and first aid", "Provide first aid at events and on election day."],
  ["data_it", "Data and IT", "Help with data entry, reporting and tech support."],
  ["security_liaison", "Security liaison", "Work with security agencies to keep events safe."],
  ["fundraising", "Fundraising", "Help raise funds within the law."],
]);

export const LANGUAGES = list([
  ["english", "English"],
  ["hausa", "Hausa"],
  ["yoruba", "Yoruba"],
  ["igbo", "Igbo"],
  ["pidgin", "Pidgin"],
  ["fulfulde", "Fulfulde"],
  ["kanuri", "Kanuri"],
  ["tiv", "Tiv"],
  ["ijaw", "Ijaw"],
  ["ibibio", "Ibibio"],
  ["edo", "Edo"],
  ["nupe", "Nupe"],
  ["other", "Other"],
]);

export const AVAILABILITY = list([
  ["anytime", "Anytime"],
  ["weekdays", "Weekdays"],
  ["weekends", "Weekends"],
  ["evenings", "Evenings"],
  ["election_day", "Election day only"],
]);

export const CONTACT_CHANNELS = list([
  ["whatsapp", "WhatsApp"],
  ["sms", "SMS"],
  ["call", "Phone call"],
  ["email", "Email"],
]);

export const PVC_STATUS = list([
  ["yes", "Yes"],
  ["not_collected", "Registered but not collected yet"],
  ["not_registered", "Not registered"],
]);

export const OCCUPATIONS = [
  "Artisan", "Banker", "Business owner", "Civil servant", "Clergy", "Driver", "Engineer",
  "Farmer", "Health worker", "Lawyer", "Media / journalist", "Okada / keke rider", "Retired",
  "Self-employed", "Student", "Teacher", "Tech / IT", "Trader", "Unemployed",
];

export const ACTIVITY_TYPES = list([
  ["meeting", "Meeting"],
  ["town_hall", "Town hall"],
  ["door_to_door", "Door-to-door"],
  ["rally", "Rally"],
  ["outreach", "Community outreach"],
  ["online", "Online campaign"],
  ["training", "Training"],
  ["other", "Other"],
]);

export const VOTER_CONCERNS = list([
  ["cost_of_living", "Cost of living"],
  ["insecurity", "Insecurity"],
  ["jobs", "Jobs"],
  ["electricity", "Electricity"],
  ["roads", "Roads"],
  ["fuel", "Fuel"],
  ["education", "Education"],
  ["healthcare", "Healthcare"],
  ["water", "Water"],
  ["other", "Other"],
]);

export const INCIDENT_TYPES = list([
  ["none", "None"],
  ["disruption", "Disruption"],
  ["venue_denied", "Venue denied"],
  ["harassment", "Harassment"],
  ["violence", "Violence"],
]);

export const ELECTION_INCIDENTS = list([
  ["late_materials", "Late or missing materials"],
  ["bvas_failure", "BVAS failure"],
  ["vote_buying", "Vote buying"],
  ["intimidation", "Intimidation of voters or agents"],
  ["violence", "Violence"],
  ["ballot_snatching", "Ballot snatching"],
  ["agent_denied", "Agent denied access"],
  ["other", "Other"],
]);

export const SEVERITY = list([
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
  ["critical", "Critical"],
]);

export const DIRECTORATES = list([
  ["youth", "Youth"],
  ["women", "Women"],
  ["mobilisation", "Mobilisation"],
  ["students", "Students"],
  ["professionals", "Professionals"],
  ["diaspora", "Diaspora"],
  ["pwd", "Persons with disabilities"],
  ["artisans", "Artisans and traders"],
  ["transport", "Transport"],
  ["farmers", "Farmers"],
]);

/** Which directorate a new group lands in, by category. */
export const CATEGORY_DIRECTORATE = {
  youth: "youth", women: "women", students: "students", artisans_traders: "artisans",
  transport: "transport", professionals: "professionals", farmers: "farmers",
  pwd: "pwd", diaspora: "diaspora", community: "mobilisation", other: "mobilisation",
};

export const PARTIES = ["ADC", "APC", "PDP", "LP", "NNPP", "APGA", "SDP", "YPP", "ADP", "Others"];

export const ROLE_LABELS = {
  group_coordinator: "Group coordinator",
  ward_coordinator: "Ward coordinator",
  lga_coordinator: "LGA coordinator",
  state_coordinator: "State coordinator",
  zonal_coordinator: "Zonal coordinator",
  directorate_head: "Directorate head",
  national_admin: "National admin",
  dpo: "Data protection officer",
  field_agent: "Field agent",
};

export function labelOf(options, value) {
  return options.find((o) => o.value === value)?.label ?? value ?? "";
}
