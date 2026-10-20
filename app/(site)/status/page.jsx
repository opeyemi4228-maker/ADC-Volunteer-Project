import { getT } from "@/lib/i18n/server";
import PageIntro from "@/components/site/PageIntro";
import StatusCheck from "./StatusCheck";

export const metadata = { title: "Check my registration" };

export default async function StatusPage() {
  const t = await getT();
  return (
    <>
      <PageIntro
        title={t("Where is my registration?")}
        lead={t("See whether your volunteer registration has been verified. We'll send a code to confirm it's your number.")}
      />
      <div className="container-page [&>*]:max-w-2xl">
        <StatusCheck />
      </div>
    </>
  );
}
