"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

import { useT } from "@/lib/i18n/client";
import { api, loadStates, loadLgas } from "@/components/forms/api";
import { cx, fmt } from "@/components/ui";

/**
 * "Who's already organising near me?" Real verified counts that start with all
 * of Nigeria and narrow as you choose a state, LGA and ward.
 *
 * All three boxes are visible from the start (the later ones greyed out until
 * the one above is chosen), so the task is clear at a glance, the card never
 * looks empty, and it doesn't jump in size as you go. It ends with something to
 * do: join.
 */
export default function AreaFinder() {
  const t = useT();
  const [states, setStates] = useState([]);
  const [lgas, setLgas] = useState([]);
  const [sel, setSel] = useState({ state: "", lga: "", ward: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStates().then(setStates).catch(() => {});
  }, []);
  useEffect(() => {
    setLgas([]);
    if (sel.state) loadLgas(sel.state).then(setLgas).catch(() => {});
  }, [sel.state]);

  const code = sel.ward || sel.lga || sel.state;
  useEffect(() => {
    let live = true;
    setLoading(true);
    api(`/area-counts?code=${code}`).then((r) => {
      if (!live) return;
      if (r.ok) setData(r.data);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [code]);

  const wards = lgas.find((l) => l.code === sel.lga)?.wards ?? [];
  const n = data?.totals;
  const place = !code ? t("Across Nigeria") : data?.area?.name ?? "";
  const none = n && !n.fewVolunteers && n.volunteers === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="grid gap-3">
        <Select label={t("State")} value={sel.state} onChange={(v) => setSel({ state: v, lga: "", ward: "" })}>
          <option value="">{t("All states")}</option>
          {states.map((s) => (
            <option key={s.code} value={s.code}>{s.name}</option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Select label={t("LGA")} value={sel.lga} disabled={!sel.state} onChange={(v) => setSel({ ...sel, lga: v, ward: "" })}>
            <option value="">{sel.state ? t("All LGAs") : t("Choose a state first")}</option>
            {lgas.map((l) => (
              <option key={l.code} value={l.code}>{l.name}</option>
            ))}
          </Select>
          <Select label={t("Ward")} value={sel.ward} disabled={!sel.lga} onChange={(v) => setSel({ ...sel, ward: v })}>
            <option value="">{sel.lga ? t("All wards") : t("Choose an LGA first")}</option>
            {wards.map((w) => (
              <option key={w.code} value={w.code}>{w.name}</option>
            ))}
          </Select>
        </div>
      </div>

      <div aria-live="polite" className="mt-6 flex flex-1 flex-col border-t border-line pt-5">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-ink-muted">
          {place}
          {loading && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
        </p>
        <dl className={cx("mt-3 grid grid-cols-2 gap-4 transition-opacity", loading && "opacity-50")}>
          <div>
            <dt className="text-[14px] text-ink-muted">{t("Verified volunteers")}</dt>
            <dd className="num mt-1 text-[34px] font-bold leading-none tracking-tight text-brand-800">
              {!n ? "—" : n.fewVolunteers ? <span className="text-[20px] leading-tight">{t("Fewer than 5")}</span> : fmt(n.volunteers)}
            </dd>
          </div>
          <div>
            <dt className="text-[14px] text-ink-muted">{t("Polling units covered")}</dt>
            <dd className="num mt-1 text-[34px] font-bold leading-none tracking-tight text-brand-800">{n ? fmt(n.pollingUnits) : "—"}</dd>
          </div>
        </dl>
        <p className="mt-4 text-[15px] text-ink-muted">
          {none ? t("No one here is verified yet. You could be the first.") : t("Choose your area to see the people near you.")}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-6">
          <Link href="/volunteer" className="btn btn-primary">
            {none ? t("Be the first") : t("Join them")}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Select({ label, children, disabled, ...props }) {
  return (
    <label className={cx("block min-w-0 space-y-1.5", disabled && "opacity-60")}>
      <span className="t-label">{label}</span>
      <select className="input truncate disabled:cursor-not-allowed" disabled={disabled} {...props} onChange={(e) => props.onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}
