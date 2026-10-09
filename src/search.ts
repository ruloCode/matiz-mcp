// Búsqueda sobre el corpus: FTS5 (BM25) para el texto + re-ranking con lo estructurado
// (tipo de sección, tema, industria, gusto guardado). Entiende español e inglés.
import { openDb, getSite } from "./db.js";
import { SECTION_SYNONYMS, sectionTypeFromQuery } from "./analysis/sections.js";
import type { SectionType, SiteRecord } from "./types.js";
import { tasteBoosts } from "./taste.js";

const STOP = new Set(
  (
    "a an the of for with and or to in on at by from is are be this that it its as into " +
    "el la los las un una unos unas de del con y o para por en al que se su sus es son como " +
    "page pagina página site sitio web website section seccion sección screen pantalla design diseño " +
    "example ejemplo ejemplos reference referencia referencias inspiration inspiración show muestrame muéstrame quiero want"
  ).split(" "),
);

/** Traducciones mínimas es→en para el vocabulario de diseño que más se usa. */
const ES_EN: Record<string, string> = {
  oscuro: "dark", claro: "light", minimalista: "minimal", tipografia: "typography", tipografía: "typography",
  colorido: "colorful", precios: "pricing", planes: "plans", testimonios: "testimonials", preguntas: "faq",
  equipo: "team", contacto: "contact", rojo: "red", azul: "blue", verde: "green", negro: "black", blanco: "white",
  morado: "purple", naranja: "orange", amarillo: "yellow", rosado: "pink", gris: "gray", cálido: "warm", calido: "warm",
  frío: "cool", frio: "cool", grande: "large", serif: "serif", redondeado: "rounded", fintech: "fintech",
  inteligencia: "ai", ia: "ai", desarrolladores: "developers", salud: "health", educación: "education", tienda: "ecommerce",
};

export function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}#]+/u)
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

/** Consulta FTS5: cada término con prefijo, unidos por OR (BM25 ordena). */
export function buildFtsQuery(q: string): string {
  const terms = new Set<string>();
  for (const t of tokenize(q)) {
    terms.add(t);
    if (ES_EN[t]) terms.add(ES_EN[t]);
  }
  const type = sectionTypeFromQuery(q);
  if (type) terms.add(type.replace("-", " ").split(" ")[0]);
  return [...terms].map((t) => `"${t.replace(/"/g, "")}"*`).join(" OR ");
}

export interface SearchOptions {
  query: string;
  kind?: "site" | "section" | "any";
  sectionType?: SectionType;
  theme?: "light" | "dark";
  industry?: string;
  project?: string; // aplica la memoria de gusto de ese proyecto
  page?: string;
  viewport?: "desktop" | "mobile";
  limit?: number;
  offset?: number;
  excludeSites?: string[];
}

export interface SearchHit {
  refId: string;
  kind: "site" | "section";
  siteId: string;
  name: string;
  url: string;
  sectionType?: string;
  heading: string;
  score: number;
  why: string[];
  site: SiteRecord;
  sectionIdx?: number;
}

