import Link from "next/link";
import { redirect } from "next/navigation";

import { getT } from "@/lib/i18n/server";
import { getViewer } from "@/lib/auth";
import PageIntro from "@/components/site/PageIntro";
import SignInForm from "../signin/SignInForm";

export const metadata = { title: "Volunteer sign in" };

/**
 * The front door for volunteers: phone number (or email) and password,
 * straight into their dashboard for their volunteer ID card and certificate.
 */
export default async function VolunteerLogin() {
  if (await getViewer()) redirect("/workspace");
  const t = await getT();
  const demo =
    process.env.NODE_ENV !== "production" || process.env.SEED_DEMO === "1"
      ? process.env.SEED_DEMO !== "0" ? { password: "Adc2027!demo", accounts: [["Volunteer (verified)", "0803 123 4567", "Abdulrahman Ọlabisi"]] } : null
      : null;
  return (
    <>
      <PageIntro title={t("Volunteer sign in")} lead={t("Sign in with the phone number and password you registered with to see your volunteer ID card and download your certificate.")} />
      <div className="container-page space-y-6 [&>*]:max-w-lg">
        <SignInForm demo={demo} />
        <p className="text-[15px] text-ink-muted">
          {t("Not registered yet?")} <Link href="/volunteer" className="link">{t("Join as a volunteer")}</Link>
          {" · "}
          <Link href="/signin" className="link">{t("Campaign coordinator sign in")}</Link>
        </p>
      </div>
    </>
  );
}
