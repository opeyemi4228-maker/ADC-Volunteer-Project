import { redirect } from "next/navigation";

import { getT } from "@/lib/i18n/server";
import { getViewer } from "@/lib/auth";
import { DEMO_PASSWORD, demoAccounts } from "@/lib/seed";
import PageIntro from "@/components/site/PageIntro";
import SignInForm from "./SignInForm";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getViewer()) redirect("/workspace");
  const t = await getT();
  // Seeded demo accounts are listed only in development with demo data loaded.
  const demo = process.env.NODE_ENV !== "production" && process.env.SEED_DEMO !== "0" ? { password: DEMO_PASSWORD, accounts: demoAccounts() } : null;
  return (
    <>
      <PageIntro title={t("Sign in")} lead={t("For campaign coordinators. Sign in with your phone number or email and password, then confirm the code sent to your phone.")} />
      <div className="container-page [&>*]:max-w-lg">
        <SignInForm demo={demo} />
      </div>
    </>
  );
}
