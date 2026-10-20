"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Card } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { GENDERS, PVC_STATUS, VOLUNTEER_ROLES, LANGUAGES, AVAILABILITY, CONTACT_CHANNELS } from "@/lib/options";
import { normalizePhone, isValidName, ageOn, isValidIsoDate } from "@/lib/validate";
import QuestionFlow from "@/components/forms/QuestionFlow";
import { api, loadStates, loadLgas, loadUnits } from "@/components/forms/api";

const UNKNOWN = "__unknown";
const clear = (...keys) => (v, d) => ({ ...d, vote: { ...d.vote, ...Object.fromEntries(keys.map((k) => [k, ""])) } });

/**
 * Volunteer registration in 6 short screens (about 2 minutes).
 * The answers are exactly what POST /api/v1/volunteers expects.
 */
function buildScreens() {
  return [
    { id: "help", title: "What would you like to volunteer for?", help: "Tick everything you'd be happy to do.",
      items: [
        { path: "help.roles", kind: "cards", label: "", options: VOLUNTEER_ROLES,
          validate: (v) => (!v?.length ? "Choose at least one thing you'd like to do." : null) },
      ] },
    { id: "you", title: "About you", server: 1,
      items: [
        { path: "about.first_name", kind: "text", label: "First name", autoComplete: "given-name", validate: (v) => (!isValidName(v) ? "Enter your first name using letters only." : null) },
        { path: "about.surname", kind: "text", label: "Surname", autoComplete: "family-name", validate: (v) => (!isValidName(v) ? "Enter your surname using letters only." : null) },
        { path: "about.phone", kind: "tel", label: "Phone number", wide: true, placeholder: "0803 123 4567", autoComplete: "tel-national",
          validate: (v) => (!normalizePhone(v) ? "Enter a Nigerian mobile number, e.g. 0803 123 4567." : null) },
      ] },
    { id: "more", title: (d, t) => t("Thanks, {name}. A little more about you", { name: d.about?.first_name?.trim() || "" }),
      items: [
        { path: "about.gender", kind: "choice", label: "Gender", options: GENDERS },
        { path: "about.dob", kind: "date", label: "Date of birth", hint: "You must be 18 or older.", minAge: 18, years: 90,
          validate: (v) => (!isValidIsoDate(v ?? "") ? "Choose your day, month and year of birth." : ageOn(v) < 18 ? "You must be 18 or older to register as a volunteer." : null) },
        { path: "help.languages", kind: "multi", label: "Languages you speak", options: LANGUAGES, validate: (v) => (!v?.length ? "Choose at least one language." : null) },
      ] },
    { id: "vote", title: "Where do you vote?", help: "It's printed on your voter's card (PVC).",
      items: [
        { path: "vote.state", kind: "select", label: "State", placeholder: "Choose a state", onSet: clear("lga", "ward", "pu"),
          load: async () => (await loadStates()).map((s) => ({ value: s.code, label: s.name })) },
        { path: "vote.lga", kind: "select", label: "LGA", placeholder: "Choose an LGA", waitingText: "Choose a state first", onSet: clear("ward", "pu"), depends: (d) => d.vote?.state,
          load: async (d) => (await loadLgas(d.vote.state)).map((l) => ({ value: l.code, label: l.name })) },
        { path: "vote.ward", kind: "select", label: "Ward", placeholder: "Choose a ward", waitingText: "Choose an LGA first", onSet: clear("pu"), depends: (d) => d.vote?.lga,
          load: async (d) => ((await loadLgas(d.vote.state)).find((l) => l.code === d.vote.lga)?.wards ?? []).map((w) => ({ value: w.code, label: w.name })) },
        { path: "vote.pu", kind: "select", label: "Polling unit", placeholder: "Choose your polling unit", waitingText: "Choose a ward first", depends: (d) => d.vote?.ward,
          load: async (d) => [{ value: UNKNOWN, label: "I don't know my polling unit" }, ...(await loadUnits(d.vote.ward)).map((u) => ({ value: u.code, label: `${u.name} (${u.code.split("-").at(-1)})` }))] },
      ] },
    { id: "reach", title: "Last few questions",
      items: [
        { path: "vote.pvc", kind: "choice", label: "Do you have your PVC?", options: PVC_STATUS, onSet: (v, d) => ({ ...d, vote: { ...d.vote, pvc_reminder: v !== "yes" } }) },
        { path: "help.availability", kind: "choice", label: "When are you usually free?", options: AVAILABILITY },
        { path: "help.channel", kind: "choice", label: "Best way to reach you", options: CONTACT_CHANNELS },
        { path: "help.smartphone", kind: "choice", label: "Do you have a smartphone?", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
        { path: "about.email", kind: "email", label: "Email address", wide: true, placeholder: "name@example.com", when: (d) => d.help?.channel === "email",
          validate: (v) => (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v ?? "").trim()) ? "Enter a valid email address." : null) },
      ] },
    { id: "agree", title: "Nearly done", help: "Please confirm and agree to finish.",
      items: [
        { path: "consent.accurate", kind: "check", label: "The information I have given is accurate.", validate: (v) => (!v ? "Please tick this box to finish." : null) },
        { path: "consent.data", kind: "check", label: (t) => <>{t("I agree to the campaign using this information to organise volunteers, as described in the")} <Link href="/privacy" target="_blank" className="link">{t("privacy notice")}</Link>.</>,
          validate: (v) => (!v ? "Please tick this box to finish." : null) },
        { path: "consent.messaging", kind: "check", label: "Send me campaign updates by SMS or WhatsApp (optional)." },
      ] },
  ];
}

