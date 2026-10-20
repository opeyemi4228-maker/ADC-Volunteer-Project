import { Montserrat, Noto_Sans } from "next/font/google";

import "./globals.css";
import { I18nProvider } from "@/lib/i18n/client";
import { getLang } from "@/lib/i18n/server";

// Montserrat is the brand face. Its latin-ext and vietnamese subsets cover every
// letter used in Hausa (ƙ ɗ ɓ ƴ), Yoruba (ẹ ọ ṣ, tone marks) and Igbo (ị ọ ụ ṅ).
// Noto Sans stays behind it as a safety net for any rarer glyph; it isn't
// preloaded, so browsers only fetch it if a page actually needs it (spec §3.2, §14).
const montserrat = Montserrat({
  subsets: ["latin", "latin-ext", "vietnamese"],
  display: "swap",
  variable: "--font-montserrat",
});

const noto = Noto_Sans({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "600", "700"],
  display: "swap",
  preload: false,
  variable: "--font-noto",
});

export const metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "ADC Volunteers System: join as a volunteer or register your support group",
    template: "%s · ADC Volunteers System",
  },
  description:
    "Join the ADC as a volunteer or register your support group, in a few quick questions. Linked to your ward and polling unit, so coordinators across Nigeria can organise with you.",
  openGraph: {
    title: "ADC Volunteers System",
    description: "Join as an ADC volunteer or register your support group, from any phone.",
    images: ["/brand/adc-logo.png"],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#085a2c",
};

export default async function RootLayout({ children }) {
  const lang = await getLang();
  return (
    <html lang={lang === "pcm" ? "pcm" : lang} className={`${montserrat.variable} ${noto.variable}`}>
      <body className="min-h-dvh font-sans">
        <I18nProvider lang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
