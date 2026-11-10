import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDna } from "../src/analysis/dna.js";
import { splitHtml, screenDocument, slugify } from "../src/studio/doc.js";
import { DEFAULT_THEME, applyThemeInput, ensureLegible, fontLinks, onColor, themeCss, themeFromDna } from "../src/studio/theme.js";
import { layoutBoard, GAP_X, GAP_Y } from "../src/studio/layout.js";
import { offPalette, pickTarget, probeFindings, checkScreen, type ProbeResult } from "../src/studio/check.js";
import { contrastRatio, parseColor } from "../src/analysis/color.js";
import { useMemoryDb } from "../src/db.js";
import * as store from "../src/studio/store.js";
import { page } from "./helpers.js";

test("splitHtml: un fragmento que empieza con <header> conserva el header (no es <head>)", () => {
  const r = splitHtml('<header class="flex justify-between"><b>Nube</b></header><main>x</main>');
  assert.match(r.body, /^<header class="flex justify-between">/);
  assert.equal(r.head, "");
});

test("splitHtml: de un documento completo toma el body, sus atributos sin on*, y del head solo estilos y Google Fonts", () => {
  const r = splitHtml(`<!doctype html><html><head><script src="https://evil.example/x.js"></script>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces"><style>.a{color:red}</style></head>
    <body class="bg-background" onload="alert(1)"><header>hola</header></body></html>`);
  assert.match(r.body, /<header>hola<\/header>/);
  assert.match(r.head, /fonts\.googleapis\.com/);
  assert.match(r.head, /\.a\{color:red\}/);
  assert.doesNotMatch(r.head, /evil/);
  assert.match(r.bodyAttrs, /bg-background/);
  assert.doesNotMatch(r.bodyAttrs, /onload/);
});

