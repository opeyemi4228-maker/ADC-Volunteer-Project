"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, MessageSquareText, ShieldCheck } from "lucide-react";

import { Alert, Card, Field } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { api } from "@/components/forms/api";
import ScreenCode from "@/components/forms/ScreenCode";

/**
 * Member sign-in with no password: the phone number used at registration,
 * then the 6-digit code sent to it by SMS.
 */
export default function MemberSignInForm({ demo, initialPhone = "" }) {
  const t = useT();
  const router = useRouter();
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(null);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [coordinator, setCoordinator] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function sendCode(e) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    setCoordinator(false);
    const r = await api("/auth/member", { method: "POST", body: { phone } });
    setBusy(false);
    if (!r.ok) {
      if (r.data.retryAfter) setWait(r.data.retryAfter);
      if (r.data.coordinator) return setCoordinator(true);
      return setError(r.error);
    }
    setSent(r.data);
    setCode("");
    setWait(r.data.retryAfter ?? 60);
  }

  async function verify(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api("/auth/member", { method: "POST", body: { phone, code } });
    if (!r.ok) {
      setBusy(false);
      if (r.data.expired) setCode("");
      return setError(r.error);
    }
    router.push("/workspace");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-8">
        {coordinator && (
          <Alert tone="info" title={t("This number has a coordinator account")} className="mb-5">
            <p>{t("Coordinators and the Super Admin sign in with their password, then a code.")}</p>
            <Link href={`/signin?login=${encodeURIComponent(phone)}`} className="btn btn-primary mt-3 h-10 min-h-10 px-4 text-[14px]">
              {t("Continue to coordinator sign in")}
            </Link>
          </Alert>
        )}
        {error && (
          <Alert tone="danger" className="mb-5">
            {t(error)}
          </Alert>
        )}
        {!sent ? (
          <form onSubmit={sendCode} className="space-y-5">
            <Field id="m-phone" label={t("Phone number you registered with")} hint={t("Enter it exactly as you did when you registered. We'll send a one-time code to it by SMS.")}>
              {(aria) => (
                <input {...aria} type="tel" inputMode="tel" autoComplete="tel-national" className="input" placeholder="0803 123 4567" value={phone} onChange={(e) => { setPhone(e.target.value); setCoordinator(false); }} required />
              )}
            </Field>
            <button type="submit" className="btn btn-primary w-full" disabled={busy || wait > 0}>
              {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <MessageSquareText aria-hidden className="size-5" />}
              {wait > 0 ? t("Send code again in {n}s", { n: wait }) : t("Send me a code")}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-5">
            <Alert tone="info" title={sent.devCode ? t("Your code") : t("Check your phone")}>
              {!sent.devCode && t("We sent a 6-digit code to the number ending {n}.", { n: sent.masked })} {t("This code is your password. It works once and expires in 10 minutes.")}
              <ScreenCode code={sent.devCode} onUse={setCode} />
            </Alert>
            <Field id="m-code" label={t("6-digit code")}>
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
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>
                {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <ShieldCheck aria-hidden className="size-5" />}
                {t("Verify and sign in")}
              </button>
              <button type="button" className="btn btn-secondary" disabled={busy || wait > 0} onClick={() => sendCode()}>
                {wait > 0 ? t("Send code again in {n}s", { n: wait }) : t("Send a new code")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setSent(null); setCode(""); setError(null); }}>
                {t("Change number")}
              </button>
            </div>
          </form>
        )}
      </Card>

      {demo && (
        <Card className="p-5">
          <p className="font-semibold">{t("Demo accounts")}</p>
          <p className="mt-1 text-[14px] text-ink-muted">{t("Development only. The code is shown on screen after you send it.")}</p>
          <ul className="mt-3 divide-y divide-line text-[14px]">
            {demo.map(([role, number, name]) => (
              <li key={number}>
                <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 py-2 text-left hover:text-brand-800" onClick={() => { setPhone(number); setSent(null); }}>
                  <span><span className="font-semibold">{role}</span> · {name}</span>
                  <span className="font-mono text-ink-muted">{number}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
