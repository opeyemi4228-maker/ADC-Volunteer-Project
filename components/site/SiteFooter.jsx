import Link from "next/link";

import { getT } from "@/lib/i18n/server";
import { Logo } from "@/components/ui";

export default async function SiteFooter() {
  const t = await getT();
  const ussd = process.env.NEXT_PUBLIC_USSD_CODE ?? "*XXX*YY#";
  return (
    <footer className="mt-24 px-3 pb-3 sm:mt-32 sm:px-4 sm:pb-4">
      <div className="rounded-[28px] bg-brand-950 text-white/70">
        <div className="container-page grid gap-12 pb-10 pt-14 sm:pt-16 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-white p-1">
                <Logo size={30} />
              </span>
              <span className="text-[15px] font-bold text-white">{t("African Democratic Congress")}</span>
            </div>
            <p className="mt-5 text-[15px] leading-relaxed">
              {t("One place for every ADC volunteer, linked to their ward and polling unit.")}
            </p>
          </div>

          <FooterList title={t("Take part")}>
            <FooterLink href="/volunteer">{t("Join as a volunteer")}</FooterLink>
            <FooterLink href="/#ways-to-help">{t("Ways to help")}</FooterLink>
            <FooterLink href="/status">{t("Check my registration")}</FooterLink>
          </FooterList>

          <FooterList title={t("Help")}>
            <FooterLink href="/help">{t("Help and contact")}</FooterLink>
            <FooterLink href="/help#no-internet">{t("Register without internet")}</FooterLink>
            <FooterLink href="/help#agents">{t("Polling unit agents")}</FooterLink>
            <FooterLink href="/privacy">{t("Privacy notice")}</FooterLink>
          </FooterList>

          <FooterList title={t("No smartphone?")}>
            <li className="text-[15px]">
              {t("Dial")} <strong className="font-semibold text-white">{ussd}</strong> {t("on any phone")}
            </li>
            <li>
              <a href="mailto:support@adc.example" className="text-[15px] hover:text-white">support@adc.example</a>
            </li>
          </FooterList>
        </div>
        <div className="container-page flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-white/10 py-6 text-[13px] text-white/50">
          <p>
            © {new Date().getFullYear()} {t("African Democratic Congress")}. {t("Your data is protected under the Nigeria Data Protection Act 2023.")}
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/signin" className="inline-flex min-h-10 items-center hover:text-white">{t("Coordinator sign in")}</Link>
            <p>
              {t("Built by")}{" "}
              <a href="https://www.bitlayerx.com" target="_blank" rel="noopener" className="inline-flex min-h-10 items-center font-semibold text-white/80 underline decoration-white/30 underline-offset-4 hover:text-white hover:decoration-white">
                BitLayerX Technologies
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterList({ title, children }) {
  return (
    <div>
      <p className="text-[14px] font-semibold text-white">{title}</p>
      <ul className="mt-3 space-y-0.5">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }) {
  return (
    <li>
      <Link href={href} className="inline-flex min-h-10 items-center text-[15px] transition-colors hover:text-white">
        {children}
      </Link>
    </li>
  );
}
