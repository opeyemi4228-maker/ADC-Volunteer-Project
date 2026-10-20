"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, LayoutDashboard } from "lucide-react";

import { Alert, Card } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { GROUP_CATEGORIES, OPERATING_LEVELS, GROUP_SIZE } from "@/lib/options";
import { normalizePhone, normalizeEmail, isValidName, passwordProblem } from "@/lib/validate";
import QuestionFlow from "@/components/forms/QuestionFlow";
import { api, loadStates, loadLgas } from "@/components/forms/api";

const clear = (...keys) => (v, d) => ({ ...d, location: { ...d.location, ...Object.fromEntries(keys.map((k) => [k, k === "areas" ? [] : ""])) } });
const nameCheck = (who) => (v) => (!isValidName(v) ? `Enter ${who} using letters only.` : null);
const phoneCheck = (v) => (!normalizePhone(v) ? "Enter a Nigerian mobile number, e.g. 0803 123 4567." : null);

/**
 * Support group registration in 6 short screens (about 3 minutes).
 * The logo, description and membership list are added later from the dashboard.
 */
function buildScreens() {
  const needWard = (d) => ["ward", "lga"].includes(d.about?.operating_level);
  const covers = (d) => ["lga", "state", "zonal"].includes(d.about?.operating_level);
  return [
    { id: "group", title: "About your support group",
      items: [
        { path: "about.name", kind: "text", label: "Group name", wide: true, maxLength: 100,
          validate: (v) => ((v ?? "").trim().length < 3 ? "Enter the group name (3 to 100 characters)." : null) },
        { path: "about.category", kind: "choice", label: "What kind of group is it?", options: GROUP_CATEGORIES },
        { path: "about.category_other", kind: "text", label: "Which kind?", wide: true, when: (d) => d.about?.category === "other", maxLength: 60 },
        { path: "about.operating_level", kind: "choice", label: "How far does its work reach?", options: OPERATING_LEVELS, onSet: clear("areas") },
      ] },
    { id: "size", title: "A little more about the group",
      items: [
        { path: "about.date_formed", kind: "month", label: "When was it formed?", years: 40,
          validate: (v) => (!/^\d{4}-\d{2}$/.test(v ?? "") ? "Choose the month and year." : v > new Date().toISOString().slice(0, 7) ? "The date formed cannot be in the future." : null) },
        { path: "about.size", kind: "choice", label: "About how many members?", options: GROUP_SIZE },
      ] },
    { id: "where", title: "Where is the group based?",
      items: [
        { path: "location.state", kind: "select", label: "State", placeholder: "Choose a state", onSet: clear("lga", "ward", "areas"),
          load: async () => (await loadStates()).map((s) => ({ value: s.code, label: s.name })) },
        { path: "location.lga", kind: "select", label: "LGA", placeholder: "Choose an LGA", waitingText: "Choose a state first", onSet: clear("ward", "areas"), depends: (d) => d.location?.state,
          load: async (d) => (await loadLgas(d.location.state)).map((l) => ({ value: l.code, label: l.name })) },
        { path: "location.ward", kind: "select", label: "Ward", placeholder: "Choose a ward", waitingText: "Choose an LGA first", when: needWard, depends: (d) => d.location?.lga,
          load: async (d) => ((await loadLgas(d.location.state)).find((l) => l.code === d.location.lga)?.wards ?? []).map((w) => ({ value: w.code, label: w.name })) },
        { path: "location.areas", kind: "custom", id: "areas", when: covers, render: (ctx) => <AreasCovered {...ctx} />,
          validate: (v) => (!v?.length ? "Choose at least one area the group covers." : null) },
      ] },
    { id: "coordinator", title: "Who is the group's coordinator?", help: "We'll call this number about the registration.",
      items: [
        { path: "leaders.0.first_name", kind: "text", label: "First name", autoComplete: "given-name", validate: nameCheck("the first name") },
        { path: "leaders.0.surname", kind: "text", label: "Surname", autoComplete: "family-name", validate: nameCheck("the surname") },
        { path: "leaders.0.phone", kind: "tel", label: "Phone number", wide: true, placeholder: "0803 123 4567", validate: phoneCheck },
      ] },
    { id: "second", title: "One more leader, as a backup", help: "For example the secretary, with a different phone number.", errorPaths: ["leaders"],
      items: [
        { path: "leaders.1.first_name", kind: "text", label: "First name", validate: nameCheck("the first name") },
        { path: "leaders.1.surname", kind: "text", label: "Surname", validate: nameCheck("the surname") },
        { path: "leaders.1.phone", kind: "tel", label: "Phone number", wide: true, placeholder: "0803 123 4567", errorPaths: ["leaders"],
          validate: (v, d) => phoneCheck(v) ?? (normalizePhone(v) === normalizePhone(d.leaders?.[0]?.phone) ? "Use a different number from the coordinator's." : null) },
      ] },
    { id: "login", title: "Create the group's login", help: "You'll use it to post updates and download your certificate. We'll email you as soon as the group is approved.", server: 5,
      items: [
        { path: "account.email", kind: "email", label: "Email address", wide: true, placeholder: "name@example.com", autoComplete: "email",
          validate: (v) => (!normalizeEmail(v) ? "Enter a valid email address." : null) },
        { path: "account.password", kind: "password", label: "Password", hint: "At least 8 characters, with some letters.", wide: true, autoComplete: "new-password", validate: (v) => passwordProblem(v) },
        { path: "consent.accurate", kind: "check", label: "The information is accurate, and the leaders listed agreed to be added.", validate: (v) => (!v ? "Please tick this box to finish." : null) },
        { path: "consent.data", kind: "check", label: (t) => <>{t("I agree to the campaign using this information to organise support groups, as described in the")} <Link href="/privacy" target="_blank" className="link">{t("privacy notice")}</Link>.</>,
          validate: (v) => (!v ? "Please tick this box to finish." : null) },
      ] },
  ];
}

