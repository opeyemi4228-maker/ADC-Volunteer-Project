import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth";
import { all } from "@/lib/db";
import { open } from "@/lib/crypto";
import { maskPhone } from "@/lib/validate";
import { placeLabel } from "@/lib/geo";
import { PageHeader } from "@/components/workspace/ui";
import AgentForm from "./AgentForm";

export const metadata = { title: "Field registration" };

export default async function AgentPage() {
  const viewer = await getViewer();
  if (!viewer.powers.includes("field_agent")) redirect("/workspace");
  const home = viewer.roles.find((r) => r.role === "field_agent");
  const today = all(
    `SELECT public_id, first_name, surname, phone_enc, phone_verified_at, vote_state_code, vote_lga_code, vote_ward_code, created_at
     FROM volunteers WHERE registered_by_agent = :u AND created_at >= date('now') ORDER BY created_at DESC`,
    { u: viewer.id },
  ).map((v) => ({ id: v.public_id, name: `${v.first_name} ${v.surname}`, phone: maskPhone(open(v.phone_enc)), confirmed: Boolean(v.phone_verified_at), place: placeLabel({ state_code: v.vote_state_code, lga_code: v.vote_lga_code, ward_code: v.vote_ward_code }), at: v.created_at.slice(11, 16) }));
  const area = home ? { state: home.area_code.slice(0, 3), lga: home.area_code.length >= 7 ? home.area_code.slice(0, 7) : "" } : {};
  return (
    <>
      <PageHeader title="Field registration" description="Register people door to door or at events. Works without signal: records wait on this phone and send when you're back online." />
      <AgentForm defaultArea={area} today={today} />
    </>
  );
}
