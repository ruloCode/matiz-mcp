// pnpm deep [host…] [--force] [--jobs N] [--timeout S] — análisis profundo (Playwright) de las portadas del catálogo:
// componentes con hover real, ritmo de espaciado, sombras, movimiento, imágenes, rejilla y stack.
// Deja <shots>/<id>/deep.json + recortes; build-explore los convierte en la ficha de cada marca.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { closeBrowser } from "../src/capture/capture.js";
import { deepAnalyze } from "../src/capture/deep.js";
import { SHOTS, homeSites } from "../src/db.js";

const args = process.argv.slice(2);
const force = args.includes("--force");
const val = (k: string) => (args.includes(k) ? +args[args.indexOf(k) + 1] || 0 : 0);
const jobs = val("--jobs") || 5;
const limitS = val("--timeout") || 150;
const only = new Set(args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--jobs" && args[i - 1] !== "--timeout"));
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
        const r = await deepAnalyze(h.url, h.id, { timeoutMs: limitS * 1000 });
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
