import Link from "next/link";
import { MapPin, Search, Users, ChevronLeft, ChevronRight } from "lucide-react";

import { getT } from "@/lib/i18n/server";
import { stateList, stateTree } from "@/lib/geo";
import { publicGroups } from "@/lib/queries";
import { GROUP_CATEGORIES } from "@/lib/options";
import { EmptyState, fmt } from "@/components/ui";
import PageIntro from "@/components/site/PageIntro";
import AutoSubmit from "./AutoSubmit";

export const metadata = { title: "Find a group near me" };
export const dynamic = "force-dynamic";

export default async function GroupsPage({ searchParams }) {
  const t = await getT();
  const sp = await searchParams;
  const state = stateList.some((s) => s.code === sp.state) ? sp.state : "";
  const lgas = state ? stateTree(state).lgas : [];
  const lga = lgas.some((l) => l.code === sp.lga) ? sp.lga : "";
  const category = GROUP_CATEGORIES.some((c) => c.value === sp.category) ? sp.category : "";
  const q = String(sp.q ?? "").slice(0, 100);
  const result = publicGroups({ state, lga, category, q, page: sp.page });
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const states = [...stateList].sort((a, b) => a.name.localeCompare(b.name));

  const pageHref = (p) => {
    const params = new URLSearchParams(Object.entries({ state, lga, category, q, page: String(p) }).filter(([, v]) => v));
    return `/groups?${params}`;
  };

  return (
    <>
      <PageIntro
        title={t("Verified support groups near you")}
        lead={t("Find a group in your area, then ask its coordinator for the invite code to join as a volunteer.")}
      />

      <div className="container-page py-8 sm:py-10">
        <form method="get" className="card grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-[1fr_1fr_1fr_1.3fr_auto] lg:items-end">
          <label className="space-y-1.5">
            <span className="t-label">{t("State")}</span>
            <AutoSubmit name="state" defaultValue={state} className="input" reset="lga">
              <option value="">{t("All states")}</option>
              {states.map((s) => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </AutoSubmit>
          </label>
          <label className="space-y-1.5">
            <span className="t-label">{t("LGA")}</span>
            <AutoSubmit name="lga" defaultValue={lga} className="input" disabled={!state}>
              <option value="">{state ? t("All LGAs") : t("Choose a state first")}</option>
              {lgas.map((l) => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </AutoSubmit>
          </label>
          <label className="space-y-1.5">
            <span className="t-label">{t("Category")}</span>
            <AutoSubmit name="category" defaultValue={category} className="input">
              <option value="">{t("All categories")}</option>
              {GROUP_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{t(c.label)}</option>
              ))}
            </AutoSubmit>
          </label>
          <label className="space-y-1.5">
            <span className="t-label">{t("Group name")}</span>
            <input name="q" defaultValue={q} className="input" placeholder={t("Search by name")} />
          </label>
          <button type="submit" className="btn btn-primary">
            <Search aria-hidden className="size-5" />
            {t("Search")}
          </button>
        </form>

        <p className="mt-6 text-[15px] text-ink-muted" aria-live="polite">
          {t("{n} verified groups", { n: fmt(result.total) })}
        </p>

        {result.groups.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={Users} title={t("No verified groups found here yet")} action={<Link href="/volunteer" className="btn btn-primary">{t("Join as a volunteer")}</Link>}>
              {t("Try a wider area, or join as a volunteer.")}
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {result.groups.map((g) => (
              <li key={g.public_id} className="card flex flex-col p-5">
                <p className="text-[14px] text-ink-muted">{t(g.categoryLabel)}</p>
                <h2 className="mt-1 text-[17px] font-bold leading-snug">{g.name}</h2>
                <p className="mt-2 flex items-start gap-1.5 text-[14px] text-ink-muted">
                  <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" />
                  {g.place}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[14px] text-ink-muted">
                  <Users aria-hidden className="size-4 shrink-0 text-brand-600" />
                  {t("{size} members", { size: g.sizeLabel })}
                </p>
                <p className="mt-auto pt-4 font-mono text-[12px] text-ink-muted">{g.public_id}</p>
              </li>
            ))}
          </ul>
        )}

        {pages > 1 && (
          <nav aria-label={t("Pages")} className="mt-8 flex items-center justify-center gap-3">
            {result.page > 1 && (
              <Link href={pageHref(result.page - 1)} className="btn btn-secondary btn-sm">
                <ChevronLeft aria-hidden className="size-4" />
                {t("Previous")}
              </Link>
            )}
            <span className="text-[14px] text-ink-muted">{t("Page {n} of {total}", { n: result.page, total: pages })}</span>
            {result.page < pages && (
              <Link href={pageHref(result.page + 1)} className="btn btn-secondary btn-sm">
                {t("Next")}
                <ChevronRight aria-hidden className="size-4" />
              </Link>
            )}
          </nav>
        )}
      </div>
    </>
  );
}
