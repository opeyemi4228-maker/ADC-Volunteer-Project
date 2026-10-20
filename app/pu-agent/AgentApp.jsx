"use client";

import { useEffect, useState } from "react";
import { Camera, CheckCircle2, Loader2, WifiOff } from "lucide-react";

import PhoneVerify from "@/components/forms/PhoneVerify";
import { uploadFile } from "@/components/forms/upload";
import { compressImage } from "@/components/workspace/compress";
import { PARTIES, ELECTION_INCIDENTS, SEVERITY } from "@/lib/options";
import { Alert } from "@/components/ui";

/**
 * Election day for one agent: check in, send the result from Form EC8A with a
 * photo of the sheet, report incidents. Figures typed while offline are kept
 * on the phone and sent when the network returns.
 */
const KEY = "adc_pu_result_draft";

async function call(url, body) {
  const res = await fetch(url, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ...json };
}

export default function AgentApp() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);

  const load = () => call("/api/v1/election/me").then((r) => { setMe(r.ok ? r : null); setLoading(false); });
  useEffect(() => {
    load();
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  if (loading) return <p className="text-ink-muted">Loading…</p>;
  if (!me) {
    return (
      <div className="space-y-4">
        <h1 className="h-page">Sign in with your phone</h1>
        <p className="text-ink-muted">Use the number you registered as a volunteer.</p>
        <PhoneVerify purpose="status" onVerified={() => { setLoading(true); load(); }} />
      </div>
    );
  }
  const a = me.assignment;
  if (!a) {
    return (
      <div className="space-y-3">
        <h1 className="h-page">Hello, {me.volunteer?.first_name ?? "there"}</h1>
        <p>You are not assigned to a polling unit. Your ward coordinator assigns agents before election day.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {!online && <Alert tone="warning" title="You're offline">Your answers are saved on this phone and will send when you reconnect.</Alert>}
      <div>
        <p className="text-[14px] text-ink-muted">{a.is_backup ? "Backup agent" : "Primary agent"} · {a.ward}, {a.lga}</p>
        <h1 className="h-page mt-1">{a.pu_name}</h1>
        <p className="text-[14px] text-ink-muted num">{a.pu_code}</p>
      </div>
      {!me.live && <Alert tone="info" title="Election day is not open yet">Check-in and results open on the day. Until then you can read this page and check your details.</Alert>}
      <CheckIn a={a} live={me.live} onDone={load} />
      <Result live={me.live} existing={me.result} online={online} onDone={load} />
      <Incident live={me.live} />
    </div>
  );
}

function CheckIn({ a, live, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="space-y-2">
      <h2 className="h-section">1. Check in</h2>
      {a.checked_in_at ? (
        <p className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 aria-hidden className="size-5" /> Checked in at {a.checked_in_at.slice(11, 16)}</p>
      ) : (
        <>
          <p className="text-ink-muted">Tap when you arrive at the polling unit.</p>
          <button className="btn btn-primary w-full" disabled={!live || busy} onClick={async () => { setBusy(true); const r = await call("/api/v1/election/checkin", {}); setBusy(false); r.ok ? onDone() : setError(r.error); }}>
            {busy && <Loader2 aria-hidden className="size-4 animate-spin" />} I have arrived
          </button>
          {error && <p role="alert" className="text-danger">{error}</p>}
        </>
      )}
    </section>
  );
}

function Result({ live, existing, online, onDone }) {
  const [f, setF] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) ?? { votes: {} }; } catch { return { votes: {} }; }
  });
  const [photo, setPhoto] = useState(null);
  const [upload, setUpload] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [errors, setErrors] = useState({});

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(f)); } catch {} }, [f]);

  async function submit() {
    setBusy(true);
    setMsg("");
    let id = upload;
    if (!id && photo) {
      const r = await uploadFile(await compressImage(photo, 2200, 0.85));
      if (r.error) { setBusy(false); return setMsg(r.error); }
      id = r.id;
      setUpload(id);
    }
    const r = await call("/api/v1/election/results", { ...f, sheet_upload_id: id });
    setBusy(false);
    if (r.ok) {
      try { localStorage.removeItem(KEY); } catch {}
      setMsg("Result sent. Your collation agent will confirm it.");
      onDone();
    } else {
      setErrors(r.errors ?? {});
      setMsg(r.error ?? "Could not send. Try again.");
    }
  }

  // Resend automatically when the network comes back.
  useEffect(() => { if (online && f.pending && !busy) { setF((x) => ({ ...x, pending: false })); submit(); } }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  if (existing) {
    return (
      <section className="space-y-2">
        <h2 className="h-section">2. Result</h2>
        <p className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 aria-hidden className="size-5" /> Sent{existing.confirmed_at ? " and confirmed" : ". Waiting for confirmation"}</p>
        <p className="text-[14px] text-ink-muted num">{PARTIES.map((p) => `${p} ${existing.party_votes[p] ?? 0}`).join(" · ")}</p>
      </section>
    );
  }
  const num = (k, label) => (
    <label className="flex items-center justify-between gap-3 border-b border-line py-2">
      <span className={k === "ADC" ? "font-bold" : ""}>{label}</span>
      <input inputMode="numeric" pattern="[0-9]*" className="input !min-h-11 w-28 text-right num" value={f.votes?.[k] ?? ""} disabled={!live}
        onChange={(e) => setF({ ...f, votes: { ...f.votes, [k]: e.target.value.replace(/\D/g, "") } })} aria-invalid={errors[`votes.${k}`] ? "true" : undefined} />
    </label>
  );
  return (
    <section className="space-y-3">
      <h2 className="h-section">2. Send the result</h2>
      <p className="text-ink-muted">Copy the figures from the official result sheet (Form EC8A) after it is signed and posted.</p>
      <div>{PARTIES.map((p) => <div key={p}>{num(p, p)}</div>)}</div>
      <div className="grid grid-cols-3 gap-2">
        {[["registered", "Registered"], ["accredited", "Accredited"], ["rejected", "Rejected"]].map(([k, l]) => (
          <label key={k} className="flex flex-col gap-1 text-[14px]"><span className="font-semibold">{l}</span>
            <input inputMode="numeric" className="input num" value={f[k] ?? ""} disabled={!live} onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/\D/g, "") })} aria-invalid={errors[k] ? "true" : undefined} />
          </label>
        ))}
      </div>
      {errors.accredited && <p role="alert" className="text-[14px] text-danger">{errors.accredited}</p>}
      <label className={`btn btn-secondary w-full ${!live ? "pointer-events-none opacity-55" : ""}`}>
        <Camera aria-hidden className="size-5" /> {photo ? `Photo ready: ${photo.name}` : "Take a photo of the result sheet"}
        <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { setPhoto(e.target.files[0] ?? null); setUpload(null); }} />
      </label>
      {errors.sheet && <p role="alert" className="text-[14px] text-danger">{errors.sheet}</p>}
      {online ? (
        <button className="btn btn-primary w-full" disabled={!live || busy || !photo} onClick={submit}>{busy && <Loader2 aria-hidden className="size-4 animate-spin" />} Send result</button>
      ) : (
        <button className="btn btn-primary w-full" disabled={!live || !photo} onClick={() => { setF({ ...f, pending: true }); setMsg("Saved. It will send when you reconnect. Keep this page open."); }}>
          <WifiOff aria-hidden className="size-4" /> Send when back online
        </button>
      )}
      {msg && <p role="status" className="text-[15px]">{msg}</p>}
    </section>
  );
}

