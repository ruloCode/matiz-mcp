// Tools del Estudio: el agente del usuario DISEÑA (escribe HTML + Tailwind con los tokens del
// tablero) y Matiz pone el lienzo, el render, la medición y la memoria (versiones y
// comentarios). Matiz no llama a ningún modelo: diseña el modelo que ya lo está usando.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { allSites, findSite } from "../db.js";
import { aggregateComposition } from "../analysis/composition.js";
import { WIREFRAME_TYPES, wireframeHtml } from "./wireframe.js";
import { captureSite } from "../capture/capture.js";
import { tasteProfile } from "../taste.js";
import { fail, guard, image, imageBuffer, ok, text, type Content } from "../mcp-util.js";
import { VIEWPORTS, TAILWIND_PATH, screenDocument, screenLinks, slugify, type ViewportName } from "./doc.js";
import { DEFAULT_THEME, applyThemeInput, classGuide, themeCss, themeFromDna, COLOR_ROLES, type BoardTheme } from "./theme.js";
import { checkScreen, probeFindings, type StudioFinding } from "./check.js";
import { layoutBoard } from "./layout.js";
import { renderOverview, renderScreen, tailwindSource } from "./render.js";
import * as store from "./store.js";

let queue = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

async function galleryUrl(): Promise<string | undefined> {
  const { ensureGallery } = await import("../gallery/server.js");
  return ensureGallery().catch(() => undefined);
}

const themeSchema = z
  .object({
    scheme: z.enum(["light", "dark"]).optional(),
    colors: z
      .record(z.string(), z.string())
      .optional()
      .describe(`Roles: ${COLOR_ROLES.join(", ")}. Hex, rgb() u oklch().`),
    fonts: z
      .object({ heading: z.string().optional(), body: z.string().optional(), mono: z.string().optional() })
      .optional()
      .describe("Familias. Si una es comercial se carga su alternativa libre (se avisa)."),
    radius: z.number().int().min(0).max(48).optional(),
    content_width: z.number().int().min(320).max(1920).optional(),
  })
  .optional();

/**
 * Lo que check_screen marca como señal de plantilla, dicho ANTES de diseñar. Es la misma lista
 * que mide tells.browser.js: si el agente la lee al empezar, no tiene que descubrirla al final.
 */
const DEFAULTS_TO_DECIDE = [
  "degradados de adorno (sobre todo morado/índigo) y paneles de vidrio",
  "una etiqueta en MAYÚSCULAS con tracking encima de cada título",
  "una sola palabra del titular en otro color o en cursiva",
  "todo el contenido picado en tarjetas idénticas, con un solo radio y la misma sombra gris",
  "emoji haciendo de ícono; flecha → al final de cada botón o enlace",
  "marcadores 01/02/03 cuando el contenido no es una secuencia",
  "metadatos unidos con «·»; todo centrado; animación de entrada en cada bloque",
  "párrafos de más de ~85 caracteres por línea; más de 9 tamaños de letra",
];

const findingsBrief = (f: StudioFinding[]) => f.map((x) => `[${x.severity}] ${x.message}${x.where ? ` — ${x.where}` : ""} → ${x.fix}`);

function themeSummary(t: BoardTheme) {
  return {
    scheme: t.scheme,
    colors: t.colors,
    fonts: t.fonts,
    fonts_original: t.fontsOriginal,
    radius: t.radius,
    content_width: t.contentWidth,
    based_on: t.source,
    adjusted_for_legibility: t.adjusted,
  };
}

function requireBoard(id: string) {
  const b = store.getBoard(slugify(id));
  if (!b) throw new Error(`No existe el tablero «${id}». Créalo con create_board (tableros: ${store.listBoards().map((x) => x.id).join(", ") || "ninguno"}).`);
  return b;
}
function requireScreen(boardId: string, name: string) {
  const s = store.getScreen(boardId, slugify(name));
  if (!s) throw new Error(`No existe la pantalla «${name}» en ${boardId} (hay: ${store.listScreens(boardId).map((x) => x.slug).join(", ") || "ninguna"}).`);
  return s;
}

async function renderAndStore(boardId: string, theme: BoardTheme, s: store.Screen, measure: boolean) {
  try {
    const r = await serial(() => renderScreen({ boardId, slug: s.slug, version: s.version, name: s.name, html: s.html, theme, viewport: s.viewport, measure }));
    const findings = probeFindings(r.probe);
    store.saveRender(boardId, s.slug, s.version, { shot: r.shot, thumb: r.thumb, height: r.height, findings, targets: r.probe.targets });
    return { ok: true as const, r, findings };
  } catch (e) {
    const msg = (e as Error).message.split("\n")[0];
    store.saveRender(boardId, s.slug, s.version, { findings: [], targets: [], error: msg });
    return { ok: false as const, error: msg };
  }
}

