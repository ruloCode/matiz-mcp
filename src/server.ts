#!/usr/bin/env node
// Servidor MCP (stdio). Lo que lo separa de Mobbin: cada referencia trae DATOS para construir
// (tokens, tipografía medida, secuencia de secciones, DESIGN.md) además de la imagen, y hay
// tools para composición, pares tipográficos, paletas con evidencia, crítica y gusto.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync, existsSync } from "node:fs";
import { z } from "zod";
import { allSites, findSite, openDb } from "./db.js";
import { search, searchDesignDocs } from "./search.js";
import { captureSite } from "./capture/capture.js";
import { similarity } from "./analysis/similarity.js";
import { aggregateComposition } from "./analysis/composition.js";
import { critique } from "./analysis/critique.js";
import { toDesignMd, toDtcg } from "./analysis/designmd.js";
import { parseColor, tonalScale } from "./analysis/color.js";
import { SECTION_TYPES } from "./analysis/sections.js";
import { remember, forget, tasteProfile } from "./taste.js";
import type { Dna, SectionType, SiteRecord } from "./types.js";

type Content =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

const text = (v: unknown): Content => ({ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 1) });
function image(path?: string): Content[] {
  if (!path || !existsSync(path)) return [];
  return [{ type: "image", data: readFileSync(path).toString("base64"), mimeType: "image/jpeg" }];
}
const ok = (content: Content[]) => ({ content });
const fail = (msg: string) => ({ content: [text(msg)], isError: true });

function guard<A>(fn: (a: A) => Promise<{ content: Content[]; isError?: boolean }> | { content: Content[]; isError?: boolean }) {
  return async (a: A) => {
    try {
      return await fn(a);
    } catch (e) {
      return fail(`Error: ${(e as Error).message}`);
    }
  };
}

/** Resumen compacto del DNA: lo que un agente necesita para construir, sin ruido. */
function tokens(d: Dna) {
  const t = d.typography;
  return {
    theme: d.theme,
    colors: {
      background: d.palette.background,
      surface: d.palette.surface,
      text: d.palette.text,
      muted: d.palette.mutedText,
      accent: d.palette.accent,
      accent2: d.palette.accent2,
      border: d.palette.border,
    },
    mood: d.palette.mood.filter((_, i) => i % 2 === 0),
    type: {
      pairing: t.pairing,
      heading: t.heading && `${t.heading.family} ${Math.round(t.heading.size)}px/${t.heading.weight}`,
      body: t.body && `${t.body.family} ${t.body.size}px/${t.body.weight} lh${t.body.lineHeight}`,
      display: t.display && `${Math.round(t.display.size)}px ls${t.display.letterSpacing}em`,
      base: t.baseSize,
      ratio: t.scaleRatio,
    },
    radius: d.shape.radius >= 999 ? "pill" : d.shape.radius,
    shadows: d.shape.shadows,
    contentWidth: d.layout.contentWidth,
    density: d.layout.density,
    primaryButton: d.buttons.find((b) => b.kind === "primary"),
  };
}

const MAX_IMAGES = 8;

const server = new McpServer(
  { name: "design-mcp", version: "0.1.0" },
  {
    instructions:
      "Referencias de diseño como datos. Flujo recomendado para diseñar algo nuevo: " +
      "1) get_composition para decidir qué secciones y en qué orden; 2) search_references por cada sección clave " +
      "(mira las imágenes: los tokens dicen el qué, la imagen el cómo); 3) suggest_palettes y suggest_type_pairings " +
      "para fijar la identidad con evidencia; 4) get_design_md de la referencia elegida como base de tokens; " +
      "5) al terminar, critique_against_reference con la URL local del build. Cita siempre la URL original del sitio. " +
      "Si el corpus no cubre lo que necesitas, capture_site agrega cualquier sitio público.",
  },
);

