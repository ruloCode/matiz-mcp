// Tableros del Estudio en la misma SQLite del corpus (~/.matiz). Cada put_screen guarda una
// VERSIÓN nueva (nunca pisa la anterior) y las capturas viven en ~/.matiz/studio/<tablero>/.
import { join } from "node:path";
import { HOME, openDb } from "../db.js";
import type { BoardTheme } from "./theme.js";
import type { ElementDesc, StudioFinding } from "./check.js";
import type { ViewportName } from "./doc.js";

export const STUDIO = join(HOME, "studio");

export type ScreenStatus = "draft" | "approved" | "discarded";

export interface Board {
  id: string;
  name: string;
  project?: string;
  brief?: string;
  theme: BoardTheme;
  createdAt: string;
  updatedAt: string;
}

export interface Screen {
  boardId: string;
  slug: string;
  name: string;
  viewport: ViewportName;
  width: number;
  height: number;
  version: number;
  html: string;
  note?: string;
  status: ScreenStatus;
  variantOf?: string;
  x?: number;
  y?: number;
  order: number;
  shot?: string;
  thumb?: string;
  findings: StudioFinding[];
  targets: ElementDesc[];
  renderError?: string;
  updatedAt: string;
}

export interface Comment {
  id: number;
  boardId: string;
  slug: string;
  x: number;
  y: number;
  text: string;
  target?: ElementDesc;
  version: number;
  author: "human" | "agent";
  status: "open" | "resolved";
  reply?: string;
  createdAt: string;
  resolvedAt?: string;
}

