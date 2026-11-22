// Extract Demo + GitHub links per project page -> output/app-registry-seed.json
const slugs = JSON.parse(await (await import("node:fs")).promises.readFile("output/hackathon-projects.json", "utf8")).map(p => p.slug).filter(s => s && s !== "?");
const strip = s => s.replace(/<[^>]+>/g, "").trim();
const out = [];
const chunk = 8;
for (let i = 0; i < slugs.length; i += chunk) {
  const batch = await Promise.allSettled(slugs.slice(i, i + chunk).map(async slug => {
    const res = await fetch(`https://build.qorechain.io/p/${slug}`, { headers: { "user-agent": "zeni-scan/1" } });
    const html = await res.text();
    // anchors whose inner text is exactly Demo / GitHub / Website / Docs
    const links = {};
    for (const m of html.matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const label = strip(m[2]);
      if (/^(demo|website|live|app|docs|github)$/i.test(label) && !links[label.toLowerCase()]) {
        links[label.toLowerCase()] = m[1];
      }
    }
    const title = strip(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").replace(/ \| Build Before Q-Day$/, "");
    const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
    return { slug, title, desc, demo: links.demo || links.website || links.live || links.app || "", github: links.github || "", docs: links.docs || "" };
  }));
  for (const r of batch) if (r.status === "fulfilled") out.push(r.value);
}
await (await import("node:fs")).promises.writeFile("output/app-registry-seed.json", JSON.stringify(out, null, 2));
const withDemo = out.filter(p => p.demo && !p.demo.includes("cloudfront") && !p.demo.includes("avatars.githubusercontent"));
console.log(`total ${out.length}, with real demo URL: ${withDemo.length}`);
withDemo.forEach(p => console.log(`${p.slug} :: ${p.demo}`));