// ---------------------------------------------------------------- búsqueda
server.registerTool(
  "search_references",
  {
    title: "Buscar referencias",
    description:
      "Busca sitios o secciones (hero, pricing, faq, footer…) en el corpus con lenguaje natural (es/en). " +
      "Cada resultado trae tokens medidos (colores con rol, tipografía, radio, botón primario), la secuencia de secciones " +
      "y una miniatura. Describe UNA cosa por búsqueda. Usa section_type para fijar el tipo y theme/industry para filtrar.",
    inputSchema: {
      query: z.string().min(1).max(400).describe("Qué buscas, p. ej. 'pricing con 3 planes y toggle anual' o 'hero oscuro con tipografía serif grande'"),
      kind: z.enum(["site", "section", "any"]).optional().describe("site = páginas completas; section = bloques sueltos. Por defecto se infiere de la consulta."),
      section_type: z.enum(SECTION_TYPES as [SectionType, ...SectionType[]]).optional(),
      theme: z.enum(["light", "dark"]).optional(),
      industry: z.string().optional().describe("ai, devtools, fintech, productivity, design, ecommerce, health, education, marketing, media, travel, agency, hardware"),
      project: z.string().optional().describe("Aplica la memoria de gusto de este proyecto al ranking"),
      limit: z.number().int().min(1).max(20).default(6),
      offset: z.number().int().min(0).default(0),
      images: z.boolean().default(true).describe("Incluir miniaturas inline"),
    },
  },
  guard(async (a) => {
    const { hits, total, inferredType } = search({
      query: a.query,
      kind: a.kind,
      sectionType: a.section_type,
      theme: a.theme,
      industry: a.industry,
      project: a.project,
      limit: a.limit,
      offset: a.offset,
    });
    if (!hits.length)
      return ok([text(`Sin resultados para "${a.query}" en un corpus de ${allSites().length} sitios. Prueba otra formulación o captura sitios con capture_site.`)]);
    const content: Content[] = [];
    const results = hits.map((h) => {
      const sec = h.sectionIdx !== undefined ? h.site.dna.sections.find((s) => s.idx === h.sectionIdx) : undefined;
      return {
        ref_id: h.refId,
        site: h.name,
        url: h.url,
        section_type: h.sectionType,
        heading: h.heading,
        section: sec && { columns: sec.columns, dark: sec.dark, bg: sec.bg, height: sec.height, reasons: sec.reasons },
        why: h.why,
        tokens: tokens(h.site.dna),
        sequence: h.kind === "site" ? h.site.dna.sequence : undefined,
        image_path: sec?.shot ?? h.site.shots.hero,
      };
    });
    content.push(text({ query: a.query, inferred_section_type: inferredType, total, offset: a.offset, results }));
    if (a.images) {
      for (const h of hits.slice(0, MAX_IMAGES)) {
        const sec = h.sectionIdx !== undefined ? h.site.dna.sections.find((s) => s.idx === h.sectionIdx) : undefined;
        const imgs = image(sec?.thumb ?? h.site.shots.heroThumb);
        if (imgs.length) content.push(text(`↓ ${h.refId} — ${h.name}${h.sectionType ? ` · ${h.sectionType}` : ""}`), ...imgs);
      }
    }
    return ok(content);
  }),
);

server.registerTool(
  "get_reference",
  {
    title: "Detalle de una referencia",
    description:
      "Todo lo medido de un sitio o sección: paleta completa con roles, niveles tipográficos, escala de radios y espaciado, " +
      "botones, cada sección con su tipo y POR QUÉ se clasificó así. image: thumb (ligera), full (resolución completa) o none.",
    inputSchema: {
      ref_id: z.string().describe("ref_id de search_references (sitio 'linear.app' o sección 'linear.app#3'), o una URL ya capturada"),
      image: z.enum(["thumb", "full", "none"]).default("thumb"),
    },
  },
  guard(async (a) => {
    const site = findSite(a.ref_id);
    if (!site) return fail(`No está en el corpus: ${a.ref_id}. Captúralo con capture_site.`);
    const idx = a.ref_id.includes("#") ? +a.ref_id.split("#")[1] : undefined;
    const sec = idx !== undefined ? site.dna.sections.find((s) => s.idx === idx) : undefined;
    const d = site.dna;
    const body = {
      ref_id: sec ? `${site.id}#${sec.idx}` : site.id,
      site: site.name,
      url: site.url,
      captured_at: site.capturedAt,
      tags: site.tags,
      industry: site.industry,
      section: sec,
      palette: d.palette,
      typography: { ...d.typography, families: d.typography.families },
      shape: d.shape,
      spacing: d.spacing,
      layout: d.layout,
      buttons: d.buttons,
      sequence: d.sequence,
      sections: sec ? undefined : d.sections.map((s) => ({ idx: s.idx, type: s.type, confidence: s.confidence, heading: s.heading, columns: s.columns, dark: s.dark, height: s.height })),
      tech: d.tech,
      motion: d.motion,
      files: sec ? { shot: sec.shot } : site.shots,
    };
    const img =
      a.image === "none" ? [] : a.image === "full" ? image(sec?.shot ?? site.shots.full) : image(sec?.thumb ?? site.shots.heroThumb);
    return ok([text(body), ...img]);
  }),
);

