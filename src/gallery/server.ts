// Galería local estilo Mobbin: `matiz-mcp gallery` sirve el corpus de ESTA máquina en
// http://localhost:4040. Sin dependencias (node:http). Las capturas se sirven solo desde
// SHOTS (nada fuera de ~/.matiz/shots) y nunca salen de tu computador.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HOME, SHOTS, allSites, findSite, homeSites, openDb } from "../db.js";
import { search } from "../search.js";
import { toDesignMd } from "../analysis/designmd.js";
import { similarity } from "../analysis/similarity.js";
import { blueprint, type TreeNode } from "../analysis/blueprint.js";
import { fontAvailability } from "../analysis/fonts.js";
import { captureSite, extractSectionTree } from "../capture/capture.js";
import type { SiteRecord } from "../types.js";
import { handleStudio } from "./studio-routes.js";

const here = dirname(fileURLToPath(import.meta.url));
const APP = () => readFileSync(join(here, "app.html"), "utf8");

const HIDDEN_BY_DEFAULT = new Set(["content", "banner", "navbar", "footer"]);
/** Peso editorial en "Destacadas": lo que más se busca como referencia va primero. */
const TYPE_WEIGHT: Record<string, number> = {
  hero: 3, pricing: 2.6, bento: 2.4, "feature-split": 2, features: 2, testimonials: 1.6, showcase: 1.6, comparison: 1.5,
  stats: 1.3, steps: 1.3, cta: 1.1, faq: 1, integrations: 1, logos: 0.8, team: 0.8, blog: 0.8, gallery: 0.9,
  newsletter: 0.8, contact: 0.8, video: 0.8, navbar: 0.5, footer: 0.4,
};
/** navbar y footer se repiten en todas las páginas de una marca: uno por marca basta. */
const ONCE_PER_BRAND = new Set(["navbar", "footer", "banner"]);

function send(res: ServerResponse, code: number, body: unknown, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function card(site: SiteRecord, idx?: number) {
  const sec = idx !== undefined ? site.dna.sections.find((s) => s.idx === idx) : undefined;
  const thumb = sec ? sec.thumb : site.shots.heroThumb;
  return {
    ref_id: sec ? `${site.id}#${sec.idx}` : site.id,
    site_id: site.id,
    name: site.name,
    host: site.host,
    url: site.url,
    page: site.page,
    viewport: site.viewport,
    type: sec?.type ?? "page",
    heading: sec?.heading ?? site.title,
    confidence: sec?.confidence,
    accent: site.dna.palette.accent,
    bg: sec?.bg ?? site.dna.palette.background,
    theme: site.dna.theme,
    has_image: !!(thumb && existsSync(thumb)),
    w: sec ? (site.viewport === "mobile" ? 390 : 1440) : 1440,
    h: sec ? Math.min(sec.height, 1800) : 900,
  };
}

function facets() {
  const db = openDb();
  const sites = allSites();
  const count = (vals: string[]) => {
    const m = new Map<string, number>();
    for (const v of vals) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, n }));
  };
  return {
    sites: sites.length,
    brands: new Set(sites.map((s) => s.host)).size,
    types: db.prepare("SELECT type AS value, count(*) AS n FROM sections GROUP BY type ORDER BY n DESC").all(),
    pages: count(sites.map((s) => s.page ?? "home")),
    industries: count(sites.flatMap((s) => s.industry)),
    themes: count(sites.map((s) => s.dna.theme)),
  };
}