let ready = false;
function db() {
  const d = openDb();
  if (ready) return d;
  d.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, project TEXT, brief TEXT, theme TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS screens (
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      slug TEXT NOT NULL, name TEXT NOT NULL, viewport TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL DEFAULT 900,
      version INTEGER NOT NULL, html TEXT NOT NULL, note TEXT, status TEXT NOT NULL DEFAULT 'draft', variant_of TEXT,
      x REAL, y REAL, ord INTEGER NOT NULL, shot TEXT, thumb TEXT, findings TEXT NOT NULL DEFAULT '[]',
      targets TEXT NOT NULL DEFAULT '[]', render_error TEXT, updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, slug)
    );
    CREATE TABLE IF NOT EXISTS screen_versions (
      board_id TEXT NOT NULL, slug TEXT NOT NULL, version INTEGER NOT NULL, html TEXT NOT NULL, note TEXT,
      shot TEXT, created_at TEXT NOT NULL, PRIMARY KEY (board_id, slug, version)
    );
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, board_id TEXT NOT NULL, slug TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL,
      text TEXT NOT NULL, target TEXT, version INTEGER NOT NULL DEFAULT 1, author TEXT NOT NULL DEFAULT 'human',
      status TEXT NOT NULL DEFAULT 'open', reply TEXT, created_at TEXT NOT NULL, resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS comments_board ON comments(board_id, status);
  `);
  ready = true;
  return d;
}

/** Solo tests: la DB en memoria se recrea, así que el esquema también. */
export function resetStudioSchema() {
  ready = false;
}

const now = () => new Date().toISOString();
const json = <T>(s: unknown, fallback: T): T => {
  try {
    return s ? (JSON.parse(String(s)) as T) : fallback;
  } catch {
    return fallback;
  }
};

type Row = Record<string, unknown>;
const toBoard = (r: Row): Board => ({
  id: String(r.id),
  name: String(r.name),
  project: (r.project as string) ?? undefined,
  brief: (r.brief as string) ?? undefined,
  theme: json<BoardTheme>(r.theme, {} as BoardTheme),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});
const toScreen = (r: Row): Screen => ({
  boardId: String(r.board_id),
  slug: String(r.slug),
  name: String(r.name),
  viewport: r.viewport as ViewportName,
  width: Number(r.width),
  height: Number(r.height),
  version: Number(r.version),
  html: String(r.html),
  note: (r.note as string) ?? undefined,
  status: r.status as ScreenStatus,
  variantOf: (r.variant_of as string) ?? undefined,
  x: r.x == null ? undefined : Number(r.x),
  y: r.y == null ? undefined : Number(r.y),
  order: Number(r.ord),
  shot: (r.shot as string) ?? undefined,
  thumb: (r.thumb as string) ?? undefined,
  findings: json(r.findings, []),
  targets: json(r.targets, []),
  renderError: (r.render_error as string) ?? undefined,
  updatedAt: String(r.updated_at),
});
const toComment = (r: Row): Comment => ({
  id: Number(r.id),
  boardId: String(r.board_id),
  slug: String(r.slug),
  x: Number(r.x),
  y: Number(r.y),
  text: String(r.text),
  target: json<ElementDesc | undefined>(r.target, undefined),
  version: Number(r.version),
  author: r.author as Comment["author"],
  status: r.status as Comment["status"],
  reply: (r.reply as string) ?? undefined,
  createdAt: String(r.created_at),
  resolvedAt: (r.resolved_at as string) ?? undefined,
});

export function listBoards(): Array<Board & { screens: number; openComments: number }> {
  const rows = db()
    .prepare(
      `SELECT b.*, (SELECT count(*) FROM screens s WHERE s.board_id = b.id) AS n,
              (SELECT count(*) FROM comments c WHERE c.board_id = b.id AND c.status = 'open') AS oc
       FROM boards b ORDER BY b.updated_at DESC`,
    )
    .all() as Row[];
  return rows.map((r) => ({ ...toBoard(r), screens: Number(r.n), openComments: Number(r.oc) }));
}

export function getBoard(id: string): Board | undefined {
  const r = db().prepare("SELECT * FROM boards WHERE id = ?").get(id) as Row | undefined;
  return r && toBoard(r);
}

export function saveBoard(b: Omit<Board, "createdAt" | "updatedAt">): Board {
  const t = now();
  db()
    .prepare(
      `INSERT INTO boards (id, name, project, brief, theme, created_at, updated_at) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, project=excluded.project, brief=excluded.brief,
         theme=excluded.theme, updated_at=excluded.updated_at`,
    )
    .run(b.id, b.name, b.project ?? null, b.brief ?? null, JSON.stringify(b.theme), t, t);
  return getBoard(b.id)!;
}

export function touchBoard(id: string) {
  db().prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(now(), id);
}

export function listScreens(boardId: string): Screen[] {
  return (db().prepare("SELECT * FROM screens WHERE board_id = ? ORDER BY ord").all(boardId) as Row[]).map(toScreen);
}

export function getScreen(boardId: string, slug: string): Screen | undefined {
  const r = db().prepare("SELECT * FROM screens WHERE board_id = ? AND slug = ?").get(boardId, slug) as Row | undefined;
  return r && toScreen(r);
}

/** Crea la pantalla o le agrega una versión. Devuelve la versión nueva. */
export function upsertScreen(s: {
  boardId: string;
  slug: string;
  name: string;
  viewport: ViewportName;
  width: number;
  html: string;
  note?: string;
  variantOf?: string;
  x?: number;
  y?: number;
}): Screen {
  const d = db();
  const prev = getScreen(s.boardId, s.slug);
  const version = (prev?.version ?? 0) + 1;
  const t = now();
  if (prev) {
    d.prepare(
      `UPDATE screens SET name=?, viewport=?, width=?, version=?, html=?, note=?, variant_of=coalesce(?, variant_of),
         x=coalesce(?, x), y=coalesce(?, y), status='draft', updated_at=? WHERE board_id=? AND slug=?`,
    ).run(s.name, s.viewport, s.width, version, s.html, s.note ?? null, s.variantOf ?? null, s.x ?? null, s.y ?? null, t, s.boardId, s.slug);
  } else {
    const ord = (d.prepare("SELECT coalesce(max(ord), -1) + 1 AS o FROM screens WHERE board_id = ?").get(s.boardId) as { o: number }).o;
    d.prepare(
      `INSERT INTO screens (board_id, slug, name, viewport, width, version, html, note, variant_of, x, y, ord, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(s.boardId, s.slug, s.name, s.viewport, s.width, version, s.html, s.note ?? null, s.variantOf ?? null, s.x ?? null, s.y ?? null, ord, t);
  }
  d.prepare("INSERT INTO screen_versions (board_id, slug, version, html, note, created_at) VALUES (?,?,?,?,?,?)").run(
    s.boardId, s.slug, version, s.html, s.note ?? null, t,
  );
  touchBoard(s.boardId);
  return getScreen(s.boardId, s.slug)!;
}

export function saveRender(
  boardId: string,
  slug: string,
  version: number,
  r: { shot?: string; thumb?: string; height?: number; findings: StudioFinding[]; targets: ElementDesc[]; error?: string },
) {
  const d = db();
  d.prepare(
    `UPDATE screens SET shot=coalesce(?, shot), thumb=coalesce(?, thumb), height=coalesce(?, height), findings=?, targets=?,
       render_error=?, updated_at=? WHERE board_id=? AND slug=? AND version=?`,
  ).run(r.shot ?? null, r.thumb ?? null, r.height ?? null, JSON.stringify(r.findings), JSON.stringify(r.targets), r.error ?? null, now(), boardId, slug, version);
  if (r.shot) d.prepare("UPDATE screen_versions SET shot=? WHERE board_id=? AND slug=? AND version=?").run(r.shot, boardId, slug, version);
}

