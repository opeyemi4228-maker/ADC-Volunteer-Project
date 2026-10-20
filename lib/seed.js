import sharp from "sharp";

import { one, run, tx, setSetting } from "./db.js";
import { seal, blind, uuid, hashPassword } from "./crypto.js";
import { stateTree, wardUnits } from "./geo.js";
import { createGroup, createVolunteer, flagDuplicate } from "./registration.js";
import { storePhotoBuffer } from "./storage.js";

/**
 * Synthetic demonstration data. Every name, number and record here is made
 * up. It mirrors the test cases the spec asks for (§11): near-duplicate
 * groups and volunteers, unverified phones from field registration and
 * volunteers with no polling unit.
 *
 * All demo coordinator accounts share the password in DEMO_PASSWORD.
 */

export const DEMO_PASSWORD = "Adc2027!demo";

let seedRand = 20260926;
function rand() {
  seedRand = (seedRand * 1664525 + 1013904223) % 4294967296;
  return seedRand / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));

const FIRST = {
  north: ["Abubakar", "Aisha", "Hauwa", "Ibrahim", "Maryam", "Sani", "Zainab", "Umar", "Fatima", "Musa", "Hadiza", "Ƙasimu", "Ɗahiru", "Bilkisu", "Yakubu", "Halima", "Nasiru", "Rukayya", "Aminu", "Safiya"],
  west: ["Adébáyọ̀", "Olúwaṣeun", "Tèmítọ́pẹ́", "Bọ́lá", "Kẹ́hìndé", "Adéọlá", "Fúnmiláyọ̀", "Oyèwálé", "Ṣadé", "Ìbùkún", "Tunde", "Yetunde", "Segun", "Folake", "Damilola", "Kunle"],
  east: ["Chukwuemeka", "Ngozi", "Chiamaka", "Ifeọma", "Obinna", "Ụchenna", "Nkechi", "Ebuka", "Adaeze", "Chidi", "Amaka", "Ikenna", "Chinedu", "Ọbịageli"],
  south: ["Ebiere", "Tamuno", "Preye", "Ibinabo", "Ekaete", "Iniobong", "Efosa", "Osaro", "Ọghenekaro", "Tari", "Imaobong", "Ese", "Boma"],
};
const SURNAME = {
  north: ["Bello", "Abdullahi", "Musa", "Yusuf", "Garba", "Danjuma", "Ƙabir", "Suleiman", "Lawal", "Aliyu", "Umar", "Shehu", "Ɓala", "Idris"],
  west: ["Adeyemi", "Ọlábísí", "Ogunleye", "Adébáyọ̀", "Balogun", "Ṣóyinká", "Akinwale", "Oyèlàràn", "Fasanya", "Ọládipọ̀"],
  east: ["Okafor", "Nwosu", "Eze", "Obi", "Okonkwo", "Nwachukwu", "Ụgwu", "Anyanwu", "Chukwu", "Ọkọrọ"],
  south: ["Briggs", "Akpan", "Ekpo", "Tonye", "Etim", "Osagie", "Omoregie", "Ọkpara", "Diri", "Ikiriko"],
};
const REGION = { NW: "north", NE: "north", NC: "north", SW: "west", SE: "east", SS: "south" };

function isoDaysAgo(days, hour = int(7, 20)) {
  const d = new Date(Date.now() - days * 86400000);
  d.setUTCHours(hour, int(0, 59), int(0, 59));
  return d.toISOString().replace("T", " ").slice(0, 19);
}

/** Registrations grow over time: more recent days are more likely. */
function growthDaysAgo(maxDays = 120) {
  return Math.floor(maxDays * (1 - Math.sqrt(rand())));
}

let phoneSeq = 0;
function fakePhone() {
  phoneSeq += 1;
  const prefix = pick(["803", "806", "813", "816", "703", "706", "810", "814", "903", "906", "805", "807", "815", "905", "802", "808", "812", "701", "902", "901"]);
  return `+234${prefix}${String(4100000 + phoneSeq * 37).padStart(7, "0").slice(-7)}`;
}

function randomWard(stateCode, lgaCode) {
  const tree = stateTree(stateCode);
  const lga = lgaCode ? tree.lgas.find((l) => l.code === lgaCode) : pick(tree.lgas);
  const ward = pick(lga.wards);
  return { state: stateCode, lga: lga.code, ward: ward.code };
}

