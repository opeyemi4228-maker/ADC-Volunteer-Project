import { redirect } from "next/navigation";

/** Short invite links for SMS (/join/KBW412) land on the volunteer form with the group pre-selected. */
export default async function Join({ params }) {
  const { code } = await params;
  redirect(`/volunteer?code=${encodeURIComponent(String(code).toUpperCase().slice(0, 12))}`);
}
