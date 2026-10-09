// pnpm build:explore — página pública "Explorar" (estilo Discover de Mobbin) con el corpus:
// exporta miniaturas WebP (cwebp) + data.json a site/public/explorar/. Las imágenes son de sitios
// de terceros: solo miniaturas, siempre con enlace al original, y NO entran al repo (.gitignore).
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { allSites } from "../src/db.js";
import { fontAvailability } from "../src/analysis/fonts.js";
import { CHALLENGE } from "../src/capture/capture.js";
import type { SiteRecord } from "../src/types.js";

const run = promisify(execFile);
const OUT = "site/public/explorar";
const IMG = join(OUT, "img");
const MAX_HOME_SECTIONS = 14;
const MAX_PRICING_SECTIONS = 6;
const SKIP = new Set(["banner"]);

if (existsSync(IMG)) rmSync(IMG, { recursive: true });
mkdirSync(IMG, { recursive: true });

const jobs: Array<{ src: string; dst: string; w: number }> = [];
const slug = (s: string) => s.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
function img(src: string | undefined, name: string, w: number): string | undefined {
  if (!src || !existsSync(src)) return undefined;
  const rel = `img/${name}.webp`;
  jobs.push({ src, dst: join(OUT, rel), w });
  return rel;
}

// fuera de la vista pública: lo capturado como referencia interna (p. ej. páginas de la competencia)
const desktop = allSites().filter((s) => (s.viewport ?? "desktop") === "desktop" && !s.tags.includes("referencia-matiz"));
const byHost = new Map<string, SiteRecord[]>();
for (const s of desktop) {
  const l = byHost.get(s.host ?? s.id) ?? [];
  l.push(s);
  byHost.set(s.host ?? s.id, l);
}

const ORDER = ["home", "pricing", "features", "customers", "about", "signup", "login", "changelog", "blog", "integrations", "enterprise", "security", "careers", "contact", "docs"];
const brands = [];
for (const [host, pages] of byHost) {
  const known = pages.filter((p) => ORDER.includes(p.page ?? "home"));
  known.sort((a, b) => ORDER.indexOf(a.page ?? "home") - ORDER.indexOf(b.page ?? "home"));
  // una marca entra con su portada; sin portada no hay tarjeta
  const home = known.find((p) => (p.page ?? "home") === "home");
  if (!home || !home.shots.heroThumb || !existsSync(home.shots.heroThumb)) continue;
  // capturas viejas de una página de desafío anti-bot: fuera de la vista pública
  if (CHALLENGE.test(`${home.title} ${home.dna.sections.slice(0, 3).map((x) => x.text).join(" ")}`)) continue;
  const d = home.dna;
  const fam = d.typography.display?.family ?? d.typography.body?.family ?? "";
  const av = fam ? fontAvailability(fam) : undefined;
  const hs = slug(host);
  const outPages = [];
  for (const p of known) {
    const page = p.page ?? "home";
    const hero = img(p.shots.heroThumb, `${hs}/${page}`, 720);
    if (!hero) continue;
    const limit = page === "home" ? MAX_HOME_SECTIONS : page === "pricing" ? MAX_PRICING_SECTIONS : 0;
    const sections = p.dna.sections
      .filter((x) => !SKIP.has(x.type) && x.height >= 100 && x.thumb)
      .slice(0, limit)
      .map((x) => ({ type: x.type, img: img(x.thumb, `${hs}/${page}-${x.idx}`, 560), h: Math.min(x.height, 1800) }))
      .filter((x) => x.img);
    outPages.push({ page, url: p.url, hero, sections });
  }
  brands.push({
    host,
    name: home.name,
    url: home.url,
    industry: home.industry,
    captured: home.capturedAt.slice(0, 10),
    theme: d.theme,
    accent: d.palette.accent ?? null,
    palette: [d.palette.background, d.palette.surface, d.palette.text, d.palette.mutedText, d.palette.accent, d.palette.accent2].filter(Boolean),
    font: fam.replace(/^_+|_[0-9a-f]{5,}$/gi, ""),
    free: av?.free ? av.freeAs : av?.alternatives?.[0],
    sequence: d.sequence,
    pages: outPages,
  });
}
brands.sort((a, b) => b.captured.localeCompare(a.captured) || a.name.localeCompare(b.name));

// conversión en paralelo
let done = 0;
async function worker() {
  while (jobs.length) {
    const j = jobs.shift()!;
    mkdirSync(join(j.dst, ".."), { recursive: true });
    await run("cwebp", ["-quiet", "-q", "72", "-resize", String(j.w), "0", j.src, "-o", j.dst]);
    done++;
  }
}
const total = jobs.length;
await Promise.all(Array.from({ length: 8 }, worker));
writeFileSync(join(OUT, "data.json"), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), brands }));
copyFileSync("site/explorar.html", join(OUT, "index.html"));
console.log(`${brands.length} marcas · ${done}/${total} imágenes → ${OUT}`);
