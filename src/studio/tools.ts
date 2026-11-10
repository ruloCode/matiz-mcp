// Tools del Estudio: el agente del usuario DISEÑA (escribe HTML + Tailwind con los tokens del
// tablero) y Matiz pone el lienzo, el render, la medición y la memoria (versiones y
// comentarios). Matiz no llama a ningún modelo: diseña el modelo que ya lo está usando.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { findSite } from "../db.js";
import { tasteProfile } from "../taste.js";
import { fail, guard, image, imageBuffer, ok, text, type Content } from "../mcp-util.js";
import { VIEWPORTS, TAILWIND_PATH, screenDocument, slugify, type ViewportName } from "./doc.js";
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

export function registerStudioTools(server: McpServer) {
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
          how_to:
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
        "táctiles chicos). variant_of = variante de otra pantalla (se pone debajo de ella en el lienzo para compararlas).",
      inputSchema: {
        board: z.string().min(1),
        name: z.string().min(1).max(80).describe("Nombre visible, p. ej. 'Home', 'Pricing · B'"),
        html: z.string().min(1).max(400_000),
        viewport: z.enum(["desktop", "tablet", "mobile"]).default("desktop").describe("desktop 1440 · tablet 834 · mobile 390"),
        variant_of: z.string().optional().describe("Nombre de la pantalla de la que esta es variante"),
        note: z.string().max(1000).optional().describe("Qué cambió o qué se quiso probar (va al historial de versiones)"),
        image: z.enum(["thumb", "full", "none"]).default("thumb"),
      },
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
      const body = {
        board: board.id,
        screen: slug,
        version: s.version,
        viewport: `${vp} (${VIEWPORTS[vp].width}px)`,
        height: res.ok ? res.r.height : undefined,
        render_ms: res.ok ? res.r.ms : undefined,
        render_error: res.ok ? undefined : res.error,
        problems: res.ok ? (res.findings.length ? findingsBrief(res.findings) : "ninguno medible") : undefined,
        open_comments: open || undefined,
        canvas: url ? `${url}/studio/${board.id}#${slug}` : undefined,
        next: "Mira la imagen. Si algo no se ve como querías, corrige y vuelve a llamar put_screen con el mismo nombre. Antes de dar la pantalla por buena: check_screen.",
      };
      const img: Content[] = res.ok && a.image !== "none" ? image(a.image === "full" ? res.r.shot : res.r.thumb) : [];
      return ok([text(body), ...img]);
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
        "texto, imágenes, fuentes, táctiles), colores FUERA del sistema del tablero, tipografías y radio que no son los del tablero y, " +
        "contra una referencia del corpus (ref_id, por defecto la base del tablero), la crítica completa: paleta, escala tipográfica, " +
        "ancho, densidad, botones y secciones que faltan. Cada hallazgo trae dónde está y qué cambiar. Puntaje 0–100.",
      inputSchema: {
        board: z.string().min(1),
        screen: z.string().min(1),
        ref_id: z.string().optional().describe("Referencia del corpus para comparar (sitio o URL capturada)"),
        image: z.boolean().default(false).describe("Incluir la miniatura de la pantalla y la de la referencia"),
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (a) => {
      const board = requireBoard(a.board);
      const s = requireScreen(board.id, a.screen);
      const refId = a.ref_id ?? board.theme.source?.ref_id;
      const ref = refId ? findSite(refId) : undefined;
      if (a.ref_id && !ref) return fail(`No está en el corpus: ${a.ref_id}`);
      const r = await serial(() => renderScreen({ boardId: board.id, slug: s.slug, version: s.version, name: s.name, html: s.html, theme: board.theme, viewport: s.viewport, measure: true }));
      if (!r.dna) return fail("La pantalla no tiene bloques medibles (¿está vacía?).");
      const report = checkScreen({ probe: r.probe, dna: r.dna, theme: board.theme, ref: ref && { id: ref.id, name: ref.name, dna: ref.dna } });
      store.saveRender(board.id, s.slug, s.version, { shot: r.shot, thumb: r.thumb, height: r.height, findings: report.findings, targets: r.probe.targets });
      const content: Content[] = [text({ board: board.id, screen: s.slug, version: s.version, ...report })];
      if (a.image) {
        content.push(text(`↓ ${s.name} v${s.version}`), ...image(r.thumb));
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
        const html = screenDocument({ html: s.html, theme: board.theme, title: `${board.name} · ${s.name}`, assetOrigin: "..", csp: false });
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
              "1. get_composition (industria más cercana) → propone la secuencia de secciones con las cifras.\n" +
              "2. search_references por cada sección clave; suggest_palettes y suggest_type_pairings para la identidad. Elige una marca base.\n" +
              "3. create_board con base_ref (y theme si ajustas colores o fuentes). Usa SOLO las clases de la guía que devuelve.\n" +
              "4. Primero baja fidelidad: put_screen con bloques grises (get_section_blueprint da medidas reales). Muéstralo con open_board y pide visto bueno.\n" +
              "5. Alta fidelidad: put_screen por pantalla. Mira cada miniatura y corrige lo que no se vea bien antes de seguir.\n" +
              "6. check_screen en cada pantalla y corrige todo lo de severidad alta. Ofrece 2–3 variantes de lo que tenga dudas (variant_of).\n" +
              "7. get_board para leer comentarios del lienzo; atiéndelos y resolve_comment.\n" +
              "8. Cuando el humano apruebe, export_board a la carpeta del proyecto e implementa desde handoff.md.\n" +
              "Cita la URL de cada referencia que uses.",
          },
        },
      ],
    }),
  );
}
