// pnpm build:og — imagen para redes (1200×630) con datos reales del corpus → site/public/og.png
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { allSites, homeSites } from "../src/db.js";
import { parseColor, toOklch } from "../src/analysis/color.js";

const homes = homeSites();
const spectrum = homes
  .map((s) => s.dna.palette.accent)
  .filter((h): h is string => !!h)
  .map((hex) => ({ hex, o: toOklch(parseColor(hex)!) }))
  .filter((x) => x.o.C >= 0.07)
  .sort((a, b) => a.o.H - b.o.H)
  .map((x) => x.hex);
const all = allSites();
const brands = new Set(all.map((s) => s.host)).size;
const pages = all.filter((s) => s.viewport !== "mobile").length;
const sections = all.reduce((n, s) => n + s.dna.sections.length, 0);
const pick = (f: number) => spectrum[Math.floor(spectrum.length * f)];
const lin = homes.find((h) => h.host === "linear.app")!;
const fmt = (n: number) => n.toLocaleString("es-CO");

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400..800&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#fff;color:#141414;font-family:Geist,system-ui,sans-serif;position:relative;overflow:hidden}
.top{position:absolute;left:72px;top:60px;display:flex;align-items:center;gap:12px;font-weight:700;font-size:30px;letter-spacing:-.03em}
.top i{width:30px;height:30px;border-radius:9px;background:conic-gradient(from 210deg,#e5484d,#f5a524,#30a46c,#0090ff,#8e4ec6,#e5484d)}
.pill{position:absolute;right:72px;top:64px;border:1px solid #e4e4e7;border-radius:999px;padding:8px 16px;font-size:18px;color:#66666c}
.left{position:absolute;left:72px;top:148px;width:660px;display:flex;flex-direction:column;gap:22px}
h1{font-size:66px;line-height:1.03;letter-spacing:-.05em;font-weight:680}
.chip{display:inline-block;width:.8em;height:.8em;border-radius:.2em;vertical-align:-.02em;margin:0 .04em}
.dim{font:500 17px 'Geist Mono',monospace;color:#66666c;display:flex;gap:10px;align-items:center}
.dim b{display:inline-block;width:120px;height:1.5px;background:#141414;position:relative}
.dim b:before,.dim b:after{content:"";position:absolute;top:-6px;width:1.5px;height:13px;background:#141414}
.dim b:after{right:0}
.card{position:absolute;right:72px;top:150px;width:330px;background:#f3f3f4;border-radius:24px;padding:22px;font-family:'Geist Mono',monospace;font-size:15px;display:grid;gap:12px}
.card .h{display:flex;justify-content:space-between}
.card .h code{background:#141414;color:#fff;border-radius:999px;padding:3px 10px;font-size:14px}
.sw{display:flex;gap:7px}.sw i{width:40px;height:40px;border-radius:10px;border:1px solid rgba(0,0,0,.08)}
.big{font-family:Geist;font-size:52px;font-weight:680;letter-spacing:-.04em;line-height:1}
.big small{font-size:18px;color:#66666c;font-weight:400;letter-spacing:0}
.mut{color:#66666c}
.seq{display:flex;flex-wrap:wrap;gap:5px}.seq span{background:#fff;border:1px solid #e4e4e7;border-radius:999px;padding:4px 9px;font-size:12px}
.strip{position:absolute;left:0;right:0;bottom:0;height:96px;display:flex}
.strip i{flex:1}
.stats{font-size:20px;color:#66666c}
.stats b{color:#141414;font-weight:600}
</style></head><body>
<div class="top"><i></i>Matiz</div>
<div class="pill">MCP de diseño · Claude · Codex · Cursor</div>
<div class="left">
<h1>Referencias de diseño <span class="chip" style="background:${pick(0.04)}"></span> que tu agente <span class="chip" style="background:${pick(0.42)}"></span> puede medir <span class="chip" style="background:${pick(0.7)}"></span></h1>
<div class="dim"><b></b>66px · −0.05em · medido por Matiz</div>
<div class="stats"><b>${fmt(brands)}</b> marcas · <b>${fmt(pages)}</b> páginas · <b>${fmt(sections)}</b> secciones medidas</div>
</div>
<div class="card">
  <div class="h"><code>get_reference</code><span class="mut">${lin.host}</span></div>
  <div class="sw">${[lin.dna.palette.background, lin.dna.palette.surface, lin.dna.palette.text, lin.dna.palette.mutedText, lin.dna.palette.accent].filter(Boolean).map((h) => `<i style="background:${h}"></i>`).join("")}</div>
  <div class="big">${Math.round(lin.dna.typography.display?.size ?? 72)}<small> px · ${lin.dna.typography.display?.letterSpacing ?? ""}em</small></div>
  <div class="seq">${[...new Set(lin.dna.sequence.filter((t) => t !== "content"))].slice(0, 6).map((t) => `<span>${t}</span>`).join("")}</div>
</div>
<div class="strip">${spectrum.map((h) => `<i style="background:${h}"></i>`).join("")}</div>
</body></html>`;

mkdirSync("site/public", { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.setContent(html, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: "site/public/og.png" });
await b.close();
console.log("site/public/og.png (1200×630)");
