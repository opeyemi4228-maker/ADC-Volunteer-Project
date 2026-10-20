/**
 * Message templates (spec §12) in the five launch languages. SMS templates
 * stay within 160 characters once filled; `fill` truncates long group names so
 * that holds. Hausa, Yoruba, Igbo and Pidgin wording are first drafts and must
 * be reviewed by native speakers before launch.
 */

const T = {
  otp: {
    en: "Your ADC registration code is {code}. It expires in 10 minutes. Do not share it with anyone.",
    ha: "Lambar rajistar ADC dinka ita ce {code}. Za ta kare cikin minti 10. Kada ka bai wa kowa.",
    yo: "Koodu iforukọsilẹ ADC rẹ ni {code}. Yoo pari ni iṣẹju 10. Ma ṣe fi han ẹnikẹni.",
    ig: "Koodu ndebanye aha ADC gị bụ {code}. Ọ ga-agwụ n'ime nkeji 10. Egosila onye ọ bụla.",
    pcm: "Your ADC registration code na {code}. E go expire for 10 minutes. No show anybody.",
  },
  group_submitted: {
    en: "Thank you. {group} is registered. ID: {id}. Your ward coordinator will contact you within 7 days.",
    ha: "Mun gode. An yi wa {group} rajista. ID: {id}. Jagoran mazaba zai tuntube ka cikin kwana 7.",
    yo: "A dupẹ. A ti forukọsilẹ {group}. ID: {id}. Olori wọọdu yoo kan si ọ laarin ọjọ 7.",
    ig: "Daalụ. Edebanyela {group} aha. ID: {id}. Onye nhazi wọọdụ ga-akpọ gị n'ime ụbọchị 7.",
    pcm: "Thank you. {group} don register. ID: {id}. Your ward coordinator go contact you inside 7 days.",
  },
  group_verified: {
    en: "{group} is now verified. Invite members with code {code} or this link: {link}",
    ha: "An tabbatar da {group}. Gayyaci mambobi da lamba {code} ko wannan mahada: {link}",
    yo: "A ti fọwọsi {group}. Pe awọn ọmọ ẹgbẹ pẹlu koodu {code} tabi ọna asopọ yii: {link}",
    ig: "Akwadola {group}. Kpọọ ndị otu jiri koodu {code} ma ọ bụ njikọ a: {link}",
    pcm: "{group} don verify. Invite members with code {code} or this link: {link}",
  },
  volunteer_submitted: {
    en: "Welcome, {name}. Your volunteer ID is {id}. Status: pending verification.",
    ha: "Barka da zuwa, {name}. ID dinka na mai sa kai shine {id}. Matsayi: ana jiran tabbatarwa.",
    yo: "Ẹ kaabọ, {name}. ID oluyọọda rẹ ni {id}. Ipo: n duro de ifọwọsi.",
    ig: "Nnọọ, {name}. ID onye ọrụ afọ ofufo gị bụ {id}. Ọnọdụ: na-eche nkwado.",
    pcm: "Welcome, {name}. Your volunteer ID na {id}. Status: dem never verify am.",
  },
  volunteer_verified: {
    en: "You're verified as a volunteer with {group}. Watch for your first task soon.",
    ha: "An tabbatar da kai a matsayin mai sa kai tare da {group}. Jira aikinka na farko.",
    yo: "A ti fọwọsi ọ gẹgẹbi oluyọọda pẹlu {group}. Duro de iṣẹ akọkọ rẹ.",
    ig: "Akwadola gị dịka onye ọrụ afọ ofufo na {group}. Chere ọrụ mbụ gị.",
    pcm: "You don verify as volunteer with {group}. Your first task dey come soon.",
  },
  more_info: {
    en: "We need a little more information about your registration. Please sign in: {link}",
    ha: "Muna bukatar karin bayani game da rajistarka. Da fatan za ka shiga: {link}",
    yo: "A nilo alaye diẹ sii nipa iforukọsilẹ rẹ. Jọwọ wọle: {link}",
    ig: "Anyị chọrọ ozi ọzọ gbasara ndebanye aha gị. Biko banye: {link}",
    pcm: "We need small more info about your registration. Abeg sign in: {link}",
  },
  pvc_reminder: {
    en: "Reminder: collect your PVC at your INEC LGA office before the deadline. Your vote needs it.",
    ha: "Tunatarwa: karbi katin zabe (PVC) a ofishin INEC na karamar hukumarka kafin wa'adi.",
    yo: "Iranti: gba PVC rẹ ni ọfiisi INEC ijọba ibilẹ rẹ ṣaaju ọjọ ipari. Ibo rẹ nilo rẹ.",
    ig: "Ncheta: nara PVC gị n'ọfịs INEC LGA gị tupu oge agwụ. Votu gị chọrọ ya.",
    pcm: "Reminder: go collect your PVC for INEC LGA office before deadline. Your vote need am.",
  },
  media_rejected: {
    en: "One of your uploads wasn't approved: {reason}. You can upload a different one.",
    ha: "Ba a amince da daya daga cikin abubuwan da ka dora ba: {reason}. Kana iya dora wani.",
    yo: "Ọkan ninu awọn ohun ti o gbe soke ko ni ifọwọsi: {reason}. O le gbe omiiran soke.",
    ig: "Ekwadoghị otu n'ime ihe i bugoro: {reason}. Ị nwere ike bulite nke ọzọ.",
    pcm: "Dem no approve one of your uploads: {reason}. You fit upload another one.",
  },
  rejected: {
    en: "Your ADC registration ({id}) was not approved: {reason}. Reply or sign in for help.",
    ha: "Ba a amince da rajistarka ta ADC ({id}) ba: {reason}.",
    yo: "Iforukọsilẹ ADC rẹ ({id}) ko ni ifọwọsi: {reason}.",
    ig: "Ekwadoghị ndebanye aha ADC gị ({id}): {reason}.",
    pcm: "Dem no approve your ADC registration ({id}): {reason}.",
  },
  task_assigned: {
    en: "New task from ADC: {task}. Due {due}. Sign in to see details: {link}",
    ha: "Sabon aiki daga ADC: {task}. Kafin {due}. Shiga don ganin bayani: {link}",
    yo: "Iṣẹ tuntun lati ADC: {task}. Ọjọ ipari {due}. Wọle: {link}",
    ig: "Ọrụ ọhụrụ sitere na ADC: {task}. Ụbọchị {due}. Banye: {link}",
    pcm: "New task from ADC: {task}. Due {due}. Sign in make you see am: {link}",
  },
};

export function fill(template, lang = "en", vars = {}) {
  const text = T[template]?.[lang] ?? T[template]?.en ?? "";
  let out = text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
  if (out.length > 160 && vars.group) {
    const room = Math.max(12, String(vars.group).length - (out.length - 160) - 1);
    out = text.replace(/\{(\w+)\}/g, (_, k) => (k === "group" ? `${String(vars.group).slice(0, room)}…` : String(vars[k] ?? "")));
  }
  return out;
}

export const TEMPLATE_KEYS = Object.keys(T);
export const TEMPLATES = T;
