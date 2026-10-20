import fs from "node:fs";
import path from "node:path";

/**
 * Nigeria as a dot matrix, for the home page. A hexagonal grid of points is
 * laid over the state outlines in public/geo/map/states.json and each point
 * inside a state is kept and tagged with it, so the page can light states up
 * by live counts. Computed once per server process (~1,300 dots, a few ms).
 */

const STEP = 15; // grid spacing in map units (map is 1000 × 812)

let cached = null;

function rings(d) {
  return d
    .split(/(?=M)/)
    .map((r) => [...r.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]))
    .filter((r) => r.length > 2);
}

// Even–odd ray casting across all rings, so holes and islands work.
function inside(x, y, polys) {
  let hit = false;
  for (const ring of polys) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

/** { width, height, r, states: [{ code, name, cx, cy }], dots: [[x, y, stateIndex], …] } */
export function dotMap() {
  if (cached) return cached;
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "geo", "map", "states.json"), "utf8"));
  const shapes = raw.states.map((s) => {
    const polys = rings(s.d);
    const xs = polys.flat().map((p) => p[0]);
    const ys = polys.flat().map((p) => p[1]);
    return { code: s.code, name: s.name, polys, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  });

  const dots = [];
  const sums = shapes.map(() => ({ x: 0, y: 0, n: 0 }));
  const rowH = STEP * 0.866;
  for (let row = 0, y = rowH / 2; y < raw.height; row += 1, y += rowH) {
    for (let x = (row % 2 ? STEP : STEP / 2); x < raw.width; x += STEP) {
      const idx = shapes.findIndex((s) => x >= s.box[0] && x <= s.box[2] && y >= s.box[1] && y <= s.box[3] && inside(x, y, s.polys));
      if (idx < 0) continue;
      dots.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10, idx]);
      sums[idx].x += x;
      sums[idx].y += y;
      sums[idx].n += 1;
    }
  }

  cached = {
    width: raw.width,
    height: raw.height,
    r: STEP * 0.3,
    states: shapes.map((s, i) => ({
      code: s.code,
      name: s.name,
      // Centre of the state's own dots (falls back to its box for tiny states).
      cx: sums[i].n ? Math.round(sums[i].x / sums[i].n) : Math.round((s.box[0] + s.box[2]) / 2),
      cy: sums[i].n ? Math.round(sums[i].y / sums[i].n) : Math.round((s.box[1] + s.box[3]) / 2),
    })),
    dots,
  };
  return cached;
}
