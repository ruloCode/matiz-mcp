// Siembra el corpus desde una lista de sitios públicos: N capturas en paralelo, salta lo ya
// capturado (también por dominio: un sitio que redirige queda con otro id).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureSite, discoverPages } from "./capture/capture.js";
import { HOME, allSites, getSite, homeSites, siteIdFromUrl } from "./db.js";

export const BUNDLED_SEED = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "seed-sites.json");

type Seed = { url: string; industry?: string[]; tags?: string[]; name?: string };

export interface SeedOptions {
  file?: string;
  concurrency?: number;
  only?: string;
  limit?: number;
  force?: boolean;
  /** recaptura los sitios del corpus que no tienen screenshots en esta máquina */
  imagesOnly?: boolean;
  /** descubre y captura páginas internas (pricing, signup…) de cada portada del corpus */
  pages?: boolean;
  maxPages?: number;
  /** captura la versión móvil (390 px) de cada portada del corpus */
  mobile?: boolean;
  log?: (m: string) => void;
}

const host = (u: string) => new URL(/^https?:/.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "");

export async function seed(o: SeedOptions = {}) {
  const log = o.log ?? ((m: string) => console.log(m));
  let sites: Seed[];
  if (o.imagesOnly) {
    sites = allSites()
      .filter((s) => !s.shots.heroThumb)
      .map((s) => ({ url: s.url, tags: s.tags, industry: s.tags.includes("curated") ? s.industry : undefined, name: s.name }));
  } else {
    sites = JSON.parse(readFileSync(o.file ?? BUNDLED_SEED, "utf8")).sites;
    if (o.only) sites = sites.filter((s) => s.industry?.includes(o.only!) || s.tags?.includes(o.only!));
    const capturedHosts = new Set(allSites().map((s) => host(s.url)));
    if (!o.force) sites = sites.filter((s) => !getSite(siteIdFromUrl(s.url)) && !capturedHosts.has(host(s.url)));
  }
  type Job = Seed & { page?: string; viewport?: "desktop" | "mobile" };
  let jobs: Job[] = sites;
  if (o.pages || o.mobile) {
    const homes = homeSites().filter((h) => !o.only || h.industry.includes(o.only) || h.tags.includes(o.only));
    const have = new Set(allSites().map((s) => s.id));
    jobs = [];
    if (o.mobile)
      for (const h of homes) if (!have.has(`${h.id}@m`)) jobs.push({ url: h.url, tags: h.tags, name: h.name, industry: h.tags.includes("curated") ? h.industry : undefined, viewport: "mobile" });
    if (o.pages) {
      log(`Buscando páginas internas en ${homes.length} portadas…`);
      const queue = [...homes];
      const found: Job[] = [];
      await Promise.all(
        Array.from({ length: o.concurrency ?? 3 }, async () => {
          while (queue.length) {
            const h = queue.shift()!;
            try {
              for (const p of await discoverPages(h.url, o.maxPages ?? 6))
                if (!have.has(siteIdFromUrl(p.url)))
                  found.push({ url: p.url, page: p.type, name: h.name, tags: h.tags, industry: h.tags.includes("curated") ? h.industry : undefined });
            } catch (e) {
              log(`✗ ${h.url} (descubrir): ${(e as Error).message.split("\n")[0]}`);
            }
          }
        }),
      );
      log(`${found.length} páginas internas nuevas`);
      jobs.push(...found);
    }
  }
  jobs = jobs.slice(0, o.limit ?? Infinity);
  sites = jobs;
  log(`Capturando ${sites.length} páginas (concurrencia ${o.concurrency ?? 3})…`);
  const failures: Array<{ url: string; error: string }> = [];
  let done = 0;
  async function worker() {
    while (sites.length) {
      const s = sites.shift()! as Job;
      try {
        const { record, ms } = await captureSite(s.url, {
          tags: s.tags,
          industry: s.industry?.length ? s.industry : undefined,
          name: s.name,
          page: s.page,
          viewport: s.viewport,
        });
        done++;
        log(`✓ [${done}] ${record.id} ${(ms / 1000).toFixed(1)}s · ${record.dna.theme} · ${record.dna.sequence.join("›")}`);
      } catch (e) {
        failures.push({ url: s.url, error: (e as Error).message.split("\n")[0] });
        log(`✗ ${s.url}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
  }
  await Promise.all(Array.from({ length: o.concurrency ?? 3 }, worker));
  writeFileSync(join(HOME, "seed-failures.json"), JSON.stringify(failures, null, 1));
  return { done, failures };
}