server.registerTool(
  "get_design_md",
  {
    title: "DESIGN.md / tokens de una referencia",
    description:
      "Exporta el sistema visual medido de un sitio como DESIGN.md (spec google-labs-code/design.md: YAML de tokens + prosa) " +
      "y/o tokens W3C DTCG en JSON. Úsalo como punto de partida del sistema de diseño, no como copia de la marca.",
    inputSchema: {
      ref_id: z.string(),
      format: z.enum(["design.md", "dtcg", "both"]).default("design.md"),
      name: z.string().optional().describe("Nombre del sistema resultante (por defecto el del sitio)"),
    },
  },
  guard(async (a) => {
    const site = findSite(a.ref_id);
    if (!site) return fail(`No está en el corpus: ${a.ref_id}`);
    const name = a.name ?? site.name;
    const out: Content[] = [];
    if (a.format !== "dtcg") out.push(text(toDesignMd(name, site.url, site.dna)));
    if (a.format !== "design.md") out.push(text(toDtcg(name, site.dna)));
    return ok(out);
  }),
);

server.registerTool(
  "find_similar",
  {
    title: "Sitios parecidos",
    description:
      "Vecinos de una referencia por ADN de diseño (tema, fondo, acento, tipografía, escala, radios, sombras, densidad, " +
      "orden de secciones), con el desglose de en qué se parecen. Sirve para ampliar un moodboard o encontrar alternativas.",
    inputSchema: {
      ref_id: z.string(),
      limit: z.number().int().min(1).max(15).default(6),
      same_industry: z.boolean().default(false),
      images: z.boolean().default(true),
    },
  },
  guard(async (a) => {
    const base = findSite(a.ref_id);
    if (!base) return fail(`No está en el corpus: ${a.ref_id}`);
    const ranked = allSites()
      .filter((s) => s.id !== base.id)
      .filter((s) => !a.same_industry || s.industry.some((i) => base.industry.includes(i)))
      .map((s) => ({ s, sim: similarity(base.dna, s.dna) }))
      .sort((x, y) => y.sim.score - x.sim.score)
      .slice(0, a.limit);
    const content: Content[] = [
      text({
        base: { ref_id: base.id, site: base.name },
        similar: ranked.map(({ s, sim }) => ({ ref_id: s.id, site: s.name, url: s.url, score: sim.score, parts: sim.parts, tokens: tokens(s.dna) })),
      }),
    ];
    if (a.images) for (const { s } of ranked.slice(0, MAX_IMAGES)) content.push(text(`↓ ${s.id}`), ...image(s.shots.heroThumb));
    return ok(content);
  }),
);

// ---------------------------------------------------------------- composición e identidad
function pickSites(a: { query?: string; industry?: string; theme?: "light" | "dark"; tags?: string[] }): SiteRecord[] {
  let sites = allSites();
  if (a.query) {
    const ids = new Set(search({ query: a.query, kind: "site", limit: 30 }).hits.map((h) => h.siteId));
    sites = sites.filter((s) => ids.has(s.id));
  }
  if (a.industry) sites = sites.filter((s) => s.industry.includes(a.industry!.toLowerCase()) || s.tags.includes(a.industry!.toLowerCase()));
  if (a.theme) sites = sites.filter((s) => s.dna.theme === a.theme);
  if (a.tags?.length) sites = sites.filter((s) => a.tags!.every((t) => s.tags.includes(t.toLowerCase())));
  return sites;
}

