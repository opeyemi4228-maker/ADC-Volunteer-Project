import { redirect } from "next/navigation";

import { requireViewer } from "@/lib/guard";
import { PageHeader } from "@/components/workspace/ui";
import Simulator from "./Simulator";

export const metadata = { title: "USSD simulator" };

export default async function UssdPage() {
  const viewer = await requireViewer();
  if (!viewer.powers.includes("settings")) redirect("/workspace");
  return (
    <>
      <PageHeader crumbs={[{ label: "Settings", href: "/workspace/settings?tab=system" }, { label: "USSD simulator" }]} title="USSD simulator" description="Try the feature-phone registration exactly as the aggregator will call it. Registrations made here are real records, so use a test number." />
      <Simulator code={process.env.NEXT_PUBLIC_USSD_CODE ?? "*XXX*YY#"} />
    </>
  );
}
