/**
 * The 37, with the codes that end up on a membership card.
 *
 * Plain ESM with no imports, because three very different things need the same
 * list and must never disagree about it:
 *
 *   - scripts/build-geography.mjs, naming the files in public/geo and the ward
 *     codes inside them;
 *   - prisma/seed.mjs, writing the states table;
 *   - lib/map.js, which groups the same names by zone for the pages.
 *
 * `code` is the middle segment of every membership number (§7.3,
 * MAP/OND/006/000123), so it is permanent: changing one here reissues numbers
 * for everybody in that state. `slug` names the file in public/geo. The source
 * INEC data calls the FCT after its city, which is why the two differ for
 * exactly one row.
 *
 * `inec` is the state's number in the INEC delimitation code — the "28" in
 * 28/06/07/003. It is what ties a row here to the published register.
 */

export const states = [
  { name: "Abia", code: "ABI", slug: "abia", zone: "SE", inec: "01" },
  { name: "Adamawa", code: "ADA", slug: "adamawa", zone: "NE", inec: "02" },
  { name: "Akwa Ibom", code: "AKW", slug: "akwa-ibom", zone: "SS", inec: "03" },
  { name: "Anambra", code: "ANA", slug: "anambra", zone: "SE", inec: "04" },
  { name: "Bauchi", code: "BAU", slug: "bauchi", zone: "NE", inec: "05" },
  { name: "Bayelsa", code: "BAY", slug: "bayelsa", zone: "SS", inec: "06" },
  { name: "Benue", code: "BEN", slug: "benue", zone: "NC", inec: "07" },
  { name: "Borno", code: "BOR", slug: "borno", zone: "NE", inec: "08" },
  { name: "Cross River", code: "CRO", slug: "cross-river", zone: "SS", inec: "09" },
  { name: "Delta", code: "DEL", slug: "delta", zone: "SS", inec: "10" },
  { name: "Ebonyi", code: "EBO", slug: "ebonyi", zone: "SE", inec: "11" },
  { name: "Edo", code: "EDO", slug: "edo", zone: "SS", inec: "12" },
  { name: "Ekiti", code: "EKI", slug: "ekiti", zone: "SW", inec: "13" },
  { name: "Enugu", code: "ENU", slug: "enugu", zone: "SE", inec: "14" },
  { name: "Gombe", code: "GOM", slug: "gombe", zone: "NE", inec: "15" },
  { name: "Imo", code: "IMO", slug: "imo", zone: "SE", inec: "16" },
  { name: "Jigawa", code: "JIG", slug: "jigawa", zone: "NW", inec: "17" },
  { name: "Kaduna", code: "KAD", slug: "kaduna", zone: "NW", inec: "18" },
  { name: "Kano", code: "KAN", slug: "kano", zone: "NW", inec: "19" },
  { name: "Katsina", code: "KAT", slug: "katsina", zone: "NW", inec: "20" },
  { name: "Kebbi", code: "KEB", slug: "kebbi", zone: "NW", inec: "21" },
  { name: "Kogi", code: "KOG", slug: "kogi", zone: "NC", inec: "22" },
  { name: "Kwara", code: "KWA", slug: "kwara", zone: "NC", inec: "23" },
  { name: "Lagos", code: "LAG", slug: "lagos", zone: "SW", inec: "24" },
  { name: "Nasarawa", code: "NAS", slug: "nasarawa", zone: "NC", inec: "25" },
  { name: "Niger", code: "NIG", slug: "niger", zone: "NC", inec: "26" },
  { name: "Ogun", code: "OGU", slug: "ogun", zone: "SW", inec: "27" },
  { name: "Ondo", code: "OND", slug: "ondo", zone: "SW", inec: "28" },
  { name: "Osun", code: "OSU", slug: "osun", zone: "SW", inec: "29" },
  { name: "Oyo", code: "OYO", slug: "oyo", zone: "SW", inec: "30" },
  { name: "Plateau", code: "PLA", slug: "plateau", zone: "NC", inec: "31" },
  { name: "Rivers", code: "RIV", slug: "rivers", zone: "SS", inec: "32" },
  { name: "Sokoto", code: "SOK", slug: "sokoto", zone: "NW", inec: "33" },
  { name: "Taraba", code: "TAR", slug: "taraba", zone: "NE", inec: "34" },
  { name: "Yobe", code: "YOB", slug: "yobe", zone: "NE", inec: "35" },
  { name: "Zamfara", code: "ZAM", slug: "zamfara", zone: "NW", inec: "36" },
  /* The source file, and INEC's own delimitation, call this one Abuja. The
     constitution does not, and neither does the rest of the site. */
  {
    name: "Federal Capital Territory",
    code: "FCT",
    slug: "abuja",
    zone: "NC",
    inec: "37",
    sourceFile: "federal-capital-territory",
  },
];

/** Display name -> row. */
export const stateByName = new Map(states.map((state) => [state.name, state]));

/** INEC's own two-digit state number -> row. */
export const stateByInec = new Map(states.map((state) => [state.inec, state]));

/** The file in public/geo that holds a state's LGAs and wards. */
export function slugFor(name) {
  return stateByName.get(name)?.slug ?? null;
}
