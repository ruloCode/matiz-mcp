// Captura de un sitio público: navega con Chromium, despeja banners, fuerza el lazy-load,
// mide la página (extract.browser.js), saca screenshots (página, hero, cada sección + miniatura)
// y arma el DNA. Una sola instancia de navegador reutilizada entre capturas.
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDna } from "../analysis/dna.js";
import { SHOTS, hostOf, saveSite, siteIdFromUrl } from "../db.js";
import { pageTypeFromUrl, pickInnerPages, type PageType } from "../pages.js";
import type { RawPage, SiteRecord } from "../types.js";
import { installChromium, isMissingBrowser } from "../browser-install.js";

const here = dirname(fileURLToPath(import.meta.url));
const EXTRACT = readFileSync(join(here, "extract.browser.js"), "utf8");
const TREE = readFileSync(join(here, "tree.browser.js"), "utf8").replace(/^\s*\/\/.*$/gm, "").trim();

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

let browser: Browser | undefined;

const launch = () => chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  try {
    browser = await launch();
  } catch (e) {
    // máquina nueva (o caché de Playwright limpiado): se instala Chromium una vez y se reintenta
    if (!isMissingBrowser(e)) throw e;
    const r = installChromium();
    if (!r.ok) throw new Error(`No se pudo instalar Chromium automáticamente. Corre: npx -y matiz-mcp init\n${r.output.slice(-400)}`);
    browser = await launch();
  }
  return browser;
}

/** Comprueba (y opcionalmente instala) Chromium. Para `init` y `doctor`. */
export async function ensureBrowser(o: { install?: boolean } = {}): Promise<{ ok: boolean; installed?: boolean; error?: string }> {
  try {
    const b = await launch();
    await b.close();
    return { ok: true };
  } catch (e) {
    if (!isMissingBrowser(e)) return { ok: false, error: (e as Error).message.split("\n")[0] };
    if (o.install === false) return { ok: false, error: "Chromium no instalado" };
    const r = installChromium();
    return r.ok ? { ok: true, installed: true } : { ok: false, error: r.output.slice(-300) };
  }
}

export async function closeBrowser() {
  // un sitio colgado puede dejar a close() esperando para siempre: tope de 5 s
  const b = browser;
  browser = undefined;
  if (b) await Promise.race([b.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
}

export interface CaptureOptions {
  name?: string;
  tags?: string[];
  industry?: string[];
  /** false = solo medir (para criticar un build local) sin guardar en el corpus. */
  store?: boolean;
  width?: number;
  height?: number;
  colorScheme?: "light" | "dark";
  /** Máximo de secciones con recorte propio. */
  maxSectionShots?: number;
  /** Tipo de página (home, pricing…); por defecto se deduce de la URL pedida. */
  page?: string;
  /** mobile = iPhone de 390 px (registro aparte, id con sufijo @m). */
  viewport?: "desktop" | "mobile";
}

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

/** Enlaces internos de una portada → las páginas que vale la pena capturar (pricing, signup…). */
export async function discoverPages(input: string, max = 6): Promise<Array<{ type: PageType; url: string }>> {
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, userAgent: UA, locale: "en-US" });
  const page = await ctx.newPage();
  try {
    await page.goto(normalizeUrl(input), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1500);
    const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map((a) => (a as HTMLAnchorElement).href));
    return pickInnerPages(page.url(), hrefs, max);
  } finally {
    await ctx.close().catch(() => {});
  }
}

export function normalizeUrl(url: string): string {
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^(localhost|127\.|192\.168\.|10\.)/.test(u)) return `http://${u}`;
  return `https://${u}`;
}

const COOKIE_BUTTONS = [
  "#onetrust-accept-btn-handler",
  "button#accept-cookies",
  "[data-testid*=cookie] button",
  "#didomi-notice-agree-button",
  "[id*=cookie i] button:has-text('Accept')",
  "button:has-text('Accept all cookies')",
  "button:has-text('Allow all cookies')",
  "button:has-text('Accept all')",
  "button:has-text('Accept All')",
  "button:has-text('Allow all')",
  "button:has-text('Accept')",
  "button:has-text('I agree')",
  "button:has-text('Got it')",
  "button:has-text('Aceptar todo')",
  "button:has-text('Aceptar')",
  "button:has-text('OK')",
];

