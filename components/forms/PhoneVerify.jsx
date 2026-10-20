"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Smartphone } from "lucide-react";

import { Alert, Field } from "@/components/ui";
import { useLang, useT } from "@/lib/i18n/client";
import { api } from "./api";

/**
 * Step 1 of every public flow: prove the phone number with a six-digit SMS
 * code. On success `onVerified` receives the verify response (existing group,
 * volunteer record and saved drafts for that number).
 */
export default function PhoneVerify({ purpose = "register", onVerified, intro }) {
  const t = useT();
  const lang = useLang();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(null); // { phone, devCode }
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function sendCode(e) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api("/auth/otp/request", { method: "POST", body: { phone, purpose, lang } });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      if (r.data.retryAfter) setWait(r.data.retryAfter);
      return;
    }
    setSent({ phone: r.data.phone, devCode: r.data.devCode });
    setWait(r.data.retryAfter ?? 60);
    setCode("");
  }

  async function verify(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api("/auth/otp/verify", { method: "POST", body: { phone: sent.phone, code, purpose } });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      if (r.data.expired) setSent(null);
      return;
    }
    onVerified(r.data);
  }

  if (!sent) {
    return (
      <form onSubmit={sendCode} className="space-y-5">
        {intro}
        <Field id="phone" label={t("Your mobile number")} hint={t("We'll send a 6-digit code by SMS to confirm it's yours.")} error={error ? t(error) : undefined}>
          {(aria) => (
            <div className="relative">
              <Smartphone aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
              <input
                {...aria}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="input pl-10"
                placeholder="0803 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
          )}
        </Field>
        <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={busy || wait > 0 || !phone.trim()}>
          {busy && <Loader2 aria-hidden className="size-5 animate-spin" />}
          {wait > 0 ? t("Wait {s}s", { s: wait }) : t("Send code")}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-5">
      <Alert tone="info" title={t("Code sent")}>
        {t("Enter the 6-digit code we sent to {phone}.", { phone: sent.phone })}
        {sent.devCode && (
          <p className="mt-1 text-[13px]">
            {t("Development mode: your code is")} <strong className="font-mono">{sent.devCode}</strong>
          </p>
        )}
      </Alert>
      <Field id="otp" label={t("6-digit code")} error={error ? t(error) : undefined}>
        {(aria) => (
          <input
            {...aria}
            className="input max-w-48 text-center font-mono text-xl tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoFocus
            required
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>
          {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <ShieldCheck aria-hidden className="size-5" />}
          {t("Verify")}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy || wait > 0} onClick={sendCode}>
          {wait > 0 ? t("Resend in {s}s", { s: wait }) : t("Resend code")}
        </button>
        <button type="button" className="link text-[15px]" onClick={() => { setSent(null); setError(null); }}>
          {t("Change number")}
        </button>
      </div>
    </form>
  );
}
