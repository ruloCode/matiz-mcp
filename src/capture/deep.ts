// Análisis profundo de una marca con Playwright: lo que una captura estática no ve.
// 1) Antes de hacer scroll se anotan los elementos ocultos bajo el pliegue y, al bajar despacio,
//    se mide cuáles aparecen (reveal on scroll) y cómo. 2) De vuelta arriba corre deep.browser.js.
// 3) A cada componente marcado se le hace hover (o focus) y se mide el delta de estilo, con
//    recorte antes/después. Resultado: <shots>/<id>/deep.json + recortes en <shots>/<id>/deep/.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { SHOTS } from "../db.js";
import { UA, clearOverlays, getBrowser } from "./capture.js";

const here = dirname(fileURLToPath(import.meta.url));
const DEEP = readFileSync(join(here, "deep.browser.js"), "utf8");

export interface DeepReport {
  version: 1;
  url: string;
  measuredAt: string;
  reveal: RevealSummary;
  states: StateDelta[];
  crops: Record<string, string>;
  [k: string]: unknown;
}

export interface RevealSummary {
  candidates: number;
  revealed: number;
  pattern: string;
  distance: number | null;
  duration: string | null;
  easing: string | null;
  stagger: number;
  fromOpacity: number | null;
  scale: number | null;
  blur: boolean;
  clip: boolean;
  samples: Array<{ tag: string; y: number; dy: number; op: number; duration: string; delay: string }>;
  scrollAnimations: Array<{ type: string; name: string; props: string[]; duration: number | null; easing: string; count: number }>;
}

export interface StateDelta {
  key: string;
  kind: string;
  state: "hover" | "focus";
  changes: Array<{ prop: string; from: string; to: string; on: "self" | "hijo" }>;
  waitMs: number;
}

// ---------- reveal on scroll ----------
const PRE = `(() => {
  const vh = innerHeight; const out = [];
  const list = document.body ? document.body.getElementsByTagName('*') : [];
  for (let i = 0; i < list.length && i < 9000; i++) {
    const el = list[i];
    const r = el.getBoundingClientRect();
    if (r.top < vh + 40 || r.width < 40 || r.height < 16) continue;
    const s = getComputedStyle(el);
    if (s.display === 'none') continue;
    const op = parseFloat(s.opacity);
    const id = s.transform === 'none' || s.transform === 'matrix(1, 0, 0, 1, 0, 0)';
    const blur = /blur\\((?!0)/.test(s.filter);
    const clip = s.clipPath && s.clipPath !== 'none';
    if (op >= 0.6 && id && !blur && !clip) continue;
    el.setAttribute('data-matiz-r', String(out.length));
    out.push({ op, tf: s.transform, flt: s.filter, clip: clip ? s.clipPath : '', y: Math.round(r.top + scrollY), tag: el.tagName.toLowerCase(), parent: el.parentElement ? (el.parentElement.getAttribute('data-matiz-p') || (el.parentElement.setAttribute('data-matiz-p', String(i)), String(i))) : '' });
    if (out.length >= 600) break;
  }
  window.__matizPre = out;
  return out.length;
})()`;

