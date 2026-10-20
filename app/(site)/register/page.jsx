import { redirect } from "next/navigation";

/** The ADC Volunteers System registers individual volunteers only; this old link now goes to /volunteer. */
export default function Moved() {
  redirect("/volunteer");
}
