"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, Loader2, WifiOff, CheckCircle2, AlertTriangle } from "lucide-react";

import { useForm, TextField, SelectField, ChoiceChips } from "@/components/forms/controls";
import LocationPicker from "@/components/forms/LocationPicker";
import { GENDERS, PVC_STATUS, VOLUNTEER_ROLES, LANGUAGES, AVAILABILITY, CONTACT_CHANNELS, MAX_ROLES } from "@/lib/options";
import { normalizePhone, isValidName, ageOn, isValidIsoDate } from "@/lib/validate";

const QUEUE = "adc_agent_queue";
const DONE = "adc_agent_results";
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) ?? []; } catch { return []; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const blank = (area) => ({ phone: "", code: "", about: {}, vote: { ...area }, help: { roles: [], languages: ["english"] }, consent: {} });

/** Quick checks before a record is queued, so bad records never leave the phone. */
function check(d) {
  const e = {};
  if (!normalizePhone(d.phone)) e.phone = "Enter a Nigerian mobile number.";
  if (!isValidName(d.about.first_name)) e["about.first_name"] = "Enter a first name.";
  if (!isValidName(d.about.surname)) e["about.surname"] = "Enter a surname.";
  if (!d.about.gender) e["about.gender"] = "Choose an option.";
  if (!isValidIsoDate(d.about.dob ?? "")) e["about.dob"] = "Enter the date of birth.";
  else if (ageOn(d.about.dob) < 18) e["about.dob"] = "They must be 18 or older.";
  if (!d.vote.ward) e["vote.state"] = "Choose state, LGA and ward.";
  if (!d.vote.pvc) e["vote.pvc"] = "Ask about their PVC.";
  if (!d.help.roles?.length) e["help.roles"] = "Choose at least one role.";
  else if (d.help.roles.length > MAX_ROLES) e["help.roles"] = "Choose up to three roles.";
  if (!d.help.availability) e["help.availability"] = "Choose availability.";
  if (!d.help.smartphone) e["help.smartphone"] = "Ask whether they have a smartphone.";
  if (!d.help.channel) e["help.channel"] = "Choose the best way to reach them.";
  if (!d.consent.accurate || !d.consent.data) e.consent = "They must tick both consent boxes themselves.";
  return e;
}

export default function AgentForm({ defaultArea, today }) {
  const router = useRouter();
  const form = useForm(blank(defaultArea));
  const [queue, setQueue] = useState([]);
  const [results, setResults] = useState([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [codeMsg, setCodeMsg] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    setQueue(read(QUEUE));
    setResults(read(DONE));
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/agent-sw.js", { scope: "/workspace/agent" }).catch(() => {});
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => { if (online && queue.length && !syncing) sync(); }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sync(list = read(QUEUE)) {
    if (!list.length) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/v1/sync/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records: list }) });
      if (!res.ok) throw new Error();
      const { results: out } = await res.json();
      const left = list.filter((r) => !out.find((o) => o.clientId === r.clientId));
      const done = [...out.map((o) => ({ ...o, name: list.find((r) => r.clientId === o.clientId)?.label, at: new Date().toISOString() })), ...read(DONE)].slice(0, 100);
      write(QUEUE, left); write(DONE, done);
      setQueue(left); setResults(done);
      router.refresh();
    } catch {
      // Still offline or the server is unreachable; the queue stays on the phone.
    } finally {
      setSyncing(false);
    }
  }

  async function sendCode() {
    setCodeMsg("");
    const res = await fetch("/api/v1/sync/confirm-phone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: form.get("phone") }) }).catch(() => null);
    if (!res) return setCodeMsg("No network. You can still save; the coordinator will confirm the number by phone.");
    const j = await res.json();
    setCodeMsg(res.ok ? `Code sent. Ask them to read it out.${j.devCode ? ` (Development: ${j.devCode})` : ""}` : j.error);
  }

  function save(e) {
    e.preventDefault();
    const d = form.data;
    const errors = check(d);
    form.setErrors(errors);
    if (Object.keys(errors).length) return;
    const record = () => ({
      clientId: crypto.randomUUID(), phone: d.phone, code: d.code || undefined, capturedAt: new Date().toISOString(),
      label: `${d.about.first_name} ${d.about.surname}`, data: { about: d.about, vote: d.vote, help: d.help, consent: d.consent },
    });
    const finish = (r) => {
      const list = [...read(QUEUE), r];
      write(QUEUE, list);
      setQueue(list);
      setSaved(`${r.label} saved.`);
      form.setData(blank({ state: d.vote.state, lga: d.vote.lga, ward: d.vote.ward }));
      setCodeMsg("");
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (navigator.onLine) sync(list);
    };
    const r = record();
    // Location only if the agent's phone allows it: for quality audits, rounded to ~10 m.
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => finish({ ...r, lat: p.coords.latitude, lng: p.coords.longitude }), () => finish(r), { timeout: 3000, maximumAge: 60000 });
    else finish(r);
  }

  const rejected = results.filter((r) => !r.ok);
  return (
    <div className="grid gap-8 xl:grid-cols-[1.4fr_1fr]">
      <form onSubmit={save} className="space-y-6" noValidate>
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${queue.length ? "border-warning/40 bg-warning-bg" : "border-line"}`} aria-live="polite">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            {!online ? <WifiOff aria-hidden className="size-4" /> : syncing ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <CloudUpload aria-hidden className="size-4" />}
            {queue.length ? `${queue.length} ${queue.length === 1 ? "record" : "records"} waiting to sync` : "Everything is synced"}
            {!online && " · offline"}
          </p>
          {queue.length > 0 && online && <button type="button" className="btn btn-secondary btn-sm" onClick={() => sync()} disabled={syncing}>Sync now</button>}
        </div>
        {saved && <p role="status" className="font-semibold text-success">{saved}</p>}

        <section className="card space-y-4 p-5">
          <h2 className="h-section">Phone</h2>
          <div className="flex flex-wrap items-end gap-2">
            <TextField form={form} path="phone" label="Their mobile number" inputMode="tel" className="min-w-56 flex-1" placeholder="0803 123 4567" />
            <button type="button" className="btn btn-secondary" onClick={sendCode} disabled={!normalizePhone(form.get("phone"))}>Send code</button>
          </div>
          {codeMsg && <p className="text-[14px]">{codeMsg}</p>}
          <TextField form={form} path="code" label="Code they read out" optional inputMode="numeric" maxLength={6} hint="Without a code the record is saved as 'phone not confirmed' and the coordinator calls to check." />
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="h-section">About them</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} path="about.first_name" label="First name" autoComplete="off" />
            <TextField form={form} path="about.surname" label="Surname" autoComplete="off" />
          </div>
          <ChoiceChips form={form} path="about.gender" label="Gender" options={GENDERS} />
          <TextField form={form} path="about.dob" label="Date of birth" type="date" max={new Date().toISOString().slice(0, 10)} />
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="h-section">Where they vote</h2>
          <LocationPicker form={form} base="vote" withPu />
          <ChoiceChips form={form} path="vote.pvc" label="PVC" options={PVC_STATUS} />
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="h-section">How they can help</h2>
          <ChoiceChips form={form} path="help.roles" label="Roles (up to three)" options={VOLUNTEER_ROLES} multiple />
          <ChoiceChips form={form} path="help.languages" label="Languages" options={LANGUAGES} multiple />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField form={form} path="help.availability" label="Availability" options={AVAILABILITY} placeholder="Choose" />
            <SelectField form={form} path="help.channel" label="Best way to reach them" options={CONTACT_CHANNELS} placeholder="Choose" />
          </div>
          <ChoiceChips form={form} path="help.smartphone" label="Smartphone?" options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
          <TextField form={form} path="help.group_code" label="Group code" optional placeholder="e.g. KBW412" />
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="h-section">Consent</h2>
          <p className="text-[15px]">Read this aloud, then hand them the phone to tick the boxes themselves.</p>
          <p className="rounded-lg bg-surface-alt p-3 text-[15px]">&ldquo;ADC will store your name, phone number and where you vote to coordinate campaign activities. Only coordinators for your area can see it. You can ask us to delete it at any time.&rdquo;</p>
          {[["accurate", "The information is accurate."], ["data", "I agree ADC can store and use it as explained."], ["messaging", "Send me campaign updates (optional)."]].map(([k, l]) => (
            <label key={k} className="flex items-start gap-3 text-[15px]">
              <input type="checkbox" className="mt-0.5 size-5 accent-brand-700" checked={Boolean(form.get(`consent.${k}`))} onChange={(e) => form.set(`consent.${k}`, e.target.checked)} /> {l}
            </label>
          ))}
          {form.errors.consent && <p role="alert" className="text-[14px] text-danger">{form.errors.consent}</p>}
        </section>

        <button className="btn btn-primary w-full sm:w-auto">Save registration</button>
      </form>

      <aside className="space-y-6">
        <section>
          <h2 className="h-section">Today</h2>
          <p className="text-[15px] text-ink-muted"><strong className="text-ink num">{today.length}</strong> registered and synced · <strong className="text-ink num">{queue.length}</strong> waiting · <strong className="text-ink num">{rejected.length}</strong> not accepted</p>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {today.map((v) => (
              <li key={v.id} className="py-2 text-[14px]">
                <p className="font-semibold">{v.name} <span className="font-normal text-ink-muted">· {v.at}</span></p>
                <p className="text-ink-muted">{v.id} · {v.phone} · {v.confirmed ? <span className="text-success">phone confirmed</span> : "phone not confirmed"}</p>
              </li>
            ))}
            {today.length === 0 && <li className="py-2 text-[14px] text-ink-muted">No registrations synced today yet.</li>}
          </ul>
        </section>
        {rejected.length > 0 && (
          <section>
            <h2 className="h-section">Not accepted</h2>
            <ul className="mt-2 space-y-2">
              {rejected.slice(0, 20).map((r) => (
                <li key={r.clientId} className="flex gap-2 text-[14px]"><AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" /><span><strong>{r.name}</strong>: {r.error}</span></li>
              ))}
            </ul>
          </section>
        )}
        {results.some((r) => r.ok) && <p className="flex items-center gap-2 text-[14px] text-success"><CheckCircle2 aria-hidden className="size-4" /> Last sync accepted {results.filter((r) => r.ok).length} records.</p>}
      </aside>
    </div>
  );
}
