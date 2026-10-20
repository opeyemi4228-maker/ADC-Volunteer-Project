"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shown if a page fails to load. Plain, calm, and always offers a way on. */
export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-16">
      <p className="text-[15px] font-semibold text-brand-700">ADC Volunteers System</p>
      <h1 className="mt-3 text-[2rem] font-bold leading-tight tracking-tight">Something went wrong on our side</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-ink-muted">
        Nothing you entered has been lost if you were filling in a form: your answers are saved on this phone. Try again, or come back in a few minutes.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => reset()} className="btn btn-primary">Try again</button>
        <Link href="/" className="link">Go to the home page</Link>
      </div>
      {error?.digest && <p className="mt-10 text-[13px] text-ink-muted">Reference: {error.digest}</p>}
    </main>
  );
}
