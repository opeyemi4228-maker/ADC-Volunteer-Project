import Link from "next/link";
import { redirect } from "next/navigation";

import { requireViewer } from "@/lib/guard";
import { getSetting } from "@/lib/db";
import { resolveArea } from "@/lib/workspace-area";
import { lgaOf, stateTree, areaName, stateList } from "@/lib/geo";
import { coversArea } from "@/lib/scope";
import { roster, eligibleAgents, situation, incidentsIn, isLive, PARTIES } from "@/lib/election";
import { ELECTION_INCIDENTS, SEVERITY, labelOf } from "@/lib/options";
import { Alert, Card, Stat, EmptyState, fmt, pct, timeAgo } from "@/components/ui";
import { PageHeader, Tabs, withParams } from "@/components/workspace/ui";
import { ApiButton } from "@/components/workspace/actions";
import RosterRow from "./RosterRow";

export const metadata = { title: "Election day" };

export default async function ElectionPage({ searchParams }) {
  const viewer = await requireViewer();
  if (!viewer.powers.includes("election")) redirect("/workspace");
  const sp = await searchParams;
  const tab = ["roster", "situation", "incidents"].includes(sp.tab) ? sp.tab : "roster";
  const live = isLive();
  const area = resolveArea(viewer, sp.ward ?? sp.lga);
  const ward = area.type === "ward" ? area.code : null;
  const lga = area.type === "lga" ? area.code : ward ? ward.slice(0, 7) : null;
  const wide = ["national", "zone"].includes(area.home.type);
  const states = wide ? stateList.filter((st) => coversArea(viewer, st.code)) : [];
  const stateCode = area.home.type === "state" ? area.home.code : wide ? (sp.state && coversArea(viewer, sp.state) ? sp.state : lga?.slice(0, 3)) : null;
  const lgas = stateCode ? stateTree(stateCode).lgas : [];

  return (
    <>
      <PageHeader
        title="Election day"
        description={getSetting("election_name", "Election day")}
        actions={<span className={`rounded-md border px-2.5 py-1 text-[14px] font-semibold ${live ? "border-danger/30 bg-danger-bg text-danger" : "border-line text-ink-muted"}`}>{live ? "Live: check-in and results are open" : "Planning: check-in and results are closed"}</span>}
      />
      {!live && <Alert tone="info" className="mb-6" title="Plan the roster now">Agents can check in and send results only after the national admin switches election day on (Settings). Rehearse with a few units before the day.</Alert>}
      <Tabs
        current={tab}
        tabs={[
          { key: "roster", label: "Agent roster", href: withParams("/workspace/election", { ward: sp.ward, lga: sp.lga }, { tab: "roster" }) },
          { key: "situation", label: "Situation room", href: "/workspace/election?tab=situation" },
          { key: "incidents", label: "Incidents", href: "/workspace/election?tab=incidents" },
        ]}
      />

      {tab === "roster" && (
        <>
          {!ward && (
            <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
              <input type="hidden" name="tab" value="roster" />
              {states.length > 0 && (
                <label className="flex flex-col gap-1">
                  <span className="t-label">State</span>
                  <select name="state" defaultValue={stateCode ?? ""} className="input min-w-56">
                    <option value="">Choose a state</option>
                    {states.map((st) => <option key={st.code} value={st.code}>{st.name}</option>)}
                  </select>
                </label>
              )}
              {lgas.length > 0 && (
                <label className="flex flex-col gap-1">
                  <span className="t-label">LGA</span>
                  <select name="lga" defaultValue={lga ?? ""} className="input min-w-56">
                    <option value="">Choose an LGA</option>
                    {lgas.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                  </select>
                </label>
              )}
              {lga && (
                <label className="flex flex-col gap-1">
                  <span className="t-label">Ward</span>
                  <select name="ward" className="input min-w-56" defaultValue="">
                    <option value="">Choose a ward</option>
                    {lgaOf(lga).wards.map((w) => <option key={w.code} value={w.code}>{w.name} ({w.units} units)</option>)}
                  </select>
                </label>
              )}
              <button className="btn btn-primary">Show roster</button>
              {!lga && lgas.length === 0 && states.length === 0 && <p className="text-ink-muted">Open a ward from the map, or ask a state coordinator. The roster is planned ward by ward.</p>}
            </form>
          )}
          {ward && <Roster viewer={viewer} ward={ward} />}
        </>
      )}

      {tab === "situation" && <Situation viewer={viewer} />}
      {tab === "incidents" && <Incidents viewer={viewer} />}
    </>
  );
}

function Roster({ viewer, ward }) {
  const rows = roster(viewer, ward);
  const people = eligibleAgents(viewer, ward);
  const options = people.map((p) => ({ id: p.id, label: `${p.first_name} ${p.surname}${p.status !== "verified" ? " (unverified)" : ""}${p.has_smartphone ? "" : " · no smartphone"}${p.vote_pu_code ? ` · votes at ${p.vote_pu_code.slice(-3)}` : ""}`, assigned: p.assigned, pu: p.vote_pu_code }));
  const primaries = rows.filter((r) => r.primary).length;
  const backups = rows.filter((r) => r.backup).length;
  const accredited = rows.filter((r) => r.primary?.accreditation_status === "accredited").length;
  return (
    <>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="h-section">{areaName(ward)} ward <span className="font-normal text-ink-muted">· {areaName(ward.slice(0, 7))}</span></h2>
        <Link className="link inline-flex min-h-10 items-center text-[14px]" href="/workspace/election?tab=roster">Choose another ward</Link>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Stat label="Polling units" value={fmt(rows.length)} />
        <Stat label="With a primary agent" value={`${fmt(primaries)} (${pct(primaries, rows.length)})`} tone={primaries < rows.length ? "warn" : undefined} />
        <Stat label="With a backup agent" value={fmt(backups)} />
        <Stat label="Primary agents accredited" value={fmt(accredited)} />
      </div>
      <p className="t-help mb-3">Agents are chosen from volunteers who offered to be polling unit agents and vote in this ward. People who vote at the unit and have a smartphone are listed first.</p>
      {people.length === 0 && <Alert tone="warning" className="mb-4" title="No volunteers in this ward offered to be polling unit agents yet">Recruit in the ward, or message volunteers asking them to add the role.</Alert>}
      <Card className="overflow-x-auto">
        <table className="table-clean">
          <thead><tr><th>Polling unit</th><th>Primary agent</th><th>Backup agent</th><th>Result</th></tr></thead>
          <tbody>
            {rows.map((r) => <RosterRow key={r.code} row={r} options={options} />)}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function Situation({ viewer }) {
  const s = situation(viewer);
  const total = Object.values(s.totals).reduce((a, b) => a + b, 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Stat label="Units with agents" value={fmt(s.rostered)} />
        <Stat label="Agents checked in" value={`${fmt(s.checkedIn)} / ${fmt(s.rostered)}`} />
        <Stat label="Results received" value={`${fmt(s.reported)} / ${fmt(s.rostered)}`} />
        <Stat label="Results confirmed" value={fmt(s.confirmed)} />
      </div>
      {s.reported === 0 ? (
        <div className="mt-8"><EmptyState title="No results yet">When agents send results from their polling units, the running totals appear here.</EmptyState></div>
      ) : (
        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <Card className="p-5">
            <h2 className="h-section">Running totals</h2>
            <p className="t-help mt-0.5">All results received. Confirmed figures in brackets.</p>
            <table className="table-clean mt-3">
              <thead><tr><th>Party</th><th className="text-right">Votes</th><th className="text-right">Share</th></tr></thead>
              <tbody>
                {PARTIES.map((p) => (
                  <tr key={p}><td className={p === "ADC" ? "font-bold" : ""}>{p}</td><td className="num text-right">{fmt(s.totals[p])} <span className="text-ink-muted">({fmt(s.confirmedTotals[p])})</span></td><td className="num text-right">{pct(s.totals[p], total)}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card className="p-5">
            <h2 className="h-section">Waiting for confirmation</h2>
            <p className="t-help mt-0.5">Check the figures against the photo of the sheet, then confirm.</p>
            <ul className="mt-3 divide-y divide-line">
              {s.pending.slice(0, 20).map((r) => (
                <li key={r.pu_code} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="text-[14px]">{r.name} <span className="text-ink-muted">· ADC {fmt(r.party_votes.ADC)}</span> {r.sheet_media_id && <a className="link" href={`/api/v1/media/${r.sheet_media_id}/file?size=full`} target="_blank" rel="noreferrer">Sheet photo</a>}</span>
                  <ApiButton url={`/api/v1/election/results/${r.pu_code}/confirm`} className="btn btn-secondary btn-sm" doneLabel="Confirmed">Confirm</ApiButton>
                </li>
              ))}
              {s.pending.length === 0 && <li className="py-2 text-ink-muted">All received results are confirmed.</li>}
            </ul>
          </Card>
        </div>
      )}
      {s.silent.length > 0 && (
        <Card className="mt-6 p-5">
          <h2 className="h-section">Not reported yet ({fmt(s.silent.length)})</h2>
          <p className="t-help mt-0.5">Call these agents first. Units whose agent never checked in are at the top.</p>
          <ul className="mt-3 grid gap-x-6 gap-y-1 text-[14px] sm:grid-cols-2 lg:grid-cols-3">
            {[...s.silent].sort((a, b) => Number(a.checkedIn) - Number(b.checkedIn)).slice(0, 60).map((u) => (
              <li key={u.pu} className={u.checkedIn ? "" : "font-semibold text-danger"}>{u.name} {u.checkedIn ? "" : "· not checked in"}</li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function Incidents({ viewer }) {
  const list = incidentsIn(viewer);
  if (!list.length) return <EmptyState title="No incidents reported">Incidents agents report on election day appear here, most serious first.</EmptyState>;
  return (
    <ul className="divide-y divide-line border-y border-line">
      {list.map((i) => (
        <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="font-semibold">{labelOf(ELECTION_INCIDENTS, i.category)} <span className={`ml-1 text-[13px] ${["high", "critical"].includes(i.severity) ? "text-danger" : "text-ink-muted"}`}>{labelOf(SEVERITY, i.severity)}</span></p>
            <p className="text-[14px] text-ink-muted">{i.place} · {i.reporter_name} · {timeAgo(i.created_at)}</p>
            {i.description && <p className="mt-1 text-[15px]">{i.description}</p>}
          </div>
          {JSON.parse(i.media_ids ?? "[]").length > 0 && <span className="text-[13px] text-ink-muted">{JSON.parse(i.media_ids).length} photo(s)</span>}
        </li>
      ))}
    </ul>
  );
}
