import { homeArea, coversArea } from "./scope.js";
import { areaName, areaTypeOf, stateOf, ZONES } from "./geo.js";

/**
 * Which area a workspace page shows. Starts at the viewer's home area and
 * lets them drill down (?area=CODE) only inside what they coordinate.
 */
export function resolveArea(viewer, requested) {
  const home = homeArea(viewer) ?? { type: "national", code: "NG" };
  if (!requested || requested === home.code) return { ...home, home };
  const type = areaTypeOf(requested);
  const allowed =
    viewer.roles.some((r) => r.role === "national_admin") ||
    (type === "zone" && viewer.roles.some((r) => r.role === "national_admin")) ||
    (type !== "zone" && type !== "national" && coversArea(viewer, requested));
  if (!allowed || type === "pu") return { ...home, home };
  return { type, code: requested, home };
}

/** Nigeria › Zone › State › LGA › Ward, starting from the viewer's home level. */
export function breadcrumb(area) {
  const trail = [];
  if (!["national", "zone", "state", "lga", "ward"].includes(area.type)) return trail;
  const code = area.code;
  trail.push({ code: "NG", name: "Nigeria", type: "national" });
  if (area.type !== "national") {
    const zone = area.type === "zone" ? code : stateOf(code)?.zone;
    trail.push({ code: zone, name: ZONES[zone], type: "zone" });
  }
  if (["state", "lga", "ward"].includes(area.type)) trail.push({ code: code.slice(0, 3), name: areaName(code.slice(0, 3)), type: "state" });
  if (["lga", "ward"].includes(area.type)) trail.push({ code: code.slice(0, 7), name: areaName(code.slice(0, 7)), type: "lga" });
  if (area.type === "ward") trail.push({ code, name: areaName(code), type: "ward" });
  const order = ["national", "zone", "state", "lga", "ward"];
  const homeIdx = order.indexOf(area.home?.type ?? "national");
  return trail.filter((c) => order.indexOf(c.type) >= (homeIdx < 0 ? 0 : homeIdx));
}
