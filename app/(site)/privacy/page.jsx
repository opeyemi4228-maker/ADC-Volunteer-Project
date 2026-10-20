import { getT } from "@/lib/i18n/server";
import { NOTICE_VERSION } from "@/lib/registration";
import PageIntro from "@/components/site/PageIntro";

export const metadata = { title: "Privacy notice" };

/*
 * Plain-language notice under the Nigeria Data Protection Act 2023. The
 * version shown here is the one recorded with every consent (NOTICE_VERSION),
 * so bump it in lib/registration.js whenever this text changes materially.
 */
const SECTIONS = [
  ["Who we are", "The African Democratic Congress (ADC) runs this platform to register and coordinate its support groups and volunteers. The ADC is the data controller for the information you give here."],
  ["What we collect", "For groups: the group's name, category, location, size, leaders' names and contact details, online platforms, and photos or videos you choose to upload. For volunteers: your name, gender, date of birth, phone number, optional email, where you vote and live, whether you have a PVC, and how you'd like to help."],
  ["Why we use it", "To link groups and volunteers with coordinators in their ward, LGA and state; to plan campaign activities and polling-unit coverage; and, only if you agree, to send you campaign updates. We never sell your data."],
  ["Legal basis", "Your consent, which you give on the last step of each form and can withdraw at any time. Withdrawing does not affect anything done before."],
  ["Who can see it", "Only coordinators for your own area can see your record, and only as much as their role needs. Phone numbers and emails are encrypted when stored. Every view and export of personal data is logged."],
  ["Photos", "Photos are re-encoded when uploaded, which removes hidden location data. Coordinators review every photo before it is used, and we do not publish images where children can be identified."],
  ["How long we keep it", "Until the end of the current election cycle, or until you ask us to delete it, whichever comes first."],
  ["Your rights", "You can ask to see, correct, move or delete your data, or object to how it is used. Email the data protection officer at dpo@adc.example. We respond within 30 days. You can also complain to the Nigeria Data Protection Commission."],
];

export default async function PrivacyPage() {
  const t = await getT();
  return (
    <>
      <PageIntro title={t("Privacy notice")} lead={t("How we collect, use and protect your information, under the Nigeria Data Protection Act 2023.")} />
      <article className="container-page py-10 [&>*]:max-w-3xl">
        <p className="text-[14px] text-ink-muted">{t("Version {v}", { v: NOTICE_VERSION })}</p>
        <div className="mt-6 space-y-8">
          {SECTIONS.map(([h, body]) => (
            <section key={h}>
              <h2 className="h-section">{t(h)}</h2>
              <p className="mt-2 text-[16px] leading-relaxed text-ink/90">{t(body)}</p>
            </section>
          ))}
        </div>
      </article>
    </>
  );
}
