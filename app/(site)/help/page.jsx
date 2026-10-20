import Link from "next/link";
import { Phone, MessageCircle, Mail, UserRoundCheck } from "lucide-react";

import { getT } from "@/lib/i18n/server";
import PageIntro from "@/components/site/PageIntro";

export const metadata = { title: "Help and contact" };

const FAQ = [
  ["What can I volunteer for?", "Polling unit agent, ward collation agent, mobiliser, door-to-door canvasser, social media, driver or logistics, event support, legal, medical and first aid, data and IT, security liaison or fundraising. Choose as many as you like when you register."],
  ["Why do you need my polling unit?", "It links you to the coordinators closest to you, and lets the campaign plan agents for every polling unit. You'll find it printed on your voter's card (PVC). If you don't know it, tick \"I don't know my polling unit\"."],
  ["I stopped halfway. Is my progress lost?", "No. Your answers are saved after each step against your phone number. Come back to the same form, verify your number again, and choose \"Continue where I stopped\"."],
  ["I didn't get the SMS code.", "Check the number, wait a minute and tap \"Resend code\". Codes expire after 10 minutes. If it still doesn't arrive, message us on WhatsApp."],
  ["How long does verification take?", "Ward coordinators aim to review new registrations within 7 days. You can check progress at any time on the \"Check my status\" page."],
  ["Can I change my details after submitting?", "Contact your ward coordinator or our support line and they can update your record."],
];

export default async function HelpPage() {
  const t = await getT();
  const ussd = process.env.NEXT_PUBLIC_USSD_CODE ?? "*XXX*YY#";

  return (
    <>
      <PageIntro title={t("Help and contact")} lead={t("Answers to common questions, and other ways to register if you don't have internet.")} />

      <div className="container-page grid gap-10 py-10 lg:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="faq">
          <h2 id="faq" className="h-page">{t("Common questions")}</h2>
          <div className="mt-6 divide-y divide-line border-y border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[17px] font-semibold tracking-tight">
                  {t(q)}
                  <span className="relative size-4 shrink-0 text-ink-muted" aria-hidden>
                    <span className="absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2 bg-current" />
                    <span className="absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 bg-current transition-transform duration-200 group-open:rotate-90 group-open:opacity-0" />
                  </span>
                </summary>
                <p className="-mt-1 max-w-[60ch] pb-6 text-[16px] leading-[1.7] text-ink-muted">{t(a)}</p>
              </details>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <section id="no-internet" className="card scroll-mt-24 p-5">
            <h2 className="h-section">{t("Register without internet")}</h2>
            <ul className="mt-4 space-y-4 text-[15px]">
              <li className="flex gap-3">
                <Phone aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-600" />
                <span>
                  {t("Dial")} <strong>{ussd}</strong> {t("on any phone and follow the menu. It works on every network, with no data.")}
                </span>
              </li>
              <li className="flex gap-3">
                <MessageCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-600" />
                <span>{t("Message us on WhatsApp and we'll register you in a chat.")}</span>
              </li>
              <li className="flex gap-3">
                <UserRoundCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-600" />
                <span>{t("Ask your ward coordinator or a field agent. They can register you on their phone.")}</span>
              </li>
            </ul>
          </section>

          <section id="agents" className="card scroll-mt-24 p-5">
            <h2 className="h-section">{t("Polling unit agents")}</h2>
            <p className="mt-3 text-[15px] text-ink-muted">
              {t("On election day, check in, send your result sheet and report incidents from your polling unit.")}
            </p>
            <Link href="/pu-agent" className="btn btn-secondary btn-sm mt-4">{t("Open the agent page")}</Link>
          </section>

          <section className="card p-5">
            <h2 className="h-section">{t("Contact support")}</h2>
            <p className="mt-3 flex items-center gap-3 text-[15px]">
              <Mail aria-hidden className="size-5 shrink-0 text-brand-600" />
              <a href="mailto:support@adc.example" className="link">support@adc.example</a>
            </p>
            <p className="mt-4 text-[14px] text-ink-muted">
              {t("Questions about your data?")} <Link href="/privacy" className="link">{t("Read the privacy notice")}</Link>
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
