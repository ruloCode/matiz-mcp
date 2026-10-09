// pnpm build:explore — página pública "Explorar" (estilo Discover de Mobbin) con el corpus:
// exporta miniaturas WebP (cwebp) + data.json a site/public/explorar/. Las imágenes son de sitios
// de terceros: solo miniaturas, siempre con enlace al original, y NO entran al repo (.gitignore).
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { SHOTS, allSites } from "../src/db.js";
import { fontAvailability, freeFont } from "../src/analysis/fonts.js";
import { homeSites } from "../src/db.js";
import { distinctiveTraits } from "../src/analysis/uniqueness.js";
import { toCssVariables, toTailwindTheme } from "../src/analysis/exports.js";
import { toDesignMd } from "../src/analysis/designmd.js";
import { contrastRatio, parseColor, tonalScale } from "../src/analysis/color.js";
import { CHALLENGE } from "../src/capture/capture.js";
import type { SiteRecord } from "../src/types.js";

const run = promisify(execFile);
// --sx-1mc3c6y: nombres que genera un CSS-in-JS. Son variables reales, pero su nombre no dice nada
const isHashed = (n: string) => /-(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{5,10}$/i.test(n) && !/-(\d{2,4}|[a-z]\d{1,3})$/i.test(n);
const hashedShare = (ns: string[]) => (ns.length ? +(ns.filter(isHashed).length / ns.length).toFixed(2) : 0);
const OUT = "site/public/explorar";
const IMG = join(OUT, "img");
const MAX_HOME_SECTIONS = 14;
const MAX_PRICING_SECTIONS = 6;
const SKIP = new Set(["banner"]);

if (existsSync(IMG)) rmSync(IMG, { recursive: true });
if (existsSync(join(OUT, "brands"))) rmSync(join(OUT, "brands"), { recursive: true });
mkdirSync(IMG, { recursive: true });

const jobs: Array<{ src: string; dst: string; w: number }> = [];
const slug = (s: string) => s.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
function pngWidth(f: string): number {
  const b = readFileSync(f);
  return b.readUInt32BE(16);
}
function img(src: string | undefined, name: string, w: number): string | undefined {
  if (!src || !existsSync(src)) return undefined;
  if (w <= 0) w = Math.min(960, pngWidth(src));
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

// ---------- métricas comparables: lo que hace distinta a una marca frente al catálogo ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Deep = Record<string, any>;
const ms = (d: string) => (d.endsWith("ms") ? parseFloat(d) : parseFloat(d) * 1000);
function metricsOf(x: Deep, d: SiteRecord["dna"]): Record<string, number | null> {
  const prim = (x.buttons ?? []).find((b: Deep) => b.role === "primary") ?? x.buttons?.[0];
  const rh = (x.spacing?.rhythm ?? []).filter((r: Deep) => r.padTop > 0 && r.padTop < 400);
  const pads = rh.map((r: Deep) => (r.padTop + Math.min(r.padBottom, 400)) / 2).sort((a: number, b: number) => a - b);
  const durs: Array<{ value: string; count: number }> = x.motion?.durations ?? [];
  const dn = durs.reduce((n, v) => n + v.count, 0);
  const h1 = x.headings?.h1 ?? x.headings?.h2;
  const elev = (x.shadows ?? []).map((s: Deep) => s.elevation);
  const rnd = (v: number | null | undefined, k = 1) => (v == null || Number.isNaN(v) ? null : Math.round(v * k) / k);
  return {
    btnRadius: prim ? rnd(prim.pill ? prim.height / 2 : Math.min(prim.radius, prim.height / 2)) : null,
    btnHeight: prim ? prim.height : null,
    btnPadX: prim ? prim.padX : null,
    cardRadius: x.cards?.[0] ? x.cards[0].radius : null,
    cardPad: x.cards?.[0] ? Math.max(...x.cards[0].padding) : null,
    sectionPad: pads.length ? rnd(pads[Math.floor(pads.length / 2)]) : null,
    container: x.spacing?.container?.[0] ?? d.layout.contentWidth ?? null,
    shadows: (x.shadows ?? []).length,
    elevation: elev.length ? Math.max(...elev) : 0,
    transitions: x.motion?.withTransition ?? 0,
    duration: dn ? rnd(durs.reduce((n, v) => n + ms(v.value) * v.count, 0) / dn) : null,
    keyframes: x.motion?.keyframeCount ?? 0,
    reveals: x.reveal?.revealed ?? 0,
    hovers: (x.states ?? []).reduce((n: number, s: Deep) => n + s.changes.length, 0),
    h1Size: h1 ? h1.size : null,
    h1Tracking: h1 ? rnd(h1.ls * 100, 10) : null,
    bodySize: x.headings?.body?.size ?? null,
    navHeight: x.nav?.height ?? null,
    images: x.imagery?.images ?? 0,
    breakpoints: (x.breakpoints ?? []).length,
  };
}

const corpusDna = homeSites().filter((h) => !h.tags.includes("referencia-matiz")).map((h) => h.dna);
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
  // ---------- ADN completo de la marca (archivo propio, se carga al abrir la ficha) ----------
  const sys = d.system;
  const bgRgb = parseColor(d.palette.background);
  const cr = (hex?: string) => (hex && bgRgb && parseColor(hex) ? +contrastRatio(parseColor(hex)!, bgRgb).toFixed(2) : null);
  const acc = d.palette.accent ? parseColor(d.palette.accent) : null;
  // el logo SVG viaja como data URI para <img>: así no puede ejecutar nada en nuestra página
  let logo: unknown = null;
  if (sys?.logo?.type === "svg") {
    const color = parseColor(sys.logo.color);
    const svg = sys.logo.svg.replace(/currentColor/g, color ? `rgb(${color.r},${color.g},${color.b})` : "#111").replace(/<script[\s\S]*?<\/script>/gi, "")
      // sin xmlns un SVG servido como imagen no se pinta (el logo de Linear salía roto)
      .replace(/^<svg(?![^>]*\sxmlns=)/, '<svg xmlns="http://www.w3.org/2000/svg"')
      .replace(/^<svg(?![^>]*xmlns:xlink)([^>]*xlink:)/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"$1');
    logo = { type: "svg", src: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, w: sys.logo.w, h: sys.logo.h };
  } else if (sys?.logo?.type === "img") logo = { type: "img", src: sys.logo.src, w: sys.logo.w, h: sys.logo.h };
  const freeName = (family: string) => {
    const av = fontAvailability(family);
    const name = av.free ? av.freeAs : av.alternatives?.[0];
    return name && freeFont(name)?.c ? name : name;
  };
  const dnaOut = {
    host,
    name: home.name,
    url: home.url,
    captured: home.capturedAt.slice(0, 10),
    theme: d.theme,
    traits: distinctiveTraits(d, corpusDna).map((t) => ({ kind: t.kind, value: t.value, text: t.text })),
    logo,
    favicon: sys?.favicon ?? null,
    roles: [
      ["Fondo", d.palette.background], ["Superficie", d.palette.surface], ["Texto", d.palette.text], ["Secundario", d.palette.mutedText],
      ["Acento", d.palette.accent], ["Acento 2", d.palette.accent2], ["Borde", d.palette.border],
    ].filter((x) => x[1]).map(([role, hex]) => ({
      role,
      hex,
      contrast: role === "Fondo" ? null : cr(hex as string),
      // procedencia: las variables declaradas que resuelven a este mismo color
      vars: (sys?.tokens.colors ?? []).filter((c) => c.hex === hex).map((c) => c.name).slice(0, 2),
    })),
    accentScale: acc ? tonalScale(acc) : null,
    gradients: sys?.gradients ?? [],
    tokens: sys ? { total: sys.tokens.total, hashed: hashedShare(sys.tokens.colors.map((c) => c.name)), colors: [...sys.tokens.colors].sort((a, b) => Number(isHashed(a.name)) - Number(isHashed(b.name))).slice(0, 32).map((c) => ({ ...c, hashed: isHashed(c.name) || undefined })), scales: sys.tokens.scales.slice(0, 6), sizes: sys.tokens.sizes.slice(0, 30), fonts: sys.tokens.fonts.slice(0, 6), shadows: sys.tokens.shadows.slice(0, 6) } : null,
    fonts: (sys?.fonts ?? d.typography.families.map((f) => ({ family: f.family, class: f.class, share: f.share, weights: [], free: false }))).map((f) => ({ ...f, use: freeName(f.family) })),
    typeScale: sys?.typeScale ?? [],
    weights: sys?.weights ?? [],
    base: d.typography.baseSize,
    ratio: d.typography.scaleRatio,
    radius: { typical: d.shape.radius, scale: d.shape.scale, pill: d.shape.pill },
    shadows: d.shape.shadowSamples,
    spacing: d.spacing,
    borderWidth: sys?.borderWidth ?? null,
    buttons: d.buttons,
    card: sys?.card ?? null,
    input: sys?.input ?? null,
    link: sys?.link ?? null,
    motion: sys?.motion ?? null,
    layout: { width: d.layout.contentWidth, density: d.layout.density, sequence: d.sequence, sections: d.sections.map((x) => ({ type: x.type, h: x.height, dark: x.dark, bg: x.bg })) },
    exports: { css: toCssVariables(home.name, d), tailwind: toTailwindTheme(home.name, d), designmd: toDesignMd(home.name, home.url, d) },
  };
  const deepFile = join(SHOTS, home.id, "deep.json");
  const deep = existsSync(deepFile) ? (JSON.parse(readFileSync(deepFile, "utf8")) as Deep) : null;
  let metrics: Record<string, number | null> | null = null;
  if (deep) {
    const crops: Record<string, string> = {};
    for (const [k, f] of Object.entries((deep.crops ?? {}) as Record<string, string>)) {
      const rel = img(join(SHOTS, home.id, "deep", f), `${hs}/deep/${k}`, 0);
      if (rel) crops[k] = rel;
    }
    const { marks: _m, crops: _c, legacyClick: _l, ...rest } = deep;
    (dnaOut as Record<string, unknown>).deep = { ...rest, crops };
    metrics = metricsOf(deep, d);
  }
  mkdirSync(join(OUT, "brands"), { recursive: true });
  writeFileSync(join(OUT, "brands", `${hs}.json`), JSON.stringify(dnaOut));

  brands.push({
    slug: hs,
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
    metrics,
  });
}
brands.sort((a, b) => b.captured.localeCompare(a.captured) || a.name.localeCompare(b.name));

// conversión en paralelo
let done = 0;
async function worker() {
  while (jobs.length) {
    const j = jobs.shift()!;
    mkdirSync(join(j.dst, ".."), { recursive: true });
    // un recorte que falte no tumba el build: se omite (la ficha cae al componente recreado)
    try {
      await run("cwebp", ["-quiet", "-q", "72", "-resize", String(j.w), "0", j.src, "-o", j.dst]);
      done++;
    } catch {
      console.log(`  (omitida) ${j.src}`);
    }
  }
}
const total = jobs.length;
await Promise.all(Array.from({ length: 8 }, worker));
writeFileSync(join(OUT, "data.json"), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), brands }));
copyFileSync("site/explorar.html", join(OUT, "index.html"));
console.log(`${brands.length} marcas · ${done}/${total} imágenes → ${OUT}`);