test("screenDocument: Tailwind sale del origen propio, CSP sin red y el @theme del tablero", () => {
  const doc = screenDocument({ html: "<p>hola</p>", theme: DEFAULT_THEME, title: "Home", assetOrigin: "http://localhost:4040" });
  assert.match(doc, /<script src="http:\/\/localhost:4040\/__matiz\/tailwind\.js"><\/script>/);
  assert.match(doc, /connect-src 'none'/);
  assert.match(doc, /--color-primary: #2563EB;/);
  assert.match(doc, /<p>hola<\/p>/);
  const sinCsp = screenDocument({ html: "<p>x</p>", theme: DEFAULT_THEME, title: "x", assetOrigin: "..", csp: false });
  assert.doesNotMatch(sinCsp, /Content-Security-Policy/);
  assert.match(sinCsp, /src="\.\.\/__matiz\/tailwind\.js"/);
});

test("slugify: estable y sin tildes", () => {
  assert.equal(slugify("Pricing · Variante B"), "pricing-variante-b");
  assert.equal(slugify("Configuración móvil"), "configuracion-movil");
  assert.equal(slugify("···"), "pantalla");
});

test("tema por defecto: el texto sobre el primario pasa AA", () => {
  const p = parseColor(DEFAULT_THEME.colors.primary)!;
  const on = parseColor(DEFAULT_THEME.colors["on-primary"]!)!;
  assert.ok(contrastRatio(p, on) >= 4.5);
});

test("themeFromDna: roles medidos, primario = acento y texto sobre el primario legible", () => {
  const t = themeFromDna(buildDna(page()), { ref_id: "example.com", name: "Example", url: "https://example.com/" });
  assert.equal(t.colors.background, "#FFFFFF");
  assert.equal(t.colors.foreground, "#111111");
  assert.equal(t.colors.primary, "#2563EB");
  assert.equal(onColor("#2563EB"), "#FFFFFF");
  assert.equal(onColor("#F5E663"), "#0A0A0A");
  assert.equal(t.source?.ref_id, "example.com");
});

test("applyThemeInput: rechaza roles y colores inválidos con motivo; primario nuevo recalcula su texto", () => {
  const { theme, rejected } = applyThemeInput(DEFAULT_THEME, { colors: { primary: "#FFE14D", accentoo: "#000", border: "no-es-color" } as never, radius: 4 });
  assert.equal(theme.colors.primary, "#FFE14D");
  assert.equal(theme.colors["on-primary"], "#0A0A0A");
  assert.equal(theme.radius, 4);
  assert.equal(rejected.length, 2);
  assert.equal(theme.colors.border, DEFAULT_THEME.colors.border);
});

test("applyThemeInput: una fuente comercial se carga con su alternativa libre y se recuerda la original", () => {
  const { theme } = applyThemeInput(DEFAULT_THEME, { fonts: { heading: "Söhne" } });
  assert.notEqual(theme.fonts.heading, "Söhne");
  assert.equal(theme.fontsOriginal?.heading, "Söhne");
});

test("themeCss + fontLinks: clases de rol, escala del primario y un link de respaldo sin pesos", () => {
  const css = themeCss(DEFAULT_THEME);
  for (const v of ["--color-background", "--color-on-primary", "--color-primary-500", "--font-heading", "--radius-brand", "--container-content"]) assert.ok(css.includes(v), v);
  const links = fontLinks({ ...DEFAULT_THEME, fonts: { heading: "Instrument Serif", body: "Inter", mono: "Inter" } });
  assert.ok(links.includes("https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap"));
  assert.equal(links.length, 4); // Instrument Serif + Inter, cada una con y sin pesos
});

test("layout: el flujo va a la derecha y las variantes debajo de su pantalla; lo movido a mano manda", () => {
  const pos = layoutBoard([
    { slug: "home", width: 1440, height: 3000, order: 0 },
    { slug: "pricing", width: 1440, height: 2000, order: 1 },
    { slug: "home-b", width: 1440, height: 2800, order: 2, variantOf: "home" },
    { slug: "home-c", width: 1440, height: 1000, order: 3, variantOf: "home-b" },
    { slug: "movil", width: 390, height: 1800, order: 4, x: -900, y: 50 },
  ]);
  assert.deepEqual(pos.get("home"), { x: 0, y: 0 });
  assert.deepEqual(pos.get("home-b"), { x: 0, y: 3000 + GAP_Y });
  assert.deepEqual(pos.get("home-c"), { x: 0, y: 3000 + GAP_Y + 2800 + GAP_Y }); // variante de variante: misma columna
  assert.deepEqual(pos.get("pricing"), { x: 1440 + GAP_X, y: 0 });
  assert.deepEqual(pos.get("movil"), { x: -900, y: 50 });
});

const probe = (over: Partial<ProbeResult["issues"]> = {}, rest: Partial<ProbeResult> = {}): ProbeResult => ({
  width: 1440,
  height: 2000,
  tailwind: true,
  empty: false,
  issues: { overflow: { scrollWidth: 1440, viewport: 1440, culprits: [] }, brokenImages: [], lowContrast: [], missingFonts: [], smallTargets: [], ...over },
  targets: [],
  ...rest,
});

test("probeFindings: sin problemas no inventa nada; desborde y contraste salen con dónde y cómo arreglar", () => {
  assert.deepEqual(probeFindings(probe()), []);
  const el = { tag: "div", text: "", classes: "w-[1700px]", path: "main > div", box: [0, 0, 1700, 40] as [number, number, number, number] };
  const f = probeFindings(
    probe({
      overflow: { scrollWidth: 1700, viewport: 1440, culprits: [{ ...el, right: 1700 }] },
      lowContrast: [{ ...el, tag: "p", text: "gris", ratio: 2.6, min: 4.5, fg: "#99A1AF", bg: "#FFFFFF", size: 18 }],
    }),
  );
  assert.equal(f[0].area, "overflow");
  assert.equal(f[0].severity, "high");
  assert.match(f[0].where!, /w-\[1700px\]/);
  assert.equal(f[1].area, "contrast");
  assert.equal(f[1].severity, "high"); // 2.6 queda a más de 1 punto del mínimo
  assert.equal(probeFindings(probe({}, { tailwind: false }))[0].area, "render");
});

test("offPalette: un gris de Tailwind por defecto con peso es fuera del sistema; los del tema y blanco/negro no", () => {
  const d = buildDna(page());
  const theme = { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, background: "#FFFFFF", foreground: "#111111", primary: "#2563EB", surface: "#F5F5F4", border: "#E5E7EB", muted: "#6B7280" } };
  assert.deepEqual(offPalette(d, theme), []);
  // el tablero dice muted = zinc-600; la pantalla usó gray-500 (#6B7280): eso es salirse del sistema
  const sinMuted = { ...theme, colors: { ...theme.colors, muted: "#3F3F46" } };
  const off = offPalette(d, sinMuted);
  assert.deepEqual(off.map((o) => o.hex), ["#6B7280"]);
  assert.equal(off[0].nearest, "#3F3F46");
});

