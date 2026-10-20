import { one, run, nowIso } from "./db.js";
import { blind } from "./crypto.js";
import { stateList, stateTree, lgaOf } from "./geo.js";
import { isValidName, properCase } from "./validate.js";
import { VOLUNTEER_ROLES } from "./options.js";
import { createVolunteer, groupByCode, volunteerByPhone, validateVolunteer } from "./registration.js";
import { send } from "./notify.js";

/**
 * Conversational registration for feature phones (USSD) and WhatsApp
 * (spec §7). One engine, two renderers: USSD screens must fit 160 characters
 * and a session dies after ~180 seconds, so progress is saved after every
 * answer and a redial offers to continue where the person stopped.
 *
 * The phone number comes from the network (USSD) or the WhatsApp account, so
 * no OTP is needed. Everything ends in the same createVolunteer() the website
 * uses, with the same validation and duplicate checks.
 */

export const SCREEN = 160;

const T = {
  en: {
    welcome: "Welcome to ADC Volunteer Registration",
    menu: ["Join as volunteer", "Join a group (with code)", "Check my status", "Language / Harshe / Ede / Asụsụ"],
    resume: "You started registering earlier.",
    resumeOpts: ["Continue where I stopped", "Start again"],
    first: "Enter your first name",
    surname: "Enter your surname",
    gender: "Gender",
    genders: ["Male", "Female", "Prefer not to say"],
    yob: "Enter your year of birth (e.g. 1990)",
    birthday: "Have you had your birthday this year?",
    yesNo: ["Yes", "No"],
    state: "State where you vote",
    lga: "LGA where you vote",
    ward: "Ward where you vote",
    pvc: "Do you have your PVC?",
    pvcs: ["Yes", "Registered, not collected", "Not registered"],
    role: "Main way you can help",
    code: "Enter your group code, or 0 to skip",
    consent: "ADC will store your details to coordinate the campaign. Privacy: adc.example/privacy",
    consentOpts: ["I agree", "I do not agree"],
    updates: "Receive campaign updates by SMS?",
    more: "More",
    back: "Back",
    invalid: "Sorry, that's not valid. Try again.",
    badName: "Use letters only, at least 2.",
    tooYoung: "You must be 18 or older to register as a volunteer.",
    badYear: "Enter a 4-digit year, e.g. 1990.",
    noCode: "Group code not found. Check it or enter 0 to skip.",
    declined: "You did not agree, so nothing was saved. Dial again any time.",
    done: "Thank you {name}. Volunteer ID {id}. Status: pending. We will SMS you.",
    already: "You're registered. ID {id}. Status: {status}.",
    notRegistered: "This number is not registered yet. Dial again and choose 1.",
    joined: "You have joined {group}. The group will confirm you.",
    enterCode: "Enter the group code (e.g. KBW412)",
    lang: "Choose language",
  },
  ha: {
    welcome: "Barka da zuwa rajistar masu sa kai na ADC",
    menu: ["Shiga a matsayin mai sa kai", "Shiga kungiya (da lamba)", "Duba matsayina", "Language / Harshe / Ede / Asụsụ"],
    first: "Rubuta sunanka na farko",
    surname: "Rubuta sunan mahaifi",
    gender: "Jinsi",
    genders: ["Namiji", "Mace", "Ban so in fada ba"],
    yob: "Rubuta shekarar haihuwarka (misali 1990)",
    state: "Jihar da kake zabe",
    lga: "Karamar hukumar da kake zabe",
    ward: "Mazabar da kake zabe",
    pvc: "Kana da katin zabe (PVC)?",
    pvcs: ["Eh", "An yi rajista, ban karba ba", "Ban yi rajista ba"],
    consentOpts: ["Na yarda", "Ban yarda ba"],
    yesNo: ["Eh", "A'a"],
    more: "Kari",
    back: "Baya",
    done: "Mun gode {name}. ID {id}. Ana jiran tabbatarwa. Za mu turo SMS.",
  },
  yo: {
    welcome: "Ẹ kaabọ si iforukọsilẹ oluyọọda ADC",
    menu: ["Darapọ bi oluyọọda", "Darapọ mọ ẹgbẹ (pẹlu koodu)", "Ṣayẹwo ipo mi", "Language / Harshe / Ede / Asụsụ"],
    first: "Kọ orukọ akọkọ rẹ",
    surname: "Kọ orukọ idile rẹ",
    yob: "Kọ ọdun ibi rẹ (fun apẹẹrẹ 1990)",
    state: "Ipinlẹ ti o ti n dibo",
    more: "Siwaju",
    back: "Pada",
    yesNo: ["Bẹẹni", "Rara"],
    done: "A dupẹ {name}. ID {id}. A n duro de ifọwọsi. A o fi SMS ranṣẹ.",
  },
  ig: {
    welcome: "Nnọọ na ndebanye aha ndị ọrụ afọ ofufo ADC",
    menu: ["Soro dịka onye ọrụ afọ ofufo", "Banye n'otu (jiri koodu)", "Lelee ọnọdụ m", "Language / Harshe / Ede / Asụsụ"],
    first: "Dee aha mbụ gị",
    surname: "Dee aha nna gị",
    yob: "Dee afọ a mụrụ gị (dịka 1990)",
    state: "Steeti ebe ị na-atụ vootu",
    more: "Ọzọ",
    back: "Azụ",
    yesNo: ["Ee", "Mba"],
    done: "Daalụ {name}. ID {id}. Na-eche nkwado. Anyị ga-ezitere gị SMS.",
  },
  pcm: {
    welcome: "Welcome to ADC Volunteer Registration",
    menu: ["Join as volunteer", "Join group (with code)", "Check my status", "Language / Harshe / Ede / Asụsụ"],
    first: "Put your first name",
    surname: "Put your surname",
    yob: "Put the year wey dem born you (e.g. 1990)",
    state: "State wey you dey vote",
    done: "Thank you {name}. Volunteer ID {id}. Dem never verify am. We go SMS you.",
  },
};

