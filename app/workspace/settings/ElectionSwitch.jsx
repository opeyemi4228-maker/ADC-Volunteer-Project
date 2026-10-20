"use client";

import { useAction } from "@/components/workspace/actions";

export default function ElectionSwitch({ on }) {
  const { run, busy, error } = useAction();
  return (
    <div className="space-y-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={busy}
        onClick={() => {
          if (!window.confirm(on ? "Close check-in and result capture?" : "Open check-in and result capture for every agent now?")) return;
          run("/api/v1/settings", { key: "election_day_enabled", value: !on });
        }}
        className={`btn ${on ? "btn-danger" : "btn-primary"}`}
      >
        {on ? "Switch election day off" : "Switch election day on"}
      </button>
      <p className="text-[14px]">Now: <strong>{on ? "On" : "Off"}</strong></p>
      {error && <p role="alert" className="text-danger">{error}</p>}
    </div>
  );
}
