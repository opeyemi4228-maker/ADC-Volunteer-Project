"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { VOLUNTEER_ROLES, AVAILABILITY, LANGUAGES, PVC_STATUS } from "@/lib/options";
import { post } from "@/components/workspace/actions";
import { fmt } from "@/components/ui";

const TEMPLATES = [
  ["", "Write your own"],
  ["Reminder: collect your PVC at your INEC LGA office before the deadline. Your vote needs it.", "PVC reminder"],
  ["Ward meeting this Saturday at 4pm. Come with one friend who is not yet registered.", "Meeting invite"],
  ["Thank you for volunteering. Your coordinator will call you this week about your first task.", "Welcome"],
];

function Select({ label, value, onChange, options, all = "Everyone" }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="t-label">{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export default function Composer({ areas, groups }) {
  const router = useRouter();
  const [channel, setChannel] = useState("sms");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [aud, setAud] = useState({ area: "", group: "", role: "", availability: "", language: "", pvc: "", verified: false });
  const [p, setP] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = setTimeout(() => {
      post("/api/v1/messages/preview", { channel, body, audience: aud }).then(setP).catch(() => setP(null));
    }, 250);
    return () => clearTimeout(id);
  }, [channel, body, aud]);

  const set = (k) => (v) => { setAud((a) => ({ ...a, [k]: v })); setConfirm(false); };

  async function send() {
    setBusy(true);
    setError("");
    try {
      const r = await post("/api/v1/messages/send", { channel, body, subject, audience: aud });
      setResult(r);
      setBody("");
      setConfirm(false);
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-5 p-5">
      <h2 className="h-section">New message</h2>
      {result && (
        <p role="status" className="rounded-lg bg-success-bg p-3 text-[15px] text-success">
          {result.status === "sent" ? `Sent to ${fmt(result.count)} people.` : `Saved. It goes out to ${fmt(result.count)} people once a second person approves it.`}
        </p>
      )}
      <fieldset>
        <legend className="t-label">Channel</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {[["sms", "SMS"], ["whatsapp", "WhatsApp"], ["email", "Email"]].map(([v, l]) => (
            <label key={v} className="chip"><input type="radio" name="channel" className="size-4 accent-brand-700" checked={channel === v} onChange={() => setChannel(v)} /> {l}</label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Area" value={aud.area} onChange={set("area")} options={areas} all="Your whole area" />
        <Select label="Role" value={aud.role} onChange={set("role")} options={VOLUNTEER_ROLES} />
        <Select label="Availability" value={aud.availability} onChange={set("availability")} options={AVAILABILITY} />
        <Select label="Language" value={aud.language} onChange={set("language")} options={LANGUAGES} />
        <Select label="PVC" value={aud.pvc} onChange={set("pvc")} options={PVC_STATUS} />
      </div>
      <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" className="size-5 accent-brand-700" checked={aud.verified} onChange={(e) => set("verified")(e.target.checked)} /> Verified volunteers only</label>

      {channel === "email" && (
        <label className="flex flex-col gap-1"><span className="t-label">Subject</span><input className="input" value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} /></label>
      )}
      <div className="space-y-1">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <label htmlFor="msg-body" className="t-label">Message</label>
          <select aria-label="Start from a template" className="rounded-md border border-line px-2 py-1 text-[14px]" onChange={(e) => e.target.value && setBody(e.target.value)} defaultValue="">
            {TEMPLATES.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
          </select>
        </div>
        <textarea id="msg-body" className="input" rows={5} value={body} maxLength={channel === "sms" ? 459 : 2000} onChange={(e) => { setBody(e.target.value); setConfirm(false); }} />
        {channel === "sms" && <p className="t-help num">{body.length} characters · {p?.segments ?? 1} SMS {p?.segments > 1 ? "parts" : "part"} per person</p>}
      </div>

      <div className="rounded-lg border border-line p-4" aria-live="polite">
        <p className="text-[15px]">
          {p ? <><strong className="num">{fmt(p.count)}</strong> {p.count === 1 ? "person" : "people"} will receive this · estimated cost <strong className="num">₦{fmt(p.cost)}</strong></> : "Counting…"}
        </p>
        {p?.label && <p className="t-help mt-1">{p.label}</p>}
        {p?.needsApproval && <p className="mt-2 text-[14px] font-semibold text-warning">More than 10,000 people: a second approver must confirm before it sends.</p>}
      </div>

      {error && <p role="alert" className="text-[14px] font-medium text-danger">{error}</p>}
      {!confirm ? (
        <button type="button" className="btn btn-primary" disabled={!body.trim() || !p?.count} onClick={() => setConfirm(true)}>Review and send</button>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-alt p-3">
          <p className="text-[15px]">Send to <strong className="num">{fmt(p.count)}</strong> people now?</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={send} disabled={busy}>{busy && <Loader2 aria-hidden className="size-4 animate-spin" />}{p.needsApproval ? "Submit for approval" : "Send"}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>Go back</button>
        </div>
      )}
    </div>
  );
}