function makeUser(name, phone, roles) {
  const id = uuid();
  run("INSERT INTO users (id, name, phone_enc, phone_hash, password_hash) VALUES (:id, :n, :pe, :ph, :pw)", {
    id, n: name, pe: seal(phone), ph: blind(phone), pw: hashPassword(DEMO_PASSWORD),
  });
  for (const [role, area_type, area_code] of roles) {
    run("INSERT INTO role_assignments (id, user_id, role, area_type, area_code) VALUES (:id, :u, :r, :t, :c)", { id: uuid(), u: id, r: role, t: area_type, c: area_code });
  }
  return id;
}

const GROUP_SPECS = [
  // name, category, level, state, lga, size, formed
  ["Kubwa Youth Vanguard", "youth", "ward", "FCT", "FCT-002", "201-500", "2025-03", { ward: "FCT-002-09", platform: true }],
  ["Bwari Market Women Forum", "women", "lga", "FCT", "FCT-002", "501-1000", "2024-11", { platform: true }],
  ["Kubwa Youths Vanguard", "youth", "ward", "FCT", "FCT-002", "51-200", "2026-06", { ward: "FCT-002-09", duplicate: true }],
  ["AMAC Professionals Network", "professionals", "lga", "FCT", "FCT-006", "51-200", "2025-08", { platform: true }],
  ["Gwagwalada Keke Riders for ADC", "transport", "lga", "FCT", "FCT-003", "201-500", "2025-05", {}],
  ["FCT Students Coalition", "students", "state", "FCT", "FCT-006", "1001-5000", "2024-09", { platform: true }],
  ["Kano Youths for Change", "youth", "state", "KAN", null, "1001-5000", "2024-06", { platform: true }],
  ["Kano Youth for Change", "youth", "lga", "KAN", null, "51-200", "2026-07", { duplicate: true }],
  ["Fagge Traders Union Support Group", "artisans_traders", "lga", "KAN", null, "501-1000", "2025-01", {}],
  ["Nassarawa Women Arise", "women", "ward", "KAN", null, "51-200", "2025-10", {}],
  ["Dala Farmers Cooperative Network", "farmers", "lga", "KAN", null, "201-500", "2025-04", {}],
  ["Kano Persons with Disabilities Forum", "pwd", "state", "KAN", null, "201-500", "2025-02", { platform: true }],
  ["Ikeja Tech Professionals for ADC", "professionals", "lga", "LAG", null, "201-500", "2025-06", { platform: true }],
  ["Surulere Market Women Movement", "women", "ward", "LAG", null, "501-1000", "2024-12", {}],
  ["Lagos Danfo Drivers Solidarity", "transport", "state", "LAG", null, "1001-5000", "2025-03", { platform: true }],
  ["Alimosho Youth Mobilisers", "youth", "lga", "LAG", null, "201-500", "2025-09", { platform: true }],
  ["UNILAG Students for Good Governance", "students", "ward", "LAG", null, "51-200", "2026-01", { platform: true }],
  ["Obio/Akpor Youth Assembly", "youth", "lga", "RIV", null, "501-1000", "2025-02", { platform: true }],
  ["Port Harcourt Fishermen Alliance", "farmers", "lga", "RIV", null, "201-500", "2025-07", {}],
  ["Rivers Women for Progress", "women", "state", "RIV", null, "1001-5000", "2024-10", { platform: true }],
  ["Kaduna North Artisans Guild", "artisans_traders", "lga", "KAD", null, "201-500", "2025-05", {}],
  ["Zaria Students Network", "students", "lga", "KAD", null, "501-1000", "2025-01", { platform: true }],
  ["Ibadan Okada Riders Support Group", "transport", "lga", "OYO", null, "501-1000", "2025-04", {}],
  ["Ogbomoso Farmers for Change", "farmers", "lga", "OYO", null, "51-200", "2026-02", {}],
  ["Enugu Diaspora Friends of ADC", "diaspora", "state", "ENU", null, "51-200", "2025-06", { platform: true }],
  ["Nsukka Community Development Circle", "community", "ward", "ENU", null, "51-200", "2025-11", {}],
  ["Aba Traders Vanguard", "artisans_traders", "lga", "ABI", null, "1001-5000", "2024-08", { platform: true }],
  ["Owerri Young Professionals", "professionals", "lga", "IMO", null, "51-200", "2025-12", { platform: true }],
  ["Benin City Women in Business", "women", "lga", "EDO", null, "201-500", "2025-03", {}],
  ["Jos Plateau Unity Group", "community", "state", "PLA", null, "501-1000", "2025-01", {}],
  ["Makurdi Farmers Alliance", "farmers", "lga", "BEN", null, "201-500", "2025-07", {}],
  ["Sokoto Youth Development Forum", "youth", "state", "SOK", null, "501-1000", "2025-02", {}],
  ["Maiduguri Peace Ambassadors", "community", "lga", "BOR", null, "201-500", "2025-05", {}],
  ["Yola Women Empowerment Network", "women", "lga", "ADA", null, "51-200", "2025-09", {}],
  ["Ilorin Emirate Youth Council", "youth", "lga", "KWA", null, "201-500", "2025-06", { platform: true }],
  ["Abeokuta Artisans Collective", "artisans_traders", "lga", "OGU", null, "51-200", "2025-10", {}],
  ["Uyo Professionals Forum", "professionals", "lga", "AKW", null, "51-200", "2026-03", { platform: true }],
  ["Awka Students Alliance", "students", "lga", "ANA", null, "201-500", "2025-08", { platform: true }],
  ["Katsina Farmers Network", "farmers", "state", "KAT", null, "1001-5000", "2024-11", {}],
  ["Minna Transport Workers Group", "transport", "lga", "NIG", null, "51-200", "2026-04", {}],
];

