import { fail } from "@/lib/http";

/** Support group registration has been retired: the system registers individual volunteers. */
export function POST() {
  return fail(410, "Support group registration is closed. Join as a volunteer instead.");
}
export function GET() {
  return fail(410, "Support groups are no longer part of the ADC Volunteers System.");
}
