import { cookies } from "next/headers";

import { LANG_COOKIE, normalizeLang, translator } from "./index.js";

export async function getLang() {
  return normalizeLang((await cookies()).get(LANG_COOKIE)?.value);
}

export async function getT() {
  return translator(await getLang());
}
