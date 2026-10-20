import { redirect } from "next/navigation";

/** The ADC Volunteers System registers individual volunteers only; this old link now goes to /workspace. */
export default function Moved() {
  redirect("/workspace");
}