export function listVersions(boardId: string, slug: string): Array<{ version: number; note?: string; createdAt: string; shot?: string }> {
  return (
    db().prepare("SELECT version, note, created_at, shot FROM screen_versions WHERE board_id=? AND slug=? ORDER BY version DESC").all(boardId, slug) as Row[]
  ).map((r) => ({ version: Number(r.version), note: (r.note as string) ?? undefined, createdAt: String(r.created_at), shot: (r.shot as string) ?? undefined }));
}

export function getVersion(boardId: string, slug: string, version: number): { html: string; note?: string; shot?: string } | undefined {
  const r = db().prepare("SELECT html, note, shot FROM screen_versions WHERE board_id=? AND slug=? AND version=?").get(boardId, slug, version) as Row | undefined;
  return r && { html: String(r.html), note: (r.note as string) ?? undefined, shot: (r.shot as string) ?? undefined };
}

export function setStatus(boardId: string, slug: string, status: ScreenStatus) {
  db().prepare("UPDATE screens SET status=?, updated_at=? WHERE board_id=? AND slug=?").run(status, now(), boardId, slug);
  touchBoard(boardId);
}

export function moveScreen(boardId: string, slug: string, x: number, y: number) {
  db().prepare("UPDATE screens SET x=?, y=? WHERE board_id=? AND slug=?").run(Math.round(x), Math.round(y), boardId, slug);
}

export function deleteScreen(boardId: string, slug: string) {
  const d = db();
  d.prepare("DELETE FROM screens WHERE board_id=? AND slug=?").run(boardId, slug);
  d.prepare("DELETE FROM comments WHERE board_id=? AND slug=?").run(boardId, slug);
  // las variantes huérfanas pasan a ser pantallas propias
  d.prepare("UPDATE screens SET variant_of=NULL WHERE board_id=? AND variant_of=?").run(boardId, slug);
  touchBoard(boardId);
}

export function addComment(c: { boardId: string; slug: string; x: number; y: number; text: string; target?: ElementDesc; version: number; author?: Comment["author"] }): Comment {
  const d = db();
  const r = d
    .prepare("INSERT INTO comments (board_id, slug, x, y, text, target, version, author, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(c.boardId, c.slug, c.x, c.y, c.text, c.target ? JSON.stringify(c.target) : null, c.version, c.author ?? "human", now());
  touchBoard(c.boardId);
  return toComment(d.prepare("SELECT * FROM comments WHERE id = ?").get(Number(r.lastInsertRowid)) as Row);
}

export function listComments(boardId: string, o: { status?: "open" | "resolved"; slug?: string } = {}): Comment[] {
  const where = ["board_id = ?"];
  const args: string[] = [boardId];
  if (o.status) (where.push("status = ?"), args.push(o.status));
  if (o.slug) (where.push("slug = ?"), args.push(o.slug));
  return (db().prepare(`SELECT * FROM comments WHERE ${where.join(" AND ")} ORDER BY id`).all(...args) as Row[]).map(toComment);
}

export function resolveComment(boardId: string, id: number, reply?: string): Comment | undefined {
  const d = db();
  d.prepare("UPDATE comments SET status='resolved', reply=coalesce(?, reply), resolved_at=? WHERE id=? AND board_id=?").run(reply ?? null, now(), id, boardId);
  touchBoard(boardId);
  const r = d.prepare("SELECT * FROM comments WHERE id = ? AND board_id = ?").get(id, boardId) as Row | undefined;
  return r && toComment(r);
}

export function reopenComment(boardId: string, id: number) {
  db().prepare("UPDATE comments SET status='open', resolved_at=NULL WHERE id=? AND board_id=?").run(id, boardId);
  touchBoard(boardId);
}

/** Marca de cambios del tablero: el lienzo hace polling barato con esto. */
export function boardStamp(boardId: string): string {
  const r = db()
    .prepare(
      `SELECT b.updated_at AS u, (SELECT max(updated_at) FROM screens WHERE board_id = b.id) AS s,
              (SELECT count(*) FROM comments WHERE board_id = b.id) AS c FROM boards b WHERE b.id = ?`,
    )
    .get(boardId) as Row | undefined;
  return r ? `${r.u}|${r.s}|${r.c}` : "";
}
