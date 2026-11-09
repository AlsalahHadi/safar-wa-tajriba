#!/usr/bin/env node
/*
 Fills the verified-ratings table (RTD) inside index.html.

   restaurants -> Google Maps rating  (Google Places API "New", Text Search)
   activities  -> TripAdvisor rating  (TripAdvisor Content API: search + details)

 The planner then hides any restaurant under 4.0 on Google, and any activity
 under 4.0 on TripAdvisor, whenever that place has at least 50 reviews.
 Places with fewer than 50 reviews are kept (the rule does not apply to them).
 Places that could not be matched stay "unverified" and are hidden once any ratings exist.
 Hotels show a Booking.com score (out of 10) as a tag only; it comes from tools/booking_ratings.json.

 Usage (Node 18+):
   GOOGLE_PLACES_API_KEY=... TRIPADVISOR_API_KEY=... node tools/update_ratings.mjs
   options: --only=restaurants | --only=activities   --dry (no file written)   --file=path/to/index.html

 Notes: check Google Maps Platform / TripAdvisor terms about storing and displaying ratings
 (attribution, caching limits) before publishing the resulting page.
*/
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const START = "/*RTD-START*/", END = "/*RTD-END*/";

export function loadVenues(html){
  const js = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));
  const grab = re => { const m = js.match(re); if (!m) throw new Error("planner data not found: " + re); return m[0]; };
  const code = grab(/const MSN=[^;]*;/) + grab(/const D=\[[^\]]*\];/) + grab(/const LV=[^\n]*;/) + grab(/const ACTS=[^;]*;/)
    + js.slice(js.indexOf("const DST="), js.indexOf("const AD=")) + ";return{DST,MEALS};";
  const {DST, MEALS} = new Function(code)();
  const restaurants = new Map(), activities = new Map();
  for (const dest of Object.keys(DST)) {
    const city = DST[dest].c;
    for (const m of Object.keys(DST[dest].r)) DST[dest].r[m].forEach(r => restaurants.set(r[0], city));
    for (const m of Object.keys(MEALS[dest])) MEALS[dest][m].forEach(list => list.forEach(r => restaurants.set(r[0], city)));
    for (const m of Object.keys(DST[dest].x)) DST[dest].x[m].forEach(a => activities.set(a[1], city));
  }
  return {restaurants, activities};
}

const norm = s => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const similar = (a, b) => { const x = norm(a), y = norm(b); if (!x || !y) return false; if (x.includes(y) || y.includes(x)) return true;
  const A = new Set(x.split(" ")), B = y.split(" "); return B.filter(w => w.length > 2 && A.has(w)).length >= Math.min(2, B.length); };

async function googleRating(name, city, key, fetchFn){
  const r = await fetchFn("https://places.googleapis.com/v1/places:searchText", {method: "POST",
    headers: {"Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount"},
    body: JSON.stringify({textQuery: name + " " + city, maxResultCount: 3})});
  if (!r.ok) throw new Error("Google " + r.status);
  const j = await r.json(), p = (j.places || []).find(p => similar(p.displayName?.text || "", name));
  return p ? [Number(p.rating || 0), Number(p.userRatingCount || 0)] : null;
}
async function tripadvisorRating(name, city, key, fetchFn){
  const q = new URLSearchParams({key, searchQuery: name + " " + city, language: "en"});
  const s = await fetchFn("https://api.content.tripadvisor.com/api/v1/location/search?" + q);
  if (!s.ok) throw new Error("TripAdvisor search " + s.status);
  const hit = ((await s.json()).data || []).find(x => similar(x.name || "", name));
  if (!hit) return null;
  const d = await fetchFn(`https://api.content.tripadvisor.com/api/v1/location/${hit.location_id}/details?` + new URLSearchParams({key, language: "en"}));
  if (!d.ok) throw new Error("TripAdvisor details " + d.status);
  const j = await d.json();
  return [Number(j.rating || 0), Number(j.num_reviews || 0)];
}

async function pool(items, n, fn){ const out = []; let i = 0;
  await Promise.all(Array.from({length: n}, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } })); return out; }

export async function run({file, only, dry, env = process.env, fetchFn = fetch, log = console.log}){
  let html = fs.readFileSync(file, "utf8");
  const {restaurants, activities} = loadVenues(html);
  const cur = JSON.parse(html.slice(html.indexOf(START) + START.length, html.indexOf(END)).replace(/^const RTD=/, "").replace(/;$/, "") || "{}");
  const RTD = {...cur}; let ok = 0, miss = 0, fail = 0;
  const jobs = [];
  if (only !== "activities") { if (!env.GOOGLE_PLACES_API_KEY) throw new Error("GOOGLE_PLACES_API_KEY is not set"); for (const [n, c] of restaurants) jobs.push(["g", n, c]); }
  if (only !== "restaurants") { if (!env.TRIPADVISOR_API_KEY) throw new Error("TRIPADVISOR_API_KEY is not set"); for (const [n, c] of activities) jobs.push(["t", n, c]); }
  await pool(jobs, 4, async ([k, n, c]) => {
    try {
      const v = k == "g" ? await googleRating(n, c, env.GOOGLE_PLACES_API_KEY, fetchFn) : await tripadvisorRating(n, c, env.TRIPADVISOR_API_KEY, fetchFn);
      if (v) { (RTD[n] ||= {})[k] = v; ok++; } else { miss++; log("no match:", k, n, "-", c); }
    } catch (e) { fail++; log("failed:", k, n, e.message); }
  });
  log(`done: ${ok} rated, ${miss} unmatched (stay hidden), ${fail} errors; jobs ${jobs.length}`);
  // Hotels: Booking.com has no public ratings API (only the partner Demand API), so scores come from
  // tools/booking_ratings.json: {"Hotel name": [score_out_of_10, review_count]} filled from your Booking.com partner data or by hand.
  try { const bf = path.join(path.dirname(fileURLToPath(import.meta.url)), "booking_ratings.json");
    if (fs.existsSync(bf)) { const B = JSON.parse(fs.readFileSync(bf, "utf8")); let nb = 0;
      for (const [n, v] of Object.entries(B)) if (Array.isArray(v) && !n.startsWith("_")) { (RTD[n] ||= {}).b = v; nb++; } log(`hotels: ${nb} Booking.com ratings merged`); } } catch (e) { log("booking_ratings.json:", e.message); }
  const block = START + "const RTD=" + JSON.stringify(RTD) + ";" + END;
  if (!dry) { html = html.slice(0, html.indexOf(START)) + block + html.slice(html.indexOf(END) + END.length); fs.writeFileSync(file, html);
    fs.writeFileSync(path.join(path.dirname(file), "ratings.json"), JSON.stringify(RTD, null, 1)); log("index.html and ratings.json updated"); }
  return RTD;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = n => (process.argv.find(a => a.startsWith("--" + n + "=")) || "").split("=")[1];
  run({file: arg("file") || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.html"), only: arg("only"), dry: process.argv.includes("--dry")})
    .catch(e => { console.error(e.message); process.exit(1); });
}
