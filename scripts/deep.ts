// pnpm deep [host…] [--force] [--jobs N] — análisis profundo (Playwright) de las portadas del catálogo:
// componentes con hover real, ritmo de espaciado, sombras, movimiento, imágenes, rejilla y stack.
// Deja <shots>/<id>/deep.json + recortes; build-explore los convierte en la ficha de cada marca.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { closeBrowser } from "../src/capture/capture.js";
import { deepAnalyze } from "../src/capture/deep.js";
import { SHOTS, homeSites } from "../src/db.js";

const args = process.argv.slice(2);
const force = args.includes("--force");
const jobs = +(args[args.indexOf("--jobs") + 1] || 0) || 5;
const only = new Set(args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--jobs"));
const targets = homeSites().filter((h) => !h.tags.includes("referencia-matiz") && (!only.size || only.has(h.host ?? "") || only.has(h.id)) && (force || only.size || !existsSync(join(SHOTS, h.id, "deep.json"))));
console.log(`${targets.length} portadas por analizar (${jobs} en paralelo)`);
let ok = 0;
let n = 0;
const queue = [...targets];
const t0 = Date.now();
await Promise.all(
  Array.from({ length: jobs }, async () => {
    while (queue.length) {
      const h = queue.shift()!;
      const t = Date.now();
      try {
        const r = await Promise.race([
          deepAnalyze(h.url, h.id),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("tiempo agotado (150 s)")), 150_000)),
        ]);
        ok++;
        const b = (r.buttons as unknown[])?.length ?? 0;
        console.log(`✓ ${++n}/${targets.length} ${h.host} · ${b} botones · ${Object.keys(r.crops).length} recortes · ${r.reveal.revealed} reveals · ${((Date.now() - t) / 1000).toFixed(0)} s`);
      } catch (e) {
        console.log(`✗ ${++n}/${targets.length} ${h.host} ${(e as Error).message.split("\n")[0]}`);
      }
    }
  }),
);
await closeBrowser();
console.log(`${ok}/${targets.length} en ${((Date.now() - t0) / 60000).toFixed(1)} min`);
process.exit(0);
