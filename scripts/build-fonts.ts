// pnpm build:fonts — catálogo de fuentes LIBRES (Fontsource: Google Fonts + otras OFL/Apache)
// → data/free-fonts.json. Se regenera de vez en cuando; viaja con el paquete.
import { writeFileSync } from "node:fs";
const res = await fetch("https://api.fontsource.org/v1/fonts");
if (!res.ok) throw new Error(`Fontsource respondió ${res.status}`);
const fonts = (await res.json()) as Array<{ family: string; category: string; variable: boolean; weights: number[]; license: string; subsets: string[] }>;
const out = fonts
  .filter((f) => f.category !== "icons" && f.subsets.includes("latin"))
  .map((f) => ({ f: f.family, c: f.category, v: f.variable ? 1 : 0, w: f.weights, l: f.license }));
writeFileSync("data/free-fonts.json", JSON.stringify({ source: "https://api.fontsource.org/v1/fonts", generated: new Date().toISOString().slice(0, 10), fonts: out }));
console.log(`${out.length} fuentes libres → data/free-fonts.json`);