export default function VolunteerForm({ inviteCode = "", role = "" }) {
  const t = useT();
  const [done, setDone] = useState(null);
  const [invite, setInvite] = useState(null);
  const [initial, setInitial] = useState(() => ({
    about: {}, vote: {}, consent: {},
    help: { roles: VOLUNTEER_ROLES.some((r) => r.value === role) ? [role] : [], languages: [], group_code: inviteCode },
  }));

  // An invite link (/join/KBW412) quietly links the volunteer to that group and pre-fills where it is.
  useEffect(() => {
    if (!inviteCode) return;
    api(`/groups/join?code=${encodeURIComponent(inviteCode)}`).then((r) => {
      if (!r.ok) return;
      setInvite(r.data.group);
      setInitial((d) => ({ ...d, vote: { state: r.data.group.state ?? "", lga: r.data.group.lga ?? "", ward: r.data.group.ward ?? "" } }));
    });
  }, [inviteCode]);

  const screens = useMemo(() => buildScreens(), []);

  async function submit(d) {
    const body = { ...d, vote: { ...d.vote, pu: d.vote.pu === UNKNOWN ? "" : d.vote.pu, pu_unknown: !d.vote.pu || d.vote.pu === UNKNOWN } };
    const r = await api("/volunteers", { method: "POST", body });
    if (r.ok) {
      setDone(r.data);
      window.scrollTo({ top: 0 });
      return { ok: true };
    }
    return { ok: false, errors: r.data.errors, error: r.error };
  }

  if (done) return <Success done={done} />;
  return <QuestionFlow key={invite ? "invite" : "plain"} flow="volunteer" screens={screens} initial={initial} onSubmit={submit} submitLabel={t("Join as a volunteer")} />;
}

function Success({ done }) {
  const t = useT();
  return (
    <Card className="p-6 text-center sm:p-10">
      <CheckCircle2 aria-hidden className="mx-auto size-14 text-brand-500" />
      <h2 className="mt-4 h-page">{t("Welcome, {name}", { name: done.firstName })}</h2>
      <p className="mt-2 text-ink-muted">{t("Your registration is pending verification. We've sent your volunteer ID by SMS.")}</p>
      <div className="mx-auto mt-8 max-w-sm rounded-xl bg-surface-alt p-4 text-left">
        <p className="text-[13px] font-semibold text-ink-muted">{t("Volunteer ID")}</p>
        <p className="font-mono text-lg font-bold">{done.publicId}</p>
        {done.group && <p className="mt-2 text-[14px]">{t("Group")}: {done.group.name}</p>}
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/status" className="btn btn-secondary">{t("Check my registration")}</Link>
        <Link href="/" className="btn btn-ghost">{t("Back to home")}</Link>
      </div>
    </Card>
  );
}
