// Documento HTML de una pantalla del Estudio: el fragmento que escribe el agente + Tailwind v4
// (vendorizado, sin CDN) + el @theme del tablero + las fuentes. Lo mismo se usa para medir
// en Chromium y para la vista en vivo del lienzo, así lo que se mide es lo que se ve.
import { fontLinks, themeCss, type BoardTheme } from "./theme.js";

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900, mobile: false, scale: 1 },
  tablet: { width: 834, height: 1112, mobile: true, scale: 2 },
  mobile: { width: 390, height: 844, mobile: true, scale: 2 },
} as const;
export type ViewportName = keyof typeof VIEWPORTS;

export const TAILWIND_PATH = "/__matiz/tailwind.js";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Separa lo que el agente mandó: un fragmento de <body> (lo normal) o un documento completo.
 * Del <head> se conservan solo <style> y hojas de Google Fonts; lo demás (scripts externos,
 * metas, <base>) se descarta para que el documento lo arme siempre Matiz.
 */
export function splitHtml(html: string): { head: string; body: string; bodyAttrs: string } {
  const src = html.trim();
  const bodyMatch = src.match(/<body(?=[\s>])([^>]*)>([\s\S]*?)(<\/body>|$)/i);
  if (!bodyMatch) return { head: "", body: src.replace(/<\/?(?:html|head)(?=[\s>])[^>]*>/gi, "").replace(/<!doctype[^>]*>/gi, ""), bodyAttrs: "" };
  const headMatch = src.match(/<head(?=[\s>])[^>]*>([\s\S]*?)<\/head>/i);
  const head = headMatch
    ? [...headMatch[1].matchAll(/<style[\s\S]*?<\/style>|<link[^>]+fonts\.googleapis\.com[^>]*>/gi)].map((m) => m[0]).join("\n")
    : "";
  const bodyAttrs = bodyMatch[1].replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return { head, body: bodyMatch[2], bodyAttrs };
}

/** CSP del documento: scripts solo los propios (Tailwind) e inline; sin red salvo fuentes e imágenes. */
export function screenCsp(assetOrigin: string): string {
  return [
    "default-src 'none'",
    `script-src ${assetOrigin} 'unsafe-inline'`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com data:",
    "img-src https: data: blob:",
    "media-src https: data: blob:",
    "connect-src 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
  ].join("; ");
}

/** Destinos de navegación de una pantalla: `data-go="Nombre de otra pantalla"` en cualquier elemento. */
export function screenLinks(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/\sdata-go\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)) out.add(slugify(m[1] ?? m[2]));
  return [...out];
}

/**
 * Navegación del prototipo. En el lienzo ("post") el clic en un data-go avisa a la página que
 * contiene el iframe; exportado ("file") abre el HTML hermano. Los enlaces normales no navegan
 * (una pantalla suelta no tiene a dónde ir).
 */
function navScript(mode: "post" | "file"): string {
  const slug = `(s)=>s.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)`;
  const go = mode === "post" ? `parent.postMessage({matiz:"go",to:to},"*")` : `location.href=to+".html"`;
  return `<script>(()=>{const slug=${slug};document.addEventListener("click",(e)=>{const g=e.target.closest("[data-go]");const a=e.target.closest("a[href]");if(g){e.preventDefault();const to=slug(g.getAttribute("data-go"));${go};}else if(a){e.preventDefault();}},true);const st=document.createElement("style");st.textContent="[data-go]{cursor:pointer}";document.head.appendChild(st);})();</script>`;
}

export function screenDocument(o: { html: string; theme: BoardTheme; title: string; assetOrigin: string; csp?: boolean; nav?: "post" | "file" }): string {
  const { head, body, bodyAttrs } = splitHtml(o.html);
  const fonts = fontLinks(o.theme)
    .map((h) => `<link rel="stylesheet" href="${esc(h)}">`)
    .join("\n");
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${o.csp === false ? "" : `<meta http-equiv="Content-Security-Policy" content="${esc(screenCsp(o.assetOrigin))}">\n`}<title>${esc(o.title)}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<script src="${esc(o.assetOrigin + TAILWIND_PATH)}"></script>
<style type="text/tailwindcss">
${themeCss(o.theme)}
</style>
${head}
</head>
<body${bodyAttrs}>
${body}
${o.nav ? navScript(o.nav) : ""}
</body>
</html>`;
}

/** slug estable para nombres de tablero/pantalla: "Pricing · Variante B" → "pricing-variante-b". */
export function slugify(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "pantalla"
  );
}
