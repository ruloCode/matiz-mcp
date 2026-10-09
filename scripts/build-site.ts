// Arma site/index.html desde site/template.html con DATOS REALES del corpus (nada inventado):
// la franja de acentos medidos, las cifras del corpus, la evaluación y la referencia de ejemplo.
// pnpm build:site
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { allSites, homeSites, openDb } from "../src/db.js";
import { parseColor, toOklch } from "../src/analysis/color.js";
import { designDocCount } from "../src/design-docs.js";
import { fontAvailability, normalizeFamily } from "../src/analysis/fonts.js";
import { aggregateComposition } from "../src/analysis/composition.js";
import { critique } from "../src/analysis/critique.js";

const homes = homeSites();
const spectrum = homes
  .map((s) => ({ hex: s.dna.palette.accent, host: s.host ?? s.id }))
  .filter((x): x is { hex: string; host: string } => !!x.hex)
  .map((x) => ({ ...x, o: toOklch(parseColor(x.hex)!) }))
  .filter((x) => x.o.C >= 0.07)
  .sort((a, b) => a.o.H - b.o.H)
  .map(({ hex, host }) => ({ hex, host }));

const db = openDb();
const all = allSites();
const sections = (db.prepare("SELECT count(*) n FROM sections").get() as { n: number }).n;
// la cifra que se publica es la del set de PRUEBA (secciones que el ajuste nunca vio), si existe
const evalFile = existsSync("research/eval/report-holdout.json") ? "research/eval/report-holdout.json" : "research/eval/report.json";
const evalReport = existsSync(evalFile) ? JSON.parse(readFileSync(evalFile, "utf8")) : null;

const ref = homes.find((s) => s.host === "incident.io");
const t = ref?.dna.typography;
const sample = ref && {
  url: ref.url,
  host: ref.host,
  theme: ref.dna.theme,
  background: ref.dna.palette.background,
  text: ref.dna.palette.text,
  accent: ref.dna.palette.accent,
  accent2: ref.dna.palette.accent2,
  display: t?.display && { family: t.display.family, size: Math.round(t.display.size), ls: t.display.letterSpacing, lh: t.display.lineHeight },
  body: t?.body && { family: t.body.family, size: t.body.size },
  freeDisplay: t?.display ? fontAvailability(t.display.family).alternatives?.[0] ?? t.display.family : undefined,
  radius: ref.dna.shape.radius,
  pill: ref.dna.shape.pill,
  sequence: ref.dna.sequence,
};

// ---------- datos de las piezas v2 (todo del corpus) ----------
const toCard = (id: string) => {
  const r = all.find((x) => x.id === id);
  if (!r) return undefined;
  const sec = r.dna.sections.find((x) => x.type === "pricing");
  const d = r.dna.typography.display;
  const fam = d?.family ?? r.dna.typography.body?.family ?? "";
  const av = fam ? fontAvailability(fam) : undefined;
  return {
    host: r.host,
    url: r.url,
    theme: r.dna.theme,
    bg: r.dna.palette.background,
    text: r.dna.palette.text,
    accent: r.dna.palette.accent,
    font: fam.replace(/^_+|_[0-9a-f]{5,}$/gi, ""),
    size: d ? Math.round(d.size) : undefined,
    ls: d?.letterSpacing,
    free: av?.free ? av.freeAs : av?.alternatives?.[0],
    isFree: !!av?.free,
    radius: r.dna.shape.radius >= 999 ? "pill" : `${r.dna.shape.radius}px`,
    heading: sec?.heading ?? "",
    reasons: sec?.reasons ?? [],
    columns: sec?.columns ?? 0,
    sequence: r.dna.sequence.slice(0, 7),
  };
};
const demo = ["shopify.com-co-precios", "mural.co-pricing", "grain.com-pricing"].map(toCard).filter(Boolean);

