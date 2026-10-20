"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, LogIn, ShieldCheck } from "lucide-react";

import { Alert, Card, Field } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { api } from "@/components/forms/api";

export default function SignInForm({ demo }) {
  const t = useT();
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function first(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api("/auth/signin", { method: "POST", body: { login, password } });
    if (!r.ok) {
      setBusy(false);
      return setError(r.error);
    }
    // Support group accounts go straight in; campaign coordinators confirm a code.
    if (r.data.done) {
      router.push("/workspace");
      router.refresh();
      return;
    }
    setBusy(false);
    setSent(r.data);
  }

  async function second(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api("/auth/signin", { method: "POST", body: { code } });
    if (!r.ok) {
      setBusy(false);
      if (r.data.restart) setSent(null);
      return setError(r.error);
    }
    router.push("/workspace");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-8">
        {error && (
          <Alert tone="danger" className="mb-5">
            {t(error)}
          </Alert>
        )}
        {!sent ? (
          <form onSubmit={first} className="space-y-5">
            <Field id="si-login" label={t("Email or phone number")}>
              {(aria) => (
                <input {...aria} type="text" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} className="input" placeholder="name@example.com" value={login} onChange={(e) => setLogin(e.target.value)} required />
              )}
            </Field>
            <Field id="si-password" label={t("Password")}>
              {(aria) => (
                <input {...aria} type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
              )}
            </Field>
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <LogIn aria-hidden className="size-5" />}
              {t("Sign in")}
            </button>
            <div className="flex flex-wrap justify-between gap-2 text-[14px]">
              <Link href="/reset" className="link inline-flex min-h-11 items-center">{t("Forgot your password?")}</Link>
              <Link href="/volunteer" className="link inline-flex min-h-11 items-center">{t("Join as a volunteer")}</Link>
            </div>
          </form>
        ) : (
          <form onSubmit={second} className="space-y-5">
            <Alert tone="info" title={t("Check your phone")}>
              {t("We sent a 6-digit code to the number ending {n}.", { n: sent.masked })}
              {sent.devCode && (
                <p className="mt-1 text-[13px]">
                  {t("Development mode: your code is")} <strong className="font-mono">{sent.devCode}</strong>
                </p>
              )}
            </Alert>
            <Field id="si-code" label={t("6-digit code")}>
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
                {t("Verify and continue")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setSent(null); setCode(""); }}>
                {t("Start again")}
              </button>
            </div>
          </form>
        )}
      </Card>

      {demo && (
        <Card className="p-5">
          <p className="font-semibold">{t("Demo accounts")}</p>
          <p className="mt-1 text-[14px] text-ink-muted">
            {t("Development only. Password for all:")} <code className="font-mono font-semibold text-ink">{demo.password}</code>
          </p>
          <ul className="mt-3 divide-y divide-line text-[14px]">
            {demo.accounts.map(([role, number, name]) => (
              <li key={number}>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-2 py-2 text-left hover:text-brand-800"
                  onClick={() => { setLogin(number); setPassword(demo.password); setSent(null); }}
                >
                  <span>
                    <span className="font-semibold">{role}</span> · {name}
                  </span>
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
