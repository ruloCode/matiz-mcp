// Corpus local: SQLite nativo de Node (node:sqlite) con FTS5. Cero dependencias nativas.
// Vive en ~/.matiz (MATIZ_HOME): DB + screenshots, nunca dentro del repo.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ClassifiedSection, Dna, SiteRecord } from "./types.js";
import { SECTION_SYNONYMS } from "./analysis/sections.js";

export const HOME = process.env.MATIZ_HOME || join(homedir(), ".matiz");
export const SHOTS = join(HOME, "shots");

let db: DatabaseSync | undefined;

export function openDb(path = join(HOME, "corpus.db")): DatabaseSync {
  if (db) return db;
  if (path !== ":memory:") mkdirSync(HOME, { recursive: true });
  db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 15000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      name TEXT NOT NULL,
      title TEXT,
      description TEXT,
      captured_at TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      industry TEXT NOT NULL DEFAULT '[]',
      dna TEXT NOT NULL,
      shots TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      type TEXT NOT NULL,
      confidence REAL NOT NULL,
      heading TEXT,
      body TEXT,
      dark INTEGER NOT NULL DEFAULT 0,
      shot TEXT,
      thumb TEXT
    );
    CREATE INDEX IF NOT EXISTS sections_type ON sections(type);
    CREATE TABLE IF NOT EXISTS design_docs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT,
      body TEXT NOT NULL,
      tokens TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS taste (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project TEXT NOT NULL,
      ref_id TEXT,
      verdict TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS refs_fts USING fts5(
      ref_id UNINDEXED, kind UNINDEXED, name, heading, body, tags,
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `);
  // migraciones aditivas (corpus creados antes de páginas internas y móvil)
  const cols = new Set((db.prepare("PRAGMA table_info(sites)").all() as Array<{ name: string }>).map((c) => c.name));
  if (!cols.has("page")) db.exec("ALTER TABLE sites ADD COLUMN page TEXT NOT NULL DEFAULT 'home'");
  if (!cols.has("host")) db.exec("ALTER TABLE sites ADD COLUMN host TEXT");
  if (!cols.has("viewport")) db.exec("ALTER TABLE sites ADD COLUMN viewport TEXT NOT NULL DEFAULT 'desktop'");
  db.exec("UPDATE sites SET host = lower(replace(replace(replace(url, 'https://', ''), 'http://', ''), 'www.', '')) WHERE host IS NULL");
  db.exec("UPDATE sites SET host = substr(host, 1, instr(host || '/', '/') - 1) WHERE host LIKE '%/%'");
  return db;
}

/** Solo para tests: DB en memoria aislada. */
export function useMemoryDb(): DatabaseSync {
  db = undefined;
  return openDb(":memory:");
}

const j = (v: unknown) => JSON.stringify(v ?? null);

export function sectionTags(s: ClassifiedSection, dna: Dna): string {
  return [
    s.type,
    ...SECTION_SYNONYMS[s.type],
    s.dark ? "dark oscuro" : "light claro",
    `${s.columns} columns columnas`,
    ...dna.keywords,
  ].join(" ");
}

export function saveSite(rec: SiteRecord) {
  const d = openDb();
  d.exec("BEGIN");
  try {
    d.prepare("DELETE FROM refs_fts WHERE ref_id = ? OR ref_id LIKE ?").run(rec.id, `${rec.id}#%`);
    d.prepare("DELETE FROM sections WHERE site_id = ?").run(rec.id);
    d.prepare(
      `INSERT INTO sites (id,url,name,title,description,captured_at,tags,industry,dna,shots,page,host,viewport)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET url=excluded.url, name=excluded.name, title=excluded.title,
         description=excluded.description, captured_at=excluded.captured_at, tags=excluded.tags,
         industry=excluded.industry, dna=excluded.dna, shots=excluded.shots, page=excluded.page,
         host=excluded.host, viewport=excluded.viewport`,
    ).run(
      rec.id, rec.url, rec.name, rec.title, rec.description, rec.capturedAt, j(rec.tags), j(rec.industry), j(rec.dna), j(rec.shots),
      rec.page ?? "home", rec.host ?? hostOf(rec.url), rec.viewport ?? "desktop",
    );

    const ins = d.prepare(
      "INSERT INTO sections (id,site_id,idx,type,confidence,heading,body,dark,shot,thumb) VALUES (?,?,?,?,?,?,?,?,?,?)",
    );
    const fts = d.prepare("INSERT INTO refs_fts (ref_id,kind,name,heading,body,tags) VALUES (?,?,?,?,?,?)");
    const dna = rec.dna;
    fts.run(
      rec.id,
      "site",
      rec.name,
      rec.title,
      [rec.description, ...dna.sections.map((s) => s.heading)].join(" "),
      [...rec.tags, ...rec.industry, ...dna.sequence, ...dna.keywords, `page-${rec.page ?? "home"}`, rec.page ?? "home", rec.viewport ?? "desktop"].join(" "),
    );
    for (const s of dna.sections) {
      const sid = `${rec.id}#${s.idx}`;
      ins.run(sid, rec.id, s.idx, s.type, s.confidence, s.heading, s.text, s.dark ? 1 : 0, s.shot ?? null, s.thumb ?? null);
      fts.run(sid, "section", rec.name, s.heading, s.text, [...rec.tags, ...rec.industry, sectionTags(s, dna), rec.page ?? "home", rec.viewport ?? "desktop"].join(" "));
    }
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

interface SiteRow {
  id: string;
  url: string;
  name: string;
  title: string;
  description: string;
  captured_at: string;
  tags: string;
  industry: string;
  dna: string;
  shots: string;
  page?: string;
  host?: string;
  viewport?: string;
}

export function rowToSite(r: SiteRow): SiteRecord {
  return {
    id: r.id,
    url: r.url,
    name: r.name,
    title: r.title,
    description: r.description,
    capturedAt: r.captured_at,
    tags: JSON.parse(r.tags),
    industry: JSON.parse(r.industry),
    dna: JSON.parse(r.dna),
    shots: JSON.parse(r.shots),
    page: r.page ?? "home",
    host: r.host ?? hostOf(r.url),
    viewport: (r.viewport as SiteRecord["viewport"]) ?? "desktop",
  };
}

export function hostOf(url: string): string {
  try {
    return new URL(/^https?:/.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url;
  }
}

/** Una referencia por marca: la portada de escritorio (para paletas, tipografía, similares). */
export function homeSites(): SiteRecord[] {
  return allSites().filter((s) => (s.page ?? "home") === "home" && (s.viewport ?? "desktop") === "desktop");
}

export function getSite(id: string): SiteRecord | undefined {
  const r = openDb().prepare("SELECT * FROM sites WHERE id = ?").get(id) as SiteRow | undefined;
  return r ? rowToSite(r) : undefined;
}

export function findSite(idOrUrl: string): SiteRecord | undefined {
  const id = idOrUrl.includes("#") ? idOrUrl.split("#")[0] : idOrUrl;
  const direct = getSite(id) ?? getSite(siteIdFromUrl(id));
  if (direct) return direct;
  const r = openDb()
    .prepare("SELECT * FROM sites WHERE lower(name) = lower(?) OR url LIKE ? LIMIT 1")
    .get(id, `%${id.replace(/^https?:\/\//, "")}%`) as SiteRow | undefined;
  return r ? rowToSite(r) : undefined;
}

export function allSites(): SiteRecord[] {
  return (openDb().prepare("SELECT * FROM sites ORDER BY captured_at DESC").all() as unknown as SiteRow[]).map(rowToSite);
}

export function siteIdFromUrl(url: string): string {
  try {
    const u = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    return path ? `${host}-${path}`.toLowerCase() : host.toLowerCase();
  } catch {
    return url.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  }
}