async function clearOverlays(page: Page) {
  for (const sel of COOKIE_BUTTONS) {
    const b = page.locator(sel).first();
    if (await b.isVisible({ timeout: 150 }).catch(() => false)) {
      await b.click({ timeout: 800 }).catch(() => {});
      await page.waitForTimeout(250);
      break;
    }
  }
  // lo que quede (banners de cookies, chats flotantes) se oculta para que no salga en las fotos
  await page
    .evaluate(() => {
      const kill = (el: Element) => ((el as HTMLElement).style.setProperty("display", "none", "important"));
      document
        .querySelectorAll("#intercom-container, .intercom-lightweight-app, #hubspot-messages-iframe-container, iframe[title*='chat' i], #crisp-chatbox, .drift-frame-controller")
        .forEach(kill);
      // banners de consentimiento: fijos/sticky o diálogos con lenguaje de cookies/datos.
      // Se revisa el texto propio del bloque (no se exige que sea corto: los paneles de
      // preferencias traen listas largas y por eso sobrevivían).
      const consent = /cookie|consent|gdpr|we use cookies|usamos cookies|your data|tus datos|ad personali[sz]ation|personalizaci[oó]n de anuncios|privacy preferences|preferencias de privacidad/;
      for (const el of Array.from(document.querySelectorAll("body *")).slice(0, 6000)) {
        const s = getComputedStyle(el);
        const dialog = el.getAttribute("role") === "dialog" || el.getAttribute("aria-modal") === "true";
        if (s.position !== "fixed" && s.position !== "sticky" && !dialog) continue;
        const t = (el.textContent || "").toLowerCase();
        if (consent.test(t) && t.length < 8000) kill(el);
      }
    })
    .catch(() => {});
}

async function autoScroll(page: Page) {
  await page
    .evaluate(async () => {
      const step = Math.round(window.innerHeight * 0.85);
      const limit = Math.min(document.documentElement.scrollHeight, 24000);
      for (let y = 0; y < limit; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 110));
      }
      window.scrollTo(0, 0);
    })
    .catch(() => {});
  await page.waitForTimeout(700);
}

/** Miniatura JPEG reescalada en una pestaña en blanco (sin CSP del sitio). */
async function thumbnail(ctx: BrowserContext, jpeg: Buffer, width = 640): Promise<Buffer> {
  const p = await ctx.newPage();
  try {
    const dataUrl = await p.evaluate(
      async ({ b64, width }) => {
        const img = new Image();
        img.src = `data:image/jpeg;base64,${b64}`;
        await img.decode();
        const scale = Math.min(1, width / img.naturalWidth);
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL("image/jpeg", 0.72);
      },
      { b64: jpeg.toString("base64"), width },
    );
    return Buffer.from(dataUrl.split(",")[1], "base64");
  } finally {
    await p.close();
  }
}

