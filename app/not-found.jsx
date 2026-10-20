import Link from "next/link";

import { getT } from "@/lib/i18n/server";
import SiteLayout from "./(site)/layout";

export const metadata = { title: "Page not found" };

export default async function NotFound() {
  const t = await getT();
  return (
    <SiteLayout>
      <div className="container-page py-16 sm:py-24">
        <h1 className="h-page sm:text-[2.5rem] sm:leading-12">{t("We couldn't find that page")}</h1>
        <p className="lead prose-width mt-3">{t("The link may be old or mistyped. If you typed the address, check it.")}</p>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href="/" className="btn btn-primary">{t("Go to the home page")}</Link>
          <Link href="/volunteer" className="link">{t("Join as a volunteer")}</Link>
          <Link href="/help" className="link">{t("Get help")}</Link>
        </div>
      </div>
    </SiteLayout>
  );
}
