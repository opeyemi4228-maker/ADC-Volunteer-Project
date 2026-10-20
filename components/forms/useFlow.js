"use client";

import { useEffect, useState } from "react";

import { api } from "./api";
import { useForm, focusFirstError } from "./controls";

/**
 * The step machine behind the registration flows. Every step is checked by
 * the server's own rules before moving on, and progress is saved on this
 * device after each step, so a dropped connection or a closed tab never loses
 * work. (There is no phone code, so there is no server-side identity to save
 * a draft against before the form is submitted.)
 *
 * `sectionStep` maps the first segment of an error path ("about", "leaders")
 * to the step that owns it, so a 422 on submit returns people to the right page.
 */
const key = (flow) => `adc_draft_${flow}`;

export function useFlow({ flow, steps, initial, sectionStep }) {
  const form = useForm(initial);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(key(flow)) ?? "null");
      if (d?.data && d.step > 1) setDraft(d);
    } catch {}
  }, [flow]);

  const store = (target, data) => {
    try {
      localStorage.setItem(key(flow), JSON.stringify({ step: target, data, at: Date.now() }));
      return true;
    } catch {
      return false;
    }
  };

  const go = (n) => {
    setStep(n);
    setError(null);
    setSaved(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  async function next() {
    setBusy(true);
    setError(null);
    const r = await api(`/validate/${flow}`, { method: "POST", body: { step, data: form.data } });
    if (!r.ok) {
      setBusy(false);
      return setError(r.error);
    }
    if (Object.keys(r.data.errors).length) {
      setBusy(false);
      form.setErrors(r.data.errors);
      return focusFirstError(r.data.errors);
    }
    form.setErrors({});
    const target = Math.min(step + 1, steps.length);
    const ok = store(target, form.data);
    setBusy(false);
    setDraft(null);
    go(target);
    setSaved(ok);
  }

  /** POSTs the finished form; returns the response data or null. */
  async function submit(path, payload = form.data) {
    setBusy(true);
    setError(null);
    const r = await api(path, { method: "POST", body: payload });
    setBusy(false);
    if (r.ok) {
      try { localStorage.removeItem(key(flow)); } catch {}
      return r.data;
    }
    const errs = r.data.errors ?? {};
    if (Object.keys(errs).length) {
      form.setErrors(errs);
      const first = Object.keys(errs)[0].split(".")[0];
      const target = sectionStep[first];
      if (target && target !== step) go(target);
      focusFirstError(errs);
    }
    setError(r.error);
    return null;
  }

  function resume(d = draft) {
    if (!d) return;
    form.setData((cur) => ({ ...cur, ...d.data }));
    setDraft(null);
    go(Math.max(1, Math.min(d.step, steps.length)));
  }

  function discard() {
    try { localStorage.removeItem(key(flow)); } catch {}
    setDraft(null);
  }

  return { form, step, go, next, submit, resume, discard, draft, busy, saved, error, setError, back: () => go(Math.max(1, step - 1)) };
}