/** Sin consulta: "top" = secciones con imagen, mejor clasificadas, de marcas curadas primero. */
function browse(q: URLSearchParams) {
  const type = q.get("type") || "";
  const page = q.get("page") || "";
  const industry = q.get("industry") || "";
  const theme = q.get("theme") || "";
  const viewport = q.get("viewport") === "mobile" ? "mobile" : "desktop";
  const kind = q.get("kind") === "page" ? "page" : "section";
  const offset = Math.max(0, Number(q.get("offset") ?? 0));
  const limit = Math.min(80, Math.max(1, Number(q.get("limit") ?? 48)));
  const text = (q.get("q") || "").trim();

  let items: ReturnType<typeof card>[] = [];
  if (text) {
    const r = search({
      query: text,
      kind: kind === "page" ? "site" : "section",
      sectionType: (type || undefined) as never,
      theme: (theme || undefined) as never,
      industry: industry || undefined,
      page: page || undefined,
      viewport,
      limit: 30,
      offset: 0,
    });
    items = r.hits.map((h) => card(h.site, h.sectionIdx));
  } else {
    const sites = allSites().filter(
      (s) =>
        (s.viewport ?? "desktop") === viewport &&
        (!page || (s.page ?? "home") === page) &&
        (!industry || s.industry.includes(industry) || s.tags.includes(industry)) &&
        (!theme || s.dna.theme === theme),
    );
    const onceSeen = new Set<string>();
    if (kind === "page") items = sites.map((s) => card(s));
    else
      for (const s of sites)
        for (const sec of s.dna.sections) {
          if (type ? sec.type !== type : HIDDEN_BY_DEFAULT.has(sec.type)) continue;
          if (ONCE_PER_BRAND.has(sec.type)) {
            const k = `${s.host}:${sec.type}`;
            if (onceSeen.has(k)) continue;
            onceSeen.add(k);
          }
          items.push(card(s, sec.idx));
        }
    // orden sin tocar la base: "curated" sale de los sitios que ya están en memoria
    const curatedIds = new Set(sites.filter((s) => s.tags.includes("curated")).map((s) => s.id));
    const score = (it: (typeof items)[number]) =>
      (it.has_image ? 10 : 0) + (TYPE_WEIGHT[it.type] ?? 1) + (curatedIds.has(it.site_id) ? 0.8 : 0) + (it.confidence ?? 0.5) + (it.page === "home" ? 0.3 : 0);
    items.sort((a, b) => score(b) - score(a));
    // diversidad por rondas: una de cada marca por vuelta, así ninguna marca acapara el top
    const byHost = new Map<string, typeof items>();
    for (const it of items) {
      const l = byHost.get(it.host ?? "") ?? [];
      l.push(it);
      byHost.set(it.host ?? "", l);
    }
    const rounds: typeof items = [];
    for (let r = 0; rounds.length < items.length; r++)
      for (const l of byHost.values()) if (l[r]) rounds.push(l[r]);
    items = rounds;
  }
  return { total: items.length, offset, items: items.slice(offset, offset + limit) };
}

function detail(refId: string) {
  const site = findSite(refId);
  if (!site) return null;
  const idx = refId.includes("#") ? +refId.split("#")[1] : undefined;
  const sec = idx !== undefined ? site.dna.sections.find((s) => s.idx === idx) : undefined;
  const d = site.dna;
  return {
    ...card(site, idx),
    captured_at: site.capturedAt,
    section: sec && { type: sec.type, confidence: sec.confidence, reasons: sec.reasons, columns: sec.columns, height: sec.height, dark: sec.dark, bg: sec.bg },
    palette: d.palette,
    typography: {
      pairing: d.typography.pairing,
      base: d.typography.baseSize,
      ratio: d.typography.scaleRatio,
      levels: Object.fromEntries(Object.entries({ display: d.typography.display, heading: d.typography.heading, body: d.typography.body, label: d.typography.label }).filter(([, v]) => v)),
      families: d.typography.families.map((f) => ({ ...f, availability: fontAvailability(f.family) })),
    },
    shape: d.shape,
    layout: d.layout,
    buttons: d.buttons,
    sequence: d.sequence,
    sections: d.sections.map((s) => ({ ref_id: `${site.id}#${s.idx}`, type: s.type, has_image: !!(s.thumb && existsSync(s.thumb)), height: s.height })),
    tech: d.tech,
    motion: d.motion,
  };
}

function similar(refId: string) {
  const base = findSite(refId);
  if (!base) return [];
  return homeSites()
    .filter((s) => s.host !== base.host)
    .map((s) => ({ s, score: similarity(base.dna, s.dna).score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ s, score }) => ({ ...card(s), score }));
}

let queue = Promise.resolve();
const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.then(() => undefined, () => undefined);
  return run;
};

async function blueprintFor(refId: string) {
  const site = findSite(refId);
  if (!site || !refId.includes("#")) return null;
  const idx = +refId.split("#")[1];
  const sec = site.dna.sections.find((s) => s.idx === idx);
  if (!sec) return null;
  const key = `${site.id}#${idx}`;
  const db = openDb();
  const cached = db.prepare("SELECT tree FROM trees WHERE ref_id = ?").get(key) as { tree: string } | undefined;
  let tree = cached ? (JSON.parse(cached.tree) as TreeNode) : null;
  if (!tree) {
    tree = (await serial(() => extractSectionTree(site.url, { top: sec.top, height: sec.height }, site.viewport ?? "desktop"))) as TreeNode | null;
    if (!tree) return null;
    db.prepare("INSERT INTO trees (ref_id, tree, captured_at) VALUES (?,?,?) ON CONFLICT(ref_id) DO UPDATE SET tree=excluded.tree").run(key, JSON.stringify(tree), new Date().toISOString());
  }
  const name = (sec.type.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase()) || "Seccion").replace(/[^A-Za-z0-9]/g, "");
  return blueprint(tree, name);
}

