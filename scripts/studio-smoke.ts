// Prueba de punta a punta del Estudio contra el servidor MCP COMPILADO (dist/cli.js), por stdio,
// como lo usa un agente. Usa un MATIZ_HOME aislado (no toca tu corpus) y deja el tablero para
// mirarlo en el lienzo. Uso: pnpm build && pnpm smoke:studio [--keep]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = process.env.MATIZ_HOME_SMOKE || mkdtempSync(join(tmpdir(), "matiz-studio-"));
const port = Number(process.env.MATIZ_GALLERY_PORT ?? 4047);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/cli.js"],
  env: { ...(process.env as Record<string, string>), MATIZ_HOME: home, MATIZ_GALLERY_PORT: String(port) },
  stderr: "pipe",
});
const client = new Client({ name: "studio-smoke", version: "1" });
await client.connect(transport);

let fails = 0;
const check = (cond: unknown, msg: string) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) fails++;
};
async function call(name: string, args: Record<string, unknown>) {
  const r = (await client.callTool({ name, arguments: args })) as { content: Array<{ type: string; text?: string; data?: string }>; isError?: boolean };
  const t = r.content.find((c) => c.type === "text")?.text ?? "";
  let json: any;
  try {
    json = JSON.parse(t);
  } catch {
    json = t;
  }
  return { json, text: t, images: r.content.filter((c) => c.type === "image").length, isError: r.isError };
}

const tools = (await client.listTools()).tools.map((t) => t.name);
for (const t of ["create_board", "put_screen", "get_screen", "check_screen", "get_board", "open_board", "manage_screen", "resolve_comment", "export_board"]) check(tools.includes(t), `tool ${t}`);

const base = (await call("search_references", { query: "fintech payments", kind: "site", limit: 1, images: false })).json.results?.[0]?.ref_id ?? "stripe.com";
const b = await call("create_board", { name: "Smoke Nube", brief: "Landing de un SaaS de agentes de IA para pymes", base_ref: base });
check(!b.isError && b.json.board === "smoke-nube", `create_board con base_ref=${base}`);
check(b.json.class_guide?.colors?.primary, "guía de clases con el rol primary");

const HERO = `
<header class="mx-auto max-w-content px-6 py-5 flex items-center justify-between">
  <b class="font-heading text-lg">Nube</b>
  <nav class="hidden md:flex gap-8 text-sm text-muted"><a href="#">Producto</a><a href="#">Precios</a><a href="#">Clientes</a></nav>
  <a class="bg-primary text-on-primary rounded-brand px-4 py-2.5 text-sm font-semibold" href="#">Empezar gratis</a>
</header>
<section class="mx-auto max-w-content px-6 pt-20 pb-24 grid md:grid-cols-2 gap-12 items-center">
  <div>
    <p class="text-sm font-semibold text-primary">Agentes para pymes</p>
    <h1 class="mt-3 text-5xl md:text-6xl font-semibold tracking-tight">Tus procesos, hechos por agentes mientras duermes</h1>
    <p class="mt-6 text-lg text-muted max-w-xl">Conecta tu correo, tu ERP y WhatsApp. Nube aprende cómo trabajas y ejecuta las tareas repetitivas con tu aprobación.</p>
    <div class="mt-8 flex flex-wrap gap-3">
      <a class="bg-primary text-on-primary rounded-brand px-5 py-3 font-semibold" href="#">Probar 14 días</a>
      <a class="border border-border rounded-brand px-5 py-3 font-semibold" href="#">Ver demo</a>
    </div>
  </div>
  <div class="aspect-[4/3] rounded-brand bg-surface border border-border p-6 grid gap-3 content-start">
    <div class="h-3 w-24 rounded-full bg-primary/30"></div>
    <div class="rounded-brand bg-background p-4 shadow-sm"><p class="text-sm font-semibold">Factura #2041 conciliada</p><p class="text-xs text-muted">hace 2 min · aprobado por Ana</p></div>
    <div class="rounded-brand bg-background p-4 shadow-sm"><p class="text-sm font-semibold">12 pedidos respondidos en WhatsApp</p><p class="text-xs text-muted">hace 9 min</p></div>
  </div>
</section>
<section class="bg-surface"><div class="mx-auto max-w-content px-6 py-20 grid md:grid-cols-3 gap-6">
  ${["Conecta", "Enseña", "Delega"].map((t, i) => `<div class="rounded-brand bg-background border border-border p-6"><p class="text-primary font-semibold">0${i + 1}</p><h3 class="mt-2 text-xl font-semibold">${t}</h3><p class="mt-2 text-muted">Paso ${i + 1} del flujo: sin código y con permisos claros.</p></div>`).join("")}
</div></section>`;

