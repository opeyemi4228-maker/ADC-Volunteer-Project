import Link from "next/link";

import { Logo } from "@/components/ui";

export const metadata = { title: "Polling unit agent", robots: { index: false } };

/** A deliberately bare page: agents use it on a phone, in a queue, on a weak network. */
export default function AgentLayout({ children }) {
  return (
    <div className="min-h-dvh bg-white">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-4">
          <Link href="/" className="flex min-h-11 items-center gap-2"><Logo size={28} /><span className="font-bold">Polling unit agent</span></Link>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-6">{children}</main>
    </div>
  );
}
