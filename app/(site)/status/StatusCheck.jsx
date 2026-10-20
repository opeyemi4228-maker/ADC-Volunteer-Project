"use client";

import Link from "next/link";
import { useState } from "react";
import { Users, HandHeart, FileClock, Download, Trash2, Loader2 } from "lucide-react";

import { Alert, Card, EmptyState, Field, StatusBadge } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import PhoneVerify from "@/components/forms/PhoneVerify";
import { api } from "@/components/forms/api";

const NEXT_STEP = {
  pending: "A coordinator will review it and contact you within 7 days.",
  info_requested: "A coordinator needs more information. Watch for their SMS or call.",
  verified: "You're all set. Coordinators in your area can now reach you.",
  suspended: "This registration is on hold. Contact support for details.",
  rejected: "This registration was not accepted. Contact support if you think this is a mistake.",
};

export default function StatusCheck() {
  const t = useT();
  const [result, setResult] = useState(null);

  async function done() {
    await api("/auth/signout", { method: "POST", body: { which: "registrant" } });
    setResult(null);
  }

  if (!result) {
    return (
      <Card className="p-5 sm:p-8">
        <PhoneVerify purpose="status" onVerified={setResult} intro={<p className="text-[15px] text-ink-muted">{t("Enter the number you registered with.")}</p>} />
      </Card>
    );
  }

  const { group, volunteer, drafts } = result;
  const draft = drafts?.group ? "group" : drafts?.volunteer ? "volunteer" : null;

  return (
    <div className="space-y-4">
      <p className="text-[15px] text-ink-muted">{t("Registrations for {phone}", { phone: result.display })}</p>

      {group && (
        <Record icon={Users} kind={t("Support group")} title={group.name} id={group.publicId} status={group.status} />
      )}
      {volunteer && (
        <Record icon={HandHeart} kind={t("Volunteer")} title={volunteer.firstName} id={volunteer.publicId} status={volunteer.status} />
      )}
      {!group && !volunteer && (
        <EmptyState
          icon={draft ? FileClock : Users}
          title={draft ? t("You have a registration in progress") : t("No registration found for this number")}
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/volunteer" className="btn btn-primary">
                {draft ? t("Continue registration") : t("Join as a volunteer")}
              </Link>
              {!draft && <Link href="/register" className="btn btn-secondary">{t("Register a support group")}</Link>}
            </div>
          }
        >
          {draft ? t("It isn't submitted yet. Pick up where you stopped.") : t("Check the number, or register now.")}
        </EmptyState>
      )}

      {(group || volunteer) && <YourData />}

      <button type="button" className="btn btn-ghost" onClick={done}>
        {t("Check another number")}
      </button>
    </div>
  );
}

/** Data rights under the NDPA: a copy of what we hold, and a deletion request for the DPO. */
function YourData() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const [error, setError] = useState(null);

  async function request(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api("/me/data/delete-request", { method: "POST", body: { details } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setSent(r.data.reference);
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="h-section">{t("Your data")}</h2>
      <p className="mt-1 text-[15px] text-ink-muted">
        {t("You can get a copy of everything we hold about this number, or ask us to delete it.")}{" "}
        <Link href="/privacy" className="link">{t("Privacy notice")}</Link>
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <a href="/api/v1/me/data" download className="btn btn-secondary btn-sm">
          <Download aria-hidden className="size-4" />
          {t("Download my data")}
        </a>
        {!open && !sent && (
          <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => setOpen(true)}>
            <Trash2 aria-hidden className="size-4" />
            {t("Ask us to delete my data")}
          </button>
        )}
      </div>

      {sent && (
        <Alert tone="success" className="mt-4" title={t("Request received")}>
          {t("Your reference is {ref}. Our data protection officer will respond within 30 days.", { ref: sent })}
        </Alert>
      )}

      {open && !sent && (
        <form onSubmit={request} className="mt-4 space-y-4 border-t border-line pt-4">
          <Alert tone="warning">
            {t("Deleting your data removes your registration. Coordinators will no longer be able to reach you.")}
          </Alert>
          <Field id="dr-details" label={t("Anything we should know?")} optional optionalText={t("Optional")} error={error ? t(error) : undefined}>
            {(aria) => (
              <textarea {...aria} className="input" maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />
            )}
          </Field>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn btn-danger" disabled={busy}>
              {busy && <Loader2 aria-hidden className="size-5 animate-spin" />}
              {t("Send deletion request")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
              {t("Cancel")}
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}

function Record({ icon: Icon, kind, title, id, status }) {
  const t = useT();
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
            <Icon aria-hidden className="size-5" />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-ink-muted">{kind}</p>
            <p className="text-[17px] font-bold">{title}</p>
            <p className="font-mono text-[13px] text-ink-muted">{id}</p>
          </div>
        </div>
        <StatusBadge status={status} t={t} />
      </div>
      {NEXT_STEP[status] && <p className="mt-4 border-t border-line pt-4 text-[15px]">{t(NEXT_STEP[status])}</p>}
    </Card>
  );
}
