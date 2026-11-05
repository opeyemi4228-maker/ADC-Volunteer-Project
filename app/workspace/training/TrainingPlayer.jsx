"use client";

import { useState } from "react";
import { ExternalLink, PlayCircle } from "lucide-react";

import { cx } from "@/components/ui";

/**
 * One lesson's video, with a tab for each of the viewer's languages it is
 * available in. Uploaded videos stream from our server; YouTube links play
 * embedded; any other link opens in a new tab.
 */
export default function TrainingPlayer({ videos, title }) {
  const [active, setActive] = useState(videos[0]?.id);
  const v = videos.find((x) => x.id === active) ?? videos[0];
  if (!v) return null;

  return (
    <div>
      <div className="relative aspect-video bg-ink">
        {v.kind === "video" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video key={v.id} src={`/api/v1/training/videos/${v.id}/file`} controls preload="metadata" playsInline className="size-full bg-black" aria-label={`${title} (${v.label})`} />
        ) : v.embed ? (
          <iframe
            key={v.id}
            src={v.embed}
            title={`${title} (${v.label})`}
            className="size-full"
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <a href={v.url} target="_blank" rel="noreferrer" className="grid size-full place-items-center text-white hover:bg-white/5">
            <span className="flex flex-col items-center gap-2 text-center">
              <PlayCircle aria-hidden className="size-12" strokeWidth={1.5} />
              <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold">Watch the video <ExternalLink aria-hidden className="size-4" /></span>
              <span className="max-w-[80%] truncate text-[12px] text-white/60">{v.url}</span>
            </span>
          </a>
        )}
      </div>
      {videos.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2.5" role="tablist" aria-label="Language">
          {videos.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={x.id === v.id}
              onClick={() => setActive(x.id)}
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
    </div>
  );
}