const LANGS = [["en", "English"], ["ha", "Hausa"], ["yo", "Yoruba"], ["ig", "Igbo"], ["pcm", "Pidgin"]];

function tr(lang, key, vars) {
  let s = T[lang]?.[key] ?? T.en[key];
  if (typeof s === "string" && vars) s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  return s;
}

/* ── Rendering ─────────────────────────────────────────────────────────── */

function numbered(title, options) {
  return [title, ...options.map((o, i) => `${i + 1}. ${o}`)].join("\n");
}

/** Pages a long list (states, LGAs, wards) into screens of at most 160 chars. */
export function pageOf(title, items, page, lang, limit = SCREEN) {
  const pages = [];
  let current = [];
  for (const item of items) {
    const trial = [...current, item];
    const text = numbered(title, trial.map((x) => x.label)) + `\n0. ${tr(lang, "more")}\n00. ${tr(lang, "back")}`;
    if ((text.length > limit || trial.length > 9) && current.length) {
      pages.push(current);
      current = [item];
    } else current = trial;
  }
  if (current.length) pages.push(current);
  const p = Math.max(0, Math.min(page, pages.length - 1));
  const shown = pages[p] ?? [];
  const footer = [p < pages.length - 1 && `0. ${tr(lang, "more")}`, p > 0 && `00. ${tr(lang, "back")}`].filter(Boolean);
  return { text: [numbered(title, shown.map((x) => x.label)), ...footer].join("\n"), shown, pages: pages.length, page: p };
}

/* ── Engine ────────────────────────────────────────────────────────────── */

const LISTS = {
  state: () => stateList.map((s) => ({ value: s.code, label: s.name })),
  lga: (d) => (stateTree(d.state)?.lgas ?? []).map((l) => ({ value: l.code, label: l.name })),
  ward: (d) => (lgaOf(d.lga)?.wards ?? []).map((w) => ({ value: w.code, label: w.name })),
  role: () => VOLUNTEER_ROLES.map((r) => ({ value: r.value, label: r.label })),
};
const NEXT = { state: "lga", lga: "ward", ward: "pvc", role: "code" };