function serveImage(res: ServerResponse, refId: string, size: string) {
  const site = findSite(refId);
  if (!site) return send(res, 404, { error: "no existe" });
  const idx = refId.includes("#") ? +refId.split("#")[1] : undefined;
  const sec = idx !== undefined ? site.dna.sections.find((s) => s.idx === idx) : undefined;
  const file = sec ? (size === "thumb" ? sec.thumb : sec.shot) : size === "full" ? site.shots.full : size === "hero" ? site.shots.hero : site.shots.heroThumb;
  if (!file) return send(res, 404, { error: "sin imagen en esta máquina" });
  const abs = resolve(file);
  if (!abs.startsWith(resolve(SHOTS)) || !existsSync(abs)) return send(res, 404, { error: "sin imagen" });
  res.writeHead(200, { "content-type": "image/jpeg", "content-length": statSync(abs).size, "cache-control": "max-age=3600" });
  createReadStream(abs).pipe(res);
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const p = url.pathname;
  try {
    if (await handleStudio(req, res, url)) return;
    if (p === "/" || p === "/index.html") return send(res, 200, APP(), "text/html; charset=utf-8");
    if (p === "/api/facets") return send(res, 200, facets());
    if (p === "/api/items") return send(res, 200, browse(url.searchParams));
    if (p.startsWith("/api/ref/")) {
      const d = detail(decodeURIComponent(p.slice(9)));
      return d ? send(res, 200, d) : send(res, 404, { error: "No está en el corpus" });
    }
    if (p.startsWith("/api/similar/")) return send(res, 200, similar(decodeURIComponent(p.slice(13))));
    if (p.startsWith("/api/designmd/")) {
      const s = findSite(decodeURIComponent(p.slice(14)));
      return s ? send(res, 200, toDesignMd(s.name, s.url, s.dna), "text/markdown; charset=utf-8") : send(res, 404, { error: "no existe" });
    }
    if (p.startsWith("/api/blueprint/")) {
      const bp = await blueprintFor(decodeURIComponent(p.slice(15)));
      return bp ? send(res, 200, bp) : send(res, 422, { error: "No pude medir esa sección en vivo (¿el sitio cambió?). Recaptúralo y vuelve a intentar." });
    }
    if (p.startsWith("/api/capture/") && req.method === "POST") {
      const s = findSite(decodeURIComponent(p.slice(13)));
      if (!s) return send(res, 404, { error: "no existe" });
      const r = await serial(() => captureSite(s.url, { name: s.name, tags: s.tags, industry: s.tags.includes("curated") ? s.industry : undefined, page: s.page, viewport: s.viewport }));
      return send(res, 200, { ok: true, ref_id: r.record.id });
    }
    if (p.startsWith("/img/")) return serveImage(res, decodeURIComponent(p.slice(5)), url.searchParams.get("size") ?? "thumb");
    send(res, 404, { error: "no existe" });
  } catch (e) {
    send(res, 500, { error: (e as Error).message });
  }
}

export function startGallery(port = 4040): Promise<string> {
  openDb();
  return new Promise((ok, fail) => {
    const srv = createServer((req, res) => void handle(req, res));
    srv.on("error", fail);
    // solo localhost: la galería sirve capturas de terceros guardadas en tu máquina
    srv.listen(port, "127.0.0.1", () => ok(`http://localhost:${port}`));
  });
}

let running: string | undefined;
/**
 * La galería de ESTE proceso, o una que ya corra en el puerto con el Estudio y el mismo
 * MATIZ_HOME (p. ej. `matiz-mcp gallery` abierto aparte). Si el puerto lo tiene otra cosa
 * (o una versión vieja sin Estudio), prueba los siguientes.
 */
export async function ensureGallery(port = Number(process.env.MATIZ_GALLERY_PORT ?? 4040)): Promise<string> {
  if (running) return running;
  for (let p = port; p < port + 6; p++) {
    try {
      running = await startGallery(p);
      return running;
    } catch (e) {
      if (!/EADDRINUSE/.test(String(e))) throw e;
      const info = (await fetch(`http://127.0.0.1:${p}/studio/api/ping`, { signal: AbortSignal.timeout(1500) })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as { matiz?: boolean; studio?: number; home?: string } | null;
      if (info?.matiz && info.studio && info.home === HOME) {
        running = `http://localhost:${p}`;
        return running;
      }
    }
  }
  throw new Error(`Los puertos ${port}–${port + 5} están ocupados.`);
}
