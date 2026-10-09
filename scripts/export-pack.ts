// pnpm export-pack — empaqueta el corpus actual (sin screenshots) en data/corpus-pack.json.gz
import { statSync } from "node:fs";
import { exportPack } from "../src/pack.js";
const r = exportPack();
console.log(`${r.sites} sitios → ${r.path} (${(statSync(r.path).size / 1024).toFixed(0)} KB)`);
