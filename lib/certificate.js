import fs from "node:fs";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import sharp from "sharp";

import { one, run, nowIso } from "./db.js";
import { objectPath } from "./storage.js";
import { placeLabel } from "./geo.js";
import { GROUP_CATEGORIES, OPERATING_LEVELS, labelOf } from "./options.js";

/**
 * Certificate of registration for a verified support group, as a PDF.
 *
 * Only issued once a coordinator has verified the group. It carries a
 * certificate number and a QR code to /verify/<group ID>, a public page that
 * confirms the certificate is genuine and still valid, so a printed copy can
 * always be checked. It is issued electronically; it does not imitate any
 * person's signature.
 *
 * Noto Sans is embedded so names in Hausa, Yoruba and Igbo print correctly.
 */

const ROOT = process.cwd();
const FONT = (w) => fs.readFileSync(path.join(ROOT, "assets", "fonts", `NotoSans_${w}.ttf`));
const SITE = process.env.SITE_URL ?? "http://localhost:3000";

const GREEN = rgb(0.039, 0.451, 0.22); // #0a7338
const DEEP = rgb(0.024, 0.247, 0.125); // #063f20
const ORANGE = rgb(0.957, 0.451, 0.129); // #f47321
const INK = rgb(0.102, 0.102, 0.102);
const MUTED = rgb(0.357, 0.38, 0.408);
const LINE = rgb(0.875, 0.89, 0.882);

export function certificateNumber(group) {
  if (group.certificate_no) return group.certificate_no;
  const year = (group.verified_at ?? nowIso()).slice(0, 4);
  const no = `ADC-CERT-${year}-${group.public_id.replace("ADC-SG-", "").replace("-", "")}`;
  run("UPDATE support_groups SET certificate_no = :n WHERE id = :id", { n: no, id: group.id });
  return no;
}

function fitSize(font, text, max, start, min = 18) {
  let size = start;
  while (size > min && font.widthOfTextAtSize(text, size) > max) size -= 1;
  return size;
}

function centered(page, font, text, size, y, color = INK) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (page.getWidth() - w) / 2, y, size, font, color });
}

export async function buildCertificate(groupId) {
  const g = one("SELECT * FROM support_groups WHERE id = :id", { id: groupId });
  if (!g || g.status !== "verified") return null;
  const number = certificateNumber(g);
  return renderCertificate(g, number);
}