function Incident({ live }) {
  const [f, setF] = useState({ category: "", severity: "", description: "" });
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function submit() {
    setBusy(true);
    setMsg("");
    const media = [];
    if (photo) {
      const r = await uploadFile(await compressImage(photo));
      if (!r.error) media.push({ upload_id: r.id, kind: "photo" });
    }
    const r = await call("/api/v1/election/incidents", { ...f, media });
    setBusy(false);
    if (r.ok) { setMsg("Incident reported. Stay safe; your coordinator has been alerted."); setF({ category: "", severity: "", description: "" }); setPhoto(null); }
    else setMsg(r.error);
  }
  return (
    <section className="space-y-3">
      <h2 className="h-section">3. Report an incident</h2>
      <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label="What happened"><option value="">What happened?</option>{ELECTION_INCIDENTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How serious">
        {SEVERITY.map((o) => <label key={o.value} className="chip"><input type="radio" name="sev" className="size-4 accent-brand-700" checked={f.severity === o.value} onChange={() => setF({ ...f, severity: o.value })} />{o.label}</label>)}
      </div>
      <textarea className="input" rows={3} placeholder="What did you see? (optional)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <label className="btn btn-secondary w-full"><Camera aria-hidden className="size-5" /> {photo ? "Photo added" : "Add a photo (optional)"}<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setPhoto(e.target.files[0] ?? null)} /></label>
      <button className="btn btn-danger w-full" disabled={!live || busy || !f.category || !f.severity} onClick={submit}>{busy && <Loader2 aria-hidden className="size-4 animate-spin" />} Report incident</button>
      {msg && <p role="status">{msg}</p>}
    </section>
  );
}
