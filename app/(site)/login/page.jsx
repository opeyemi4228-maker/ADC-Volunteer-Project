import Link from "next/link";
import { redirect } from "next/navigation";

import { getT } from "@/lib/i18n/server";
import { getViewer } from "@/lib/auth";
import PageIntro from "@/components/site/PageIntro";
import SignInForm from "../signin/SignInForm";

export const metadata = { title: "Support group login" };

/**
 * The front door for support groups: email and password, straight into the
 * group dashboard to post updates, download the certificate and manage members.
 */
export default async function GroupLogin() {
  if (await getViewer()) redirect("/workspace");
  const t = await getT();
  const demo =
    process.env.NODE_ENV !== "production" && process.env.SEED_DEMO !== "0"
      ? { password: "Adc2027!demo", accounts: [["Support group (Kubwa Youth Vanguard)", "kubwayouth@example.com", "Abdulrahman Ọlabisi"]] }
      : null;
  return (
    <>
      <PageIntro title={t("Support group login")} lead={t("Sign in with your group's email and password to post updates on your work, share photos, manage members and download your certificate.")} />
      <div className="container-page space-y-6 [&>*]:max-w-lg">
        <SignInForm demo={demo} />
        <p className="text-[15px] text-ink-muted">
          {t("Not registered yet?")} <Link href="/register" className="link">{t("Register your support group")}</Link>
          {" · "}
          <Link href="/signin" className="link">{t("Campaign coordinator sign in")}</Link>
        </p>
      </div>
    </>
  );
}