const EVENTS = ["Ward town hall", "Door-to-door outreach", "Monthly meeting", "Youth rally", "Market walk", "PVC awareness drive", "Community clean-up", "Women's forum", "Training for PU agents"];

async function eventImage(title, i) {
  const hues = [["#0a7338", "#12a650"], ["#085a2c", "#f47321"], ["#063f20", "#2fb163"], ["#a94c0c", "#f9a56f"], ["#0b8a41", "#9fdcb5"]];
  const [a, b] = hues[i % hues.length];
  const people = Array.from({ length: 14 }, (_, k) => {
    const x = 60 + k * 85 + (k % 3) * 9;
    const y = 520 + (k % 2) * 40;
    return `<circle cx="${x}" cy="${y - 70}" r="26" fill="#fff" fill-opacity="0.85"/><rect x="${x - 34}" y="${y - 40}" width="68" height="140" rx="30" fill="#fff" fill-opacity="0.7"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <rect width="1280" height="800" fill="url(#g)"/>
    <circle cx="1080" cy="150" r="120" fill="#fff" fill-opacity="0.12"/>
    ${people}
    <rect x="0" y="690" width="1280" height="110" fill="#000" fill-opacity="0.35"/>
    <text x="48" y="760" font-family="Helvetica, Arial, sans-serif" font-size="46" font-weight="700" fill="#fff">${title}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

export async function seedDemo({ log = console.log } = {}) {
  if (one("SELECT 1 AS x FROM users LIMIT 1")) return false;
  log("Seeding demonstration data…");

  /* Coordinators at every level. */
  const users = {
    admin: makeUser("Amina Bello", "+2348000000001", [["national_admin", "national", "NG"]]),
    zonal: makeUser("Emeka Okafor", "+2348000000002", [["zonal_coordinator", "zone", "NC"]]),
    fct: makeUser("Halima Yusuf", "+2348000000003", [["state_coordinator", "state", "FCT"]]),
    bwari: makeUser("Tunde Adeyemi", "+2348000000004", [["lga_coordinator", "lga", "FCT-002"]]),
    kubwa: makeUser("Grace Nwosu", "+2348000000005", [["ward_coordinator", "ward", "FCT-002-09"]]),
    youth: makeUser("Ibrahim Musa", "+2348000000006", [["directorate_head", "directorate", "youth"]]),
    dpo: makeUser("Ngozi Eze", "+2348000000007", [["dpo", "national", "NG"]]),
    agent: makeUser("Yakubu Danjuma", "+2348000000008", [["field_agent", "lga", "FCT-002"]]),
    kano: makeUser("Sani Abdullahi", "+2348000000009", [["state_coordinator", "state", "KAN"]]),
  };

  /* Groups. */
  const groups = [];
  for (const [i, [name, category, level, state, lgaCode, size, formed, extra]] of GROUP_SPECS.entries()) {
    const loc = randomWard(state, lgaCode);
    if (extra.ward) loc.ward = extra.ward;
    const tree = stateTree(state);
    const lga = tree.lgas.find((l) => l.code === loc.lga);
    const areas = level === "state" ? tree.lgas.slice(0, int(3, 8)).map((l) => l.code) : level === "lga" ? lga.wards.slice(0, int(2, 6)).map((w) => w.code) : [];
    const region = REGION[tree.zone];
    const coordPhone = i === 0 ? "+2348031234567" : fakePhone();
    const d = {
      about: { name, category, operating_level: level, date_formed: formed, size, description: `${name} brings people together in ${lga.name} to organise, register voters and support ADC candidates.`, cac_status: pick(["registered", "in_progress", "not_registered", ""]) },
      location: { state, lga: loc.lga, ward: level === "ward" || level === "lga" ? loc.ward : "", areas, address: chance(0.6) ? `Near ${pick(["the central mosque", "the market square", "St. Paul's church", "the town hall", "the motor park"])}, ${lga.name}` : "" },
      leaders: [
        { position: "coordinator", first_name: pick(FIRST[region]), surname: pick(SURNAME[region]), phone: coordPhone, gender: pick(["male", "female"]) },
        { position: "secretary", first_name: pick(FIRST[region]), surname: pick(SURNAME[region]), phone: fakePhone(), gender: pick(["male", "female"]) },
        { position: pick(["financial_secretary", "women_leader", "youth_leader", "publicity_secretary"]), first_name: pick(FIRST[region]), surname: pick(SURNAME[region]), phone: chance(0.5) ? fakePhone() : "" },
      ],
      online: extra.platform
        ? {
            has_platform: "yes",
            platforms: [{ types: [pick(["whatsapp_group", "whatsapp_community", "telegram", "facebook"])], name: `${name} ${pick(["Online", "Hub", "Family"])}`, audience: pick(["100-500", "501-1000", "1001-5000", "5001-20000"]), frequency: pick(["daily", "several_weekly", "weekly"]) }],
            social: { facebook: chance(0.7) ? name.replace(/[^A-Za-z]/g, "") : "", x: chance(0.5) ? `@${name.replace(/[^A-Za-z]/g, "").slice(0, 14)}` : "" },
          }
        : { has_platform: chance(0.5) ? "no" : "" },
      consent: { accurate: true, data: true, messaging: chance(0.8) },
    };
    if (i === 0) d.leaders[0] = { position: "coordinator", first_name: "Abdulrahman", surname: "Ọlabisi", phone: coordPhone, gender: "male", email: "kyv.coordinator@example.com" };
    const g = createGroup(d, { registrantPhone: coordPhone, channel: "web" });
    const created = isoDaysAgo(extra.duplicate ? int(1, 6) : i === 0 ? 150 : int(20, 160));
    let status = extra.duplicate ? "pending" : chance(0.72) ? "verified" : chance(0.6) ? "pending" : "info_requested";
    if (i === 0) status = "verified";
    run("UPDATE support_groups SET created_at = :c, updated_at = :c, status = :s, verified_by = :vb, verified_at = :va, verification_method = :vm WHERE id = :id", {
      id: g.id, c: created, s: status, vb: status === "verified" ? users.fct : null, va: status === "verified" ? created : null, vm: status === "verified" ? pick(["phone_call", "in_person", "known"]) : null,
    });
    if (i === 0) {
      run("UPDATE support_groups SET public_id = 'ADC-SG-37-0412', join_code = 'KBW412' WHERE id = :id", { id: g.id });
      run("UPDATE counters SET value = 412 WHERE name = 'group:FCT'");
      g.publicId = "ADC-SG-37-0412";
      g.joinCode = "KBW412";
    }
    groups.push({ ...g, state, lga: loc.lga, ward: loc.ward, level, status, name });
  }
  const kubwa = groups[0];
  // The Kubwa Youth Vanguard coordinator gets a group-coordinator login.
  users.kyv = makeUser("Abdulrahman Ọlabisi", "+2348031234567", [["group_coordinator", "group", kubwa.id]]);
  run("UPDATE users SET email_enc = :e, email_hash = :h WHERE id = :id", { e: seal("kubwayouth@example.com"), h: blind("kubwayouth@example.com"), id: users.kyv });
  // A duplicate the automatic check misses (different LGA) is still worth one manual flag.
  flagDuplicate("group", groups[7].id, groups[6].id, `Similar name to ${groups[6].name} (${groups[6].publicId}) in the same state`);

  /* Volunteers: weighted towards the states with groups. */
  const weights = { FCT: 26, KAN: 18, LAG: 16, RIV: 9, KAD: 8, OYO: 6, ENU: 3, ABI: 3, PLA: 2, SOK: 2, KAT: 2, BEN: 2, EDO: 2, KWA: 1, OGU: 1, IMO: 1, AKW: 1, ANA: 1, BOR: 1, ADA: 1, NIG: 1 };
  const pool = Object.entries(weights).flatMap(([s, w]) => Array(w).fill(s));
  const roleKeys = ["pu_agent", "ward_collation", "mobiliser", "canvasser", "social_media", "logistics", "events", "legal", "medical", "data_it", "security_liaison", "fundraising"];
  const roleWeights = [30, 8, 26, 22, 14, 6, 10, 2, 3, 5, 2, 3];
  const weightedRole = () => {
    let r = rand() * roleWeights.reduce((a, b) => a + b, 0);
    for (let k = 0; k < roleKeys.length; k += 1) if ((r -= roleWeights[k]) < 0) return roleKeys[k];
    return "mobiliser";
  };

  const volunteerIds = [];
  const TOTAL = 1400;
  tx(() => {
    for (let i = 0; i < TOTAL; i += 1) {
      const state = i < 160 ? "FCT" : pick(pool);
      const inState = groups.filter((g) => g.state === state && g.status !== "rejected");
      const group = i < 110 ? kubwa : inState.length && chance(0.7) ? pick(inState) : null;
      const loc = i < 110 ? randomWard("FCT", "FCT-002") : group && chance(0.6) ? randomWard(state, group.lga) : randomWard(state);
      if (i < 70) loc.ward = "FCT-002-09";
      const units = wardUnits(loc.ward);
      const region = REGION[stateTree(state).zone];
      const hasPu = units.length && chance(0.72);
      const age = int(18, 64);
      const dob = new Date(Date.now() - (age * 365.25 + int(1, 360)) * 86400000).toISOString().slice(0, 10);
      const roles = new Set([weightedRole()]);
      if (chance(0.55)) roles.add(weightedRole());
      if (chance(0.2)) roles.add(weightedRole());
      const channel = pick(["web", "web", "web", "web", "whatsapp", "ussd", "field_agent", "field_agent"]);
      const langs = new Set(["english"]);
      langs.add({ north: "hausa", west: "yoruba", east: "igbo", south: "pidgin" }[region]);
      if (chance(0.4)) langs.add("pidgin");
      const phone = fakePhone();
      const d = {
        about: { first_name: pick(FIRST[region]), surname: pick(SURNAME[region]), gender: pick(["male", "male", "female", "female", "undisclosed"]), dob, occupation: pick(["Trader", "Student", "Teacher", "Artisan", "Civil servant", "Farmer", "Driver", "Self-employed", "Health worker", "Tech / IT", ""]) },
        vote: { ...loc, pu: hasPu ? pick(units).code : "", pu_unknown: !hasPu, pvc: chance(0.74) ? "yes" : chance(0.7) ? "not_collected" : "not_registered", pvc_reminder: chance(0.5) },
        help: { group_code: group?.joinCode ?? "", roles: [...roles], languages: [...langs], availability: pick(["anytime", "weekends", "evenings", "weekdays", "election_day"]), smartphone: chance(0.78) ? "yes" : "no", channel: pick(["whatsapp", "whatsapp", "sms", "call"]) },
        consent: { accurate: true, data: true, messaging: chance(0.85) },
      };
      const agent = channel === "field_agent" && state === "FCT" ? users.agent : null;
      const v = createVolunteer(d, { phone, channel, agentId: agent, phoneVerified: channel !== "field_agent" || chance(0.8) });
      if (v.error) continue;
      const created = isoDaysAgo(i < 20 ? int(0, 3) : growthDaysAgo(120));
      const status = i < 25 ? "pending" : chance(0.7) ? "verified" : chance(0.85) ? "pending" : "rejected";
      run(
        `UPDATE volunteers SET created_at = :c, updated_at = :c, status = :s, verified_at = :va, verified_by = :vb, verification_method = :vm,
         group_status = CASE WHEN group_id IS NULL THEN NULL WHEN :s = 'verified' THEN 'approved' ELSE group_status END,
         status_reason = :reason WHERE id = :id`,
        {
          id: v.id, c: created, s: status, va: status === "verified" ? created : null, vb: status === "verified" ? users.kubwa : null,
          vm: status === "verified" ? pick(["phone_call", "in_person", "known"]) : null, reason: status === "rejected" ? "Could not reach on the number given" : null,
        },
      );
      volunteerIds.push({ id: v.id, state, ...loc, pu: d.vote.pu, roles: [...roles], status, smartphone: d.help.smartphone === "yes" });
    }
  });

  /* §11 test cases: near-duplicate volunteers in the same ward with the same date of birth. */
  const dupBase = { vote: { state: "FCT", lga: "FCT-002", ward: "FCT-002-09", pu: "", pu_unknown: true, pvc: "yes" }, help: { group_code: "KBW412", roles: ["mobiliser"], languages: ["english", "igbo"], availability: "weekends", smartphone: "yes", channel: "whatsapp" }, consent: { accurate: true, data: true } };
  createVolunteer({ ...dupBase, about: { first_name: "Chukwuemeka", surname: "Obi", gender: "male", dob: "1992-04-17" } }, { phone: "+2348091110001" });
  createVolunteer({ ...dupBase, about: { first_name: "Chukwuemeka", surname: "Obih", gender: "male", dob: "1992-04-17" } }, { phone: "+2348091110002" });
  createVolunteer({ ...dupBase, about: { first_name: "Fatima", surname: "Abdullahi", gender: "female", dob: "1998-09-03" } }, { phone: "+2348091110003" });
  createVolunteer({ ...dupBase, about: { first_name: "Fatimah", surname: "Abdullahi", gender: "female", dob: "1998-09-03" } }, { phone: "+2348091110004", channel: "field_agent", agentId: users.agent, phoneVerified: false });
  // The group coordinator is also a volunteer.
  createVolunteer({ ...dupBase, about: { first_name: "Abdulrahman", surname: "Ọlabisi", gender: "male", dob: "1990-02-11" }, vote: { ...dupBase.vote, pu: wardUnits("FCT-002-09")[4].code, pu_unknown: false }, help: { ...dupBase.help, roles: ["pu_agent", "mobiliser"] } }, { phone: "+2348031234567" });
  run("UPDATE volunteers SET status = 'verified', verified_at = created_at, group_status = 'approved' WHERE phone_hash = :h", { h: blind("+2348031234567") });

  /* Media: generated event pictures, some approved, some awaiting review. */
  const mediaGroups = groups.filter((g) => g.status === "verified").slice(0, 14);
  let m = 0;
  for (const g of [kubwa, kubwa, kubwa, ...mediaGroups]) {
    const title = EVENTS[m % EVENTS.length];
    const keys = await storePhotoBuffer(await eventImage(title, m));
    const status = m < 3 ? "approved" : chance(0.55) ? "approved" : chance(0.15) ? "publicity" : "pending";
    run(
      `INSERT INTO media_items (id, owner_type, owner_id, group_id, uploaded_by, uploader_name, kind, storage_key, medium_key, thumbnail_key, mime,
        event_name, event_date, state_code, lga_code, ward_code, caption, attendance, people_consent_confirmed, file_hash, phash, moderation_status, created_at)
       VALUES (:id, 'group', :g, :g, 'seed', 'Group coordinator', 'photo', :sk, :mk, :tk, :mime, :ev, :date, :s, :l, :w, :cap, :att, 1, :fh, :ph, :st, :c)`,
      {
        id: uuid(), g: g.id, ...Object.fromEntries(Object.entries({ sk: keys.storage_key, mk: keys.medium_key, tk: keys.thumbnail_key, mime: keys.mime, fh: keys.file_hash, ph: keys.phash })),
        ev: title, date: isoDaysAgo(int(2, 60)).slice(0, 10), s: g.state, l: g.lga, w: g.ward, cap: `${title} organised by ${g.name}.`, att: int(20, 400), st: status, c: isoDaysAgo(int(0, 30)),
      },
    );
    m += 1;
  }
  run("INSERT INTO media_items (id, owner_type, owner_id, group_id, uploaded_by, uploader_name, kind, external_url, event_name, event_date, state_code, lga_code, ward_code, caption, people_consent_confirmed, moderation_status) VALUES (:id, 'group', :g, :g, 'seed', 'Group coordinator', 'link', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Kubwa ward rally highlights', :d, 'FCT', 'FCT-002', 'FCT-002-09', 'Video highlights from our ward rally.', 1, 'approved')", { id: uuid(), g: kubwa.id, d: isoDaysAgo(12).slice(0, 10) });

  /* Activities. */
  const concernsPool = ["cost_of_living", "insecurity", "jobs", "electricity", "roads", "fuel", "education", "healthcare", "water"];
  for (let i = 0; i < 90; i += 1) {
    const g = i < 12 ? kubwa : pick(groups.filter((x) => x.status === "verified"));
    const type = pick(["meeting", "town_hall", "door_to_door", "door_to_door", "rally", "outreach", "online", "training"]);
    const concerns = [...new Set([pick(concernsPool), pick(concernsPool), pick(concernsPool)])].slice(0, int(1, 3));
    const incident = chance(0.08) ? pick(["disruption", "venue_denied", "harassment"]) : "none";
    run(
      `INSERT INTO activities (id, public_id, group_id, type, title, date, state_code, lga_code, ward_code, description, attendance, households_reached, new_signups, concerns, incident_type, incident_details, reporter_name, created_at)
       VALUES (:id, :pid, :g, :type, :title, :date, :s, :l, :w, :desc, :att, :hh, :ns, :con, :inc, :incd, 'Group coordinator', :c)`,
      {
        id: uuid(), pid: `ADC-ACT-${String(i + 1).padStart(6, "0")}`, g: g.id, type, title: pick(EVENTS), date: isoDaysAgo(int(0, 75)).slice(0, 10),
        s: g.state, l: g.lga, w: g.ward, desc: "Members met residents, answered questions about the party's plans and signed up new volunteers.",
        att: int(15, 350), hh: type === "door_to_door" ? int(40, 320) : null, ns: int(0, 25), con: JSON.stringify(concerns),
        inc: incident, incd: incident !== "none" ? "Some youths disrupted the meeting for about 20 minutes before it continued peacefully." : null, c: isoDaysAgo(int(0, 60)),
      },
    );
  }

  /* Tasks. */
  const tasks = [
    ["Door-to-door on Saturday", "All Kubwa groups: visit homes on your street and talk about PVC collection.", 6, 300, "households", "ward", "FCT-002-09"],
    ["Confirm polling unit for every volunteer", "Call volunteers without a polling unit and help them find it on their PVC.", 10, 120, "volunteers", "lga", "FCT-002"],
    ["Bwari LGA town hall", "Mobilise members for the LGA town hall at the council secretariat.", 14, 800, "attendees", "lga", "FCT-002"],
    ["Recruit two PU agents per unit", "Identify a primary and backup agent for every polling unit in the ward.", 21, 80, "agents", "ward", "FCT-002-09"],
    ["Kano PVC awareness week", "Run PVC collection awareness in every LGA.", 9, 2000, "people reached", "state", "KAN"],
  ];
  for (const [title, desc, dueIn, target, unit, areaType, areaCode] of tasks) {
    const id = uuid();
    run("INSERT INTO tasks (id, title, description, due_date, target_value, target_unit, area_type, area_code, created_by, creator_name, created_at) VALUES (:id, :t, :d, :due, :tv, :u, :at, :ac, :cb, :cn, :c)", {
      id, t: title, d: desc, due: new Date(Date.now() + dueIn * 86400000).toISOString().slice(0, 10), tv: target, u: unit, at: areaType, ac: areaCode,
      cb: areaType === "ward" ? users.kubwa : areaType === "lga" ? users.bwari : users.kano, cn: areaType === "ward" ? "Grace Nwosu" : areaType === "lga" ? "Tunde Adeyemi" : "Sani Abdullahi", c: isoDaysAgo(int(1, 6)),
    });
    const targetGroups = groups.filter((g) => (areaType === "ward" ? g.ward === areaCode : areaType === "lga" ? g.lga === areaCode : g.state === areaCode) && g.status === "verified");
    for (const g of targetGroups) run("INSERT INTO task_assignments (id, task_id, assignee_type, assignee_id) VALUES (:id, :t, 'group', :g)", { id: uuid(), t: id, g: g.id });
    if (title.startsWith("Door-to-door")) {
      run("INSERT INTO task_reports (id, task_id, achieved_value, notes, reporter_name, created_at) VALUES (:id, :t, 184, 'Covered Phase 4 and Byazhin. Many people have not collected PVCs.', 'Abdulrahman Ọlabisi', :c)", { id: uuid(), t: id, c: isoDaysAgo(1) });
    }
  }

  /* Message history. */
  run(
    `INSERT INTO messages (id, channel, body, audience, audience_label, recipient_count, estimated_cost, status, created_by, creator_name, sent_at, created_at)
     VALUES (:id, 'sms', 'Reminder: collect your PVC at your INEC LGA office before the deadline. Your vote needs it.', '{"area":"FCT-002","pvc":"not_collected"}', 'Bwari LGA · PVC not collected', 64, 256, 'sent', :u, 'Tunde Adeyemi', :c, :c)`,
    { id: uuid(), u: users.bwari, c: isoDaysAgo(9) },
  );

  /* An export waiting for the national admin. */
  run("INSERT INTO exports (id, kind, filters, reason, requested_by, requester_name) VALUES (:id, 'volunteers', '{\"area\":\"KAN\"}', 'Printing PU agent lists for training on Saturday', :u, 'Sani Abdullahi')", { id: uuid(), u: users.kano });

  /* Election day: planned now, switched on later. Some agents already rostered in Kubwa. */
  setSetting("election_day_enabled", false);
  setSetting("election_name", "2027 Presidential and National Assembly elections");
  const kubwaAgents = volunteerIds.filter((v) => v.ward === "FCT-002-09" && v.roles.includes("pu_agent") && v.pu && v.status === "verified");
  const used = new Set();
  for (const v of kubwaAgents) {
    const backup = used.has(`${v.pu}:0`) ? 1 : 0;
    if (used.has(`${v.pu}:${backup}`)) continue;
    used.add(`${v.pu}:${backup}`);
    run("INSERT INTO pu_agents (pu_code, volunteer_id, is_backup, accreditation_status, assigned_by) VALUES (:pu, :v, :b, :a, :by)", {
      pu: v.pu, v: v.id, b: backup, a: pick(["not_started", "submitted", "accredited"]), by: users.kubwa,
    });
  }

  run("INSERT INTO audit_log (actor, actor_name, action, details) VALUES (NULL, 'System', 'seed', :d)", { d: JSON.stringify({ groups: groups.length, volunteers: volunteerIds.length }) });
  log(`Seeded ${groups.length} groups, ${volunteerIds.length + 5} volunteers, ${Object.keys(users).length} coordinator accounts.`);
  return true;
}

export function demoAccounts() {
  return [
    ["National admin", "0800 000 0001", "Amina Bello"],
    ["Zonal coordinator (North Central)", "0800 000 0002", "Emeka Okafor"],
    ["State coordinator (FCT)", "0800 000 0003", "Halima Yusuf"],
    ["LGA coordinator (Bwari)", "0800 000 0004", "Tunde Adeyemi"],
    ["Ward coordinator (Kubwa)", "0800 000 0005", "Grace Nwosu"],
    ["Directorate head (Youth)", "0800 000 0006", "Ibrahim Musa"],
    ["Data protection officer", "0800 000 0007", "Ngozi Eze"],
    ["Field agent (Bwari)", "0800 000 0008", "Yakubu Danjuma"],
    ["State coordinator (Kano)", "0800 000 0009", "Sani Abdullahi"],
    ["Support group account (Kubwa Youth Vanguard)", "kubwayouth@example.com", "Abdulrahman Ọlabisi"],
  ];
}