/** Vista en el chat (MCP Apps): los hosts que la soportan pintan la pantalla dentro de la conversación. */
const UI_URI = "ui://matiz/studio.html";
const UI_META = { ui: { resourceUri: UI_URI }, "ui/resourceUri": UI_URI };
const here = dirname(fileURLToPath(import.meta.url));

export function registerStudioTools(server: McpServer) {
  const viewFile = join(here, "app-view.html");
  if (existsSync(viewFile))
    server.registerResource("matiz-studio-view", UI_URI, { mimeType: "text/html;profile=mcp-app", title: "Matiz Estudio" }, async () => ({
      contents: [{ uri: UI_URI, mimeType: "text/html;profile=mcp-app", text: readFileSync(viewFile, "utf8") }],
    }));

  server.registerTool(
    "create_board",
    {
      title: "Crear tablero (Estudio)",
      description:
        "Abre (o actualiza) un TABLERO del Estudio de Matiz: un lienzo tipo Figma donde diseñas pantallas ANTES de tocar el código del " +
        "proyecto. Fija el sistema del tablero: base_ref toma la marca medida de un sitio del corpus (colores con rol, tipografías con " +
        "alternativa libre, radio, ancho); theme ajusta o define a mano. Todas las pantallas reciben esos tokens como clases de Tailwind " +
        "(bg-background, text-foreground, text-muted, bg-primary, text-on-primary, font-heading, rounded-brand, max-w-content). " +
        "Devuelve la guía de clases y la URL del lienzo. Mismo nombre = mismo tablero (actualiza el tema).",
      inputSchema: {
        name: z.string().min(1).max(80),
        brief: z.string().max(4000).optional().describe("Qué se diseña y para quién (queda en el tablero y en la entrega)"),
        project: z.string().optional().describe("Proyecto de gusto (remember_taste): sus reglas vuelven en la respuesta"),
        base_ref: z.string().optional().describe("Sitio del corpus cuya marca medida es la base, p. ej. 'linear.app'"),
        theme: themeSchema,
      },
      annotations: { readOnlyHint: false },
    },
    guard(async (a) => {
      const id = slugify(a.name);
      const prev = store.getBoard(id);
      let base: BoardTheme = prev?.theme ?? DEFAULT_THEME;
      if (a.base_ref) {
        const site = findSite(a.base_ref);
        if (!site) return fail(`No está en el corpus: ${a.base_ref}. Búscalo con search_references o captúralo con capture_site.`);
        base = themeFromDna(site.dna, { ref_id: site.id, name: site.name, url: site.url });
      }
      const { theme, rejected, warnings } = applyThemeInput(base, a.theme as never);
      const board = store.saveBoard({ id, name: a.name, project: a.project ?? prev?.project, brief: a.brief ?? prev?.brief, theme });
      const url = await galleryUrl();
      return ok([
        text({
          board: board.id,
          status: prev ? "actualizado" : "creado",
          canvas: url ? `${url}/studio/${board.id}` : "inicia la galería con open_board para verlo",
          theme: themeSummary(theme),
          class_guide: classGuide(theme),
          rejected: rejected.length ? rejected : undefined,
          adjusted_for_legibility: theme.adjusted,
          contrast_warnings: warnings.length ? warnings : undefined,
          taste: board.project ? tasteProfile(board.project) : undefined,
          avoid_by_default: {
            why: "Son los tratamientos que un modelo pone sea cual sea el encargo. check_screen los cuenta y dice dónde. Si el brief los pide, úsalos; si no, cada uno debe ser una decisión.",
            list: DEFAULTS_TO_DECIDE,
          },
          how_to:
            "Antes de dibujar, escribe un plan corto (paleta en 4–6 roles, tipografías y su papel, idea de layout en una frase) y revísalo: si una parte es lo que harías para cualquier página parecida, cámbiala. " +
            "Diseña con put_screen (una pantalla por llamada: el HTML del <body> con clases de Tailwind v4). Empieza en baja fidelidad si " +
            "el usuario aún no decidió la estructura (get_composition + get_section_blueprint dan el esqueleto medido). Mira la miniatura " +
            "que vuelve, corrige, y corre check_screen antes de mostrarla. Variantes: put_screen con variant_of. Lo que el humano comente " +
            "en el lienzo llega con get_board.",
        }),
      ]);
    }),
  );

  server.registerTool(
    "put_screen",
    {
      title: "Dibujar una pantalla",
      description:
        "Crea o actualiza una pantalla del tablero (cada llamada guarda una VERSIÓN nueva; nada se pisa). html = contenido del <body> con " +
        "clases de Tailwind v4 y los tokens del tablero (no hace falta <html>, <head> ni el script de Tailwind: Matiz los pone). Sin red: " +
        "no hay fetch ni scripts externos; imágenes solo https o placeholders (div bg-surface con aspect-ratio). Se renderiza en Chromium " +
        "al viewport pedido y vuelve la MINIATURA para que la veas + problemas medidos (desborde, contraste, imágenes rotas, fuentes, " +
        "táctiles chicos). variant_of = variante de otra pantalla (se pone debajo de ella en el lienzo para compararlas). FLUJOS: pon " +
        "data-go=\"Nombre de otra pantalla\" en un botón o enlace y el lienzo dibuja la flecha y lo vuelve un prototipo navegable.",
      inputSchema: {
        board: z.string().min(1),
        name: z.string().min(1).max(80).describe("Nombre visible, p. ej. 'Home', 'Pricing · B'"),
        html: z.string().min(1).max(400_000),
        viewport: z.enum(["desktop", "tablet", "mobile"]).default("desktop").describe("desktop 1440 · tablet 834 · mobile 390"),
        variant_of: z.string().optional().describe("Nombre de la pantalla de la que esta es variante"),
        note: z.string().max(1000).optional().describe("Qué cambió o qué se quiso probar (va al historial de versiones)"),
        image: z.enum(["thumb", "full", "none"]).default("thumb"),
      },
      _meta: UI_META,
      annotations: { readOnlyHint: false },
    },
    guard(async (a) => {
      const board = requireBoard(a.board);
      const slug = slugify(a.name);
      let variantOf: string | undefined;
      if (a.variant_of) {
        variantOf = slugify(a.variant_of);
        if (variantOf === slug) return fail("Una pantalla no puede ser variante de sí misma: usa otro nombre.");
        requireScreen(board.id, variantOf);
      }
      const vp = a.viewport as ViewportName;
      const s = store.upsertScreen({ boardId: board.id, slug, name: a.name, viewport: vp, width: VIEWPORTS[vp].width, html: a.html, note: a.note, variantOf });
      const res = await renderAndStore(board.id, board.theme, s, false);
      const url = await galleryUrl();
      const open = store.listComments(board.id, { status: "open", slug }).length;
      const links = screenLinks(a.html);
      const existing = new Set(store.listScreens(board.id).map((x) => x.slug));
      const body = {
        kind: "screen",
        board: board.id,
        screen: slug,
        name: a.name,
        version: s.version,
        viewport: `${vp} (${VIEWPORTS[vp].width}px)`,
        height: res.ok ? res.r.height : undefined,
        render_ms: res.ok ? res.r.ms : undefined,
        render_error: res.ok ? undefined : res.error,
        problems: res.ok ? (res.findings.length ? findingsBrief(res.findings) : "ninguno medible") : undefined,
        open_comments: open || undefined,
        links: links.length ? links.map((to) => (existing.has(to) ? to : `${to} (aún no existe: dibújala con ese nombre)`)) : undefined,
        canvas: url ? `${url}/studio/${board.id}#${slug}` : undefined,
        next: "Mira la imagen. Si algo no se ve como querías, corrige y vuelve a llamar put_screen con el mismo nombre. Antes de dar la pantalla por buena: check_screen.",
      };
      const img: Content[] = res.ok && a.image !== "none" ? image(a.image === "full" ? res.r.shot : res.r.thumb) : [];
      return ok([text(body), ...img]);
    }),
  );

  server.registerTool(
    "draft_wireframe",
    {
      title: "Esqueleto en baja fidelidad",
      description:
        "Dibuja la ESTRUCTURA de una página en bloques grises (baja fidelidad, como un wireframe de Figma) para acordar qué secciones van " +
        "y en qué orden antes del detalle. sections = la secuencia que quieres; si la omites sale la secuencia típica medida en el corpus " +
        "para esa industria y tipo de página (la misma evidencia de get_composition). Queda como una pantalla más del tablero: el humano " +
        `la comenta y tú la reemplazas por la versión real con put_screen. Tipos: ${WIREFRAME_TYPES.join(", ")}.`,
      inputSchema: {
        board: z.string().min(1),
        name: z.string().min(1).max(80).default("Wireframe"),
        sections: z.array(z.string()).max(30).optional().describe("Secuencia de tipos de sección, en orden"),
        industry: z.string().optional().describe("Si no hay sections: industria del corpus para la secuencia típica (ai, devtools, fintech…)"),
        page: z.string().optional().describe("Tipo de página del corpus (home por defecto): pricing, about, features…"),
        viewport: z.enum(["desktop", "tablet", "mobile"]).default("desktop"),
      },
      _meta: UI_META,
      annotations: { readOnlyHint: false },
    },
    guard(async (a) => {
      const board = requireBoard(a.board);
      let sequence = a.sections;
      let evidence: unknown;
      if (!sequence?.length) {
        const page = a.page ?? "home";
        let sites = allSites().filter((x) => (x.page ?? "home") === page && (x.viewport ?? "desktop") === "desktop");
        if (a.industry) sites = sites.filter((x) => x.industry.includes(a.industry!.toLowerCase()) || x.tags.includes(a.industry!.toLowerCase()));
        if (sites.length < 2) return fail(`Solo ${sites.length} sitio(s) del corpus con ese filtro: pasa sections a mano o amplía el filtro.`);
        const comp = aggregateComposition(sites.map((x) => ({ id: x.id, name: x.name, sequence: x.dna.sequence })), 0.25);
        sequence = comp.typicalSequence;
        evidence = { sites: sites.length, industry: a.industry ?? "todas", page, presence: Object.fromEntries(comp.types.filter((t) => sequence!.includes(t.type)).map((t) => [t.type, Math.round(t.presence * 100) + "%"])) };
      }
      const wf = wireframeHtml(sequence);
      if (!wf.used.length) return fail(`Ningún tipo de sección reconocido. Usa: ${WIREFRAME_TYPES.join(", ")}.`);
      const slug = slugify(a.name);
      const vp = a.viewport as ViewportName;
      const s = store.upsertScreen({ boardId: board.id, slug, name: a.name, viewport: vp, width: VIEWPORTS[vp].width, html: wf.html, note: `wireframe: ${wf.used.join(" → ")}` });
      const res = await renderAndStore(board.id, board.theme, s, false);
      const url = await galleryUrl();
      return ok([
        text({
          kind: "wireframe",
          board: board.id,
          screen: slug,
          name: a.name,
          version: s.version,
          sequence: wf.used,
          unknown_types: wf.unknown.length ? wf.unknown : undefined,
          evidence,
          render_error: res.ok ? undefined : res.error,
          canvas: url ? `${url}/studio/${board.id}#${slug}` : undefined,
          next: "Muéstraselo al humano (open_board) y acuerda la estructura. Luego dibuja la versión real con put_screen (otro nombre, o el mismo para reemplazarla).",
        }),
        ...(res.ok ? image(res.r.thumb) : []),
      ]);
    }),
  );

  server.registerTool(
    "get_screen",
    {
      title: "Leer una pantalla",
      description: "El HTML de una pantalla (versión actual o una anterior) para editarlo, su historial de versiones y sus comentarios abiertos.",
      inputSchema: {
        board: z.string().min(1),
        screen: z.string().min(1),
        version: z.number().int().min(1).optional(),
        image: z.enum(["thumb", "full", "none"]).default("none"),
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (a) => {
      const board = requireBoard(a.board);
      const s = requireScreen(board.id, a.screen);
      const v = a.version && a.version !== s.version ? store.getVersion(board.id, s.slug, a.version) : undefined;
      if (a.version && a.version !== s.version && !v) return fail(`La pantalla ${s.slug} no tiene versión ${a.version} (actual: ${s.version}).`);
      const shot = v ? v.shot : a.image === "full" ? s.shot : s.thumb;
      return ok([
        text({
          board: board.id,
          screen: s.slug,
          name: s.name,
          viewport: s.viewport,
          status: s.status,
          variant_of: s.variantOf,
          version: a.version ?? s.version,
          current_version: s.version,
          note: v ? v.note : s.note,
          html: v ? v.html : s.html,
          versions: store.listVersions(board.id, s.slug).map((x) => ({ version: x.version, note: x.note, at: x.createdAt })),
          open_comments: store.listComments(board.id, { status: "open", slug: s.slug }).map((c) => ({ id: c.id, text: c.text, on: c.target, at: [Math.round(c.x), Math.round(c.y)], version: c.version })),
        }),
        ...(a.image !== "none" ? image(shot) : []),
      ]);
    }),
  );

  server.registerTool(
    "check_screen",
    {
      title: "Medir una pantalla",
      description:
        "Mide la pantalla renderizada como si fuera un sitio del corpus y la evalúa: problemas de render (desborde, contraste texto por " +
        "texto, imágenes, fuentes, táctiles), colores FUERA del sistema del tablero, tipografías y radio que no son los del tablero, " +
        "SEÑALES DE PLANTILLA (16 tratamientos por defecto de las páginas generadas: degradados de adorno, etiquetas en mayúsculas sobre " +
        "cada título, tarjetas idénticas, emoji de ícono, líneas de más de 85 caracteres…) y, contra una referencia del corpus (ref_id, " +
        "por defecto la base del tablero), la crítica completa. Con responsive (por defecto) una pantalla de escritorio se vuelve a medir " +
        "a 390 px para cazar desbordes en móvil. Cada hallazgo trae dónde está y qué cambiar. Puntaje 0–100.",
      inputSchema: {
        board: z.string().min(1),
        screen: z.string().min(1),
        ref_id: z.string().optional().describe("Referencia del corpus para comparar (sitio o URL capturada)"),
        responsive: z.boolean().default(true).describe("Medir también el mismo HTML a 390 px (solo pantallas de escritorio o tablet)"),
        image: z.boolean().default(false).describe("Incluir la miniatura de la pantalla, la de 390 px y la de la referencia"),
      },
      _meta: UI_META,
      annotations: { readOnlyHint: true },
    },
    guard(async (a) => {
      const board = requireBoard(a.board);
      const s = requireScreen(board.id, a.screen);
      const refId = a.ref_id ?? board.theme.source?.ref_id;
      const ref = refId ? findSite(refId) : undefined;
      if (a.ref_id && !ref) return fail(`No está en el corpus: ${a.ref_id}`);
      const r = await serial(() => renderScreen({ boardId: board.id, slug: s.slug, version: s.version, name: s.name, html: s.html, theme: board.theme, viewport: s.viewport, measure: true }));
      const small =
        a.responsive && s.viewport !== "mobile"
          ? await serial(() => renderScreen({ boardId: board.id, slug: `${s.slug}--390`, version: s.version, name: s.name, html: s.html, theme: board.theme, viewport: "mobile" })).catch(() => undefined)
          : undefined;
      const report = checkScreen({
        probe: r.probe,
        dna: r.dna,
        theme: board.theme,
        tells: r.tells,
        ref: ref && { id: ref.id, name: ref.name, dna: ref.dna },
        responsive: small ? [{ viewport: "390", width: 390, probe: small.probe }] : undefined,
      });
      store.saveRender(board.id, s.slug, s.version, { shot: r.shot, thumb: r.thumb, height: r.height, findings: report.findings, targets: r.probe.targets });
      const url = await galleryUrl();
      const content: Content[] = [text({ kind: "check", board: board.id, screen: s.slug, name: s.name, version: s.version, canvas: url ? `${url}/studio/${board.id}#${s.slug}` : undefined, ...report })];
      if (a.image) {
        content.push(text(`↓ ${s.name} v${s.version}`), ...image(r.thumb));
        if (small) content.push(text("↓ el mismo HTML a 390 px"), ...image(small.thumb));
        if (ref) content.push(text(`↓ referencia: ${ref.name} (${ref.url})`), ...image(ref.shots.heroThumb));
      }
      return ok(content);
    }),
  );

  server.registerTool(
    "get_board",
    {
      title: "Ver el tablero",
      description:
        "Estado del tablero: pantallas (versión, viewport, estado que marcó el humano — aprobada/descartada/borrador —, variantes, " +
        "problemas abiertos) y los COMENTARIOS del humano en el lienzo, cada uno con el elemento exacto que señaló (etiqueta, texto, " +
        "clases, selector). Con image=true, una vista general del lienzo. Sin board, lista los tableros.",
      inputSchema: {
        board: z.string().optional(),
        image: z.boolean().default(true),
        include_resolved: z.boolean().default(false),
      },
      _meta: UI_META,
      annotations: { readOnlyHint: true },
    },
    guard(async (a) => {
      if (!a.board) {
        const boards = store.listBoards();
        return ok([text(boards.length ? boards.map((b) => ({ board: b.id, name: b.name, screens: b.screens, open_comments: b.openComments, updated: b.updatedAt })) : "No hay tableros. Crea uno con create_board.")]);
      }
      const board = requireBoard(a.board);
      const screens = store.listScreens(board.id);
      const pos = layoutBoard(screens.map((s) => ({ slug: s.slug, width: s.width, height: s.height, order: s.order, variantOf: s.variantOf, x: s.x, y: s.y })));
      const comments = store.listComments(board.id, a.include_resolved ? {} : { status: "open" });
      const url = await galleryUrl();
      const content: Content[] = [
        text({
          board: board.id,
          name: board.name,
          brief: board.brief,
          canvas: url ? `${url}/studio/${board.id}` : undefined,
          theme: themeSummary(board.theme),
          screens: screens.map((s) => ({
            screen: s.slug,
            name: s.name,
            viewport: s.viewport,
            version: s.version,
            status: s.status,
            variant_of: s.variantOf,
            note: s.note,
            problems: s.findings.filter((f) => f.severity !== "low").length || undefined,
            render_error: s.renderError,
          })),
          references: store.listRefs(board.id).map((r) => ({ ref_id: r.refId, note: r.note })),
          comments: comments.map((c) => ({
            id: c.id,
            screen: c.slug,
            text: c.text,
            on: c.target ? { tag: c.target.tag, text: c.target.text, classes: c.target.classes, path: c.target.path } : undefined,
            at: [Math.round(c.x), Math.round(c.y)],
            on_version: c.version,
            status: c.status,
            reply: c.reply,
          })),
          how_to: comments.some((c) => c.status === "open")
            ? "Atiende cada comentario abierto con put_screen (misma pantalla) y luego resolve_comment con una respuesta corta de qué cambiaste."
            : undefined,
        }),
      ];
      if (a.image && screens.length) {
        const buf = await serial(() =>
          renderOverview(screens.map((s) => ({ name: `${s.name} · v${s.version}`, thumb: s.thumb, ...pos.get(s.slug)!, width: s.width, height: s.height, status: s.status }))),
        ).catch(() => undefined);
        content.push(...imageBuffer(buf));
      }
      return ok(content);
    }),
  );

  server.registerTool(
    "pin_reference",
    {
      title: "Fijar una referencia en el tablero",
      description:
        "Pone una referencia del corpus (sitio 'linear.app' o sección 'linear.app#3') EN el lienzo, encima de las pantallas, como en un " +
        "moodboard de Figma: el humano ve de dónde sale cada decisión y tú la tienes a la vista al diseñar. note = qué tomas de ella. " +
        "Si la captura no está en esta máquina se toma en el momento (~10 s). remove=true la quita.",
      inputSchema: {
        board: z.string().min(1),
        ref_id: z.string().min(1),
        note: z.string().max(300).optional().describe("Qué se toma de esta referencia: 'la jerarquía del hero', 'la tabla de precios'"),
        remove: z.boolean().default(false),
      },
      _meta: UI_META,
      annotations: { readOnlyHint: false },
    },
    guard(async (a) => {
      const board = requireBoard(a.board);
      let site = findSite(a.ref_id);
      if (!site) return fail(`No está en el corpus: ${a.ref_id}. Búscala con search_references o captúrala con capture_site.`);
      const idx = a.ref_id.includes("#") ? +a.ref_id.split("#")[1] : undefined;
      const refId = idx !== undefined ? `${site.id}#${idx}` : site.id;
      if (a.remove) {
        store.unpinRef(board.id, refId);
        return ok([text(`Referencia ${refId} quitada del tablero.`)]);
      }
      const shotOf = (s: typeof site) => (idx !== undefined ? s!.dna.sections.find((x) => x.idx === idx)?.shot : s!.shots.hero);
      if (!shotOf(site) || !existsSync(shotOf(site)!)) {
        const s0 = site;
        await serial(() => captureSite(s0.url, { name: s0.name, tags: s0.tags, industry: s0.tags.includes("curated") ? s0.industry : undefined, page: s0.page, viewport: s0.viewport })).catch(() => undefined);
        site = findSite(site.id) ?? site;
      }
      const shot = shotOf(site);
      store.pinRef(board.id, refId, a.note);
      const url = await galleryUrl();
      return ok([
        text({
          board: board.id,
          pinned: refId,
          site: site.name,
          url: site.url,
          note: a.note,
          image: shot && existsSync(shot) ? "en el lienzo" : "no se pudo capturar (el sitio cambió o bloquea); queda fijada sin imagen",
          canvas: url ? `${url}/studio/${board.id}` : undefined,
          references: store.listRefs(board.id).map((r) => r.refId),
        }),
        ...image(idx !== undefined ? site.dna.sections.find((x) => x.idx === idx)?.thumb : site.shots.heroThumb),
      ]);
    }),
  );

  server.registerTool(
    "open_board",
    {
      title: "Abrir el lienzo",
      description: "Abre el lienzo del tablero en el navegador del usuario (zoom, mover, comparar variantes, comentar sobre un elemento, aprobar o descartar).",
      inputSchema: { board: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    guard(async (a) => {
      const board = a.board ? requireBoard(a.board) : undefined;
      const url = await galleryUrl();
      if (!url) return fail("No pude iniciar la galería local (¿puertos 4040–4045 ocupados?).");
      const target = `${url}/studio${board ? `/${board.id}` : ""}`;
      const { spawn } = await import("node:child_process");
      const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
      spawn(opener, [target], { stdio: "ignore", detached: true }).unref();
      return ok([text(`Lienzo abierto en ${target}`)]);
    }),
  );

  server.registerTool(
    "manage_screen",
    {
      title: "Gestionar una pantalla",
      description:
        "approve / discard / draft cambian el estado (normalmente lo decide el humano en el lienzo); restore vuelve a una versión " +
        "anterior (como versión NUEVA); delete borra la pantalla y sus comentarios; move la ubica en el lienzo (x, y).",
      inputSchema: {
        board: z.string().min(1),
        screen: z.string().min(1),
        action: z.enum(["approve", "discard", "draft", "restore", "delete", "move"]),
        version: z.number().int().min(1).optional().describe("Para restore"),
        x: z.number().optional(),
        y: z.number().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    guard(async (a) => {
      const board = requireBoard(a.board);
      const s = requireScreen(board.id, a.screen);
      if (a.action === "delete") {
        store.deleteScreen(board.id, s.slug);
        return ok([text(`Pantalla ${s.slug} borrada.`)]);
      }
      if (a.action === "move") {
        if (a.x === undefined || a.y === undefined) return fail("move necesita x e y.");
        store.moveScreen(board.id, s.slug, a.x, a.y);
        return ok([text(`Pantalla ${s.slug} en (${a.x}, ${a.y}).`)]);
      }
      if (a.action === "restore") {
        if (!a.version) return fail("restore necesita version.");
        const v = store.getVersion(board.id, s.slug, a.version);
        if (!v) return fail(`No existe la versión ${a.version}.`);
        const ns = store.upsertScreen({ boardId: board.id, slug: s.slug, name: s.name, viewport: s.viewport, width: s.width, html: v.html, note: `restaurada desde v${a.version}` });
        const res = await renderAndStore(board.id, board.theme, ns, false);
        return ok([text({ screen: s.slug, version: ns.version, restored_from: a.version, render_error: res.ok ? undefined : res.error }), ...(res.ok ? image(res.r.thumb) : [])]);
      }
      const status = a.action === "approve" ? "approved" : a.action === "discard" ? "discarded" : "draft";
      store.setStatus(board.id, s.slug, status);
      return ok([text(`Pantalla ${s.slug}: ${status}.`)]);
    }),
  );

  server.registerTool(
    "resolve_comment",
    {
      title: "Resolver un comentario",
      description: "Marca resuelto un comentario del lienzo con una respuesta corta (qué cambiaste). El humano la ve junto al pin.",
      inputSchema: { board: z.string().min(1), comment_id: z.number().int(), reply: z.string().max(1000).optional() },
      annotations: { readOnlyHint: false },
    },
    guard(async (a) => {
      const board = requireBoard(a.board);
      const c = store.resolveComment(board.id, a.comment_id, a.reply);
      return c ? ok([text({ resolved: c.id, screen: c.slug, reply: c.reply })]) : fail(`No existe el comentario ${a.comment_id} en ${board.id}.`);
    }),
  );

  server.registerTool(
    "export_board",
    {
      title: "Entregar el tablero",
      description:
        "Exporta el tablero a una carpeta para pasar al código: cada pantalla como HTML autónomo (abre sin internet salvo fuentes), " +
        "su captura, theme.css (el @theme de Tailwind v4 listo para el proyecto) y handoff.md (brief, tokens, guía de clases, " +
        "pantallas con notas, estado y comentarios). only_approved deja fuera borradores y descartadas.",
      inputSchema: {
        board: z.string().min(1),
        dir: z.string().min(1).describe("Carpeta destino (absoluta, o relativa al directorio actual)"),
        only_approved: z.boolean().default(false),
      },
      annotations: { readOnlyHint: false },
    },
    guard(async (a) => {
      const board = requireBoard(a.board);
      let screens = store.listScreens(board.id).filter((s) => s.status !== "discarded");
      if (a.only_approved) screens = screens.filter((s) => s.status === "approved");
      if (!screens.length) return fail(a.only_approved ? "No hay pantallas aprobadas (apruébalas en el lienzo o con manage_screen)." : "El tablero no tiene pantallas.");
      const out = resolve(isAbsolute(a.dir) ? a.dir : join(process.cwd(), a.dir), board.id);
      mkdirSync(join(out, "screens"), { recursive: true });
      mkdirSync(join(out, "shots"), { recursive: true });
      mkdirSync(join(out, "__matiz"), { recursive: true });
      writeFileSync(join(out, TAILWIND_PATH.slice(1)), tailwindSource());
      const files: string[] = [];
      for (const s of screens) {
        const html = screenDocument({ html: s.html, theme: board.theme, title: `${board.name} · ${s.name}`, assetOrigin: "..", csp: false, nav: "file" });
        writeFileSync(join(out, "screens", `${s.slug}.html`), html);
        files.push(`screens/${s.slug}.html`);
        if (s.shot && existsSync(s.shot)) {
          copyFileSync(s.shot, join(out, "shots", `${s.slug}.jpg`));
          files.push(`shots/${s.slug}.jpg`);
        }
      }
      writeFileSync(join(out, "theme.css"), `/* ${board.name} — tema del tablero (Matiz Estudio) */\n@import "tailwindcss";\n\n${themeCss(board.theme)}\n`);
      const comments = store.listComments(board.id);
      const g = classGuide(board.theme);
      const md = [
        `# ${board.name}`,
        "",
        board.brief ? `${board.brief}\n` : "",
        `Diseñado en el Estudio de Matiz. ${board.theme.source ? `Marca base medida: [${board.theme.source.name}](${board.theme.source.url}).` : ""}`,
        "",
        "## Tokens",
        "",
        "| Rol | Valor |",
        "|---|---|",
        ...Object.entries(board.theme.colors).map(([k, v]) => `| ${k} | \`${v}\` |`),
        `| fuente títulos | ${board.theme.fonts.heading}${board.theme.fontsOriginal?.heading ? ` (marca original: ${board.theme.fontsOriginal.heading})` : ""} |`,
        `| fuente texto | ${board.theme.fonts.body}${board.theme.fontsOriginal?.body ? ` (marca original: ${board.theme.fontsOriginal.body})` : ""} |`,
        `| radio | ${board.theme.radius}px |`,
        `| ancho de contenido | ${board.theme.contentWidth}px |`,
        "",
        "`theme.css` trae el `@theme` de Tailwind v4: con él, las clases de las pantallas funcionan igual en el proyecto.",
        "",
        "## Clases",
        "",
        ...Object.entries(g.colors).map(([k, v]) => `- **${k}**: ${v}`),
        `- ${g.radius}`,
        `- ${g.container}`,
        "",
        "## Pantallas",
        "",
        ...screens.flatMap((s) => {
          const cs = comments.filter((c) => c.slug === s.slug);
          return [
            `### ${s.name} — ${s.viewport}, v${s.version}, ${s.status === "approved" ? "aprobada" : "borrador"}`,
            "",
            `![${s.name}](shots/${s.slug}.jpg)`,
            "",
            `HTML: [screens/${s.slug}.html](screens/${s.slug}.html)${s.variantOf ? ` · variante de ${s.variantOf}` : ""}`,
            s.note ? `\nNota: ${s.note}` : "",
            ...(cs.length ? ["", "Comentarios:", ...cs.map((c) => `- ${c.status === "open" ? "◻︎" : "✓"} ${c.text}${c.target ? ` _(en <${c.target.tag}> «${c.target.text.slice(0, 50)}»)_` : ""}${c.reply ? ` → ${c.reply}` : ""}`)] : []),
            "",
          ];
        }),
      ].join("\n");
      writeFileSync(join(out, "handoff.md"), md);
      return ok([text({ dir: out, screens: screens.length, files: ["handoff.md", "theme.css", ...files] })]);
    }),
  );
}

/** Prompt para diseñar en el Estudio desde cero. */
export function registerStudioPrompt(server: McpServer) {
  server.registerPrompt(
    "design_in_studio",
    {
      title: "Diseñar pantallas en el Estudio",
      description: "Guía al agente para diseñar pantallas en el lienzo de Matiz, con referencias medidas, antes de tocar el código.",
      argsSchema: {
        product: z.string().describe("Qué es el producto y para quién"),
        screens: z.string().default("landing").describe("Qué pantallas: 'landing', 'pricing y checkout', 'onboarding móvil'…"),
        mood: z.string().optional().describe("Tono buscado"),
      },
    },
    ({ product, screens, mood }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Quiero diseñar ${screens} para: ${product}.${mood ? ` Tono: ${mood}.` : ""}\n\n` +
              "Diseña en el Estudio de Matiz ANTES de escribir código del proyecto:\n" +
              "1. Decide de qué trata, para quién es y cuál es el trabajo principal de la pantalla. La identidad sale del tema, no de una plantilla.\n" +
              "2. get_composition (industria más cercana) y draft_wireframe con esa evidencia: acuerda la ESTRUCTURA con el humano (open_board) antes del detalle.\n" +
              "3. search_references por cada sección clave y pin_reference de las 2–4 que vas a usar, con una nota de qué tomas de cada una.\n" +
              "4. suggest_palettes y suggest_type_pairings; create_board con base_ref o theme. Escribe el plan (paleta, tipografías, layout, lo memorable) y compáralo con avoid_by_default: lo genérico se cambia antes de dibujar.\n" +
              "5. put_screen por pantalla, usando SOLO las clases de la guía. Mira cada miniatura y corrige antes de seguir. Une el flujo con data-go.\n" +
              "6. check_screen en cada pantalla (incluye 390 px): corrige toda severidad alta y decide cada señal de plantilla (quítala o justifícala).\n" +
              "7. Ofrece 2–3 variantes de lo que tenga dudas (variant_of). get_board para leer los comentarios del lienzo; atiéndelos y resolve_comment.\n" +
              "8. Cuando el humano apruebe, export_board a la carpeta del proyecto e implementa desde handoff.md.\n" +
              "Cita la URL de cada referencia que uses.",
          },
        },
      ],
    }),
  );
}