export function search(o: SearchOptions): { hits: SearchHit[]; total: number; inferredType?: SectionType } {
  const db = openDb();
  const limit = Math.min(30, Math.max(1, o.limit ?? 8));
  const inferredType = o.sectionType ?? sectionTypeFromQuery(o.query);
  const kind = o.kind ?? (inferredType ? "section" : "any");
  const fts = buildFtsQuery(o.query);

  type Row = { ref_id: string; kind: string; rank: number };
  let rows: Row[] = [];
  if (fts) {
    rows = db
      .prepare(
        `SELECT ref_id, kind, bm25(refs_fts, 0, 0, 4.0, 3.0, 1.0, 2.0) AS rank
         FROM refs_fts WHERE refs_fts MATCH ? ORDER BY rank LIMIT 600`,
      )
      .all(fts) as unknown as Row[];
  }
  // sin texto útil (o sin resultados) pero con tipo: todas las secciones de ese tipo
  if (!rows.length && inferredType) {
    rows = (db.prepare("SELECT id AS ref_id, 'section' AS kind, 0 AS rank FROM sections WHERE type = ?").all(inferredType) as unknown as Row[]);
  }
  if (!rows.length && !fts) {
    rows = db.prepare("SELECT id AS ref_id, 'site' AS kind, 0 AS rank FROM sites").all() as unknown as Row[];
  }

  const boosts = o.project ? tasteBoosts(o.project) : new Map<string, number>();
  const siteCache = new Map<string, SiteRecord | undefined>();
  const site = (id: string) => {
    if (!siteCache.has(id)) siteCache.set(id, getSite(id));
    return siteCache.get(id);
  };
  const minRank = Math.min(0, ...rows.map((r) => r.rank));

  const hits: SearchHit[] = [];
  for (const r of rows) {
    if (kind !== "any" && r.kind !== kind) continue;
    const [siteId, idxStr] = r.ref_id.split("#");
    if (o.excludeSites?.includes(siteId)) continue;
    const s = site(siteId);
    if (!s) continue;
    if ((s.viewport ?? "desktop") !== (o.viewport ?? "desktop")) continue;
    if (o.page && (s.page ?? "home") !== o.page) continue;
    const why: string[] = [];
    // BM25 de FTS5 es negativo (más negativo = mejor): normalizado a 0..1
    let score = minRank < 0 ? r.rank / minRank : 0.5;
    let sectionType: string | undefined;
    let heading = s.title;
    let sectionIdx: number | undefined;
    if (r.kind === "section") {
      sectionIdx = +idxStr;
      const sec = s.dna.sections.find((x) => x.idx === sectionIdx);
      if (!sec) continue;
      sectionType = sec.type;
      heading = sec.heading || heading;
      if (inferredType) {
        if (sec.type === inferredType) {
          score += 1 + sec.confidence * 0.3;
          why.push(`es una sección ${sec.type} (${Math.round(sec.confidence * 100)}%)`);
        } else score -= 0.6;
      }
      if (o.theme && (sec.dark ? "dark" : "light") !== o.theme) score -= 0.5;
    }
    if (o.theme) {
      if (s.dna.theme === o.theme) {
        score += 0.3;
        why.push(`tema ${o.theme}`);
      } else if (r.kind === "site") score -= 0.6;
    }
    if (o.industry) {
      const ind = o.industry.toLowerCase();
      if (s.industry.includes(ind) || s.tags.includes(ind)) {
        score += 0.4;
        why.push(`industria ${ind}`);
      } else score -= 0.2;
    }
    const b = boosts.get(siteId) ?? 0;
    if (b) {
      score += b;
      why.push(b > 0 ? "te gustó algo parecido" : "descartaste algo parecido");
    }
    hits.push({ refId: r.ref_id, kind: r.kind as "site" | "section", siteId, name: s.name, url: s.url, sectionType, heading, score, why, site: s, sectionIdx });
  }

  hits.sort((a, b) => b.score - a.score);
  // diversidad: máximo 2 resultados de la misma MARCA (portada + páginas internas cuentan juntas)
  const perSite = new Map<string, number>();
  const diverse = hits.filter((h) => {
    const key = h.site.host ?? h.siteId;
    const n = perSite.get(key) ?? 0;
    perSite.set(key, n + 1);
    return n < 2;
  });
  const offset = o.offset ?? 0;
  return { hits: diverse.slice(offset, offset + limit), total: diverse.length, inferredType };
}

export function searchDesignDocs(query: string, limit = 5) {
  const fts = buildFtsQuery(query);
  if (!fts) return [];
  return openDb()
    .prepare(
      `SELECT d.id, d.name, d.source, d.path, substr(d.body, 1, 1200) AS excerpt, d.tokens
       FROM refs_fts f JOIN design_docs d ON d.id = f.ref_id
       WHERE refs_fts MATCH ? AND f.kind = 'design-md'
       ORDER BY bm25(refs_fts, 0, 0, 4.0, 3.0, 1.0, 2.0) LIMIT ?`,
    )
    .all(fts, limit) as Array<{ id: string; name: string; source: string; path: string; excerpt: string; tokens: string }>;
}

export { SECTION_SYNONYMS };
