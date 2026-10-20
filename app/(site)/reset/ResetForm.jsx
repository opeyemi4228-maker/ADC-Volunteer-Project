"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Eye, EyeOff } from "lucide-react";

import { Alert, Card, Field } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { api } from "@/components/forms/api";

export default function ResetForm({ token }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api("/auth/reset", { method: "POST", body: token ? { token, password } : { email } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setDone(r.data);
  }

  if (done) {
    return (
      <Card className="p-5 sm:p-8">
        {token ? (
          <Alert tone="success" title={t("Your password has been changed")}>
            <Link href="/signin" className="link">{t("Sign in")}</Link>
          </Alert>
        ) : (
          <Alert tone="success" title={t("Check your email")}>
            <p>{t("If that address has an account, we've sent a link to reset the password. It works for one hour.")}</p>
            {done.devLink && (
              <p className="mt-2 text-[13px]">
                {t("Development mode: email is not sent.")} <Link href={done.devLink} className="link">{t("Open the reset link")}</Link>
              </p>
            )}
          </Alert>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-8">
      <form onSubmit={submit} className="space-y-5">
        {error && <Alert tone="danger">{t(error)}</Alert>}
        {token ? (
          <Field id="rs-password" label={t("New password")} hint={t("At least 8 characters, with some letters.")}>
            {(aria) => (
              <div className="space-y-1.5">
                <input {...aria} type={show ? "text" : "password"} autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                <button type="button" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-700" onClick={() => setShow((v) => !v)}>
                  {show ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
                  {show ? t("Hide password") : t("Show password")}
                </button>
              </div>
            )}
          </Field>
        ) : (
          <Field id="rs-email" label={t("Email address")}>
            {(aria) => <input {...aria} type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />}
          </Field>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy && <Loader2 aria-hidden className="size-5 animate-spin" />}
          {token ? t("Save new password") : t("Send reset link")}
        </button>
        <p className="text-[14px]"><Link href="/signin" className="link">{t("Back to sign in")}</Link></p>
      </form>
    </Card>
  );
}
