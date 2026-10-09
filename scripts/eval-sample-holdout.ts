// Muestra de PRUEBA (held-out): secciones de páginas internas que el ajuste del clasificador
// nunca vio. Estratificada por tipo predicho → research/eval/holdout-sample.json
import { writeFileSync, existsSync } from "node:fs";
import { allSites } from "../src/db.js";

let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pool = new Map<string, Array<{ ref_id: string; thumb: string; predicted: string }>>();
for (const s of allSites())
  if ((s.page ?? "home") !== "home" && (s.viewport ?? "desktop") === "desktop")
    for (const sec of s.dna.sections)
      if (sec.thumb && existsSync(sec.thumb)) {
        const l = pool.get(sec.type) ?? [];
        l.push({ ref_id: `${s.id}#${sec.idx}`, thumb: sec.thumb, predicted: sec.type });
        pool.set(sec.type, l);
      }
const out: Array<{ ref_id: string; thumb: string; predicted: string }> = [];
for (const [type, items] of pool) {
  const n = type === "content" ? 20 : 7;
  out.push(...items.map((x) => ({ x, r: rand() })).sort((a, b) => a.r - b.r).slice(0, n).map((y) => y.x));
}
out.sort(() => rand() - 0.5);
writeFileSync("research/eval/holdout-sample.json", JSON.stringify(out.map(({ ref_id, predicted }) => ({ ref_id, predicted })), null, 1));
writeFileSync(process.argv[2] ?? "/dev/null", JSON.stringify(out));
console.log(`${out.length} secciones de páginas internas · ${pool.size} tipos`);