test("checkScreen: puntaje 100 sin hallazgos; con referencia suma la crítica (sin repetir el contraste)", () => {
  const d = buildDna(page());
  const theme = themeFromDna(d);
  const clean = checkScreen({ probe: probe(), dna: d, theme });
  assert.equal(clean.score, 100);
  const darkRef = buildDna(page({ rootBg: "rgb(10, 10, 10)", colors: [{ c: "rgb(10, 10, 10)", prop: "bg", w: 3_000_000 }, { c: "rgb(250, 250, 250)", prop: "text", w: 50_000 }] }));
  const r = checkScreen({ probe: probe(), dna: d, theme, ref: { id: "oscuro.com", name: "Oscuro", dna: darkRef } });
  assert.equal(r.reference?.ref_id, "oscuro.com");
  assert.ok(r.findings.every((f) => f.area !== "ref:contrast"));
  assert.ok(r.findings.length > 0 && r.score < 100);
});

test("pickTarget: el clic señala la caja MÁS PEQUEÑA que lo contiene", () => {
  const t = (tag: string, box: [number, number, number, number]) => ({ tag, text: tag, classes: "", path: tag, box });
  const targets = [t("section", [0, 0, 1440, 800]), t("button", [100, 300, 160, 48]), t("h1", [100, 100, 800, 120])];
  assert.equal(pickTarget(targets, 150, 320)?.tag, "button");
  assert.equal(pickTarget(targets, 1000, 700)?.tag, "section");
  assert.equal(pickTarget(targets, 2000, 2000), undefined);
});

test("store: cada put guarda versión nueva, los comentarios guardan el elemento y borrar deja huérfanas como raíz", () => {
  useMemoryDb();
  store.resetStudioSchema();
  store.saveBoard({ id: "demo", name: "Demo", theme: DEFAULT_THEME });
  const a = store.upsertScreen({ boardId: "demo", slug: "home", name: "Home", viewport: "desktop", width: 1440, html: "<p>1</p>" });
  const b = store.upsertScreen({ boardId: "demo", slug: "home", name: "Home", viewport: "desktop", width: 1440, html: "<p>2</p>", note: "más aire" });
  assert.equal(a.version, 1);
  assert.equal(b.version, 2);
  assert.equal(store.getVersion("demo", "home", 1)?.html, "<p>1</p>");
  assert.deepEqual(store.listVersions("demo", "home").map((v) => v.version), [2, 1]);
  store.upsertScreen({ boardId: "demo", slug: "home-b", name: "Home B", viewport: "desktop", width: 1440, html: "<p>b</p>", variantOf: "home" });
  const target = { tag: "button", text: "Probar", classes: "bg-primary", path: "a", box: [0, 0, 10, 10] as [number, number, number, number] };
  const c = store.addComment({ boardId: "demo", slug: "home", x: 5, y: 5, text: "más grande", target, version: 2 });
  assert.equal(c.target?.tag, "button");
  assert.equal(store.listComments("demo", { status: "open" }).length, 1);
  store.resolveComment("demo", c.id, "subí a text-lg");
  assert.equal(store.listComments("demo", { status: "open" }).length, 0);
  assert.equal(store.listComments("demo")[0].reply, "subí a text-lg");
  store.setStatus("demo", "home-b", "approved");
  assert.equal(store.getScreen("demo", "home-b")?.status, "approved");
  // un put nuevo devuelve la pantalla a borrador: lo aprobado era OTRA versión
  store.upsertScreen({ boardId: "demo", slug: "home-b", name: "Home B", viewport: "desktop", width: 1440, html: "<p>b2</p>" });
  assert.equal(store.getScreen("demo", "home-b")?.status, "draft");
  store.deleteScreen("demo", "home");
  assert.equal(store.getScreen("demo", "home-b")?.variantOf, undefined);
  assert.equal(store.listComments("demo").length, 0);
});

