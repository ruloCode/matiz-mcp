// Rutas del Estudio dentro de la galería local: el lienzo (/studio), su API de lectura,
// las capturas y la vista en vivo de cada pantalla, y las acciones del humano
// (comentar, aprobar, mover). Solo localhost; las escrituras exigen la cabecera
// x-matiz (fuerza preflight CORS, así ninguna web externa puede escribir aquí).
import type { IncomingMessage, ServerResponse } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HOME } from "../db.js";
import * as store from "../studio/store.js";
import { layoutBoard } from "../studio/layout.js";
import { pickTarget } from "../studio/check.js";
import { TAILWIND_PATH, VIEWPORTS, screenCsp, screenDocument, slugify } from "../studio/doc.js";
import { tailwindSource } from "../studio/render.js";

const here = dirname(fileURLToPath(import.meta.url));
const APP = () => readFileSync(join(here, "studio.html"), "utf8");
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

function send(res: ServerResponse, code: number, body: unknown, type = "application/json; charset=utf-8", extra: Record<string, string> = {}) {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store", ...extra });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) throw new Error("cuerpo demasiado grande");
  }
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

const imgUrl = (b: string, s: string, v: number, size: "thumb" | "full") => `/studio/img/${encodeURIComponent(b)}/${encodeURIComponent(s)}?v=${v}&size=${size}`;

function boardPayload(id: string) {
  const board = store.getBoard(id);
  if (!board) return null;
  const screens = store.listScreens(id);
  const pos = layoutBoard(screens.map((s) => ({ slug: s.slug, width: s.width, height: s.height, order: s.order, variantOf: s.variantOf, x: s.x, y: s.y })));
  return {
    board: { id: board.id, name: board.name, brief: board.brief, project: board.project, theme: board.theme, updatedAt: board.updatedAt },
    stamp: store.boardStamp(id),
    screens: screens.map((s) => ({
      slug: s.slug,
      name: s.name,
      viewport: s.viewport,
      width: s.width,
      height: s.height,
      viewportHeight: VIEWPORTS[s.viewport].height,
      version: s.version,
      status: s.status,
      variantOf: s.variantOf,
      note: s.note,
      ...pos.get(s.slug)!,
      manual: s.x != null,
      thumb: s.thumb ? imgUrl(id, s.slug, s.version, "thumb") : null,
      shot: s.shot ? imgUrl(id, s.slug, s.version, "full") : null,
      live: `/studio/s/${encodeURIComponent(id)}/${encodeURIComponent(s.slug)}`,
      findings: s.findings,
      renderError: s.renderError,
      versions: store.listVersions(id, s.slug).map((v) => ({ version: v.version, note: v.note, at: v.createdAt })),
      updatedAt: s.updatedAt,
    })),
    comments: store.listComments(id),
  };
}

function serveShot(res: ServerResponse, boardId: string, slug: string, version: number, size: string) {
  const s = store.getScreen(boardId, slug);
  if (!s) return send(res, 404, { error: "no existe" });
  let file = size === "full" ? s.shot : s.thumb;
  if (version && version !== s.version) {
    const v = store.getVersion(boardId, slug, version);
    file = v?.shot ? (size === "full" ? v.shot : v.shot.replace(/\.jpg$/, ".thumb.jpg")) : undefined;
  }
  if (!file) return send(res, 404, { error: "sin captura" });
  const abs = resolve(file);
  if (!abs.startsWith(resolve(store.STUDIO)) || !existsSync(abs)) return send(res, 404, { error: "sin captura" });
  res.writeHead(200, { "content-type": "image/jpeg", "content-length": statSync(abs).size, "cache-control": "max-age=31536000, immutable" });
  createReadStream(abs).pipe(res);
}

