// Siembra el corpus con data/seed-sites.json (o un archivo propio): N capturas en paralelo,
// salta lo ya capturado (--force recaptura), deja las fallas en ~/.design-mcp/seed-failures.json.
// pnpm seed [--file path] [--concurrency 3] [--only fintech] [--limit 20] [--force]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { captureSite, closeBrowser } from "../src/capture/capture.js";
import { HOME, getSite, siteIdFromUrl } from "../src/db.js";

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const file = opt("file", "data/seed-sites.json")!;
const concurrency = +opt("concurrency", "3")!;
const only = opt("only");
const limit = opt("limit") ? +opt("limit")! : Infinity;
const force = args.includes("--force");

type Seed = { url: string; industry?: string[]; tags?: string[]; name?: string };
let sites: Seed[] = JSON.parse(readFileSync(file, "utf8")).sites;
if (only) sites = sites.filter((s) => s.industry?.includes(only) || s.tags?.includes(only));
if (!force) sites = sites.filter((s) => !getSite(siteIdFromUrl(s.url)));
sites = sites.slice(0, limit);
console.log(`Capturando ${sites.length} sitios (concurrencia ${concurrency})…`);

const failures: Array<{ url: string; error: string }> = [];
let done = 0;
const t0 = Date.now();
async function worker() {
  while (sites.length) {
    const s = sites.shift()!;
    try {
      const { record, ms } = await captureSite(s.url, { tags: s.tags, industry: s.industry?.length ? s.industry : undefined });
      done++;
      console.log(`✓ [${done}] ${record.id} ${(ms / 1000).toFixed(1)}s · ${record.dna.theme} · ${record.dna.sequence.join("›")}`);
    } catch (e) {
      failures.push({ url: s.url, error: (e as Error).message.split("\n")[0] });
      console.log(`✗ ${s.url}: ${(e as Error).message.split("\n")[0]}`);
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
await closeBrowser();
writeFileSync(join(HOME, "seed-failures.json"), JSON.stringify(failures, null, 1));
console.log(`Listo: ${done} capturados, ${failures.length} fallidos en ${Math.round((Date.now() - t0) / 1000)}s`);