test("ensureLegible: una marca medida con muted = fondo, sin superficie y borde blanco en oscuro se corrige y se anota", () => {
  const t = ensureLegible({ ...DEFAULT_THEME, scheme: "dark", colors: { background: "#0E111C", foreground: "#FFFFFF", primary: "#1644FF", muted: "#0E111C", border: "#E0E0E0", "on-primary": "#FFFFFF" } });
  const bg = parseColor(t.colors.background)!;
  assert.ok(contrastRatio(parseColor(t.colors.muted!)!, bg) >= 4.5, "muted legible");
  assert.ok(contrastRatio(parseColor(t.colors.muted!)!, bg) < contrastRatio(parseColor(t.colors.foreground)!, bg), "muted más suave que el texto");
  assert.ok(t.colors.surface && contrastRatio(parseColor(t.colors.surface)!, bg) < 1.6, "surface cerca del fondo");
  assert.ok(contrastRatio(parseColor(t.colors.border!)!, bg) <= 2.2, "borde discreto");
  assert.equal(t.adjusted?.length, 3);
  assert.equal(t.colors.primary, "#1644FF"); // la marca no se toca
});

test("applyThemeInput: lo que fija el agente no se cambia, pero se avisa si no se lee", () => {
  const { warnings, theme } = applyThemeInput(DEFAULT_THEME, { colors: { muted: "#D4D4D8" } });
  assert.equal(theme.colors.muted, "#D4D4D8");
  assert.match(warnings[0], /^muted #D4D4D8 sobre background/);
});

test("classGuide: anuncia los contrastes reales (text-primary sobre fondo oscuro no sirve como texto)", async () => {
  const { classGuide } = await import("../src/studio/theme.js");
  const g = classGuide({ ...DEFAULT_THEME, scheme: "dark", colors: { background: "#0E111C", foreground: "#FFFFFF", primary: "#1644FF", "on-primary": "#FFFFFF" } });
  const line = g.contrast.find((l: string) => l.startsWith("text-primary sobre bg-background"))!;
  assert.match(line, /NO como texto/);
});

test("screenLinks: data-go con comillas dobles o simples, deduplicado y en slug", async () => {
  const { screenLinks } = await import("../src/studio/doc.js");
  assert.deepEqual(screenLinks(`<a data-go="Precios">x</a><button data-go='Registro · Paso 1'>y</button><a data-go="precios">z</a>`), ["precios", "registro-paso-1"]);
  assert.deepEqual(screenLinks("<a href='#'>nada</a>"), []);
});

test("screenDocument con nav: el lienzo recibe postMessage y la exportación abre el HTML hermano", () => {
  const post = screenDocument({ html: "<a data-go='Precios'>x</a>", theme: DEFAULT_THEME, title: "x", assetOrigin: "http://localhost:4040", nav: "post" });
  assert.match(post, /parent\.postMessage\(\{matiz:"go"/);
  const file = screenDocument({ html: "<a data-go='Precios'>x</a>", theme: DEFAULT_THEME, title: "x", assetOrigin: "..", csp: false, nav: "file" });
  assert.match(file, /location\.href=to\+"\.html"/);
  assert.doesNotMatch(screenDocument({ html: "<p>x</p>", theme: DEFAULT_THEME, title: "x", assetOrigin: ".." }), /data-go/);
});

test("wireframeHtml: tipos conocidos en orden, los desconocidos se reportan, cada sección marcada", async () => {
  const { wireframeHtml, WIREFRAME_TYPES } = await import("../src/studio/wireframe.js");
  const r = wireframeHtml(["navbar", "hero", "Pricing", "carrusel-3d", "footer"]);
  assert.deepEqual(r.used, ["navbar", "hero", "pricing", "footer"]);
  assert.deepEqual(r.unknown, ["carrusel-3d"]);
  assert.deepEqual([...r.html.matchAll(/data-wf="([a-z-]+)"/g)].map((m) => m[1]), ["navbar", "hero", "pricing", "footer"]);
  assert.ok(WIREFRAME_TYPES.length >= 24); // cubre todos los tipos del clasificador
  // solo tokens del tablero: nada de grises por defecto de Tailwind
  assert.doesNotMatch(r.html, /\b(gray|slate|zinc|neutral)-\d/);
});

test("tellFindings: cada señal medida se vuelve un hallazgo con dónde y qué decidir; sin señales no hay nada", async () => {
  const { tellFindings } = await import("../src/studio/check.js");
  const ex = { tag: "div", text: "x", path: "section > div", box: [0, 0, 10, 10] as [number, number, number, number] };
  assert.deepEqual(tellFindings({ fonts: { body: "Fraunces", heading: "Fraunces" } }, DEFAULT_THEME), []);
  const f = tellFindings(
    {
      gradient: { count: 3, purple: 2, examples: [ex] },
      "card-kit": { count: 2, groups: 2, examples: [ex] },
      "long-lines": { count: 1, examples: [ex] },
      eyebrow: { count: 4, examples: [ex] },
      fonts: { body: "Inter", heading: "Inter" },
    },
    DEFAULT_THEME,
  );
  const areas = f.map((x) => x.area);
  assert.deepEqual(areas, ["tell:gradient", "tell:eyebrow", "tell:card-kit", "tell:long-lines", "tell:default-font"]);
  assert.match(f[0].message, /2 hacia el morado/);
  assert.ok(f.every((x) => x.severity !== "high"), "una señal nunca es alta: puede ser una decisión");
  // con marca base, la fuente por defecto es de la marca: no se avisa
  assert.ok(!tellFindings({ fonts: { body: "Inter", heading: "Inter" } }, { ...DEFAULT_THEME, source: { ref_id: "x", name: "x", url: "x" } }).length);
});

test("checkScreen: lo que se rompe a 390 px entra como hallazgo propio", () => {
  const d = buildDna(page());
  const theme = themeFromDna(d);
  const roto = probe({ overflow: { scrollWidth: 620, viewport: 390, culprits: [] } });
  const r = checkScreen({ probe: probe(), dna: d, theme, responsive: [{ viewport: "390", width: 390, probe: roto }] });
  assert.equal(r.findings[0].area, "overflow@390");
  assert.match(r.findings[0].message, /^A 390px:/);
});

test("store: referencias fijadas en orden, sin duplicar, y se pueden quitar", () => {
  useMemoryDb();
  store.resetStudioSchema();
  store.saveBoard({ id: "refs", name: "Refs", theme: DEFAULT_THEME });
  const before = store.boardStamp("refs");
  store.pinRef("refs", "linear.app", "la jerarquía del hero");
  store.pinRef("refs", "stripe.com#3");
  store.pinRef("refs", "linear.app"); // repetir no duplica ni borra la nota
  assert.deepEqual(store.listRefs("refs").map((r) => [r.refId, r.note]), [["linear.app", "la jerarquía del hero"], ["stripe.com#3", undefined]]);
  assert.notEqual(store.boardStamp("refs"), before, "el lienzo se entera");
  store.unpinRef("refs", "linear.app");
  assert.deepEqual(store.listRefs("refs").map((r) => r.refId), ["stripe.com#3"]);
});

test("ensureLegible: un muted casi igual al texto principal no da jerarquía y se deriva uno más suave", () => {
  const t = ensureLegible({ ...DEFAULT_THEME, colors: { background: "#F6F8F7", foreground: "#000000", primary: "#1E6B3C", muted: "#0F0E12", surface: "#ECEEED", border: "#D8DAD9", "on-primary": "#FFFFFF" } });
  const bg = parseColor(t.colors.background)!;
  const m = contrastRatio(parseColor(t.colors.muted!)!, bg);
  assert.ok(m >= 4.5 && m < 9, `muted ${t.colors.muted} = ${m.toFixed(2)}:1`);
  assert.ok(contrastRatio(parseColor(t.colors.muted!)!, parseColor(t.colors.surface!)!) >= 4.5, "también sobre surface");
  assert.match(t.adjusted![0], /casi el mismo color del texto/);
});

test("probeFindings: textos encimados salen como hallazgo con los dos textos", () => {
  const el = (text: string) => ({ tag: "span", text, classes: "", path: "div > span", box: [0, 0, 10, 10] as [number, number, number, number] });
  const f = probeFindings(probe({ overlaps: [{ a: el("Papa criolla"), b: el("Mora de Castilla"), share: 55 }] }));
  assert.equal(f[0].area, "overlap");
  assert.equal(f[0].severity, "high");
  assert.match(f[0].where!, /«Papa criolla» pisa «Mora de Castilla» \(55%\)/);
});
