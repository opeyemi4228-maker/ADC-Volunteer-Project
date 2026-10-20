"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { useForm, TextField, SelectField, ChoiceChips } from "@/components/forms/controls";
import LocationPicker from "@/components/forms/LocationPicker";
import MediaPicker from "@/components/workspace/MediaPicker";
import { ACTIVITY_TYPES, VOTER_CONCERNS, INCIDENT_TYPES } from "@/lib/options";
import { post } from "@/components/workspace/actions";
import { Alert } from "@/components/ui";

export default function ActivityForm({ groups, defaultGroup, defaultLocation }) {
  const router = useRouter();
  const form = useForm({ group_id: defaultGroup ?? "", type: "", date: new Date().toISOString().slice(0, 10), location: defaultLocation ?? {}, concerns: [], incident_type: "none" });
  const [media, setMedia] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const uploading = media.some((m) => m.status === "uploading");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const out = await post("/api/v1/activities", { ...form.data, media: media.filter((m) => m.status === "done").map(({ upload_id, kind, external_url, caption, consent }) => ({ upload_id, kind, external_url, caption, consent })) });
      router.push(`/workspace/activities?reported=${out.publicId}`);
      router.refresh();
    } catch (err) {
      setError(err.message);
      if (err.errors) {
        const { location, ...rest } = err.errors;
        form.setErrors({ ...rest, ...(location ? { "location.state": location } : {}) });
      }
    } finally {
      setBusy(false);
    }
  }

  const type = form.get("type");
  const incident = form.get("incident_type");

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div className="card space-y-5 p-5">
        {groups.length > 0 && (
          <SelectField form={form} path="group_id" label="Group" optional options={groups.map((g) => ({ value: g.id, label: g.name }))} placeholder="Not a group activity" />
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField form={form} path="type" label="Activity type" options={ACTIVITY_TYPES} placeholder="Choose" />
          <TextField form={form} path="date" label="Date" type="date" max={new Date().toISOString().slice(0, 10)} />
        </div>
        <TextField form={form} path="title" label="Name of the activity" optional placeholder="e.g. Ward 4 town hall" maxLength={120} />
        <LocationPicker form={form} base="location" needWard={false} />
        <TextField form={form} path="description" label="What happened?" optional type="textarea" maxLength={1000} />
        <div className="grid gap-5 sm:grid-cols-3">
          <TextField form={form} path="attendance" label="Attendance" optional type="number" min="0" inputMode="numeric" />
          {type === "door_to_door" && <TextField form={form} path="households_reached" label="Households reached" type="number" min="0" inputMode="numeric" />}
          <TextField form={form} path="new_signups" label="New volunteers signed up" optional type="number" min="0" inputMode="numeric" />
        </div>
        <ChoiceChips form={form} path="concerns" label="Top concerns raised by voters" hint="Choose all that came up." options={VOTER_CONCERNS} multiple />
        <SelectField form={form} path="incident_type" label="Was there an incident?" options={INCIDENT_TYPES} />
        {incident && incident !== "none" && <TextField form={form} path="incident_details" label="Describe what happened" type="textarea" maxLength={1000} />}
      </div>

      <div className="card space-y-3 p-5">
        <h2 className="h-section">Pictures and videos <span className="text-[15px] font-normal text-ink-muted">(optional)</span></h2>
        <MediaPicker items={media} onChange={setMedia} />
      </div>

      {error && <Alert tone="danger" title={error}>{form.errors.media ?? null}</Alert>}
      <div className="sticky bottom-0 -mx-4 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={busy || uploading}>
          {(busy || uploading) && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {uploading ? "Waiting for uploads to finish…" : "Submit report"}
        </button>
      </div>
    </form>
  );
}
