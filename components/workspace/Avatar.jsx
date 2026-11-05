import { cx } from "@/components/ui";

/** The URL of a volunteer's profile photo; `updatedAt` makes a new photo replace the cached one. */
export function photoUrl(volunteerId, updatedAt, size = "thumb") {
  const v = updatedAt ? `&v=${encodeURIComponent(String(updatedAt).replace(/\D/g, ""))}` : "";
  return `/api/v1/volunteers/${volunteerId}/photo?size=${size}${v}`;
}

export const initialsOf = (name = "") => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

/** A round profile photo, or the person's initials when there is none. Server-safe. */
export function Avatar({ src, name, className = "size-9 text-[13px]", rounded = "rounded-full" }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cx("shrink-0 bg-surface-alt object-cover", rounded, className)} loading="lazy" />;
  }
  return (
    <span aria-hidden className={cx("grid shrink-0 place-items-center bg-gradient-to-br from-brand-500 to-brand-800 font-bold text-white", rounded, className)}>
      {initialsOf(name)}
    </span>
  );
}