const filterShape = {
  query: z.string().optional().describe("Acota el conjunto de sitios con una búsqueda"),
  industry: z.string().optional(),
  theme: z.enum(["light", "dark"]).optional(),
  tags: z.array(z.string()).optional(),
};

server.registerTool(
  "get_composition",
  {
    title: "Composición típica",
    description:
      "La composición como dato: para un conjunto de sitios (por industria, tema, búsqueda o todo el corpus) devuelve qué " +
      "secciones aparecen y con qué frecuencia, su posición típica, el orden típico, las transiciones más comunes y las " +
      "aperturas (lo que va justo después del navbar). Cada cifra sale de sitios reales que se listan como ejemplo.",
    inputSchema: { ...filterShape, min_presence: z.number().min(0).max(1).default(0.25) },
  },
  guard(async (a) => {
    const sites = pickSites(a);
    if (sites.length < 2) return fail(`Solo ${sites.length} sitio(s) con ese filtro; amplía el filtro o captura más sitios.`);
    const report = aggregateComposition(
      sites.map((s) => ({ id: s.id, name: s.name, sequence: s.dna.sequence })),
      a.min_presence,
    );
    return ok([text({ filter: a, ...report })]);
  }),
);

server.registerTool(
  "suggest_type_pairings",
  {
    title: "Pares tipográficos con evidencia",
    description:
      "Combinaciones títulos/texto que se usan de verdad en el corpus (filtrable), con cuántos sitios las usan, " +
      "tamaños y tracking medidos y los sitios de ejemplo. No es una lista curada: es uso real.",
    inputSchema: { ...filterShape, limit: z.number().int().min(1).max(20).default(8) },
  },
  guard(async (a) => {
    const sites = pickSites(a);
    const pairs = new Map<string, { heading: string; body: string; pairing: string; sites: string[]; display: number[]; tracking: number[]; base: number[] }>();
    for (const s of sites) {
      const t = s.dna.typography;
      const h = t.heading?.family ?? t.body?.family;
      const b = t.body?.family ?? h;
      if (!h || !b) continue;
      const k = `${h}|${b}`;
      const e = pairs.get(k) ?? { heading: h, body: b, pairing: t.pairing, sites: [], display: [], tracking: [], base: [] };
      e.sites.push(s.name);
      if (t.display) {
        e.display.push(Math.round(t.display.size));
        e.tracking.push(t.display.letterSpacing);
      }
      e.base.push(t.baseSize);
      pairs.set(k, e);
    }
    const classes = new Map<string, number>();
    for (const s of sites) classes.set(s.dna.typography.pairing, (classes.get(s.dna.typography.pairing) ?? 0) + 1);
    const avg = (xs: number[]) => (xs.length ? +(xs.reduce((x, y) => x + y, 0) / xs.length).toFixed(3) : undefined);
    return ok([
      text({
        sites: sites.length,
        pairing_classes: [...classes.entries()].sort((x, y) => y[1] - x[1]).map(([pairing, n]) => ({ pairing, sites: n })),
        pairs: [...pairs.values()]
          .sort((x, y) => y.sites.length - x.sites.length)
          .slice(0, a.limit)
          .map((p) => ({ heading: p.heading, body: p.body, pairing: p.pairing, used_by: p.sites, avg_display_px: avg(p.display), avg_display_tracking_em: avg(p.tracking), avg_base_px: avg(p.base) })),
        note: "Las familias comerciales (Söhne, GT, etc.) pueden requerir licencia; busca equivalentes libres por clase (serif/sans/mono).",
      }),
    ]);
  }),
);

