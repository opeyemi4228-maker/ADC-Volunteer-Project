"use client";

/**
 * Browser-side helpers for the forms: JSON calls to /api/v1, and the INEC
 * register read from the static files in /geo (cached per page load, and by
 * the browser for a week via the Cache-Control header in next.config.mjs).
 */

export async function api(path, { method = "GET", body } = {}) {
  try {
    const res = await fetch(`/api/v1${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: data.error ?? "Something went wrong. Try again.", data };
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, status: 0, error: "You seem to be offline. Check your connection and try again.", data: {} };
  }
}

const cache = new Map();

function getJson(url) {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(url))))
        .catch((e) => {
          cache.delete(url);
          throw e;
        }),
    );
  }
  return cache.get(url);
}

/** [{ code, name, slug }] sorted by name. */
export async function loadStates() {
  const idx = await getJson("/geo/index.json");
  return idx.states.map(({ code, name, slug }) => ({ code, name, slug })).sort((a, b) => a.name.localeCompare(b.name));
}

/** [{ code, name, wards: [{ code, name, units }] }] sorted by name. */
export async function loadLgas(stateCode) {
  const states = await loadStates();
  const s = states.find((x) => x.code === stateCode);
  if (!s) return [];
  const tree = await getJson(`/geo/${s.slug}.json`);
  return tree.lgas
    .map((l) => ({ ...l, wards: [...l.wards].sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** [{ code, name }] for one ward. */
export async function loadUnits(wardCode) {
  const [s, l, w] = (wardCode ?? "").split("-");
  if (!w) return [];
  const byWard = await getJson(`/geo/pu/${s}-${l}.json`).catch(() => ({}));
  return (byWard[w] ?? []).map(([n, name]) => ({ code: `${wardCode}-${n}`, name }));
}

/** Read/write a nested value by "a.b.0.c" path, immutably. */
export function getIn(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setIn(obj, path, value) {
  const [head, ...rest] = path.split(".");
  const base = Array.isArray(obj) ? [...obj] : { ...(obj ?? {}) };
  base[head] = rest.length ? setIn(obj?.[head] ?? (/^\d+$/.test(rest[0]) ? [] : {}), rest.join("."), value) : value;
  return base;
}
