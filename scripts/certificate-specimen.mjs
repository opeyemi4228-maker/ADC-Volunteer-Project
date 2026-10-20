/**
 * Builds public/brand/certificate-specimen.pdf: a sample certificate with a
 * placeholder volunteer, used to show volunteers what they receive.
 *   SITE_URL=https://your-domain node scripts/certificate-specimen.mjs && sips -s format png public/brand/certificate-specimen.pdf --out public/brand/certificate-sample.png
 */
import fs from "node:fs";
const { renderCertificate } = await import("../lib/certificate.js");
const out = await renderCertificate(
  { public_id: "ADC-M-37-000000", first_name: "Your", surname: "Name", roles: ["pu_agent", "mobiliser", "canvasser"], verified_at: "2026-10-01 09:00:00", vote_state_code: "FCT", vote_lga_code: "FCT-002", vote_ward_code: "FCT-002-09" },
  "ADC-CERT-2026-SPECIMEN",
);
fs.writeFileSync("public/brand/certificate-specimen.pdf", out.bytes);
console.log("written");
