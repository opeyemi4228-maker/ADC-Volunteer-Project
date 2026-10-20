import { getT } from "@/lib/i18n/server";
import PageIntro from "@/components/site/PageIntro";
import GroupForm from "./GroupForm";

export const metadata = { title: "Register a support group" };

export default async function RegisterPage() {
  const t = await getT();
  return (
    <>
      <PageIntro
        title={t("Put your group on the map")}
        lead={t("Answer a few quick questions about your group, one at a time. About 5 minutes. At the end you choose an email and password for your group dashboard.")}
      />
      <div className="container-page">
        <GroupForm />
      </div>
    </>
  );
}