const POST = `(() => {
  const pre = window.__matizPre || []; const res = [];
  const tr = (m) => {
    if (!m || m === 'none') return { x: 0, y: 0, sc: 1 };
    const v = m.match(/matrix(3d)?\\(([^)]+)\\)/); if (!v) return { x: 0, y: 0, sc: 1 };
    const a = v[2].split(',').map(Number);
    return v[1] ? { x: a[12], y: a[13], sc: a[0] } : { x: a[4], y: a[5], sc: Math.hypot(a[0], a[1]) };
  };
  pre.forEach((p, i) => {
    const el = document.querySelector('[data-matiz-r="' + i + '"]'); if (!el) return;
    const s = getComputedStyle(el);
    const op = parseFloat(s.opacity);
    const a = tr(p.tf), b = tr(s.transform);
    const da = Math.hypot(a.x, a.y), db = Math.hypot(b.x, b.y);
    const opUp = op - p.op >= 0.3;
    const moved = da >= 6 && db <= da * 0.3;
    const scaled = Math.abs(a.sc - 1) >= 0.03 && Math.abs(b.sc - 1) <= Math.abs(a.sc - 1) * 0.3;
    const unblur = /blur\\((?!0)/.test(p.flt) && !/blur\\((?!0)/.test(s.filter);
    const unclip = !!p.clip && s.clipPath !== p.clip;
    if (!(opUp || moved || scaled || unblur || unclip)) return;
    res.push({ tag: p.tag, y: p.y, parent: p.parent, op: p.op, dx: Math.round(a.x), dy: Math.round(a.y), sc: +a.sc.toFixed(3), opUp, moved, scaled, blur: unblur, clip: unclip,
      duration: s.transitionDuration.split(',')[0].trim(), easing: s.transitionTimingFunction.split(/,(?![^(]*\\))/)[0].trim(), delay: s.transitionDelay.split(',')[0].trim(),
      animation: s.animationName !== 'none' ? s.animationName + ' ' + s.animationDuration : '' });
  });
  return { candidates: pre.length, revealed: res };
})()`;

// recorrido lento que además muestrea las animaciones vivas (las de JS no viven en el CSS)
const SLOW_SCROLL = `(async () => {
  const seen = new Map();
  const sample = () => {
    try {
      for (const a of document.getAnimations()) {
        const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
        const type = a.constructor.name === 'CSSAnimation' ? 'css' : a.constructor.name === 'CSSTransition' ? 'transición' : 'js';
        const props = a.effect && a.effect.getKeyframes ? [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((x) => !['offset','easing','composite','computedOffset'].includes(x))))].slice(0, 5) : [];
        const name = a.animationName || a.transitionProperty || '';
        const key = type + '|' + name + '|' + props.join(',');
        const e = seen.get(key) || { type, name, props, duration: typeof t.duration === 'number' ? Math.round(t.duration) : null, easing: t.easing || '', count: 0 };
        e.count++; seen.set(key, e);
      }
    } catch (e) {}
  };
  const limit = Math.min(document.documentElement.scrollHeight, 16000);
  for (let y = 0; y < limit; y += 320) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); sample(); }
  window.scrollTo(0, limit); await new Promise((r) => setTimeout(r, 900)); sample();
  return [...seen.values()].sort((a, b) => b.count - a.count).slice(0, 16);
})()`;

// en texto (no función): tsx le mete __name a las funciones con nombre y en el navegador no existe
const SETTLE = `(async () => {
  try { for (const a of document.getAnimations()) { const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : null; if (t && t.iterations !== Infinity) a.finish(); } } catch (e) {}
  const el = document.querySelector('[data-matiz-deep="__KEY__"]');
  const op = () => { let o = 1; for (let n = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
  const t0 = performance.now();
  while (el && op() < 0.97 && performance.now() - t0 < 1600) await new Promise((r) => setTimeout(r, 80));
})()`;

// lo que la limpieza vieja (has-text) habría clicado: si no es un botón de cookies, esa captura está contaminada
const LEGACY = ["#onetrust-accept-btn-handler", "button#accept-cookies", "[data-testid*=cookie] button", "#didomi-notice-agree-button", "[id*=cookie i] button:has-text('Accept')",
  "button:has-text('Accept all cookies')", "button:has-text('Allow all cookies')", "button:has-text('Accept all')", "button:has-text('Accept All')", "button:has-text('Allow all')",
  "button:has-text('Accept')", "button:has-text('I agree')", "button:has-text('Got it')", "button:has-text('Aceptar todo')", "button:has-text('Aceptar')", "button:has-text('OK')"];
