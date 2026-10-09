// Corpus empaquetado: el DNA de cada sitio (tokens, secciones, secuencia) SIN screenshots
// ni medición cruda. Viaja con el paquete para que una instalación nueva tenga referencias
// desde el primer segundo; las imágenes se capturan en la máquina de cada quien.
import { gunzipSync, gzipSync } from "node:zlib";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allSites, openDb, saveSite } from "./db.js";
import type { SiteRecord } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
/** data/ vive junto a src/ (dev) o junto a dist/ (paquete instalado). */
export const BUNDLED_PACK = join(here, "..", "data", "corpus-pack.json.gz");

interface Pack {
  version: 1;
  exportedAt: string;
  sites: SiteRecord[];
}

export function exportPack(path = BUNDLED_PACK) {
  const sites = allSites().map((s) => ({
    ...s,
    shots: {},
    dna: {
      ...s.dna,
      // solo un extracto corto del texto: alcanza para buscar, no reproduce la página
      sections: s.dna.sections.map(({ shot: _s, thumb: _t, ...sec }) => ({ ...sec, text: sec.text.slice(0, 200) })),
    },
  }));
  const pack: Pack = { version: 1, exportedAt: new Date().toISOString(), sites };
  writeFileSync(path, gzipSync(JSON.stringify(pack), { level: 9 }));
  return { sites: sites.length, path };
}

/** Importa lo que falte. Nunca pisa un sitio ya capturado en esta máquina. */
export function importPack(path = BUNDLED_PACK): { imported: number; skipped: number } {
  if (!existsSync(path)) return { imported: 0, skipped: 0 };
  const pack = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as Pack;
  const have = new Set((openDb().prepare("SELECT id FROM sites").all() as Array<{ id: string }>).map((r) => r.id));
  let imported = 0;
  for (const s of pack.sites) {
    if (have.has(s.id)) continue;
    saveSite(s);
    imported++;
  }
  return { imported, skipped: pack.sites.length - imported };
}

export function corpusIsEmpty(): boolean {
  return (openDb().prepare("SELECT count(*) AS n FROM sites").get() as { n: number }).n === 0;
}
