import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Field-level protection for phone numbers and emails (spec §15).
 *
 *   seal(value)   AES-256-GCM ciphertext, stored in *_enc columns
 *   open(sealed)  back to the plain value, for people allowed to see it
 *   blind(value)  keyed HMAC, stored in *_hash columns so a phone number can be
 *                 looked up and kept unique without ever being stored in clear
 *
 * The key comes from APP_SECRET. In development one is generated into
 * data/.secret on first run so the site works out of the box.
 */

function loadSecret() {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  const file = path.join(process.cwd(), "data", ".secret");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_SECRET must be set in production.");
    }
    const secret = crypto.randomBytes(48).toString("base64");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}

const SECRET = loadSecret();
const ENC_KEY = crypto.createHash("sha256").update(`enc:${SECRET}`).digest();
const MAC_KEY = crypto.createHash("sha256").update(`mac:${SECRET}`).digest();

export function seal(value) {
  if (value == null || value === "") return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const body = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${body.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

export function open(sealed) {
  if (!sealed) return "";
  try {
    const [, iv, body, tag] = sealed.split(".");
    const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function blind(value) {
  if (!value) return null;
  return crypto.createHmac("sha256", MAC_KEY).update(String(value).toLowerCase()).digest("base64url");
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export function verifyPassword(password, stored) {
  if (!stored?.startsWith("scrypt$")) return false;
  const [, salt, key] = stored.split("$");
  const expected = Buffer.from(key, "base64url");
  const actual = crypto.scryptSync(password, Buffer.from(salt, "base64url"), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

export function hashCode(code) {
  return crypto.createHmac("sha256", MAC_KEY).update(`otp:${code}`).digest("base64url");
}

export function token(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function uuid() {
  return crypto.randomUUID();
}

export function otpCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}
