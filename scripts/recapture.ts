// pnpm recapture <archivo.json | host…> — recaptura portadas conservando nombre, etiquetas e industria,
// y las marca como obsoletas en la evaluación (sus índices de sección pueden moverse).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { captureSite, closeBrowser } from "../src/capture/capture.js";
import { homeSites, hostOf } from "../src/db.js";

const args = process.argv.slice(2);
const urls: string[] = args.filter((a) => !a.startsWith("--")).flatMap((a) => (a.endsWith(".json") ? JSON.parse(readFileSync(a, "utf8")).sites.map((s: { url: string }) => s.url) : [a]));
const all = args.includes("--all");
const hosts = new Set(urls.map(hostOf));
const targets = homeSites().filter((h) => all ? !h.tags.includes("referencia-matiz") : hosts.has(h.host ?? ""));
let ok = 0;
const queue = [...targets];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const h = queue.shift()!;
      try {
        await captureSite(h.url, { name: h.name, tags: h.tags, industry: h.tags.includes("curated") ? h.industry : undefined, page: "home" });
        ok++;
      } catch (e) {
        console.log("✗", h.url, (e as Error).message.split("\n")[0]);
      }
    }
  }),
);
await closeBrowser();
const f = "research/eval/stale-sites.json";
const prev: string[] = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : [];
writeFileSync(f, JSON.stringify([...new Set([...prev, ...targets.map((t) => t.id)])].sort(), null, 1));
console.log(`${ok}/${targets.length} portadas recapturadas`);
process.exit(0);