server.registerTool(
  "suggest_palettes",
  {
    title: "Paletas con evidencia",
    description:
      "Paletas reales con roles (fondo, superficie, texto, acento, borde) de sitios del corpus que cumplan el filtro, " +
      "más la escala tonal 50–950 del acento lista para usar. accent_family filtra por tono (blue, green, orange, purple…).",
    inputSchema: {
      ...filterShape,
      accent_family: z.string().optional(),
      limit: z.number().int().min(1).max(15).default(6),
    },
  },
  guard(async (a) => {
    let sites = pickSites(a);
    if (a.accent_family) sites = sites.filter((s) => s.dna.palette.swatches.find((w) => w.role === "accent")?.family === a.accent_family!.toLowerCase());
    const palettes = sites.slice(0, a.limit).map((s) => {
      const p = s.dna.palette;
      const acc = p.accent && parseColor(p.accent);
      return {
        ref_id: s.id,
        site: s.name,
        theme: s.dna.theme,
        roles: { background: p.background, surface: p.surface, text: p.text, muted: p.mutedText, accent: p.accent, accent2: p.accent2, border: p.border },
        mood: p.mood.filter((_, i) => i % 2 === 0),
        accent_scale: acc ? tonalScale(acc) : undefined,
      };
    });
    return ok([text({ sites: sites.length, palettes })]);
  }),
);

server.registerTool(
  "search_design_md",
  {
    title: "Buscar en DESIGN.md abiertos",
    description: "Busca en los DESIGN.md de sistemas de marca con licencia abierta indexados (pnpm seed:design-md).",
    inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(10).default(4) },
  },
  guard(async (a) => {
    const docs = searchDesignDocs(a.query, a.limit);
    if (!docs.length) return ok([text("Sin resultados (¿corriste pnpm seed:design-md?).")]);
    return ok([text(docs.map((d) => ({ id: d.id, name: d.name, source: d.source, path: d.path, tokens: JSON.parse(d.tokens), excerpt: d.excerpt })))]);
  }),
);

// ---------------------------------------------------------------- captura y crítica
let queue = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

