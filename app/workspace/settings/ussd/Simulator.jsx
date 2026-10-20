"use client";

import { useState } from "react";

export default function Simulator({ code }) {
  const [phone, setPhone] = useState("08091234000");
  const [inputs, setInputs] = useState(null);
  const [screen, setScreen] = useState("");
  const [ended, setEnded] = useState(false);
  const [value, setValue] = useState("");

  async function call(list) {
    const res = await fetch("/api/v1/ussd/callback", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ sessionId: "sim", serviceCode: code, phoneNumber: phone, text: list.join("*") }),
    });
    const text = await res.text();
    setEnded(text.startsWith("END"));
    setScreen(text.replace(/^(CON|END) /, ""));
    setInputs(list);
  }

  return (
    <div className="flex flex-wrap gap-8">
      <div className="w-72 rounded-[2rem] border-8 border-ink bg-ink p-3">
        <div className="min-h-64 rounded-lg bg-[#c9d8c5] p-3 font-mono text-[13px] leading-5 whitespace-pre-wrap text-ink" aria-live="polite">
          {inputs === null ? `Dial ${code}` : screen}
          <p className="mt-2 text-[11px] text-ink-muted">{screen.length} / 160</p>
        </div>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (inputs === null || ended) return; call([...inputs, value]); setValue(""); }}>
          <input className="min-w-0 flex-1 rounded-md bg-white px-2 py-2 font-mono" value={value} onChange={(e) => setValue(e.target.value)} disabled={inputs === null || ended} aria-label="Reply" />
          <button className="rounded-md bg-brand-600 px-3 font-semibold text-white" disabled={inputs === null || ended}>Send</button>
        </form>
      </div>
      <div className="max-w-sm space-y-3">
        <label className="flex flex-col gap-1"><span className="t-label">Phone number</span><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <button type="button" className="btn btn-primary" onClick={() => call([])}>Dial {code}</button>
        <p className="t-help">Hang up and dial again part-way through to see the session resume from the last answer.</p>
      </div>
    </div>
  );
}
