// Fonts ship with the site (no download from Google at build time, so a build
// never fails on a network hiccup, and no visitor data goes to Google).
// Montserrat is the brand face; its latin-ext and vietnamese ranges cover every
// letter used in Hausa (ƙ ɗ ɓ ƴ), Yoruba (ẹ ọ ṣ, tone marks) and Igbo (ị ọ ụ ṅ).
// Noto Sans sits behind it as a safety net. Each file is split by
// unicode-range, so a browser only downloads the ranges a page actually uses.
import "@fontsource-variable/montserrat/wght.css";
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/600.css";
import "@fontsource/noto-sans/700.css";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/client";
import { getLang } from "@/lib/i18n/server";

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
    <html lang={lang === "pcm" ? "pcm" : lang}>
      <body className="min-h-dvh font-sans">
        <I18nProvider lang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
