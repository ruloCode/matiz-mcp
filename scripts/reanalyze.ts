// Recalcula el DNA de todo el corpus desde la medición cruda guardada (shots/<id>/raw.json)
// con la versión ACTUAL del análisis. Conserva screenshots, nombre, etiquetas e industria manual.
// pnpm reanalyze
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { allSites, saveSite, SHOTS } from "../src/db.js";
import { buildDna } from "../src/analysis/dna.js";
import type { RawPage } from "../src/types.js";

let n = 0;
let skipped = 0;
for (const site of allSites()) {
  const rawPath = join(SHOTS, site.id, "raw.json");
  if (!existsSync(rawPath)) {
    skipped++;
    continue;
  }
  const raw = JSON.parse(readFileSync(rawPath, "utf8")) as RawPage;
  const manual = site.tags.includes("curated") ? site.industry : undefined;
  const dna = buildDna(raw, { industry: manual });
  // los recortes dependen de los límites de sección (crudos), no de la clasificación
  const shots = new Map(site.dna.sections.map((s) => [s.idx, { shot: s.shot, thumb: s.thumb }]));
  for (const s of dna.sections) Object.assign(s, shots.get(s.idx) ?? {});
  saveSite({ ...site, industry: dna.industry, dna });
  n++;
}
console.log(`${n} sitios re-analizados${skipped ? `, ${skipped} sin raw.json (recaptúralos con pnpm seed --force)` : ""}`);