const COOKIEISH = /^(accept( all)?( cookies)?|allow all( cookies)?|i agree|agree|got it|aceptar( todo| todas)?|acepto|ok)$/i;
async function legacyClick(page: Page): Promise<string | null> {
  for (const sel of LEGACY) {
    const b = page.locator(sel).first();
    if (!(await b.isVisible({ timeout: 150 }).catch(() => false))) continue;
    const t = ((await b.innerText({ timeout: 500 }).catch(() => "")) || "").replace(/\s+/g, " ").trim();
    return sel.startsWith("#") || sel.startsWith("[data-testid") || COOKIEISH.test(t) ? null : t.slice(0, 80);
  }
  return null;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const mode = (xs: string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

interface RevealRow { tag: string; y: number; parent: string; op: number; dx: number; dy: number; sc: number; opUp: boolean; moved: boolean; scaled: boolean; blur: boolean; clip: boolean; duration: string; easing: string; delay: string; animation: string }

export function summarizeReveal(r: { candidates: number; revealed: RevealRow[] }, anims: RevealSummary["scrollAnimations"]): RevealSummary {
  const rv = r.revealed;
  const kinds = rv.map((x) => (x.clip ? "máscara" : x.blur ? "desenfoque" : x.scaled ? (x.opUp ? "zoom + fundido" : "zoom") : x.moved && x.opUp ? (Math.abs(x.dy) >= Math.abs(x.dx) ? (x.dy > 0 ? "sube + fundido" : "baja + fundido") : "lateral + fundido") : x.moved ? "desliza" : "fundido"));
  // escalonado: hermanos del mismo padre que entran con retrasos distintos
  const byParent = new Map<string, Set<string>>();
  for (const x of rv) {
    const s = byParent.get(x.parent) ?? new Set();
    if (x.delay && x.delay !== "0s") s.add(x.delay);
    byParent.set(x.parent, s);
  }
  const stagger = [...byParent.values()].filter((s) => s.size >= 2).length;
  const moving = rv.filter((x) => x.moved);
  const durs = rv.map((x) => x.duration).filter((d) => d && d !== "0s");
  return {
    candidates: r.candidates,
    revealed: rv.length,
    pattern: mode(kinds) ?? "—",
    distance: median(moving.map((x) => Math.round(Math.hypot(x.dx, x.dy)))),
    duration: mode(durs),
    easing: mode(rv.filter((x) => x.duration !== "0s").map((x) => x.easing)),
    stagger,
    fromOpacity: median(rv.filter((x) => x.opUp).map((x) => x.op)),
    scale: median(rv.filter((x) => x.scaled).map((x) => x.sc)),
    blur: rv.some((x) => x.blur),
    clip: rv.some((x) => x.clip),
    samples: rv.slice(0, 12).map((x) => ({ tag: x.tag, y: x.y, dy: x.dy, op: x.op, duration: x.duration, delay: x.delay })),
    scrollAnimations: anims,
  };
}

// ---------- estados: hover y focus ----------
const SNAP = `(el) => {
  const P = ['backgroundColor','color','borderTopColor','boxShadow','transform','opacity','textDecorationLine','filter','backgroundImage','outlineStyle','outlineColor','outlineWidth','scale','translate'];
  const pick = (e) => { const s = getComputedStyle(e); const o = {}; for (const p of P) o[p] = s[p]; const r = e.getBoundingClientRect(); o.__w = Math.round(r.width); o.__h = Math.round(r.height); return o; };
  const kids = [...el.querySelectorAll('svg, span, i, img, div, p')].slice(0, 8);
  const dur = (e) => { const s = getComputedStyle(e); const d = s.transitionDuration.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 1 : 1000)); const l = s.transitionDelay.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 1 : 1000)); return Math.max(0, ...d.map((v, i) => v + (l[i % l.length] || 0))); };
  return { self: pick(el), kids: kids.map(pick), wait: Math.max(dur(el), ...kids.map(dur)) };
}`;

const LABEL: Record<string, string> = {
  backgroundColor: "fondo", color: "texto", borderTopColor: "borde", boxShadow: "sombra", transform: "transform", opacity: "opacidad",
  textDecorationLine: "subrayado", filter: "filtro", backgroundImage: "degradado", outlineStyle: "outline", outlineColor: "color de outline",
  outlineWidth: "ancho de outline", scale: "escala", translate: "desplazamiento", __w: "ancho", __h: "alto",
};

type Snap = { self: Record<string, string | number>; kids: Array<Record<string, string | number>>; wait: number };

function diff(a: Snap, b: Snap): StateDelta["changes"] {
  const out: StateDelta["changes"] = [];
  for (const k of Object.keys(a.self)) {
    if (String(a.self[k]) === String(b.self[k])) continue;
    if ((k === "__w" || k === "__h") && Math.abs(+a.self[k] - +b.self[k]) < 2) continue;
    out.push({ prop: LABEL[k] ?? k, from: String(a.self[k]).slice(0, 140), to: String(b.self[k]).slice(0, 140), on: "self" });
  }
  // un hijo (flecha, ícono, subrayado animado) que cambia: solo lo primero que se mueva
  a.kids.forEach((ka, i) => {
    const kb = b.kids[i];
    if (!kb || out.filter((x) => x.on === "hijo").length >= 2) return;
    for (const k of ["transform", "opacity", "color", "backgroundColor", "translate", "scale", "__w"]) {
      if (String(ka[k]) === String(kb[k])) continue;
      if (k === "__w" && Math.abs(+ka[k] - +kb[k]) < 2) continue;
      out.push({ prop: LABEL[k] ?? k, from: String(ka[k]).slice(0, 100), to: String(kb[k]).slice(0, 100), on: "hijo" });
      break;
    }
  });
  return out;
}

async function crop(page: Page, key: string, file: string, maxH = 860): Promise<boolean> {
  const loc = page.locator(`[data-matiz-deep="${key}"]`).first();
  // la caja se mide hasta que deja de moverse (scroll suave, menús que se reacomodan)
  let box = await loc.boundingBox().catch(() => null);
  for (let i = 0; i < 6 && box; i++) {
    await page.waitForTimeout(90);
    const b2 = await loc.boundingBox().catch(() => null);
    if (b2 && Math.abs(b2.x - box.x) < 1 && Math.abs(b2.y - box.y) < 1 && Math.abs(b2.width - box.width) < 1) break;
    box = b2;
  }
  if (!box || box.width < 4 || box.height < 4) return false;
  const vp = page.viewportSize()!;
  const pad = 16;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const w = Math.min(vp.width - x, box.width + pad * 2);
  const h = Math.min(vp.height - y, box.height + pad * 2, maxH);
  if (w < 8 || h < 8) return false;
  const buf = await page.screenshot({ type: "png", clip: { x, y, width: w, height: h }, animations: "disabled" }).catch(() => null);
  if (!buf) return false;
  writeFileSync(file, buf);
  return true;
}

async function center(page: Page, key: string) {
  await page
    .evaluate((k) => {
      const el = document.querySelector(`[data-matiz-deep="${k}"]`);
      if (!el) return;
      if (k === "nav") window.scrollTo(0, 0);
      else el.scrollIntoView({ block: "center", inline: "nearest" });
    }, key)
    .catch(() => {});
  await page.waitForTimeout(380);
  // lo que entra animado (reveal, fade de JS) se espera hasta que el elemento y sus padres estén opacos
  await page.evaluate(SETTLE.replace("__KEY__", key)).catch(() => {});
}

/** Corre el análisis profundo de una URL y lo deja en <shots>/<id>/deep.json. */
export async function deepAnalyze(url: string, id: string, opts: { timeoutMs?: number } = {}): Promise<DeepReport> {
  const b = await getBrowser();
  // aquí el movimiento NO se reduce: es justo lo que se mide
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, userAgent: UA, locale: "en-US", colorScheme: "light", reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  // tope real: cerrar el contexto corta todo lo que esté en vuelo (un Promise.race afuera no lo detenía
  // y la tarea "vencida" seguía escribiendo y borrando recortes después)
  let expired = false;
  const timer = opts.timeoutMs ? setTimeout(() => { expired = true; ctx.close().catch(() => {}); }, opts.timeoutMs) : undefined;
  const dir = join(SHOTS, id, "deep");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (res && res.status() >= 400) throw new Error(`HTTP ${res.status()}`);
    await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    // sin scroll suave: con él, la caja medida y la foto no coinciden
    await page.addStyleTag({ content: "html, body { scroll-behavior: auto !important; }" }).catch(() => {});
    const legacy0 = await legacyClick(page);
    await clearOverlays(page);
    await page.evaluate(PRE).catch(() => 0);
    const anims = ((await page.evaluate(SLOW_SCROLL).catch(() => [])) ?? []) as RevealSummary["scrollAnimations"];
    const post = (await page.evaluate(POST).catch(() => ({ candidates: 0, revealed: [] }))) as { candidates: number; revealed: RevealRow[] };
    // la captura vieja limpiaba también DESPUÉS del scroll, con el contenido perezoso ya cargado
    const legacy = legacy0 ?? (await legacyClick(page));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(700);
    await clearOverlays(page);
    await page.evaluate(() => document.fonts?.ready).catch(() => {});

    const data = (await page.evaluate(DEEP)) as Record<string, unknown> & { marks: Array<{ key: string; kind: string; label: string }> };
    const crops: Record<string, string> = {};
    const states: StateDelta[] = [];
    // los widgets de chat y banners que llegan tarde no deben salir en los recortes
    await clearOverlays(page);
    for (const m of data.marks) {
      await center(page, m.key);
      await page.mouse.move(2, 2);
      await page.waitForTimeout(120);
      const file = join(dir, `${m.key}.png`);
      if (await crop(page, m.key, file, m.kind === "nav" ? 200 : 860)) crops[m.key] = `${m.key}.png`;
      const hoverable = m.kind === "button" || m.kind === "card" || m.kind === "link" || m.kind === "badge";
      const focusable = m.kind === "input";
      if (!hoverable && !focusable) continue;
      const loc = page.locator(`[data-matiz-deep="${m.key}"]`).first();
      const before = (await loc.evaluate(new Function(`return (${SNAP})`)() as (el: Element) => Snap).catch(() => null)) as Snap | null;
      if (!before) continue;
      if (focusable) await loc.focus({ timeout: 1500 }).catch(() => {});
      else await loc.hover({ timeout: 1500, force: true }).catch(() => {});
      const wait = Math.min(1000, Math.max(160, before.wait + 120));
      await page.waitForTimeout(wait);
      const after = (await loc.evaluate(new Function(`return (${SNAP})`)() as (el: Element) => Snap).catch(() => null)) as Snap | null;
      if (!after) continue;
      const changes = diff(before, after);
      if (changes.length) {
        const f2 = join(dir, `${m.key}-${focusable ? "focus" : "hover"}.png`);
        if (await crop(page, m.key, f2)) crops[`${m.key}-${focusable ? "focus" : "hover"}`] = `${m.key}-${focusable ? "focus" : "hover"}.png`;
      }
      states.push({ key: m.key, kind: m.kind, state: focusable ? "focus" : "hover", changes, waitMs: wait });
      await page.mouse.move(2, 2);
      if (focusable) await loc.blur().catch(() => {});
    }
    const report: DeepReport = { version: 1, url: page.url(), measuredAt: new Date().toISOString(), ...data, reveal: summarizeReveal(post, anims), states, crops, legacyClick: legacy };
    if (expired) throw new Error(`tiempo agotado (${Math.round((opts.timeoutMs ?? 0) / 1000)} s)`);
    writeFileSync(join(SHOTS, id, "deep.json"), JSON.stringify(report));
    return report;
  } catch (e) {
    if (expired) throw new Error(`tiempo agotado (${Math.round((opts.timeoutMs ?? 0) / 1000)} s)`);
    throw e;
  } finally {
    clearTimeout(timer);
    await ctx.close().catch(() => {});
  }
}
