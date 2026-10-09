// Páginas internas: la portada casi nunca tiene precios, formularios de registro ni casos de
// cliente. Se descubren en los enlaces del propio sitio y se capturan como registros aparte.

export const PAGE_TYPES = [
  "home", "pricing", "about", "customers", "features", "blog", "changelog", "signup", "login",
  "careers", "contact", "integrations", "security", "enterprise", "docs",
] as const;
export type PageType = (typeof PAGE_TYPES)[number];

/** Orden de prioridad al elegir qué capturar de cada sitio. */
export const PAGE_PRIORITY: PageType[] = [
  "pricing", "signup", "about", "customers", "features", "changelog", "blog", "integrations",
  "careers", "contact", "security", "enterprise", "login", "docs",
];

const RULES: Array<[PageType, RegExp]> = [
  ["pricing", /^\/(pricing|plans|precios|planes|tarifas)(\/|$)/],
  ["signup", /^\/(signup|sign-up|register|join|registro|registrate|get-started|start)(\/|$)/],
  ["login", /^\/(login|log-in|signin|sign-in|ingresar|iniciar-sesion)(\/|$)/],
  ["about", /^\/(about|about-us|company|nosotros|quienes-somos|acerca)(\/|$)/],
  ["customers", /^\/(customers|case-studies|stories|clientes|casos|testimonials)(\/|$)/],
  ["features", /^\/(features|product|products|platform|funcionalidades|caracteristicas|producto)(\/|$)/],
  ["changelog", /^\/(changelog|releases|updates|whats-new|novedades)(\/|$)/],
  ["blog", /^\/(blog|news|journal|articles|noticias)(\/?$)/],
  ["integrations", /^\/(integrations|apps|marketplace|integraciones)(\/?$)/],
  ["careers", /^\/(careers|jobs|join-us|empleos|trabaja-con-nosotros)(\/|$)/],
  ["contact", /^\/(contact|contact-us|contacto|contact-sales|demo|book-a-demo)(\/|$)/],
  ["security", /^\/(security|trust|seguridad)(\/|$)/],
  ["enterprise", /^\/(enterprise|empresas)(\/|$)/],
  ["docs", /^\/(docs|documentation|documentacion)(\/?$)/],
];

/** Tipo de página por su ruta. Ignora el prefijo de idioma (/es, /en-us, /es-co…). */
export function pageTypeFromUrl(url: string): PageType | undefined {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return undefined;
  }
  path = path.replace(/^\/[a-z]{2}(-[a-z]{2})?(?=\/)/, "");
  if (path === "/" || path === "") return "home";
  for (const [type, re] of RULES) if (re.test(path)) return type;
  return undefined;
}

const bareHost = (h: string) => h.replace(/^www\./, "").toLowerCase();

/** De los enlaces de una portada, el mejor candidato por tipo (misma raíz de dominio, ruta más corta). */
export function pickInnerPages(homeUrl: string, hrefs: string[], max = 6): Array<{ type: PageType; url: string }> {
  const home = new URL(homeUrl);
  const best = new Map<PageType, string>();
  for (const href of hrefs) {
    let u: URL;
    try {
      u = new URL(href, home);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol) || bareHost(u.hostname) !== bareHost(home.hostname)) continue;
    const type = pageTypeFromUrl(u.href);
    if (!type || type === "home") continue;
    const clean = `${u.origin}${u.pathname.replace(/\/+$/, "") || "/"}`;
    const prev = best.get(type);
    if (!prev || clean.length < prev.length) best.set(type, clean);
  }
  return PAGE_PRIORITY.filter((t) => best.has(t)).slice(0, max).map((type) => ({ type, url: best.get(type)! }));
}
