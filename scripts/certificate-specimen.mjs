/**
 * Builds public/brand/certificate-specimen.pdf: a sample certificate with a
 * placeholder group, used on the home page to show groups what they receive.
 *   SITE_URL=https://your-domain node scripts/certificate-specimen.mjs && sips -s format png public/brand/certificate-specimen.pdf --out public/brand/certificate-sample.png
 */
import fs from "node:fs";
const { renderCertificate } = await import("../lib/certificate.js");
const out = await renderCertificate(
  { public_id: "ADC-SG-00-0000", name: "Your Support Group", category: "community", operating_level: "ward", verified_at: "2026-10-01 09:00:00", state_code: "FCT", lga_code: "FCT-002", ward_code: "FCT-002-09", logo_key: null },
  "ADC-CERT-2026-SPECIMEN",
);
fs.writeFileSync("public/brand/certificate-specimen.pdf", out.bytes);
console.log("written");