const devtools = homes.filter((h) => h.industry.includes("devtools"));
const comp = aggregateComposition(devtools.map((h) => ({ id: h.id, name: h.name, sequence: h.dna.sequence })));
const composition = {
  sites: comp.sites,
  types: comp.types.filter((t) => t.type !== "content").slice(0, 7).map((t) => ({ type: t.type, presence: t.presence })),
  typical: comp.typicalSequence,
};

// familias comerciales reales del corpus (agrupadas por nombre normalizado; sin fuentes del sistema)
const famCount = new Map<string, { family: string; n: number }>();
for (const h of homes)
  for (const f of h.dna.typography.families.filter((x) => x.share >= 0.3)) {
    if (/system|apple|segoe|helvetica|arial/i.test(f.family)) continue;
    const key = normalizeFamily(f.family);
    const e = famCount.get(key) ?? { family: f.family, n: 0 };
    e.n++;
    famCount.set(key, e);
  }
const fonts = [...famCount.values()]
  .map(({ family, n }) => ({ family, n, av: fontAvailability(family) }))
  .filter((x) => !x.av.free && x.av.reason === "equivalente curado")
  .sort((a, b) => b.n - a.n)
  .slice(0, 5)
  .map((x) => ({ family: x.family.replace(/^_+|_[0-9a-f]{5,}$/gi, ""), sites: x.n, free: x.av.alternatives?.[0] }));

const tgt = homes.find((h) => h.host === "vercel.com");
const refS = homes.find((h) => h.host === "linear.app");
const crit = tgt && refS ? critique(tgt.dna, refS.dna, "linear.app") : undefined;
const critiqueExample = crit && {
  target: "vercel.com",
  reference: "linear.app",
  summary: crit.summary,
  findings: crit.findings.slice(0, 4).map((f) => ({ severity: f.severity, area: f.area, message: f.message, fix: f.fix })),
};

const linear = homes.find((h) => h.host === "linear.app");
const secEx = linear?.dna.sections.find((x) => x.type === "hero");
const sectionExample = secEx && {
  host: "linear.app", idx: secEx.idx, type: secEx.type, confidence: secEx.confidence, reasons: secEx.reasons,
  heading: secEx.heading, columns: secEx.columns, bg: secEx.bg, dark: secEx.dark, height: secEx.height,
  sequence: linear!.dna.sequence.slice(0, 9),
};
const pricingPages = all.filter((s) => s.page === "pricing" && s.viewport !== "mobile").length;

const data = {
  generated: new Date().toISOString().slice(0, 10),
  brands: new Set(all.map((s) => s.host)).size,
  pages: all.filter((s) => s.viewport !== "mobile").length,
  mobile: all.filter((s) => s.viewport === "mobile").length,
  sections,
  designDocs: designDocCount(),
  accuracy: evalReport ? Math.round(evalReport.accuracy * 1000) / 10 : null,
  evalN: evalReport?.evaluated ?? null,
  evalHoldout: evalReport?.set === "holdout",
  spectrum,
  sample,
  demo,
  composition,
  fonts,
  critiqueExample,
  sectionExample,
  pricingPages,
};
const tpl = readFileSync("site/template.html", "utf8");
const page = tpl.replace("/*__MATIZ_DATA__*/null", JSON.stringify(data));
// fragmento (vista previa como artifact) + página completa para hosting estático (Vercel)
writeFileSync("site/index.html", page);
mkdirSync("site/public", { recursive: true });
writeFileSync(
  "site/public/index.html",
  `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta property="og:title" content="Matiz">\n<meta property="og:description" content="Referencias de diseño medidas para tu agente: colores con rol, tipografía, composición y DESIGN.md.">\n${page.replace(/(<\/style>)/, "$1").replace(/^(<title>.*?<\/title>)/s, "$1")}\n</html>\n`
    .replace("<style>", "<style>\n" )
    .replace(/(<\/style>)/, "$1\n</head>\n<body>")
    .replace(/<\/html>\n$/, "</body>\n</html>\n"),
);
console.log(`site/index.html · ${data.brands} marcas · ${data.pages} páginas · ${data.mobile} móviles · ${data.sections} secciones · ${spectrum.length} acentos`);
