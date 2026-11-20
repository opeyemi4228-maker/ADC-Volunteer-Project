"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Card } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { GENDERS, PVC_STATUS, VOLUNTEER_ROLES, LANGUAGES, AVAILABILITY, CONTACT_CHANNELS, MAX_ROLES } from "@/lib/options";
import { normalizePhone, isValidName, ageOn, isValidIsoDate } from "@/lib/validate";
import QuestionFlow from "@/components/forms/QuestionFlow";
import BankAccounts from "@/components/forms/BankAccounts";
import PhotoUpload from "@/components/forms/PhotoUpload";
import { bankAccountProblems } from "@/lib/banks";
import { api, loadStates, loadLgas, loadUnits } from "@/components/forms/api";
import { preloadCaptcha } from "@/components/forms/captcha";
import { SIGN_IN_OPEN } from "@/lib/features";

const UNKNOWN = "__unknown";
const clear = (...keys) => (v, d) => ({ ...d, vote: { ...d.vote, ...Object.fromEntries(keys.map((k) => [k, ""])) } });

/**
 * Volunteer registration in 8 short screens (about 3 minutes).
 * The answers are exactly what POST /api/v1/volunteers expects.
 * `photo` is shared with the photo screen: whether an upload is still running.
 */
function buildScreens(photo) {
  return [
    { id: "help", title: "What would you like to volunteer for? (Choose up to 3)",
      help: "Each person can volunteer for a maximum of THREE (3) things. Pick the three you'd be happiest to do. Once you've chosen three, untick one to change your choice.",
      notice: "You can only select up to 3 volunteer roles.",
      items: [
        { path: "help.roles", kind: "cards", label: "", options: VOLUNTEER_ROLES, max: MAX_ROLES,
          validate: (v) => (!v?.length ? "Choose at least one thing you'd like to do." : v.length > MAX_ROLES ? "You can only choose up to 3 things. Untick one to continue." : null) },
      ] },
    { id: "you", title: "About you", server: 1,
      items: [
        { path: "about.first_name", kind: "text", label: "First name", autoComplete: "given-name", validate: (v) => (!isValidName(v) ? "Enter your first name using letters only." : null) },
        { path: "about.surname", kind: "text", label: "Surname", autoComplete: "family-name", validate: (v) => (!isValidName(v) ? "Enter your surname using letters only." : null) },
        { path: "about.phone", kind: "tel", label: "Phone number", wide: true, placeholder: "0803 123 4567", autoComplete: "tel-national",
          hint: "Enter it carefully. You'll sign in with a code sent to this number, so it must be correct.",
          validate: (v) => (!normalizePhone(v) ? "Enter a Nigerian mobile number, e.g. 0803 123 4567." : null) },
      ] },
    { id: "more", title: (d, t) => t("Thanks, {name}. A little more about you", { name: d.about?.first_name?.trim() || "" }),
      items: [
        { path: "about.gender", kind: "choice", label: "Gender", options: GENDERS },
        { path: "about.dob", kind: "date", label: "Date of birth", hint: "You must be 18 or older.", minAge: 18, years: 90,
          validate: (v) => (!isValidIsoDate(v ?? "") ? "Choose your day, month and year of birth." : ageOn(v) < 18 ? "You must be 18 or older to register as a volunteer." : null) },
        { path: "help.languages", kind: "multi", label: "Languages you speak", options: LANGUAGES, validate: (v) => (!v?.length ? "Choose at least one language." : null) },
      ] },
    { id: "photo", title: "Add your photo",
      help: "A clear photo of your face is needed to finish registering. It goes on your volunteer ID card, so coordinators can recognise you.",
      items: [
        { path: "about.photo_upload_id", kind: "custom",
          render: ({ data, set, t }, error) => (
            <PhotoUpload
              value={data.about?.photo_upload_id ?? ""}
              onChange={(id) => set("about.photo_upload_id", id)}
              onBusy={(b) => { photo.current.busy = b; }}
              onPreview={(url) => { photo.current.preview = url; }}
              invalid={Boolean(error)}
              t={t}
            />
          ),
          validate: (v) => (photo.current.busy ? "Wait for your photo to finish uploading." : !v ? "Add a photo of yourself to continue." : null) },
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
        { path: "about.email", kind: "email", label: "Email address", wide: true, placeholder: "name@example.com", optional: true,
          hint: "We'll email you when you're verified. You can also sign in with it.",
          validate: (v, d) => (String(v ?? "").trim() === "" ? (d.help?.channel === "email" ? "Enter your email address, or choose another way to reach you." : null)
            : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()) ? "Enter a valid email address." : null) },
      ] },
    { id: "bank", title: "Your bank account",
      help: "Where the campaign will send any payment due to you as a volunteer. Add one account in your own name.",
      items: [
        { path: "bank.accounts", kind: "custom",
          render: ({ data, set, t }, error) => (
            <BankAccounts
              value={data.bank?.accounts}
              onChange={(v) => set("bank.accounts", v)}
              t={t}
              showErrors={Boolean(error)}
              ownerName={[data.about?.first_name, data.about?.surname].filter(Boolean).join(" ")}
            />
          ),
          validate: (v) => (Object.keys(bankAccountProblems(v)).length ? "Check the bank details marked above." : null) },
      ] },
    { id: "agree", title: "Confirm and join",
      help: "There's no password. To sign in later, enter the phone number you gave on this form and we'll text you a one-time code. Make sure that number is correct.",
      items: [
        { path: "consent.accurate", kind: "check", label: "The information I have given is accurate.", validate: (v) => (!v ? "Please tick this box to finish." : null) },
        { path: "consent.data", kind: "check", label: (t) => <>{t("I agree to the campaign using this information to organise volunteers, as described in the")} <Link href="/privacy" target="_blank" className="link">{t("privacy notice")}</Link>.</>,
          validate: (v) => (!v ? "Please tick this box to finish." : null) },
        { path: "consent.messaging", kind: "check", label: "Send me campaign updates by SMS or WhatsApp (optional)." },
      ] },
  ];
}

