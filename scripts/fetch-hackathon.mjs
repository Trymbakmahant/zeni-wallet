// Live hackathon data fetcher — parses SSR HTML from build.qorechain.io
// Usage: node scripts/fetch-hackathon.mjs [--details]

const BASE = "https://build.qorechain.io";
const wantDetails = process.argv.includes("--details");

const stripTags = (s) => s.replace(/<[^>]+>/g, "").replace(/<!-- -->/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16))).trim();

async function get(path) {
  const res = await fetch(BASE + path, { headers: { "user-agent": "zeni-hackathon-scan/1.0" } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.text();
}

// ---- /projects ----
const projectsHtml = await get("/projects");

// Community picks section
const communityStart = projectsHtml.indexOf("picks-title");
const allMarker = projectsHtml.match(/All projects \((\d+)\)/);
const allProjectsStart = projectsHtml.indexOf("All projects");
const communitySnippet = communityStart > -1 && allProjectsStart > communityStart
  ? projectsHtml.slice(communityStart, allProjectsStart) : "";

const cardRegex = /<a class="group block" href="\/p\/([^"]+)"[\s\S]*?<span[^>]*>#<!-- -->(\d+)<\/span>[\s\S]*?<p class="font-sans text-lg font-semibold[^"]*">([^<]+)<\/p>[\s\S]*?<span class="font-mono text-xs text-fg-subtle">([^<]+)<\/span>/g;

console.log("=== COMMUNITY PICKS (leaderboard) ===");
const picks = [];
for (const m of communitySnippet.matchAll(cardRegex)) {
  const [, slug, rank, name, votes] = m;
  picks.push({ rank: +rank, slug, name, votes });
  console.log(`#${rank} ${name} (${slug}): ${votes}`);
}

// All projects — every href="/p/<slug>" occurrence, deduped, with nearby title text
console.log("\n=== ALL PROJECT SLUGS ===");
const slugSet = new Map();
for (const m of projectsHtml.matchAll(/href="\/p\/([a-z0-9-]+)"/g)) {
  slugSet.set(m[1], (slugSet.get(m[1]) || 0) + 1);
}
const slugs = [...slugSet.keys()];
console.log(`found ${slugs.length} unique project slugs (page claims ${allMarker?.[1] ?? "?"})`);

// Try to extract project cards: slug + title + tagline
// Cards are typically <a href="/p/slug" ...> ...title... ...desc... </a>
const projects = [];
const cardBlock = /<a[^>]*href="\/p\/([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/g;
for (const m of projectsHtml.matchAll(cardBlock)) {
  const [, slug, inner] = m;
  const text = stripTags(inner).replace(/\s+/g, " ").trim();
  if (!projects.find(p => p.slug === slug)) projects.push({ slug, text });
}

// ---- /feed ----
console.log("\n=== FEED (latest activity) ===");
let feedItems = [];
try {
  const feedHtml = await get("/feed");
  // Look for project links + commit messages + relative times
  const feedBlocks = feedHtml.matchAll(/href="\/p\/([a-z0-9-]+)"[\s\S]{0,2000}?(?:ago|minutes|hours)/g);
  const seen = new Set();
  for (const m of feedBlocks) {
    const snippet = stripTags(m[0]).replace(/\s+/g, " ").trim().slice(0, 220);
    const key = m[1] + snippet.slice(0, 60);
    if (!seen.has(key)) { seen.add(key); feedItems.push({ slug: m[1], snippet }); }
  }
  feedItems.slice(0, 40).forEach(f => console.log(`[${f.slug}] ${f.snippet}`));
  console.log(`(${feedItems.length} feed items parsed)`);
} catch (e) {
  console.log("feed fetch failed:", e.message);
}

// ---- per-project detail pages ----
if (wantDetails) {
  console.log("\n=== PROJECT DETAILS ===");
  const details = [];
  const chunk = 8;
  for (let i = 0; i < slugs.length; i += chunk) {
    const batch = slugs.slice(i, i + chunk);
    const results = await Promise.allSettled(batch.map(async (slug) => {
      const html = await get(`/p/${slug}`);
      // title: <title> or first h1
      const title = stripTags(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
      // description / tagline heuristics
      const descMatch = html.match(/<meta name="description" content="([^"]*)"/) || html.match(/<meta property="og:description" content="([^"]*)"/);
      const desc = descMatch ? descMatch[1].slice(0, 300) : "";
      // verified vs declared list items: text-ok = verified
      const verified = [...html.matchAll(/<li[^>]*>[\s\S]*?text-ok[\s\S]*?<\/li>/g)].map(m => stripTags(m[0]).replace(/\s+/g, " ").trim()).filter(Boolean);
      const declared = [...html.matchAll(/<li[^>]*>[\s\S]*?text-fg-subtle[\s\S]*?<\/li>/g)].map(m => stripTags(m[0]).replace(/\s+/g, " ").trim()).filter(Boolean);
      // external links (github, demo)
      const links = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(m => m[1]).filter(u => !u.includes("qorechain.io") && !u.includes("qore.network"));
      const github = links.find(u => u.includes("github.com")) ?? "";
      const demo = links.find(u => !u.includes("github.com")) ?? "";
      return { slug, title, desc, verified, declared, github, demo };
    }));
    for (const r of results) {
      if (r.status === "fulfilled") details.push(r.value);
      else details.push({ slug: "?", error: r.reason?.message });
    }
  }
  const fs = await import("node:fs");
  fs.writeFileSync("output/hackathon-projects.json", JSON.stringify(details, null, 2));
  console.log(`wrote ${details.length} project details -> output/hackathon-projects.json`);
  // quick category guess by keyword
  const cats = {};
  for (const d of details) {
    const t = `${d.slug} ${d.title} ${d.desc}`.toLowerCase();
    const cat =
      /defi|swap|dex|amm|lend|borrow|yield|stak|liquidity|perp|trading|trade/.test(t) ? "defi" :
      /nft|marketplace|art|collect/.test(t) ? "nft" :
      /game|play|quest|gamif/.test(t) ? "gaming" :
      /ai|agent|llm|bot|model/.test(t) ? "ai" :
      /bridge|cross|interop|multi.?chain/.test(t) ? "bridge/interop" :
      /privacy|zk|anon|mixer|private/.test(t) ? "privacy" :
      /identity|did|kyc|credential|attest/.test(t) ? "identity" :
      /social|chat|messaging|community|dao|governance|voting/.test(t) ? "social/dao" :
      /tool|sdk|dev|infra|indexer|explorer|analytics|monitor/.test(t) ? "devtools/infra" :
      /wallet|payment|pay|checkout|ramp/.test(t) ? "wallet/payments" :
      /rwa|real.?world|asset|tokeniz/.test(t) ? "rwa" :
      /oracle|data|price/.test(t) ? "oracle/data" : "other";
    cats[cat] = (cats[cat] || 0) + 1;
    d._cat = cat;
  }
  console.log("\n=== CATEGORY GUESS ===");
  Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log(`${c}: ${n}`));
  fs.writeFileSync("output/hackathon-projects.json", JSON.stringify(details, null, 2));
}
