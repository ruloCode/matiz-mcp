// Arma site/index.html desde site/template.html con DATOS REALES del corpus (nada inventado):
// la franja de acentos medidos, las cifras del corpus, la evaluación y la referencia de ejemplo.
// pnpm build:site
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { allSites, homeSites, openDb } from "../src/db.js";
import { parseColor, toOklch } from "../src/analysis/color.js";
import { designDocCount } from "../src/design-docs.js";
import { fontAvailability } from "../src/analysis/fonts.js";

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
const evalReport = existsSync("research/eval/report.json") ? JSON.parse(readFileSync("research/eval/report.json", "utf8")) : null;

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

const data = {
  generated: new Date().toISOString().slice(0, 10),
  brands: new Set(all.map((s) => s.host)).size,
  pages: all.filter((s) => s.viewport !== "mobile").length,
  mobile: all.filter((s) => s.viewport === "mobile").length,
  sections,
  designDocs: designDocCount(),
  accuracy: evalReport ? Math.round(evalReport.accuracy * 1000) / 10 : null,
  evalN: evalReport?.evaluated ?? null,
  spectrum,
  sample,
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
