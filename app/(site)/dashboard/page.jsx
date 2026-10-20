import { redirect } from "next/navigation";

/** The coordinator area lives at /workspace; this keeps old links working. */
export default function DashboardPage() {
  redirect("/workspace");
}