function prompt(s, error = "") {
  const lang = s.lang;
  const pre = error ? `${error}\n` : "";
  switch (s.step) {
    case "menu": return { text: `${tr(lang, "welcome")}\n${numbered("", tr(lang, "menu")).trim()}` };
    case "resume": return { text: numbered(tr(lang, "resume"), tr(lang, "resumeOpts")) };
    case "lang": return { text: numbered(tr(lang, "lang"), LANGS.map((l) => l[1])) };
    case "first": return { text: pre + tr(lang, "first") };
    case "surname": return { text: pre + tr(lang, "surname") };
    case "gender": return { text: pre + numbered(tr(lang, "gender"), tr(lang, "genders")) };
    case "yob": return { text: pre + tr(lang, "yob") };
    case "birthday": return { text: numbered(tr(lang, "birthday"), tr(lang, "yesNo")) };
    case "state": case "lga": case "ward": case "role": {
      const p = pageOf(tr(lang, s.step), LISTS[s.step](s.data), s.page ?? 0, lang, SCREEN - pre.length);
      return { text: pre + p.text };
    }
    case "pvc": return { text: pre + numbered(tr(lang, "pvc"), tr(lang, "pvcs")) };
    case "code": return { text: pre + tr(lang, "code") };
    case "joincode": return { text: pre + tr(lang, "enterCode") };
    case "consent": return { text: numbered(tr(lang, "consent"), tr(lang, "consentOpts")) };
    case "updates": return { text: numbered(tr(lang, "updates"), tr(lang, "yesNo")) };
    default: return { text: tr(lang, "welcome") };
  }
}

/**
 * One step of the conversation. `state` is what was saved last time (or
 * null); `input` is what the person just typed. Returns the new state and the
 * screen to show; `end: true` closes the session.
 */
export function step(state, input, { phone, channel }) {
  const s = state ? { ...state, data: { ...state.data } } : { step: "menu", data: {}, lang: "en", page: 0 };
  const lang = s.lang;
  const v = String(input ?? "").trim();
  const choose = (n) => Number.parseInt(v, 10) === n;
  const again = (msg = tr(lang, "invalid")) => ({ state: s, ...prompt(s, msg) });
  const go = (next) => { s.step = next; s.page = 0; return { state: s, ...prompt(s) }; };

  switch (s.step) {
    case "menu": {
      const existing = volunteerByPhone(phone);
      if (choose(1)) {
        if (existing) return { state: { step: "menu", data: {}, lang }, text: tr(lang, "already", { id: existing.public_id, status: existing.status }), end: true };
        return go("first");
      }
      if (choose(2)) return go("joincode");
      if (choose(3)) {
        return { state: s, text: existing ? tr(lang, "already", { id: existing.public_id, status: existing.status }) : tr(lang, "notRegistered"), end: true };
      }
      if (choose(4)) return go("lang");
      return again();
    }
    case "resume":
      if (choose(1)) { s.step = s.resumeStep; return { state: s, ...prompt(s) }; }
      if (choose(2)) return { state: { step: "menu", data: {}, lang, page: 0 }, ...prompt({ step: "menu", lang }) };
      return again();
    case "lang": {
      const l = LANGS[Number.parseInt(v, 10) - 1];
      if (!l) return again();
      s.lang = l[0];
      return go("menu");
    }
    case "first":
      if (!isValidName(v)) return again(tr(lang, "badName"));
      s.data.first_name = properCase(v);
      return go("surname");
    case "surname":
      if (!isValidName(v)) return again(tr(lang, "badName"));
      s.data.surname = properCase(v);
      return go("gender");
    case "gender": {
      const g = ["male", "female", "undisclosed"][Number.parseInt(v, 10) - 1];
      if (!g) return again();
      s.data.gender = g;
      return go("yob");
    }
    case "yob": {
      const y = Number(v);
      const now = new Date().getFullYear();
      if (!/^\d{4}$/.test(v) || y < now - 110) return again(tr(lang, "badYear"));
      if (y > now - 18) return { state: { step: "menu", data: {}, lang }, text: tr(lang, "tooYoung"), end: true };
      s.data.yob = y;
      if (y === now - 18) return go("birthday");
      return go("state");
    }
    case "birthday":
      if (choose(1)) return go("state");
      if (choose(2)) return { state: { step: "menu", data: {}, lang }, text: tr(lang, "tooYoung"), end: true };
      return again();
    case "state": case "lga": case "ward": case "role": {
      const p = pageOf(tr(lang, s.step), LISTS[s.step](s.data), s.page ?? 0, lang);
      if (v === "0" && p.page < p.pages - 1) { s.page = p.page + 1; return { state: s, ...prompt(s) }; }
      if (v === "00" && p.page > 0) { s.page = p.page - 1; return { state: s, ...prompt(s) }; }
      const picked = p.shown[Number.parseInt(v, 10) - 1];
      if (!picked) return again();
      s.data[s.step] = picked.value;
      if (s.step === "state") { s.data.lga = null; s.data.ward = null; }
      if (s.step === "lga") s.data.ward = null;
      return go(NEXT[s.step]);
    }
    case "pvc": {
      const pvc = ["yes", "not_collected", "not_registered"][Number.parseInt(v, 10) - 1];
      if (!pvc) return again();
      s.data.pvc = pvc;
      return go("role");
    }
    case "code": {
      if (v === "0") { s.data.group_code = ""; return go("consent"); }
      if (!groupByCode(v)) return again(tr(lang, "noCode"));
      s.data.group_code = v.toUpperCase();
      return go("consent");
    }
    case "joincode": {
      const g = groupByCode(v);
      if (!g) return again(tr(lang, "noCode"));
      const existing = volunteerByPhone(phone);
      if (existing) {
        run("UPDATE volunteers SET group_id = :g, group_status = 'pending', updated_at = :now WHERE id = :id", { g: g.id, id: existing.id, now: nowIso() });
        return { state: { step: "menu", data: {}, lang }, text: tr(lang, "joined", { group: g.name.slice(0, 60) }), end: true };
      }
      s.data.group_code = g.join_code;
      return go("first");
    }
    case "consent":
      if (choose(2)) return { state: { step: "menu", data: {}, lang }, text: tr(lang, "declined"), end: true };
      if (!choose(1)) return again();
      return go("updates");
    case "updates": {
      if (!choose(1) && !choose(2)) return again();
      const d = s.data;
      const record = {
        about: { first_name: d.first_name, surname: d.surname, gender: d.gender, dob: `${d.yob}-01-01` },
        vote: { state: d.state, lga: d.lga, ward: d.ward, pu_unknown: true, pvc: d.pvc, pvc_reminder: d.pvc === "not_collected" },
        help: { roles: [d.role], group_code: d.group_code ?? "", channel: channel === "whatsapp" ? "whatsapp" : "sms", smartphone: channel === "whatsapp" ? "yes" : undefined },
        consent: { accurate: true, data: true, messaging: choose(1) },
      };
      const errors = validateVolunteer(record, { channel });
      if (Object.keys(errors).length) return { state: { step: "menu", data: {}, lang }, text: Object.values(errors)[0], end: true };
      const out = createVolunteer(record, { phone, channel });
      if (out.error) return { state: { step: "menu", data: {}, lang }, text: tr(lang, "already", { id: volunteerByPhone(phone)?.public_id ?? "", status: "pending" }), end: true };
      send({ to: phone, template: "volunteer_submitted", lang, vars: { name: out.firstName, id: out.publicId } });
      return { state: { step: "done", data: {}, lang }, text: tr(lang, "done", { name: out.firstName, id: out.publicId }), end: true };
    }
    default:
      return go("menu");
  }
}

