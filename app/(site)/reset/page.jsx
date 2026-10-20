import { getT } from "@/lib/i18n/server";
import PageIntro from "@/components/site/PageIntro";
import ResetForm from "./ResetForm";

export const metadata = { title: "Reset your password" };

export default async function ResetPage({ searchParams }) {
  const t = await getT();
  const token = String((await searchParams).token ?? "").slice(0, 100);
  return (
    <>
      <PageIntro
        title={token ? t("Choose a new password") : t("Reset your password")}
        lead={token ? t("Pick a password you haven't used here before.") : t("Enter the email address your group registered with. We'll send you a link to choose a new password.")}
      />
      <div className="container-page [&>*]:max-w-lg">
        <ResetForm token={token} />
      </div>
    </>
  );
}