export default function VolunteerForm({ role = "" }) {
  const t = useT();
  const [done, setDone] = useState(null);
  useEffect(preloadCaptcha, []);
  const [initial] = useState(() => ({
    about: {}, vote: {}, consent: {}, bank: { accounts: [{}] },
    help: { roles: VOLUNTEER_ROLES.some((r) => r.value === role) ? [role] : [], languages: [] },
  }));


  const photo = useRef({ busy: false, preview: null });
  const screens = useMemo(() => buildScreens(photo), []);

  async function submit(d) {
    const body = { ...d, vote: { ...d.vote, pu: d.vote.pu === UNKNOWN ? "" : d.vote.pu, pu_unknown: !d.vote.pu || d.vote.pu === UNKNOWN } };
    const r = await api("/volunteers", { method: "POST", body, captcha: "register" });
    if (r.ok) {
      setDone(r.data);
      window.scrollTo({ top: 0 });
      return { ok: true };
    }
    return { ok: false, errors: r.data.errors, error: r.error };
  }

  if (done) return <Success done={done} photo={photo.current.preview} />;
  return <QuestionFlow flow="volunteer" screens={screens} initial={initial} onSubmit={submit} submitLabel={t("Join as a volunteer")} />;
}

function Success({ done, photo }) {
  const t = useT();
  return (
    <Card className="p-6 text-center sm:p-10">
      {photo ? (
        <div className="relative mx-auto w-fit">
          <img src={photo} alt="" className="aspect-[4/5] w-28 rounded-2xl object-cover shadow-[0_12px_28px_-14px_rgb(10_115_56/0.55)] ring-1 ring-line" />
          <CheckCircle2 aria-hidden className="absolute -bottom-2 -right-2 size-9 rounded-full bg-white text-brand-500" />
        </div>
      ) : <CheckCircle2 aria-hidden className="mx-auto size-14 text-brand-500" />}
      <h2 className="mt-4 h-page">{t("Welcome, {name}", { name: done.firstName })}</h2>
      <p className="mt-2 text-ink-muted">{t("Your registration is pending verification. We've sent your volunteer ID by SMS.")}</p>
      {SIGN_IN_OPEN && <p className="mt-1 text-ink-muted">{t("Sign in any time with the phone number you registered with. We'll text you a one-time code to sign in. Your certificate appears there once you're verified.")}</p>}
      <div className="mx-auto mt-8 max-w-sm rounded-xl bg-surface-alt p-4 text-left">
        <p className="text-[13px] font-semibold text-ink-muted">{t("Volunteer ID")}</p>
        <p className="font-mono text-lg font-bold">{done.publicId}</p>
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {SIGN_IN_OPEN && <Link href="/login" className="btn btn-primary">{t("Go to my volunteer dashboard")}</Link>}
        <Link href="/status" className={SIGN_IN_OPEN ? "btn btn-secondary" : "btn btn-primary"}>{t("Check my registration")}</Link>
        <Link href="/" className="btn btn-ghost">{t("Back to home")}</Link>
      </div>
    </Card>
  );
}
