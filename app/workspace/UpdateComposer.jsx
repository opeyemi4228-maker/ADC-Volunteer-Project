"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, CheckCircle2 } from "lucide-react";

import MediaPicker from "@/components/workspace/MediaPicker";
import { post } from "@/components/workspace/actions";
import { cx } from "@/components/ui";

/**
 * "Post an update" for a support group: what you did, when, and photos.
 * It becomes an activity report (spec §9.4) tied to the group's own area, so
 * coordinators see it in their activity log and photos go to moderation.
 */
const TYPES = [
  ["meeting", "Meeting"],
  ["outreach", "Outreach"],
  ["door_to_door", "Door-to-door"],
  ["rally", "Rally"],
  ["town_hall", "Town hall"],
  ["training", "Training"],
  ["online", "Online"],
  ["other", "Other"],
];

export default function UpdateComposer({ group }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [text, setText] = useState("");
  const [type, setType] = useState("meeting");
  const [date, setDate] = useState(today);
  const [attendance, setAttendance] = useState("");
  const [households, setHouseholds] = useState("");
  const [media, setMedia] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [posted, setPosted] = useState(false);
  const uploading = media.some((m) => m.status === "uploading");
  const needsConsent = media.some((m) => m.status === "done" && !m.consent);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (text.trim().length < 5) return setError("Say in a sentence or two what your group did.");
    if (needsConsent) return setError("Tick the consent box on each photo, or remove it.");
    setBusy(true);
    try {
      const firstLine = text.trim().split("\n")[0];
      await post("/api/v1/activities", {
        group_id: group.id,
        type,
        date,
        title: firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine,
        description: text.trim(),
        location: { state: group.state_code, lga: group.lga_code ?? "", ward: group.ward_code ?? "" },
        attendance,
        households_reached: type === "door_to_door" ? households : "",
        incident_type: "none",
        media: media.filter((m) => m.status === "done").map(({ upload_id, kind, external_url, caption, consent }) => ({ upload_id, kind, external_url, caption, consent })),
      });
      setText("");
      setAttendance("");
      setHouseholds("");
      setMedia([]);
      setDate(today);
      setPosted(true);
      router.refresh();
    } catch (err) {
      setError(err.errors ? Object.values(err.errors)[0] : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="post" onSubmit={submit} className="card scroll-mt-20 space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="h-section">Post an update</h2>
        <p className="mt-1 text-[15px] text-ink-muted">Tell the campaign what your group has been doing. Add photos if you have them.</p>
      </div>
      {posted && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-success-bg p-3 text-[15px] font-semibold text-success">
          <CheckCircle2 aria-hidden className="size-5" /> Update posted. Photos appear in your gallery once a coordinator has reviewed them.
        </p>
      )}
      <label className="block">
        <span className="sr-only">What did your group do?</span>
        <textarea
          className="input !min-h-28"
          placeholder="e.g. We held a town hall at Kubwa market square. About 150 people came and 12 signed up to volunteer."
          value={text}
          maxLength={1000}
          onChange={(e) => { setText(e.target.value); setPosted(false); }}
        />
      </label>
      <fieldset>
        <legend className="t-label">What kind of activity?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {TYPES.map(([v, l]) => (
            <button key={v} type="button" className="chip" aria-pressed={type === v} onClick={() => setType(v)}>{l}</button>
          ))}
        </div>
      </fieldset>
      <div className={cx("grid gap-4", type === "door_to_door" ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        <label className="flex flex-col gap-1">
          <span className="t-label">Date</span>
          <input type="date" className="input" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-label">People present <span className="font-normal text-ink-muted">(optional)</span></span>
          <input type="number" min="0" inputMode="numeric" className="input" value={attendance} onChange={(e) => setAttendance(e.target.value)} />
        </label>
        {type === "door_to_door" && (
          <label className="flex flex-col gap-1">
            <span className="t-label">Homes visited</span>
            <input type="number" min="0" inputMode="numeric" className="input" value={households} onChange={(e) => setHouseholds(e.target.value)} />
          </label>
        )}
      </div>
      <MediaPicker items={media} onChange={setMedia} />
      {error && <p role="alert" className="text-[14px] font-medium text-danger">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy || uploading}>
        {busy || uploading ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <Send aria-hidden className="size-5" />}
        {uploading ? "Waiting for photos to upload…" : "Post update"}
      </button>
    </form>
  );
}