/** Draws the certificate for a group row. Exported for the website's specimen image. */
export async function renderCertificate(g, number) {

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Certificate of Registration: ${g.name}`);
  pdf.setAuthor("African Democratic Congress");
  pdf.setSubject(`Support group ${g.public_id}`);
  pdf.setCreator("ADC Volunteers System");

  // Embedded whole: pdf-lib's subsetter drops glyphs from this font.
  const regular = await pdf.embedFont(FONT("400Regular"));
  const semibold = await pdf.embedFont(FONT("600SemiBold"));
  const bold = await pdf.embedFont(FONT("700Bold"));

  const page = pdf.addPage([842, 595]); // A4 landscape
  const W = page.getWidth();
  const H = page.getHeight();

  // A solid white sheet, so the certificate is white in every viewer and printer.
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });

  // Frame: a deep green outer rule, a thin inner rule, and an orange accent at the top.
  page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: DEEP, borderWidth: 3 });
  page.drawRectangle({ x: 28, y: 28, width: W - 56, height: H - 56, borderColor: GREEN, borderWidth: 0.75 });
  page.drawRectangle({ x: W / 2 - 60, y: H - 31, width: 120, height: 4, color: ORANGE });

  const adcPng = fs.readFileSync(path.join(ROOT, "public", "brand", "adc-logo.png"));
  const adc = await pdf.embedPng(adcPng);

  // Party logo top-left; the group's own logo top-right when they uploaded one.
  const logoW = 70;
  page.drawImage(adc, { x: 58, y: H - 58 - logoW * (adc.height / adc.width), width: logoW, height: logoW * (adc.height / adc.width) });
  if (g.logo_key && fs.existsSync(objectPath(g.logo_key))) {
    try {
      const png = await sharp(fs.readFileSync(objectPath(g.logo_key))).resize(240, 240, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
      const img = await pdf.embedPng(png);
      page.drawImage(img, { x: W - 58 - logoW, y: H - 58 - logoW, width: logoW, height: logoW });
    } catch {
      /* A logo that can't be read is left off rather than failing the certificate. */
    }
  }

  centered(page, semibold, "AFRICAN DEMOCRATIC CONGRESS", 12, H - 88, GREEN);
  centered(page, bold, "Certificate of Registration", 34, H - 136, DEEP);
  centered(page, regular, "This is to certify that", 14, H - 178, MUTED);

  const nameSize = fitSize(bold, g.name, W - 200, 34);
  centered(page, bold, g.name, nameSize, H - 226, INK);
  page.drawLine({ start: { x: W / 2 - 170, y: H - 240 }, end: { x: W / 2 + 170, y: H - 240 }, thickness: 0.75, color: LINE });

  centered(page, regular, "is a registered and verified support group of the African Democratic Congress,", 13.5, H - 268, INK);
  centered(page, regular, "recognised to organise supporters and volunteers in the area shown below.", 13.5, H - 287, INK);

  // Details, in four columns.
  const details = [
    ["Group ID", g.public_id],
    ["Category", labelOf(GROUP_CATEGORIES, g.category) + (g.category_other ? ` (${g.category_other})` : "")],
    ["Level", `${labelOf(OPERATING_LEVELS, g.operating_level)} level`],
    ["Date verified", new Date(`${(g.verified_at ?? nowIso()).replace(" ", "T")}Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })],
  ];
  const colW = (W - 160) / details.length;
  details.forEach(([k, v], i) => {
    const x = 80 + i * colW;
    page.drawText(k.toUpperCase(), { x, y: H - 340, size: 8.5, font: semibold, color: MUTED });
    page.drawText(v, { x, y: H - 357, size: fitSize(semibold, v, colW - 12, 12.5, 8), font: semibold, color: INK });
  });
  const place = placeLabel(g);
  page.drawText("BASED IN", { x: 80, y: H - 392, size: 8.5, font: semibold, color: MUTED });
  page.drawText(place, { x: 80, y: H - 409, size: fitSize(semibold, place, W - 330, 12.5, 8), font: semibold, color: INK });

  // Footer: how to check it, and a QR code that does exactly that.
  const verifyUrl = `${SITE}/verify/${g.public_id}`;
  const qr = await pdf.embedPng(await QRCode.toBuffer(verifyUrl, { margin: 0, width: 240, color: { dark: "#063f20", light: "#ffffff" } }));
  page.drawImage(qr, { x: W - 58 - 86, y: 52, width: 86, height: 86 });
  page.drawText("Scan to verify", { x: W - 58 - 86, y: 40, size: 8, font: regular, color: MUTED });

  page.drawLine({ start: { x: 80, y: 118 }, end: { x: 360, y: 118 }, thickness: 0.75, color: LINE });
  page.drawText(`Certificate No. ${number}`, { x: 80, y: 100, size: 11, font: semibold, color: INK });
  page.drawText("Issued electronically by the ADC Volunteers System.", { x: 80, y: 83, size: 9.5, font: regular, color: MUTED });
  page.drawText(`Check it is genuine at ${verifyUrl.replace(/^https?:\/\//, "")}`, { x: 80, y: 68, size: 9.5, font: regular, color: MUTED });
  page.drawText("Valid while the group remains verified.", { x: 80, y: 53, size: 9.5, font: regular, color: MUTED });

  return { bytes: await pdf.save(), number, filename: `ADC-Certificate-${g.public_id}.pdf` };
}

