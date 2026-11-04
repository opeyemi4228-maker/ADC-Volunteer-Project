import Link from "next/link";
import { redirect } from "next/navigation";

import { getT } from "@/lib/i18n/server";
import { getViewer } from "@/lib/auth";
import PageIntro from "@/components/site/PageIntro";
import MemberSignInForm from "./MemberSignInForm";

export const metadata = { title: "Volunteer sign in" };

/**
 * The front door for members (volunteers): no password. They enter the phone
 * number they registered with and the one-time code sent to it by SMS.
 */
export default async function VolunteerLogin({ searchParams }) {
  if (await getViewer()) redirect("/workspace");
  const t = await getT();
  // Demo sign-in hints only on a development machine running the demo data.
  const demo = process.env.NODE_ENV !== "production" && process.env.SEED_DEMO === "1"
    ? [["Volunteer (verified)", "0803 123 4567", "Abdulrahman Ọlabisi"]]
    : null;
  return (
    <>
      <PageIntro title={t("Volunteer sign in")} lead={t("Enter the phone number you registered with and we'll text you a one-time code. That code is your password: there's nothing else to remember.")} />
      <div className="container-page space-y-6 [&>*]:max-w-lg">
        <MemberSignInForm demo={demo} initialPhone={String((await searchParams).phone ?? "").slice(0, 40)} />
        <p className="text-[15px] text-ink-muted">
          {t("Not registered yet?")} <Link href="/volunteer" className="link">{t("Join as a volunteer")}</Link>
          {" · "}
          <Link href="/signin" className="link">{t("Campaign coordinator sign in")}</Link>
        </p>
      </div>
    </>
  );
}