function prettyName(raw: RawPage, url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const fromTitle = raw.title.split(/[|–—·:-]/)[0].trim();
  const base = host.split(".")[0];
  if (fromTitle && fromTitle.length <= 28 && fromTitle.toLowerCase().includes(base.slice(0, 4))) return fromTitle;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Árbol de layout de UNA sección, medido en vivo (para get_section_blueprint). Se ubica la
 * sección por la caja que guardó la captura (top/alto), con el mismo viewport.
 */
export async function extractSectionTree(
  input: string,
  box: { top: number; height: number },
  viewport: "desktop" | "mobile" = "desktop",
): Promise<unknown | null> {
  const b = await getBrowser();
  const mobile = viewport === "mobile";
  const ctx = await b.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: MOBILE_UA, locale: "en-US", reducedMotion: "reduce" }
      : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, userAgent: UA, locale: "en-US", reducedMotion: "reduce" },
  );
  const page = await ctx.newPage();
  try {
    await page.goto(normalizeUrl(input), { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await clearOverlays(page);
    await autoScroll(page);
    return await page.evaluate(`(${TREE})(${JSON.stringify(box)})`);
  } finally {
    await ctx.close().catch(() => {});
  }
}

export interface CaptureResult {
  record: SiteRecord;
  raw: RawPage;
  ms: number;
}

export async function captureSite(input: string, opts: CaptureOptions = {}): Promise<CaptureResult> {
  const t0 = Date.now();
  const url = normalizeUrl(input);
  const store = opts.store !== false;
  const b = await getBrowser();
  const mobile = opts.viewport === "mobile";
  const ctx = await b.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: MOBILE_UA, locale: "en-US", colorScheme: opts.colorScheme ?? "light", reducedMotion: "reduce" }
      : { viewport: { width: opts.width ?? 1440, height: opts.height ?? 900 }, deviceScaleFactor: 1, userAgent: UA, locale: "en-US", colorScheme: opts.colorScheme ?? "light", reducedMotion: "reduce" },
  );
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (res && res.status() >= 400) throw new Error(`HTTP ${res.status()} en ${url}`);
    await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await clearOverlays(page);
    await autoScroll(page);
    await clearOverlays(page);
    await page.evaluate(() => document.fonts?.ready).catch(() => {});

    const raw = (await page.evaluate(EXTRACT)) as RawPage;
    if (!raw.sections.length) throw new Error("La página no tiene bloques medibles (¿bloqueo anti-bot o render vacío?)");
    const finalUrl = page.url();
    const id = siteIdFromUrl(finalUrl.split("?")[0]) + (mobile ? "@m" : "");
    const dna = buildDna(raw, { industry: opts.industry });

    const shots: SiteRecord["shots"] = {};
    if (store) {
      const dir = join(SHOTS, id);
      mkdirSync(dir, { recursive: true });
      // la medición cruda se guarda: mejorar el análisis = `pnpm reanalyze`, sin volver a navegar
      writeFileSync(join(dir, "raw.json"), JSON.stringify(raw));
      const vw = raw.viewport.w;
      const hero = await page.screenshot({ type: "jpeg", quality: 78 });
      writeFileSync((shots.hero = join(dir, "hero.jpg")), hero);
      writeFileSync((shots.heroThumb = join(dir, "hero.thumb.jpg")), await thumbnail(ctx, hero, 720));
      const fullH = Math.min(raw.pageHeight, 16_000);
      const full = await page.screenshot({ type: "jpeg", quality: 62, fullPage: true, clip: { x: 0, y: 0, width: vw, height: fullH } });
      writeFileSync((shots.full = join(dir, "full.jpg")), full);
      const max = opts.maxSectionShots ?? 28;
      for (const s of dna.sections.slice(0, max)) {
        if (s.height < 40 || s.top >= fullH) continue;
        const h = Math.min(s.height, 1800, fullH - s.top);
        const buf = await page
          .screenshot({ type: "jpeg", quality: 72, fullPage: true, clip: { x: 0, y: s.top, width: vw, height: h } })
          .catch(() => undefined);
        if (!buf) continue;
        writeFileSync((s.shot = join(dir, `s${String(s.idx).padStart(2, "0")}.jpg`)), buf);
        writeFileSync((s.thumb = join(dir, `s${String(s.idx).padStart(2, "0")}.thumb.jpg`)), await thumbnail(ctx, buf, 560));
      }
    }

    const record: SiteRecord = {
      id,
      url: finalUrl,
      name: opts.name ?? prettyName(raw, finalUrl),
      title: raw.title,
      description: raw.description,
      capturedAt: new Date().toISOString(),
      tags: (opts.tags ?? []).map((t) => t.toLowerCase()),
      industry: dna.industry,
      dna,
      shots,
      page: opts.page ?? pageTypeFromUrl(url) ?? "home",
      host: hostOf(finalUrl),
      viewport: mobile ? "mobile" : "desktop",
    };
    if (store) saveSite(record);
    return { record, raw, ms: Date.now() - t0 };
  } finally {
    await ctx.close().catch(() => {});
  }
}
