// Render de una pantalla del Estudio con el MISMO Chromium de las capturas: se sirve el
// documento desde un origen interno (http://matiz.studio), sin red salvo fuentes e
// imágenes https, se espera a Tailwind y a las fuentes, se fotografía y se mide con la
// sonda (problemas) y, si se pide, con el extractor del corpus (ADN comparable).
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getBrowser, thumbnail, UA } from "../capture/capture.js";
import { buildDna } from "../analysis/dna.js";
import type { Dna, RawPage } from "../types.js";
import { TAILWIND_PATH, VIEWPORTS, screenDocument, type ViewportName } from "./doc.js";
import type { BoardTheme } from "./theme.js";
import type { ProbeResult, Tells } from "./check.js";
import { STUDIO } from "./store.js";

const here = dirname(fileURLToPath(import.meta.url));
const PROBE = readFileSync(join(here, "probe.browser.js"), "utf8").replace(/^\s*\/\/.*$/gm, "").trim();
const TELLS = readFileSync(join(here, "tells.browser.js"), "utf8").replace(/^\s*\/\/.*$/gm, "").trim();
const EXTRACT = readFileSync(join(here, "..", "capture", "extract.browser.js"), "utf8");

let tailwindJs: Buffer | undefined;
/** Tailwind v4 para navegador, del paquete instalado (funciona sin internet). */
export function tailwindSource(): Buffer {
  if (!tailwindJs) tailwindJs = readFileSync(createRequire(import.meta.url).resolve("@tailwindcss/browser"));
  return tailwindJs;
}

export const RENDER_ORIGIN = "http://matiz.studio";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

export interface RenderResult {
  shot: string;
  thumb: string;
  height: number;
  probe: ProbeResult;
  dna?: Dna;
  tells?: Tells;
  ms: number;
}

export async function renderScreen(o: {
  boardId: string;
  slug: string;
  version: number;
  name: string;
  html: string;
  theme: BoardTheme;
  viewport: ViewportName;
  measure?: boolean;
}): Promise<RenderResult> {
  const t0 = Date.now();
  const vp = VIEWPORTS[o.viewport];
  const b = await getBrowser();
  const ctx = await b.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    userAgent: vp.mobile ? MOBILE_UA : UA,
    locale: "es-CO",
    colorScheme: o.theme.scheme,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const doc = screenDocument({ html: o.html, theme: o.theme, title: o.name, assetOrigin: RENDER_ORIGIN });
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin === RENDER_ORIGIN) {
      if (url.pathname === TAILWIND_PATH) return route.fulfill({ status: 200, contentType: "text/javascript", body: tailwindSource() });
      if (url.pathname === "/s") return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: doc });
      return route.fulfill({ status: 404, body: "" });
    }
    // fuera del origen interno: solo fuentes de Google e imágenes/medios https (sin scripts ni fetch)
    const type = req.resourceType();
    const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
    if (url.protocol === "https:" && (fonts || type === "image" || type === "media" || (type === "font" && fonts))) return route.continue();
    return route.abort();
  });
  const page = await ctx.newPage();
  try {
    await page.goto(`${RENDER_ORIGIN}/s`, { waitUntil: "load", timeout: 30_000 });
    // Tailwind en el navegador genera su <style> después del primer render
    await page
      .waitForFunction(() => Array.from(document.querySelectorAll("style")).some((s) => /tailwindcss v4/.test(s.textContent || "")), undefined, { timeout: 8000 })
      .catch(() => {});
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForTimeout(250);

    const probe = (await page.evaluate(`(${PROBE})(${JSON.stringify({ fonts: [...new Set([o.theme.fonts.heading, o.theme.fonts.body])], touch: vp.mobile, width: vp.width })})`)) as ProbeResult;
    const dir = join(STUDIO, o.boardId);
    mkdirSync(dir, { recursive: true });
    const height = Math.min(Math.max(probe.height, vp.height), 14_000);
    const jpg = await page.screenshot({ type: "jpeg", quality: 82, fullPage: true, clip: { x: 0, y: 0, width: vp.width, height } });
    const shot = join(dir, `${o.slug}.v${o.version}.jpg`);
    const thumb = join(dir, `${o.slug}.v${o.version}.thumb.jpg`);
    writeFileSync(shot, jpg);
    writeFileSync(thumb, await thumbnail(ctx, jpg, o.viewport === "desktop" ? 900 : 480));

    let dna: Dna | undefined;
    let tells: Tells | undefined;
    if (o.measure) {
      const raw = (await page.evaluate(EXTRACT)) as RawPage;
      if (raw.sections.length) dna = buildDna(raw);
      tells = (await page.evaluate(`(${TELLS})({})`).catch(() => undefined)) as Tells | undefined;
    }
    return { shot, thumb, height, probe, dna, tells, ms: Date.now() - t0 };
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * Vista general del tablero para el agente: las miniaturas en su posición del lienzo,
 * en una sola imagen (para que VEA el conjunto sin pedir cada pantalla).
 */
export async function renderOverview(items: Array<{ name: string; thumb?: string; x: number; y: number; width: number; height: number; status: string }>, width = 1600): Promise<Buffer | undefined> {
  const withImg = items.filter((i) => i.thumb);
  if (!withImg.length) return;
  const minX = Math.min(...items.map((i) => i.x));
  const minY = Math.min(...items.map((i) => i.y));
  const maxX = Math.max(...items.map((i) => i.x + i.width));
  const maxY = Math.max(...items.map((i) => i.y + Math.min(i.height, 4000)));
  const pad = 80;
  const scale = Math.min(1, (width - pad * 2) / (maxX - minX || 1));
  const H = Math.min(2400, Math.round((maxY - minY) * scale + pad * 2 + 30));
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: { width, height: H } });
  const page = await ctx.newPage();
  try {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const cards = items
      .map((i) => {
        const left = pad + (i.x - minX) * scale;
        const top = pad + 24 + (i.y - minY) * scale;
        const w = i.width * scale;
        const h = Math.min(i.height, 4000) * scale;
        const src = i.thumb ? `data:image/jpeg;base64,${readFileSync(i.thumb).toString("base64")}` : "";
        const tag = i.status === "approved" ? " ✓" : i.status === "discarded" ? " ✕" : "";
        return `<div style="position:absolute;left:${left}px;top:${top - 22}px;font:600 13px system-ui;color:#555">${esc(i.name)}${tag}</div>
<div style="position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;overflow:hidden;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.15);background:#fff;${i.status === "discarded" ? "opacity:.35;" : ""}">${src ? `<img src="${src}" style="width:100%;display:block">` : ""}</div>`;
      })
      .join("\n");
    await page.setContent(`<body style="margin:0;background:#ededee;position:relative;height:${H}px">${cards}</body>`, { waitUntil: "load" });
    return await page.screenshot({ type: "jpeg", quality: 72 });
  } finally {
    await ctx.close().catch(() => {});
  }
}