const p1 = await call("put_screen", { board: "smoke-nube", name: "Home", html: HERO, note: "primera versión" });
check(!p1.isError && p1.json.version === 1 && p1.images === 1, `put_screen Home v1 con miniatura (${p1.json.render_ms} ms)`);
check(p1.json.problems === "ninguno medible" || Array.isArray(p1.json.problems), `problemas: ${JSON.stringify(p1.json.problems).slice(0, 160)}`);

const p2 = await call("put_screen", { board: "smoke-nube", name: "Home", html: HERO + `<div class="w-[1700px] h-8 bg-primary-100"></div><p class="text-gray-400">gris por defecto</p>` });
check(p2.json.version === 2, "segunda versión de Home");
const probs = JSON.stringify(p2.json.problems);
check(/Desborde horizontal/.test(probs), "detecta el desborde horizontal de la v2");

const m = await call("put_screen", { board: "smoke-nube", name: "Home móvil", viewport: "mobile", html: HERO });
check(m.json.viewport?.startsWith("mobile"), `pantalla móvil (${m.json.height}px de alto)`);
const v = await call("put_screen", { board: "smoke-nube", name: "Home · B", variant_of: "Home", html: HERO.replace("Tus procesos, hechos por agentes mientras duermes", "Deja de copiar y pegar entre sistemas"), note: "titular más concreto" });
check(!v.isError, "variante B de Home");

const c = await call("check_screen", { board: "smoke-nube", screen: "Home", image: true });
check(typeof c.json.score === "number" && c.json.findings?.some((f: any) => f.area === "palette" || f.area === "contrast"), `check_screen Home: ${c.json.summary}`);
check(c.json.reference?.ref_id, `crítica contra la referencia ${c.json.reference?.name}`);

// el humano comenta en el lienzo: POST como lo hace la página
const gallery = `http://localhost:${port}`;
const page = await fetch(`${gallery}/studio/smoke-nube`).then((r) => r.status);
check(page === 200, "el lienzo responde /studio/smoke-nube");
const boardData = await fetch(`${gallery}/studio/api/board/smoke-nube`).then((r) => r.json());
check(boardData.screens?.length === 3 && boardData.screens.every((s: any) => s.thumb), "API del lienzo: 3 pantallas con captura");
const live = await fetch(`${gallery}/studio/s/smoke-nube/home`);
check(live.status === 200 && /content-security-policy/i.test([...live.headers.keys()].join(" ")), "vista en vivo con CSP");
const noHeader = await fetch(`${gallery}/studio/api/board/smoke-nube/comments`, { method: "POST", body: "{}" });
check(noHeader.status === 403, "un POST sin x-matiz se rechaza");
const cm = await fetch(`${gallery}/studio/api/board/smoke-nube/comments`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-matiz": "1" },
  body: JSON.stringify({ slug: "home", x: 230, y: 420, text: "Este titular es muy largo, dejalo en dos líneas" }),
}).then((r) => r.json());
check(cm.target?.tag, `el comentario señala <${cm.target?.tag}> «${cm.target?.text?.slice(0, 40)}»`);

const g = await call("get_board", { board: "smoke-nube" });
check(g.json.comments?.length === 1 && g.json.comments[0].on?.tag, "get_board trae el comentario con su elemento");
check(g.images === 1, "get_board trae la vista general");
const r = await call("resolve_comment", { board: "smoke-nube", comment_id: cm.id, reply: "Titular recortado a 6 palabras" });
check(r.json.resolved === cm.id, "resolve_comment");

const s = await call("get_screen", { board: "smoke-nube", screen: "Home", version: 1 });
check(s.json.html?.includes("Tus procesos") && s.json.versions?.length === 2, "get_screen v1 con historial");
const res = await call("manage_screen", { board: "smoke-nube", screen: "Home", action: "restore", version: 1 });
check(res.json.version === 3, "restore v1 → v3");
await call("manage_screen", { board: "smoke-nube", screen: "Home · B", action: "approve" });

const ex = await call("export_board", { board: "smoke-nube", dir: join(home, "entrega") });
const out = ex.json.dir;
check(out && existsSync(join(out, "handoff.md")) && existsSync(join(out, "theme.css")) && existsSync(join(out, "__matiz", "tailwind.js")), "export_board: handoff + theme + tailwind");
check(out && readFileSync(join(out, "screens", "home.html"), "utf8").includes("../__matiz/tailwind.js"), "HTML exportado apunta a su Tailwind local");

console.log(`\n${fails ? `✗ ${fails} fallas` : "✓ todo bien"} · MATIZ_HOME=${home} · lienzo ${gallery}/studio/smoke-nube`);
if (process.argv.includes("--keep")) {
  console.log("--keep: el servidor sigue arriba para mirar el lienzo (Ctrl+C para salir)");
  await new Promise(() => {});
}
await client.close();
process.exit(fails ? 1 : 0);
