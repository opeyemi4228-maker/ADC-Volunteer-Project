import { normalizePhone } from "@/lib/validate";
import { openSession, answer, SCREEN } from "@/lib/conversation";

/**
 * POST /api/v1/ussd/callback: the aggregator webhook (Africa's Talking
 * format: sessionId, serviceCode, phoneNumber, text). `text` holds every
 * answer in this session joined by "*"; the newest is the last part.
 *
 * Set USSD_CALLBACK_KEY and give the aggregator …/callback?key=<value>, and
 * restrict the route to the aggregator's IP range at the proxy.
 */
export async function POST(request) {
  const key = process.env.USSD_CALLBACK_KEY;
  if (key && new URL(request.url).searchParams.get("key") !== key) return new Response("END Not allowed", { status: 403 });

  const type = request.headers.get("content-type") ?? "";
  const f = type.includes("json") ? await request.json() : Object.fromEntries(await request.formData());
  const phone = normalizePhone(f.phoneNumber);
  if (!phone) return reply("END This service is for Nigerian mobile numbers.");

  const text = String(f.text ?? "");
  const out = text === "" ? openSession("ussd", phone) : answer("ussd", phone, text.split("*").at(-1));
  return reply(`${out.end ? "END" : "CON"} ${out.text}`);
}

function reply(body) {
  // Aggregators truncate past 182 characters; screens are built to fit 160.
  return new Response(body.slice(0, SCREEN + 4), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
