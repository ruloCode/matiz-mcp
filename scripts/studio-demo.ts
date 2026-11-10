// Tablero de DEMOSTRACIÓN del Estudio, hecho con las tools por MCP como lo haría un agente.
// Sirve para las capturas del sitio. Uso: pnpm build && tsx scripts/studio-demo.ts <MATIZ_HOME>
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const home = process.argv[2];
if (!home) throw new Error("uso: tsx scripts/studio-demo.ts <MATIZ_HOME>");
const port = Number(process.env.MATIZ_GALLERY_PORT ?? 4051);
const client = new Client({ name: "studio-demo", version: "1" });
await client.connect(
  new StdioClientTransport({ command: process.execPath, args: ["dist/cli.js"], env: { ...(process.env as Record<string, string>), MATIZ_HOME: home, MATIZ_GALLERY_PORT: String(port) }, stderr: "pipe" }),
);
async function call(name: string, args: Record<string, unknown>) {
  const r = (await client.callTool({ name, arguments: args })) as { content: Array<{ type: string; text?: string }>; isError?: boolean };
  const t = r.content.find((c) => c.type === "text")?.text ?? "";
  if (r.isError) throw new Error(`${name}: ${t}`);
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

const B = "huerta-sierra";
const board = await call("create_board", {
  name: "Huerta Sierra",
  brief: "Canasta semanal de 14 fincas de la Sierra Nevada de Santa Marta. Para familias de Santa Marta y Barranquilla que quieren saber de dónde viene lo que comen.",
  base_ref: "teenage.engineering",
  theme: { colors: { primary: "#1E6B3C" }, fonts: { heading: "Bricolage Grotesque" }, radius: 6 },
});
console.log("tablero:", board.board, board.theme.colors, board.theme.fonts, board.adjusted_for_legibility ?? "");

await call("draft_wireframe", { board: B, name: "Estructura", sections: ["navbar", "hero", "steps", "feature-split", "pricing", "faq", "footer"] });
await call("pin_reference", { board: B, ref_id: "craft.do", note: "Mucho aire y color solo para actuar" });
await call("pin_reference", { board: B, ref_id: "aesop.com", note: "Cómo contar el origen del producto sin fotos de stock" });

const FARMS = [
  ["Tomate chonto", "Finca El Recreo", "Minca", 650],
  ["Café pergamino", "La Victoria", "Minca", 1200],
  ["Lulo", "Doña Ester", "San Pedro", 1450],
  ["Mora de Castilla", "Los Naranjos", "San Pedro", 1800],
  ["Papa criolla", "Cerro Azul", "Palmor", 2100],
];
const altitude = `
<div class="relative rounded-brand border border-border bg-surface p-6 overflow-hidden">
  <p class="text-sm text-muted">Esta semana, por altura</p>
  <div class="relative mt-4 h-[360px]">
    ${[0, 500, 1000, 1500, 2000].map((m) => `<div class="absolute left-0 right-0 border-t border-dashed border-border" style="bottom:${(m / 2400) * 100}%"><span class="absolute -top-3 left-0 bg-surface pr-2 text-xs font-mono text-muted">${m} m</span></div>`).join("")}
    ${FARMS.map(([p, f, , m], i) => `<div class="absolute flex items-center gap-2" style="bottom:calc(${((m as number) / 2400) * 100}% - 10px);left:${18 + i * 15}%"><span class="h-3 w-3 rounded-full bg-primary ring-4 ring-primary-100"></span><span class="text-sm"><b class="font-semibold">${p}</b><span class="block text-xs text-muted">${f} · ${m} m</span></span></div>`).join("")}
  </div>
</div>`;

const header = (cta = "Pedir la canasta") => `
<header class="border-b border-border">
  <div class="mx-auto max-w-content px-6 h-16 flex items-center justify-between">
    <b class="font-heading text-xl tracking-tight">huerta<span class="text-primary">/</span>sierra</b>
    <nav class="hidden md:flex gap-8 text-sm text-muted"><a href="#">Esta semana</a><a href="#">Las fincas</a><a href="#">Cómo llega</a></nav>
    <a data-go="Tu canasta" class="bg-primary text-on-primary rounded-brand px-4 py-2 text-sm font-medium">${cta}</a>
  </div>
</header>`;

const steps = `
<section class="mx-auto max-w-content px-6 py-20">
  <h2 class="font-heading text-3xl font-semibold tracking-tight max-w-xl">Del martes al jueves, sin bodega en medio</h2>
  <ol class="mt-10 grid md:grid-cols-3 gap-px bg-border rounded-brand overflow-hidden border border-border">
    ${[
      ["Martes", "Cada finca cosecha lo que pediste. Nada se recoge antes."],
      ["Miércoles", "Se empaca en Minca en cajas que vuelven la semana siguiente."],
      ["Jueves", "Llega a tu puerta entre las 7 y las 11 de la mañana."],
    ].map(([d, t], i) => `<li class="bg-background p-6"><p class="font-mono text-sm text-primary">${i + 1}</p><h3 class="mt-3 text-lg font-semibold">${d}</h3><p class="mt-2 text-muted max-w-xs">${t}</p></li>`).join("")}
  </ol>
</section>`;

const farmsTable = `
<section class="bg-surface border-y border-border">
  <div class="mx-auto max-w-content px-6 py-20 grid md:grid-cols-[1fr_2fr] gap-12">
    <div><h2 class="font-heading text-3xl font-semibold tracking-tight">Sabes de qué finca viene cada cosa</h2><p class="mt-4 text-muted max-w-sm">Catorce familias campesinas entre los 600 y los 2.200 metros. La canasta cambia con lo que da la montaña.</p></div>
    <table class="w-full text-left">
      <thead class="text-sm text-muted"><tr class="border-b border-border"><th class="py-3 font-medium">Producto</th><th class="py-3 font-medium">Finca</th><th class="py-3 font-medium">Vereda</th><th class="py-3 font-medium text-right">Altura</th></tr></thead>
      <tbody>${FARMS.map(([p, f, v, m]) => `<tr class="border-b border-border"><td class="py-3 font-medium">${p}</td><td class="py-3">${f}</td><td class="py-3 text-muted">${v}</td><td class="py-3 text-right font-mono">${(m as number).toLocaleString("es-CO")} m</td></tr>`).join("")}</tbody>
    </table>
  </div>
</section>`;

const pricing = `
<section class="mx-auto max-w-content px-6 py-20">
  <h2 class="font-heading text-3xl font-semibold tracking-tight">Un tamaño para cada casa</h2>
  <div class="mt-10 grid md:grid-cols-3 border border-border rounded-brand divide-y md:divide-y-0 md:divide-x divide-border">
    ${[
      ["Pequeña", "1–2 personas", "$68.000", false],
      ["Familiar", "3–4 personas", "$112.000", true],
      ["Grande", "5 o más", "$154.000", false],
    ].map(([n, p, v, main]) => `<div class="p-8 ${main ? "bg-primary-50" : ""}"><p class="text-sm text-muted">${p}</p><h3 class="mt-1 text-xl font-semibold">${n}</h3><p class="mt-6 font-heading text-4xl font-semibold">${v}<span class="text-base font-normal text-muted"> / semana</span></p><a data-go="Tu canasta" class="mt-8 inline-block rounded-brand px-5 py-3 font-medium ${main ? "bg-primary text-on-primary" : "border border-border"}">Elegir ${String(n).toLowerCase()}</a></div>`).join("")}
  </div>
</section>`;

const footer = `<footer class="border-t border-border"><div class="mx-auto max-w-content px-6 py-10 flex flex-wrap justify-between gap-4 text-sm text-muted"><p>Huerta Sierra · Minca, Santa Marta</p><p>Pausa o cancela cuando quieras, antes del lunes a mediodía.</p></div></footer>`;

const hero = (title: string, sub: string) => `
<section class="mx-auto max-w-content px-6 pt-16 pb-20 grid md:grid-cols-[1.1fr_1fr] gap-12 items-center">
  <div>
    <h1 class="font-heading text-5xl md:text-7xl font-semibold tracking-tight leading-[0.95]">${title}</h1>
    <p class="mt-6 text-lg text-muted max-w-md">${sub}</p>
    <div class="mt-8 flex flex-wrap items-center gap-4"><a data-go="Tu canasta" class="bg-primary text-on-primary rounded-brand px-6 py-3 font-medium">Pedir la canasta</a><span class="text-sm text-muted">Primera entrega el jueves 13</span></div>
  </div>
  ${altitude}
</section>`;

const HOME = header() + hero("Lo que se cosechó el martes llega el jueves.", "Una canasta semanal de 14 fincas de la Sierra Nevada. Cada producto dice de qué finca viene y a qué altura se sembró.") + steps + farmsTable + pricing + footer;
const r1 = await call("put_screen", { board: B, name: "Inicio", html: HOME, note: "primera versión: la altura como idea central" });
console.log("Inicio:", r1.problems);
const HOME_B = header() + hero("Catorce fincas. Una canasta. Todos los jueves.", "Fruta, verdura y café de la Sierra Nevada, cosechados para ti y no para una bodega.") + steps + farmsTable + pricing + footer;
await call("put_screen", { board: B, name: "Inicio · B", variant_of: "Inicio", html: HOME_B, note: "titular de cantidades en vez de tiempos" });

const MOBILE = header("Pedir") + `
<section class="px-5 pt-10 pb-12">
  <h1 class="font-heading text-[44px] font-semibold tracking-tight leading-[0.95]">Lo que se cosechó el martes llega el jueves.</h1>
  <p class="mt-5 text-muted">Una canasta semanal de 14 fincas de la Sierra Nevada.</p>
  <a data-go="Tu canasta" class="mt-7 block text-center bg-primary text-on-primary rounded-brand px-6 py-3.5 font-medium">Pedir la canasta</a>
</section>
<section class="px-5 pb-12"><div class="rounded-brand border border-border bg-surface divide-y divide-border">${FARMS.map(([p, f, , m]) => `<div class="flex items-center justify-between px-4 py-3"><span><b class="font-medium">${p}</b><span class="block text-xs text-muted">${f}</span></span><span class="font-mono text-sm">${(m as number).toLocaleString("es-CO")} m</span></div>`).join("")}</div></section>` + steps.replace("py-20", "py-12").replace("px-6", "px-5") + footer;
await call("put_screen", { board: B, name: "Inicio móvil", viewport: "mobile", html: MOBILE });

const CART = header("Volver") .replace('data-go="Tu canasta"', 'data-go="Inicio"') + `
<section class="mx-auto max-w-content px-6 py-14 grid md:grid-cols-[1.4fr_1fr] gap-12">
  <div>
    <h1 class="font-heading text-4xl font-semibold tracking-tight">Tu canasta familiar</h1>
    <p class="mt-2 text-muted">Llega el jueves 13 entre las 7 y las 11 a.m.</p>
    <ul class="mt-8 divide-y divide-border border-y border-border">${FARMS.map(([p, f, , m], i) => `<li class="flex items-center justify-between py-4"><span><b class="font-medium">${p}</b><span class="block text-sm text-muted">${f} · ${(m as number).toLocaleString("es-CO")} m</span></span><span class="font-mono">${["1 kg", "500 g", "1 kg", "500 g", "2 kg"][i]}</span></li>`).join("")}</ul>
  </div>
  <form class="rounded-brand border border-border bg-surface p-6 grid gap-4 content-start">
    <h2 class="text-lg font-semibold">Entrega</h2>
    <label class="grid gap-1.5 text-sm"><span class="text-muted">Dirección</span><input class="rounded-brand border border-border bg-background px-3 py-2.5" value="Cra. 3 #18-45, Rodadero"></label>
    <label class="grid gap-1.5 text-sm"><span class="text-muted">Teléfono para avisarte</span><input class="rounded-brand border border-border bg-background px-3 py-2.5" value="300 555 0142"></label>
    <div class="flex justify-between pt-2 border-t border-border"><span class="text-muted">Total semanal</span><b class="font-heading text-2xl">$112.000</b></div>
    <button class="bg-primary text-on-primary rounded-brand px-5 py-3 font-medium">Confirmar pedido</button>
    <p class="text-xs text-muted">Pagas contra entrega la primera vez.</p>
  </form>
</section>`;
await call("put_screen", { board: B, name: "Tu canasta", html: CART });

// check_screen a 390 px encontró las etiquetas del gráfico encimadas: en móvil va como lista
const list = `<ul class="md:hidden rounded-brand border border-border bg-surface divide-y divide-border">${[...FARMS].reverse().map(([p, f, , m]) => `<li class="flex items-center justify-between px-4 py-3"><span><b class="font-medium">${p}</b><span class="block text-xs text-muted">${f}</span></span><span class="font-mono text-sm">${(m as number).toLocaleString("es-CO")} m</span></li>`).join("")}</ul>`;
const v1 = await call("check_screen", { board: B, screen: "Inicio" });
console.log("check Inicio v1:", v1.summary);
await call("put_screen", { board: B, name: "Inicio", html: HOME.replace('<div class="relative rounded-brand border border-border bg-surface p-6 overflow-hidden">', list + '<div class="hidden md:block relative rounded-brand border border-border bg-surface p-6 overflow-hidden">'), note: "a 390 px el gráfico encimaba etiquetas: en móvil va como lista" });
const check = await call("check_screen", { board: B, screen: "Inicio" });
console.log("check Inicio:", check.summary);
for (const f of check.findings) console.log("  -", f.severity, f.area, f.message.slice(0, 110));
const canvas = String(board.canvas).replace(/\/studio\/.*$/, "");
const c = await fetch(`${canvas}/studio/api/board/${B}/comments`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-matiz": "1" },
  body: JSON.stringify({ slug: "inicio", x: 300, y: 330, text: "Me gusta. ¿Podemos probar el titular en dos líneas en vez de tres?" }),
}).then((r) => r.json());
console.log("comentario en", c.target?.tag, c.target?.text?.slice(0, 40));
await call("manage_screen", { board: B, screen: "Inicio · B", action: "approve" });
console.log(`\nlienzo: ${canvas}/studio/${B}`);
await new Promise(() => {});
