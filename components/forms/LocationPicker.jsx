"use client";

import { useEffect, useState } from "react";

import { useT } from "@/lib/i18n/client";
import { loadStates, loadLgas, loadUnits } from "./api";
import { SelectField } from "./controls";

/**
 * State → LGA → ward (→ polling unit) from the INEC register. Changing a level
 * clears the levels below it, so a saved combination is always consistent.
 * `base` is the object path holding { state, lga, ward, pu }.
 */
export default function LocationPicker({ form, base, needWard = true, withPu = false, labels = {}, keys = {} }) {
  const t = useT();
  const k = { state: "state", lga: "lga", ward: "ward", pu: "pu", ...keys };
  const raw = form.get(base) ?? {};
  const loc = { state: raw[k.state], lga: raw[k.lga], ward: raw[k.ward], pu: raw[k.pu], pu_unknown: raw.pu_unknown };
  const [states, setStates] = useState([]);
  const [lgas, setLgas] = useState([]);
  const [units, setUnits] = useState([]);

  useEffect(() => {
    loadStates().then(setStates).catch(() => setStates([]));
  }, []);
  useEffect(() => {
    if (!loc.state) return setLgas([]);
    loadLgas(loc.state).then(setLgas).catch(() => setLgas([]));
  }, [loc.state]);
  useEffect(() => {
    if (!withPu || !loc.ward) return setUnits([]);
    loadUnits(loc.ward).then(setUnits).catch(() => setUnits([]));
  }, [withPu, loc.ward]);

  const wards = lgas.find((l) => l.code === loc.lga)?.wards ?? [];
  const change = (patch) => {
    const mapped = Object.fromEntries(Object.entries(patch).map(([key, v]) => [k[key] ?? key, v]));
    form.set(base, { ...(form.get(base) ?? {}), ...mapped });
  };

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <SelectField
        form={form}
        path={`${base}.${k.state}`}
        label={labels.state ?? t("State")}
        options={states.map((s) => ({ value: s.code, label: s.name }))}
        placeholder={states.length ? t("Choose a state") : t("Loading…")}
        onChange={(v) => change({ state: v, lga: "", ward: "", pu: "" })}
      />
      <SelectField
        form={form}
        path={`${base}.${k.lga}`}
        label={labels.lga ?? t("Local government area (LGA)")}
        options={lgas.map((l) => ({ value: l.code, label: l.name }))}
        placeholder={loc.state ? t("Choose an LGA") : t("Choose a state first")}
        disabled={!loc.state}
        onChange={(v) => change({ lga: v, ward: "", pu: "" })}
      />
      {needWard !== null && (
        <SelectField
          form={form}
          path={`${base}.${k.ward}`}
          label={labels.ward ?? t("Ward")}
          optional={!needWard}
          options={wards.map((w) => ({ value: w.code, label: w.name }))}
          placeholder={loc.lga ? t("Choose a ward") : t("Choose an LGA first")}
          disabled={!loc.lga}
          onChange={(v) => change({ ward: v, pu: "" })}
        />
      )}
      {withPu && (
        <div className="space-y-2">
          <SelectField
            form={form}
            path={`${base}.${k.pu}`}
            label={t("Polling unit")}
            hint={t("Where you vote. It's printed on your PVC.")}
            options={units.map((u) => ({ value: u.code, label: `${u.code.slice(-3)} · ${u.name}` }))}
            placeholder={loc.ward ? t("Choose a polling unit") : t("Choose a ward first")}
            disabled={!loc.ward || loc.pu_unknown}
            onChange={(v) => change({ pu: v })}
          />
          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              className="size-4 accent-brand-700"
              checked={Boolean(loc.pu_unknown)}
              onChange={(e) => change({ pu_unknown: e.target.checked, pu: "" })}
            />
            {t("I don't know my polling unit")}
          </label>
        </div>
      )}
    </div>
  );
}
