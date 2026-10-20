import { getT } from "@/lib/i18n/server";
import PageIntro from "@/components/site/PageIntro";
import VolunteerForm from "./VolunteerForm";

export const metadata = { title: "Join as a volunteer" };

export default async function VolunteerPage({ searchParams }) {
  const t = await getT();
  const sp = await searchParams;
  const role = String(sp.role ?? "").slice(0, 40);
  return (
    <>
      <PageIntro
        title={t("Help at your polling unit and beyond")}
        lead={t("A few quick questions, one at a time. About 3 minutes, and you must be 18 or older.")}
      />
      <div className="container-page">
        <VolunteerForm role={role} />
      </div>
    </>
  );
}
