"use client";

/**
 * Google reCAPTCHA v3 in the browser. The script loads the first time a
 * protected form is shown (preloadCaptcha) or submitted (captchaToken), so
 * pages without these forms never contact Google.
 * With NEXT_PUBLIC_RECAPTCHA_SITE_KEY unset (local development) it does nothing.
 */
const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
let loading;

function load() {
  if (!SITE_KEY || typeof window === "undefined") return Promise.resolve(null);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(SITE_KEY)}`;
      s.async = true;
      s.onload = () => window.grecaptcha.ready(() => resolve(window.grecaptcha));
      s.onerror = () => { loading = null; reject(new Error("reCAPTCHA failed to load")); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export function preloadCaptcha() {
  load().catch(() => {});
}

/** A fresh token for one action (tokens are single-use and last two minutes), or null. */
export async function captchaToken(action) {
  try {
    const g = await load();
    return g ? await g.execute(SITE_KEY, { action }) : null;
  } catch {
    return null; // The server decides; it answers with a clear message if a token was required.
  }
}