/** Which wards / LGAs / states a wider group covers, as tick chips. */
function AreasCovered({ data, set, t }) {
  const level = data.about?.operating_level;
  const [options, setOptions] = useState(null);
  const dep = `${level}|${data.location?.state}|${data.location?.lga}`;
  useEffect(() => {
    let live = true;
    setOptions(null);
    (async () => {
      let list = [];
      if (level === "zonal") list = (await loadStates()).map((s) => ({ value: s.code, label: s.name }));
      else if (data.location?.state) {
        const lgas = await loadLgas(data.location.state);
        if (level === "state") list = lgas.map((l) => ({ value: l.code, label: l.name }));
        else if (data.location?.lga) list = (lgas.find((l) => l.code === data.location.lga)?.wards ?? []).map((w) => ({ value: w.code, label: w.name }));
      }
      if (live) setOptions(list);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
  const picked = new Set(data.location?.areas ?? []);
  const label = level === "zonal" ? t("Which states does it cover?") : level === "state" ? t("Which LGAs does it cover?") : t("Which wards does it cover?");
  return (
    <div className="space-y-2">
      <p className="text-[15px] font-semibold">{label}</p>
      {options === null ? <p className="text-ink-muted">{t("Loading…")}</p> : options.length === 0 ? <p className="text-ink-muted">{t("Choose the state and LGA above first.")}</p> : (
        <div className="flex max-h-60 flex-wrap gap-2 overflow-y-auto">
          {options.map((o) => {
            const on = picked.has(o.value);
            return (
              <button key={o.value} type="button" aria-pressed={on} onClick={() => set("location.areas", on ? [...picked].filter((x) => x !== o.value) : [...picked, o.value])}
                className={`inline-flex min-h-10 items-center rounded-full border px-3.5 text-[14px] font-medium ${on ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-white hover:border-ink/40"}`}>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function GroupForm() {
  const t = useT();
  const [done, setDone] = useState(null);
  const screens = useMemo(() => buildScreens(), []);

  async function submit(d) {
    const body = { ...d, leaders: d.leaders.filter((l) => l.first_name || l.phone), membership: {}, online: {}, media: [] };
    const r = await api("/groups", { method: "POST", body });
    if (r.ok) {
      setDone(r.data);
      window.scrollTo({ top: 0 });
      return { ok: true };
    }
    return { ok: false, errors: r.data.errors, error: r.error };
  }

  if (done) return <Success done={done} />;
  return (
    <QuestionFlow
      flow="group"
      screens={screens}
      initial={{ about: {}, location: { areas: [] }, leaders: [{ position: "coordinator" }, { position: "secretary" }], account: {}, consent: {} }}
      onSubmit={submit}
      submitLabel={t("Register the group")}
    />
  );
}

function Success({ done }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/join/${done.joinCode}` : `/join/${done.joinCode}`;
  return (
    <Card className="mx-auto max-w-2xl rounded-3xl p-6 text-center sm:p-10">
      <CheckCircle2 aria-hidden className="mx-auto size-14 text-brand-500" />
      <h2 className="mt-4 h-page">{t("{group} is registered", { group: done.name })}</h2>
      <p className="mt-2 text-ink-muted">{t("Your coordinator will review it, usually within 7 days. We'll email you as soon as it's approved, and your certificate will be ready in your dashboard.")}</p>
      <dl className="mx-auto mt-8 grid max-w-md gap-3 text-left">
        <div className="rounded-2xl bg-surface-alt p-4">
          <dt className="text-[13px] font-semibold text-ink-muted">{t("Group ID")}</dt>
          <dd className="font-mono text-lg font-bold">{done.publicId}</dd>
        </div>
        <div className="rounded-2xl bg-surface-alt p-4">
          <dt className="text-[13px] font-semibold text-ink-muted">{t("Invite code for members")}</dt>
          <dd className="flex items-center justify-between gap-3">
            <span className="font-mono text-lg font-bold">{done.joinCode}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true))}>
              <Copy aria-hidden className="size-4" />
              {copied ? t("Link copied") : t("Copy invite link")}
            </button>
          </dd>
        </div>
      </dl>
      <Alert tone="info" className="mx-auto mt-6 max-w-md text-left">
        {t("Share the invite link so members can join now. You can add your logo and membership list from your dashboard.")}
        {done.membership?.count != null && <p className="mt-2">{t("{n} members were read from your list.", { n: done.membership.count })}</p>}
        {done.membership?.error && <p className="mt-2 text-danger">{t(done.membership.error)}</p>}
      </Alert>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <a href="/workspace" className="btn btn-primary btn-lg"><LayoutDashboard aria-hidden className="size-5" /> {t("Go to my group dashboard")}</a>
        <Link href="/" className="btn btn-ghost">{t("Back to home")}</Link>
      </div>
    </Card>
  );
}