server.registerTool(
  "capture_site",
  {
    title: "Capturar un sitio",
    description:
      "Agrega un sitio público al corpus: lo abre en Chromium, mide tokens y estructura, clasifica sus secciones y guarda " +
      "screenshots locales (~10–20 s). Etiquétalo (tags/industry) para poder filtrarlo después.",
    inputSchema: {
      url: z.string().min(3),
      name: z.string().optional(),
      tags: z.array(z.string()).optional(),
      industry: z.array(z.string()).optional(),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  guard(async (a) => {
    const { record, ms } = await serial(() => captureSite(a.url, { name: a.name, tags: a.tags, industry: a.industry }));
    return ok([
      text({ ref_id: record.id, site: record.name, url: record.url, seconds: +(ms / 1000).toFixed(1), tokens: tokens(record.dna), sequence: record.dna.sequence }),
      ...image(record.shots.heroThumb),
    ]);
  }),
);

server.registerTool(
  "critique_against_reference",
  {
    title: "Criticar contra una referencia",
    description:
      "Mide una página (tu build, incluso en localhost) y la compara con una referencia del corpus: contraste WCAG, paleta, " +
      "tipografía, radios, sombras, ancho, densidad y secciones que faltan. Cada hallazgo trae el valor tuyo, el de la " +
      "referencia y qué cambiar. No guarda tu página en el corpus.",
    inputSchema: {
      url: z.string().describe("Página a evaluar, p. ej. http://localhost:3000"),
      ref_id: z.string(),
      images: z.boolean().default(true),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  guard(async (a) => {
    const ref = findSite(a.ref_id);
    if (!ref) return fail(`No está en el corpus: ${a.ref_id}`);
    const { record } = await serial(() => captureSite(a.url, { store: false }));
    const result = critique(record.dna, ref.dna, ref.name);
    const content: Content[] = [
      text({ target: { url: record.url, tokens: tokens(record.dna), sequence: record.dna.sequence }, reference: { ref_id: ref.id, tokens: tokens(ref.dna), sequence: ref.dna.sequence }, ...result }),
    ];
    if (a.images) content.push(text(`↓ referencia: ${ref.name}`), ...image(ref.shots.heroThumb));
    return ok(content);
  }),
);

// ---------------------------------------------------------------- gusto
server.registerTool(
  "remember_taste",
  {
    title: "Guardar gusto",
    description:
      "Memoria de gusto por proyecto: like/dislike sobre una referencia (mueve el ranking de search_references con project) " +
      "o una regla propia en texto (verdict 'rule', p. ej. 'sin gradientes'). Para borrar una entrada pasa forget_id.",
    inputSchema: {
      project: z.string().min(1),
      verdict: z.enum(["like", "dislike", "rule"]).optional(),
      ref_id: z.string().optional(),
      note: z.string().max(500).optional(),
      forget_id: z.number().int().optional(),
    },
    annotations: { readOnlyHint: false },
  },
  guard(async (a) => {
    if (a.forget_id !== undefined) {
      forget(a.forget_id);
      return ok([text(`Entrada ${a.forget_id} borrada.`)]);
    }
    if (!a.verdict) return fail("Falta verdict (like | dislike | rule).");
    if (a.verdict !== "rule" && !a.ref_id) return fail("like/dislike necesitan ref_id.");
    if (a.verdict === "rule" && !a.note) return fail("Una regla necesita note.");
    if (a.ref_id && !findSite(a.ref_id)) return fail(`No está en el corpus: ${a.ref_id}`);
    const id = remember(a.project, a.verdict, a.ref_id, a.note);
    return ok([text({ id, saved: a })]);
  }),
);

server.registerTool(
  "get_taste",
  {
    title: "Perfil de gusto",
    description: "Reglas, referencias aprobadas/descartadas y los rasgos que se repiten en lo aprobado de un proyecto.",
    inputSchema: { project: z.string().min(1) },
  },
  guard(async (a) => ok([text(tasteProfile(a.project))])),
);

server.registerTool(
  "corpus_stats",
  {
    title: "Qué hay en el corpus",
    description: "Cuántos sitios hay, por industria, tema y tipo de sección. Úsalo para saber qué se puede pedir.",
    inputSchema: {},
  },
  guard(async () => {
    const db = openDb();
    const sites = allSites();
    const count = (vals: string[]) => {
      const m = new Map<string, number>();
      for (const v of vals) m.set(v, (m.get(v) ?? 0) + 1);
      return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
    };
    const types = db.prepare("SELECT type, count(*) AS n FROM sections GROUP BY type ORDER BY n DESC").all();
    const docs = db.prepare("SELECT count(*) AS n FROM design_docs").get() as { n: number };
    return ok([
      text({
        sites: sites.length,
        sections: types,
        design_docs: docs.n,
        industries: count(sites.flatMap((s) => s.industry)),
        tags: count(sites.flatMap((s) => s.tags)),
        themes: count(sites.map((s) => s.dna.theme)),
        latest: sites.slice(0, 10).map((s) => s.id),
      }),
    ]);
  }),
);

// ---------------------------------------------------------------- prompt
server.registerPrompt(
  "design_from_references",
  {
    title: "Diseñar con referencias",
    description: "Guía al agente para diseñar una página desde el corpus en vez de desde cero.",
    argsSchema: {
      product: z.string().describe("Qué es el producto y para quién"),
      page: z.string().default("landing").describe("Tipo de página: landing, pricing, dashboard…"),
      mood: z.string().optional().describe("Tono buscado, p. ej. 'sobrio y editorial'"),
    },
  },
  ({ product, page, mood }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `Voy a construir una ${page} para: ${product}.${mood ? ` Tono: ${mood}.` : ""}\n\n` +
            "Antes de escribir código, usa design-mcp:\n" +
            "1. corpus_stats para ver qué hay.\n" +
            "2. get_composition (filtra por la industria más cercana) y propón la secuencia de secciones justificándola con las cifras.\n" +
            "3. Por cada sección clave, search_references y elige 1–2 referencias; explica qué tomas de cada una mirando la imagen.\n" +
            "4. suggest_palettes y suggest_type_pairings: fija paleta y tipografías con evidencia (y alternativas libres si son comerciales).\n" +
            "5. get_design_md de la referencia base y adáptalo a la marca (no la copies).\n" +
            "6. Construye. Al final corre critique_against_reference con la URL local y corrige lo de severidad alta.\n" +
            "Cita la URL original de cada referencia que uses.",
        },
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