/* ── Persistence ───────────────────────────────────────────────────────── */

export function loadConversation(channel, phone) {
  const row = one("SELECT state FROM conversations WHERE channel = :c AND phone_hash = :h", { c: channel, h: blind(phone) });
  return row ? JSON.parse(row.state) : null;
}

export function saveConversation(channel, phone, state) {
  run(
    `INSERT INTO conversations (channel, phone_hash, state, updated_at) VALUES (:c, :h, :s, :now)
     ON CONFLICT(channel, phone_hash) DO UPDATE SET state = :s, updated_at = :now`,
    { c: channel, h: blind(phone), s: JSON.stringify(state), now: nowIso() },
  );
}

/**
 * Starts a new session. If the person dropped out mid-registration (a USSD
 * timeout, a lost signal), they are offered to carry on from the last answer.
 */
export function openSession(channel, phone) {
  const saved = loadConversation(channel, phone);
  const midway = saved && !["menu", "done", "resume", "lang"].includes(saved.step) && saved.data?.first_name;
  const state = midway ? { ...saved, resumeStep: saved.step, step: "resume" } : { step: "menu", data: {}, lang: saved?.lang ?? "en", page: 0 };
  saveConversation(channel, phone, state);
  return { state, ...prompt(state) };
}

export function answer(channel, phone, input) {
  const saved = loadConversation(channel, phone);
  const out = step(saved, input, { phone, channel });
  saveConversation(channel, phone, out.state);
  return out;
}
