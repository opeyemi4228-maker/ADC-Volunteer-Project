"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardList, Download, ExternalLink, Loader2, MessageSquareText, PlayCircle } from "lucide-react";

import { cx, dateTimeLabel } from "@/components/ui";

/**
 * One lesson's video, with a tab for each of the viewer's languages it is
 * available in, then its feedback questions.
 *
 * Watching is recorded for the Super Admin: a viewing starts when play is
 * pressed, and the seconds actually played are sent every 15 seconds, on
 * pause, at the end and when the page is closed. Seeking ahead does not count
 * as watching. Uploaded videos and YouTube links are measured; any other link
 * counts as a viewing when it is opened.
 *
 * Feedback is answered once per lesson, in whichever language the viewer
 * chooses; that answer counts for the lesson in every language.
 */
export default function TrainingPlayer({ moduleId, videos, title, questions = [], progress, languageLabels = {} }) {
  const [active, setActive] = useState(videos[0]?.id);
  const [started, setStarted] = useState(Boolean(progress?.watched));
  const [answered, setAnswered] = useState(progress?.answered ?? null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const feedbackRef = useRef(null);
  const tracker = useWatchTracker();
  const v = videos.find((x) => x.id === active) ?? videos[0];
  if (!v) return null;

  const hasFeedback = questions.length > 0;
  function onStart() {
    setStarted(true);
  }
  function onEnded() {
    setStarted(true);
    if (hasFeedback && !answered) {
      setFeedbackOpen(true);
      setTimeout(() => feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    }
  }
  function switchTo(id) {
    tracker.flush();
    setActive(id);
  }

  return (
    <div>
      <div className="relative aspect-video bg-ink">
        {v.kind === "video" ? (
          <UploadedVideo key={v.id} v={v} title={title} tracker={tracker} onStart={onStart} onEnded={onEnded} />
        ) : v.embed ? (
          <YouTubeVideo key={v.id} v={v} title={title} tracker={tracker} onStart={onStart} onEnded={onEnded} />
        ) : (
          <a
            href={v.url}
            target="_blank"
            rel="noreferrer"
            onClick={() => { tracker.begin(v.id); onStart(); }}
            className="grid size-full place-items-center text-white hover:bg-white/5"
          >
            <span className="flex flex-col items-center gap-2 text-center">
              <PlayCircle aria-hidden className="size-12" strokeWidth={1.5} />
              <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold">Watch the video <ExternalLink aria-hidden className="size-4" /></span>
              <span className="max-w-[80%] truncate text-[12px] text-white/60">{v.url}</span>
            </span>
          </a>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2.5">
        {videos.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Language">
            {videos.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={x.id === v.id}
                onClick={() => switchTo(x.id)}
                className={cx(
                  "min-h-9 rounded-full px-3 text-[13px] font-semibold transition-colors",
                  x.id === v.id ? "bg-brand-700 text-white" : "bg-surface-alt text-ink-muted hover:text-ink",
                )}
              >
                {x.label}
              </button>
            ))}
          </div>
        )}
        {v.kind === "video" ? (
          <a href={`/api/v1/training/videos/${v.id}/file?download=1`} download className="btn btn-secondary btn-sm ml-auto">
            <Download aria-hidden className="size-4" /> Download{videos.length > 1 ? ` (${v.label})` : ""}
          </a>
        ) : (
          <span className="ml-auto text-[12px] text-ink-muted">Online video: watch it here or on the site it is hosted on.</span>
        )}
      </div>

      {hasFeedback && (
        <div ref={feedbackRef} className="scroll-mt-24 border-b border-line px-4 py-3">
          {answered ? (
            <p className="flex items-start gap-2 text-[13px] font-medium text-success" role="status">
              <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                Feedback sent{answered.language ? ` in ${languageLabels[answered.language] ?? answered.language}` : ""}{answered.at ? ` on ${dateTimeLabel(answered.at)}` : ""}. Thank you.
                {videos.length > 1 && <span className="block font-normal text-ink-muted">It counts for this lesson in every language, so there is nothing more to answer.</span>}
              </span>
            </p>
          ) : feedbackOpen ? (
            <FeedbackForm
              moduleId={moduleId}
              questions={questions}
              defaultLanguage={v.language}
              languages={[...new Set(videos.map((x) => x.language))]}
              languageLabels={languageLabels}
              onDone={setAnswered}
              onClose={() => setFeedbackOpen(false)}
            />
          ) : (
            <div className="rounded-xl border border-brand-700/25 bg-brand-50 p-3">
              <p className="flex items-start gap-2 text-[13px] leading-5 text-brand-800">
                <ClipboardList aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  <strong className="font-bold">Feedback at the end of this video.</strong>{" "}
                  When the video finishes you will answer {questions.length === 1 ? "1 short question" : `${questions.length} short questions`} about it.
                  Answer once, in any of your languages: your answer counts for this lesson in every language.
                </span>
              </p>
              {started && (
                <button type="button" className="btn btn-primary btn-sm mt-2.5" onClick={() => setFeedbackOpen(true)}>
                  <MessageSquareText aria-hidden className="size-4" /> Answer the feedback questions
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Players ───────────────────────────────────────────────────────────── */

function UploadedVideo({ v, title, tracker, onStart, onEnded }) {
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      src={`/api/v1/training/videos/${v.id}/file`}
      controls
      preload="metadata"
      playsInline
      className="size-full bg-black"
      aria-label={`${title} (${v.label})`}
      onPlay={() => { tracker.begin(v.id); onStart(); }}
      onTimeUpdate={(e) => tracker.progress(v.id, e.currentTarget.currentTime, e.currentTarget.duration)}
      onSeeking={(e) => tracker.seeked(e.currentTarget.currentTime)}
      onPause={() => tracker.flush()}
      onEnded={(e) => { tracker.progress(v.id, e.currentTarget.currentTime, e.currentTarget.duration); tracker.finish(); onEnded(); }}
    />
  );
}

/**
 * A YouTube video. It loads only when play is pressed (so a viewing is
 * counted), then reports its position through YouTube's player messages.
 */
function YouTubeVideo({ v, title, tracker, onStart, onEnded }) {
  const [playing, setPlaying] = useState(false);
  const frame = useRef(null);
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;
  const ytId = v.embed.match(/\/embed\/([^/?]+)/)?.[1];

  useEffect(() => {
    if (!playing) return undefined;
    let ended = false;
    let lastPos = 0;
    function onMessage(e) {
      if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin) || e.source !== frame.current?.contentWindow) return;
      let data;
      try { data = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
      const info = data?.info;
      if (data?.event !== "infoDelivery" || !info) return;
      if (typeof info.currentTime === "number") tracker.progress(v.id, info.currentTime, info.duration);
      if (typeof info.currentTime === "number") lastPos = info.currentTime;
      // Played again after the end: a new viewing.
      if (info.playerState === 1 && ended) { ended = false; tracker.begin(v.id); }
      if (info.playerState === 2) tracker.flush();
      if (info.playerState === 0 && !ended && lastPos > 0) { ended = true; tracker.finish(); endedRef.current(); }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [playing, v.id, tracker]);

  function listen() {
    // Asks the player to post its state and position to this page.
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: v.id, channel: "widget" }), "*");
  }

  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => { tracker.begin(v.id); onStart(); setPlaying(true); }}
        className="group relative grid size-full place-items-center overflow-hidden text-white"
        aria-label={`Play ${title} (${v.label})`}
      >
        {ytId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`} alt="" className="absolute inset-0 size-full object-cover opacity-70 transition-opacity group-hover:opacity-85" />
        )}
        <span className="relative flex flex-col items-center gap-2 drop-shadow">
          <PlayCircle aria-hidden className="size-16" strokeWidth={1.5} />
          <span className="text-[14px] font-semibold">Play ({v.label})</span>
        </span>
      </button>
    );
  }
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <iframe
      ref={frame}
      src={`${v.embed}&autoplay=1&enablejsapi=1&origin=${encodeURIComponent(origin)}`}
      title={`${title} (${v.label})`}
      className="size-full"
      onLoad={listen}
      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}

/* ── Watch tracking ────────────────────────────────────────────────────── */

const SEND_EVERY_MS = 15_000;

/**
 * Keeps one viewing at a time: begin() on play, progress() on every position
 * update, flush() to send, finish() at the end (the next play starts a new
 * viewing, so a second watch counts as a second time).
 */
function useWatchTracker() {
  const view = useRef(null);
  const starting = useRef(null);
  const api = useRef(null);

  if (!api.current) {
    const send = (beacon = false) => {
      const w = view.current;
      if (!w) return;
      w.sentAt = Date.now();
      const body = JSON.stringify({ seconds: Math.round(w.seconds), position: Math.round(w.position), duration: Math.round(w.duration || 0), ended: w.ended });
      const url = `/api/v1/training/views/${w.id}`;
      if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      } else {
        fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
      }
    };
    api.current = {
      begin(videoId) {
        const w = view.current;
        if (w && w.videoId === videoId && !w.ended) return;
        if (starting.current === videoId) return;
        if (w && !w.ended) send();
        starting.current = videoId;
        fetch(`/api/v1/training/videos/${videoId}/views`, { method: "POST" })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            if (j?.id) view.current = { id: j.id, videoId, seconds: 0, position: 0, duration: 0, lastPos: null, ended: false, sentAt: Date.now() };
          })
          .catch(() => {})
          .finally(() => { if (starting.current === videoId) starting.current = null; });
      },
      progress(videoId, position, duration) {
        const w = view.current;
        if (!w || w.videoId !== videoId || w.ended || !Number.isFinite(position)) return;
        // Only steady forward playback counts as watching; a jump is a seek.
        if (w.lastPos != null) {
          const step = position - w.lastPos;
          if (step > 0 && step <= 3) w.seconds += step;
        }
        w.lastPos = position;
        w.position = Math.max(w.position, position);
        if (Number.isFinite(duration) && duration > 0) w.duration = duration;
        if (Date.now() - w.sentAt > SEND_EVERY_MS) send();
      },
      seeked(position) {
        if (view.current) view.current.lastPos = position;
      },
      flush(beacon = false) {
        if (view.current && !view.current.ended) send(beacon);
      },
      finish() {
        const w = view.current;
        if (!w || w.ended) return;
        w.ended = true;
        send();
      },
    };
  }

  useEffect(() => {
    const t = api.current;
    const hide = () => { if (document.visibilityState === "hidden") t.flush(true); };
    const leave = () => t.flush(true);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      t.flush(true);
    };
  }, []);

  return api.current;
}

/* ── Feedback ──────────────────────────────────────────────────────────── */

const textIn = (map, lang) => (map ? map[lang] || map.english || Object.values(map).find(Boolean) || "" : "");

function FeedbackForm({ moduleId, questions, defaultLanguage, languages, languageLabels, onDone, onClose }) {
  const router = useRouter();
  const [language, setLanguage] = useState(defaultLanguage);
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    const missing = Object.fromEntries(questions.filter((q) => q.required && (answers[q.id] === undefined || String(answers[q.id]).trim() === ""))
      .map((q) => [q.id, q.kind === "choice" ? "Choose an answer." : "Write an answer."]));
    setErrors(missing);
    if (Object.keys(missing).length) return setError("Answer every question to finish.");
    setBusy(true);
    const res = await fetch(`/api/v1/training/${moduleId}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language, answers }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      onDone({ language, at: new Date().toISOString() });
      router.refresh();
      return;
    }
    if (json.answered) return onDone(json.answered);
    setErrors(json.errors ?? {});
    setError(json.error ?? "Something went wrong. Try again.");
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px] font-bold"><MessageSquareText aria-hidden className="size-4 text-brand-700" /> Feedback questions</h3>
        {languages.length > 1 && (
          <label className="flex items-center gap-2 text-[13px] font-semibold text-ink-muted">
            Answer in
            <select className="input !min-h-9 !w-auto !py-1 text-[13px]" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {languages.map((l) => <option key={l} value={l}>{languageLabels[l] ?? l}</option>)}
            </select>
          </label>
        )}
      </div>
      <p className="text-[12px] text-ink-muted">You answer once for this lesson. Whichever language you choose, it counts for the lesson in every language.</p>

      <ol className="space-y-4">
        {questions.map((q, i) => (
          <li key={q.id}>
            <fieldset>
              <legend className="text-[14px] font-semibold leading-5">
                {i + 1}. {textIn(q.prompt, language)}
                {!q.required && <span className="ml-1 font-normal text-ink-muted">(optional)</span>}
              </legend>
              {q.kind === "choice" ? (
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {(q.options ?? []).map((o, n) => (
                    <label key={n} className={cx("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-[14px]", answers[q.id] === n ? "border-brand-700 bg-brand-50 ring-1 ring-brand-700" : "border-line hover:border-ink/40")}>
                      <input type="radio" name={`${moduleId}-${q.id}`} className="size-4 accent-brand-700" checked={answers[q.id] === n} onChange={() => setAnswers({ ...answers, [q.id]: n })} />
                      {textIn(o, language)}
                    </label>
                  ))}
                </div>
              ) : (
                <textarea className="input mt-2 min-h-24" maxLength={1000} value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
              )}
              {errors[q.id] && <p role="alert" className="mt-1 text-[13px] font-medium text-danger">{errors[q.id]}</p>}
            </fieldset>
          </li>
        ))}
      </ol>

      {error && <p role="alert" className="text-[14px] font-medium text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy && <Loader2 aria-hidden className="size-4 animate-spin" />} Send feedback</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Later</button>
      </div>
    </form>
  );
}
