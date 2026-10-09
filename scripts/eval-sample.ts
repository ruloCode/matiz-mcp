// Muestra estratificada de secciones para etiquetar a mano (o con visión) → research/eval/sample.json
// Solo ids y rutas locales de miniatura: las imágenes NO entran al repo.
import { writeFileSync, existsSync } from "node:fs";
import { homeSites } from "../src/db.js";

const per: Record<string, number> = { content: 30 };
const DEFAULT = 6;
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pool = new Map<string, Array<{ ref_id: string; thumb: string; predicted: string }>>();
for (const s of homeSites())
  for (const sec of s.dna.sections)
    if (sec.thumb && existsSync(sec.thumb)) {
      const l = pool.get(sec.type) ?? [];
      l.push({ ref_id: `${s.id}#${sec.idx}`, thumb: sec.thumb, predicted: sec.type });
      pool.set(sec.type, l);
    }
const out: Array<{ ref_id: string; thumb: string; predicted: string }> = [];
for (const [type, items] of pool) {
  const n = per[type] ?? DEFAULT;
  out.push(...items.map((x) => ({ x, r: rand() })).sort((a, b) => a.r - b.r).slice(0, n).map((y) => y.x));
}
out.sort(() => rand() - 0.5);
writeFileSync("research/eval/sample.json", JSON.stringify(out.map(({ ref_id, predicted }) => ({ ref_id, predicted })), null, 1));
writeFileSync(process.argv[2] ?? "/dev/null", JSON.stringify(out));
console.log(`${out.length} secciones · ${pool.size} tipos`);
