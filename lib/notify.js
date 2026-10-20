import { run } from "./db.js";
import { seal, blind, uuid } from "./crypto.js";
import { fill } from "./templates.js";

/**
 * Outgoing SMS / WhatsApp / email. Every message is written to the outbox
 * first, then handed to the provider. SMS_PROVIDER=console (the default in
 * development) only logs it, so the whole site can be exercised without an
 * aggregator account; the outbox is visible in Workspace -> Messages.
 *
 * To go live, set SMS_PROVIDER to an aggregator and implement `deliver` for it
 * (Termii, Africa's Talking and the WhatsApp Business Platform all take a
 * phone number and a body).
 */

const PROVIDER = process.env.SMS_PROVIDER ?? "console";

async function deliver(channel, to, body) {
  if (PROVIDER === "console") {
    console.log(`[${channel} -> ${to}] ${body}`);
    return "console";
  }
  throw new Error(`SMS provider "${PROVIDER}" is not configured.`);
}

export async function send({ channel = "sms", to, template, lang = "en", vars = {}, body }) {
  const text = body ?? fill(template, lang, vars);
  const id = uuid();
  run("INSERT INTO outbox (id, channel, to_enc, to_hash, template, body) VALUES (:id, :channel, :to_enc, :to_hash, :template, :body)", {
    id,
    channel,
    to_enc: seal(to),
    to_hash: blind(to),
    template: template ?? null,
    body: text,
  });
  try {
    const messageId = await deliver(channel, to, text);
    run("UPDATE outbox SET status = 'sent', message_id = :m WHERE id = :id", { id, m: messageId });
  } catch (error) {
    run("UPDATE outbox SET status = 'failed' WHERE id = :id", { id });
    console.error("[notify]", error.message);
  }
  return text;
}

export const isConsoleProvider = PROVIDER === "console";

/* ── Email ─────────────────────────────────────────────────────────────── */

let transport = null;
async function mailer() {
  if (!process.env.SMTP_URL) return null;
  if (!transport) {
    const nodemailer = (await import("nodemailer")).default;
    transport = nodemailer.createTransport(process.env.SMTP_URL);
  }
  return transport;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** A plain, readable HTML email: one message, one button, no tracking. */
function emailHtml({ heading, paragraphs, button }) {
  return `<!doctype html><html><body style="margin:0;background:#f3f5f4;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #dfe3e1;border-radius:12px" cellpadding="0" cellspacing="0">
<tr><td style="padding:28px 28px 8px"><p style="margin:0;font-size:13px;font-weight:bold;color:#0a7338">ADC Volunteers System</p>
<h1 style="margin:10px 0 0;font-size:22px;line-height:1.3">${esc(heading)}</h1></td></tr>
<tr><td style="padding:8px 28px 8px;font-size:16px;line-height:1.55">${paragraphs.map((p) => `<p style="margin:12px 0">${esc(p)}</p>`).join("")}</td></tr>
${button ? `<tr><td style="padding:8px 28px 28px"><a href="${esc(button.href)}" style="display:inline-block;background:#0a7338;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">${esc(button.label)}</a></td></tr>` : ""}
</table>
<p style="font-size:12px;color:#5b6168;margin:16px 0 0">African Democratic Congress · You received this because this address is registered on the ADC Volunteers System.</p>
</td></tr></table></body></html>`;
}

/**
 * Sends an email through the outbox. Without SMTP_URL it is only logged
 * (development), exactly like SMS with SMS_PROVIDER=console.
 */
export async function sendEmail({ to, subject, heading, paragraphs, button, template = "email" }) {
  const text = [heading, "", ...paragraphs, ...(button ? ["", `${button.label}: ${button.href}`] : [])].join("\n");
  const id = uuid();
  run("INSERT INTO outbox (id, channel, to_enc, to_hash, template, body) VALUES (:id, 'email', :to_enc, :to_hash, :template, :body)", {
    id, to_enc: seal(to), to_hash: blind(to), template, body: `${subject}\n\n${text}`,
  });
  try {
    const t = await mailer();
    if (t) {
      const info = await t.sendMail({ from: process.env.EMAIL_FROM ?? "ADC Volunteers System <no-reply@adc.example>", to, subject, text, html: emailHtml({ heading, paragraphs, button }) });
      run("UPDATE outbox SET status = 'sent', message_id = :m WHERE id = :id", { id, m: info.messageId ?? "smtp" });
    } else {
      console.log(`[email -> ${to}] ${subject}\n${text}`);
      run("UPDATE outbox SET status = 'sent', message_id = 'console' WHERE id = :id", { id });
    }
  } catch (error) {
    run("UPDATE outbox SET status = 'failed' WHERE id = :id", { id });
    console.error("[email]", error.message);
  }
}

export const isEmailLive = Boolean(process.env.SMTP_URL);