/** true si la ruta era del Estudio (respondida). */
export async function handleStudio(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const p = url.pathname;
  if (!(p === "/studio" || p.startsWith("/studio/") || p === TAILWIND_PATH)) return false;
  // DNS rebinding: un dominio ajeno que resuelva a 127.0.0.1 no entra
  if (!LOCAL_HOST.test(req.headers.host ?? "")) return send(res, 403, { error: "solo localhost" }), true;
  const origin = `http://${req.headers.host}`;

  if (p === TAILWIND_PATH) return send(res, 200, tailwindSource(), "text/javascript; charset=utf-8", { "cache-control": "max-age=86400" }), true;
  if (p === "/studio/api/ping") return send(res, 200, { matiz: true, studio: 1, home: HOME }), true;
  if (p === "/studio/api/boards") {
    const boards = store.listBoards().map((b) => {
      const first = store.listScreens(b.id).find((s) => s.thumb);
      return { id: b.id, name: b.name, brief: b.brief, screens: b.screens, openComments: b.openComments, updatedAt: b.updatedAt, colors: b.theme.colors, thumb: first ? imgUrl(b.id, first.slug, first.version, "thumb") : null };
    });
    return send(res, 200, boards), true;
  }

  let m = p.match(/^\/studio\/api\/board\/([^/]+)(\/stamp)?$/);
  if (m && req.method === "GET") {
    const id = decodeURIComponent(m[1]);
    if (m[2]) return send(res, 200, { stamp: store.boardStamp(id) }), true;
    const payload = boardPayload(id);
    return (payload ? send(res, 200, payload) : send(res, 404, { error: "No existe ese tablero" })), true;
  }

  m = p.match(/^\/studio\/img\/([^/]+)\/([^/]+)$/);
  if (m) return serveShot(res, decodeURIComponent(m[1]), decodeURIComponent(m[2]), Number(url.searchParams.get("v") ?? 0), url.searchParams.get("size") ?? "thumb"), true;

  m = p.match(/^\/studio\/s\/([^/]+)\/([^/]+)$/);
  if (m) {
    const board = store.getBoard(decodeURIComponent(m[1]));
    const s = board && store.getScreen(board.id, decodeURIComponent(m[2]));
    if (!board || !s) return send(res, 404, "No existe", "text/plain; charset=utf-8"), true;
    const v = Number(url.searchParams.get("v") ?? 0);
    const html = v && v !== s.version ? store.getVersion(board.id, s.slug, v)?.html ?? s.html : s.html;
    const doc = screenDocument({ html, theme: board.theme, title: `${s.name} · ${board.name}`, assetOrigin: origin });
    return send(res, 200, doc, "text/html; charset=utf-8", { "content-security-policy": screenCsp(origin) }), true;
  }

  // escrituras del humano
  if (req.method === "POST") {
    if (req.headers["x-matiz"] !== "1") return send(res, 403, { error: "falta x-matiz" }), true;
    const body = await readJson(req);
    m = p.match(/^\/studio\/api\/board\/([^/]+)\/comments$/);
    if (m) {
      const boardId = decodeURIComponent(m[1]);
      const s = store.getScreen(boardId, slugify(String(body.slug ?? "")));
      const t = String(body.text ?? "").trim().slice(0, 2000);
      if (!s || !t) return send(res, 400, { error: "falta pantalla o texto" }), true;
      const x = Number(body.x), y = Number(body.y);
      const target = pickTarget(s.targets, x, y);
      return send(res, 200, store.addComment({ boardId, slug: s.slug, x, y, text: t, target, version: s.version })), true;
    }
    m = p.match(/^\/studio\/api\/board\/([^/]+)\/comments\/(\d+)$/);
    if (m) {
      const boardId = decodeURIComponent(m[1]);
      if (body.action === "reopen") store.reopenComment(boardId, Number(m[2]));
      else store.resolveComment(boardId, Number(m[2]), body.reply ? String(body.reply).slice(0, 1000) : undefined);
      return send(res, 200, { ok: true }), true;
    }
    m = p.match(/^\/studio\/api\/board\/([^/]+)\/screens\/([^/]+)$/);
    if (m) {
      const boardId = decodeURIComponent(m[1]);
      const slug = decodeURIComponent(m[2]);
      if (!store.getScreen(boardId, slug)) return send(res, 404, { error: "no existe" }), true;
      const a = String(body.action);
      if (a === "move") store.moveScreen(boardId, slug, Number(body.x), Number(body.y));
      else if (a === "approve" || a === "discard" || a === "draft") store.setStatus(boardId, slug, a === "approve" ? "approved" : a === "discard" ? "discarded" : "draft");
      else return send(res, 400, { error: "acción desconocida" }), true;
      return send(res, 200, { ok: true, stamp: store.boardStamp(boardId) }), true;
    }
    return send(res, 404, { error: "no existe" }), true;
  }

  if (p === "/studio" || /^\/studio\/[^/]+\/?$/.test(p)) return send(res, 200, APP(), "text/html; charset=utf-8"), true;
  return send(res, 404, { error: "no existe" }), true;
}
