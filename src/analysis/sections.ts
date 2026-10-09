// Clasifica los bloques de una página en tipos de sección (hero, pricing, faq…).
// Reglas con puntaje y motivos visibles: el agente puede ver POR QUÉ algo es "pricing".
import type { RawSection, SectionType } from "../types.js";

export const SECTION_TYPES: SectionType[] = [
  "banner", "navbar", "hero", "logos", "features", "feature-split", "bento", "steps", "stats",
  "testimonials", "pricing", "comparison", "faq", "cta", "newsletter", "integrations", "team",
  "blog", "contact", "gallery", "video", "showcase", "footer", "content",
];

/** Sinónimos es/en para buscar por tipo de sección en lenguaje natural. */
export const SECTION_SYNONYMS: Record<SectionType, string[]> = {
  banner: ["banner", "announcement", "anuncio", "barra superior", "topbar"],
  navbar: ["navbar", "nav", "navigation", "header", "menu", "navegación", "cabecera", "encabezado"],
  hero: ["hero", "above the fold", "portada", "cabecera principal", "landing", "headline"],
  logos: ["logos", "logo cloud", "social proof", "trusted by", "clientes", "marcas", "prueba social"],
  features: ["features", "feature grid", "benefits", "características", "funcionalidades", "beneficios"],
  "feature-split": ["feature split", "alternating", "image and text", "media", "zigzag", "imagen y texto"],
  bento: ["bento", "bento grid", "mosaico"],
  steps: ["steps", "how it works", "process", "pasos", "cómo funciona", "proceso"],
  stats: ["stats", "metrics", "numbers", "estadísticas", "métricas", "cifras"],
  testimonials: ["testimonials", "reviews", "quotes", "testimonios", "reseñas", "opiniones"],
  pricing: ["pricing", "plans", "price", "precios", "planes", "tarifas", "suscripción"],
  comparison: ["comparison", "compare", "vs", "table", "comparativa", "comparación", "tabla"],
  faq: ["faq", "questions", "preguntas frecuentes", "preguntas", "dudas", "accordion", "acordeón"],
  cta: ["cta", "call to action", "get started", "llamado a la acción", "empieza"],
  newsletter: ["newsletter", "subscribe", "waitlist", "email signup", "suscribirse", "lista de espera", "boletín"],
  integrations: ["integrations", "apps", "connect", "integraciones", "conectores"],
  team: ["team", "about", "people", "equipo", "nosotros", "quiénes somos"],
  blog: ["blog", "articles", "posts", "news", "artículos", "noticias"],
  contact: ["contact", "form", "contacto", "formulario"],
  gallery: ["gallery", "portfolio", "work", "galería", "portafolio", "trabajos"],
  video: ["video", "demo video", "vídeo"],
  showcase: ["showcase", "product screenshot", "product shot", "producto", "demo"],
  footer: ["footer", "pie de página", "pie"],
  content: ["content", "text", "contenido", "texto"],
};

const has = (text: string, re: RegExp) => re.test(text);
const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

const CURRENCY = /([$€£¥]\s?\d)|(\b\d[\d.,]*\s?(usd|eur|cop|mxn)\b)/gi;
const PERIOD = /(\/\s?(mo|month|mes|yr|year|año|user|usuario|seat)\b)|(\bper (month|user|seat|year|editor|member)\b)|(\b(al|por) mes\b)|(\bpor usuario\b)|(\bbilled (monthly|annually|yearly)\b)|(\bfacturado\b)/gi;
const STATNUM = /\b\d[\d.,]*\s?(%|x|k\+?|m\+?|b\+?|t\+?|\+)(?=[\s.,;]|$)/gi;

interface Ctx {
  index: number;
  total: number;
  viewportH: number;
  pageHeight: number;
  firstContentIdx: number; // primer bloque que no es navbar/banner
}

interface Scored {
  type: SectionType;
  score: number;
  reasons: string[];
}

export function classifySection(s: RawSection, ctx: Ctx): { type: SectionType; confidence: number; reasons: string[] } {
  const t = `${s.headings.join(" ")} ${s.text}`.toLowerCase();
  const c = s.counts;
  const cand: Scored[] = [];
  const add = (type: SectionType, score: number, reason: string) => {
    const hit = cand.find((x) => x.type === type);
    if (hit) {
      hit.score += score;
      hit.reasons.push(reason);
    } else cand.push({ type, score, reasons: [reason] });
  };
  const isLast = ctx.index === ctx.total - 1;
  const short = s.textLength < 320;

  // estructura de página
  if (isBannerLike(s, ctx.index)) add("banner", 0.7, "barra delgada de anuncio arriba");
  if ((s.top < 10 || ((s.tag === "header" || s.tag === "nav") && ctx.index <= 1)) && s.height < 200 && c.link + c.button >= 3)
    add("navbar", 0.8, `${c.link + c.button} enlaces/botones en una franja de ${Math.round(s.height)}px arriba`);
  if ((s.position === "sticky" || s.position === "fixed" || s.tag === "header" || s.tag === "nav") && s.height < 120 && c.link >= 5 && s.textLength < 300)
    add("navbar", 0.7, "barra de navegación fija/sticky");
  if (s.tag === "footer") add("footer", 0.9, "etiqueta <footer>");
  if (isLast && c.link >= 6) add("footer", 0.6, "último bloque con muchos enlaces");
  if (has(t, /©|all rights reserved|derechos reservados|privacy policy|política de privacidad|terms of service/)) add("footer", 0.45, "© / legales");

  // hero: el primer bloque de contenido, grande, con el titular más grande
  if (ctx.index === ctx.firstContentIdx && s.top < ctx.viewportH * 1.1 && s.height >= 280) {
    add("hero", 0.75, "primer bloque de contenido en el primer pantallazo");
    if (c.heading > 0 && (s.headingSizes[0] ?? 0) >= 36) add("hero", 0.2, `titular de ${Math.round(s.headingSizes[0])}px`);
  }

  // conversión
  // pricing exige precio Y periodo ("$20 /mes"); cifras sueltas como "$1.4T" no cuentan
  const prices = count(t, CURRENCY);
  const periods = count(t, PERIOD);
  // un precio suelto ("From $83,990") es una ficha de producto, no una sección de planes:
  // pricing pide varios precios con periodo, o precios + nombres de plan en columnas
  const planWords = has(t, /\bpricing\b|\bplans?\b|\bprecios\b|\bplanes\b|\btarifas\b|\bper (month|user|seat)\b|\bbilled\b/);
  if (prices >= 3 && periods >= 2) add("pricing", 0.6 + Math.min(0.3, periods * 0.06), `${prices} precios con periodo (${periods})`);
  else if (prices >= 2 && periods >= 1 && (s.columns >= 2 || planWords)) add("pricing", 0.5, `${prices} precios con periodo en columnas`);
  else if (prices >= 2 && planWords && s.columns >= 2) add("pricing", 0.45, "precios + nombres de plan en columnas");
  if (planWords && s.columns >= 2 && prices >= 1) add("pricing", 0.15, "título de planes + columnas");
  if (c.table > 0 && (prices >= 1 || has(t, /\bcompare\b|\bcomparar\b|\bvs\.?\b/))) add("comparison", 0.6, "tabla comparativa");
  if (has(t, /\bvs\.?\s|versus|compared to|comparado con|alternativ/) && s.columns >= 2) add("comparison", 0.35, "lenguaje de comparación");

  const questions = count(t, /\?/g);
  if (c.details >= 3) add("faq", 0.7, `${c.details} <details>`);
  if (c.expanders >= 3 && questions >= 3) add("faq", 0.55, `${c.expanders} acordeones con preguntas`);
  if (has(t, /\bfaqs?\b|frequently asked|preguntas frecuentes|common questions|got questions/)) add("faq", 0.55, "título de preguntas frecuentes");
  if (questions >= 4 && s.columns <= 2) add("faq", 0.2, "varias preguntas");

  if (c.blockquote >= 1) add("testimonials", 0.35, "<blockquote>");
  if (has(t, /testimonial|what (our )?(customers|users|people|clients) (say|are saying)|\bloved by\b|wall of love|lo que dicen|customer reviews|reseñas|opiniones de|★|⭐/)) add("testimonials", 0.5, "lenguaje de testimonios");
  const quotes = count(t, /[“”"«»]/g);
  if (quotes >= 2) add("testimonials", quotes >= 4 && s.columns >= 2 ? 0.45 : 0.3, `${quotes} comillas de cita`);
  if (has(t, /customer stories|customer love|real stories|success stories|historias de (clientes|éxito)|casos de éxito/)) add("testimonials", 0.35, "historias de clientes");

  if (c.smallImg >= 5 && s.textLength < 260) add("logos", 0.7, `${c.smallImg} logos pequeños, poco texto`);
  if (s.textLength < 80 && has(t, /trusted by|supported by|backed by|used by|loved by|empresas que confían|confían en/)) add("logos", 0.5, "franja de prueba social (los logos van debajo)");
  if (has(t, /trusted by|used by|backed by|powering|loved by teams|\bcompanies\b|empresas que confían|confían en|\bour customers\b|\bclientes\b/) && c.smallImg >= 3) add("logos", 0.3, "lenguaje de prueba social");

  const stats = count(t, STATNUM);
  if (stats >= 3 && s.textLength < 700) add("stats", 0.6, `${stats} cifras destacadas`);

  if (has(t, /how it works|cómo funciona|\bstep \d|\bpaso \d/)) add("steps", 0.55, "cómo funciona / paso N");
  else if (has(t, /\b01\b.{3,}\b02\b.{3,}\b03\b/) && (s.columns >= 3 || c.li >= 3)) add("steps", 0.4, "tres o más pasos numerados en fila");

  // un email suelto es newsletter SOLO si hay lenguaje de suscripción; si invita a empezar, es un CTA
  const subscribeWords = has(t, /newsletter|subscribe|suscr[ií]bete|waitlist|lista de espera|join the list|early access|product updates|in your inbox|boletín/);
  if (c.emailInput >= 1 && c.textarea === 0 && s.height < 700) add(subscribeWords ? "newsletter" : "cta", subscribeWords ? 0.7 : 0.35, subscribeWords ? "email + lenguaje de suscripción" : "email para empezar");
  else if (subscribeWords) add("newsletter", 0.3, "lenguaje de suscripción");
  const contactWords = has(t, /contact us|get in touch|contáctanos|escríbenos|\bhablemos\b|talk to (sales|us)|habla con ventas/);
  if (c.form >= 1 && c.textarea >= 1) add("contact", 0.6, "formulario con mensaje");
  else if (c.form >= 1 && c.input >= 3 && contactWords) add("contact", 0.6, "formulario con varios campos + lenguaje de contacto");
  else if (c.form >= 1 && c.input >= 3) add("contact", 0.25, "formulario con varios campos");

  // integraciones = la palabra Y una grilla de íconos; mencionarla en un párrafo no alcanza
  if (has(t, /\bintegrations\b|\bintegraciones\b|\bconnects? with\b|\bworks with\b|\bconecta con\b/))
    add("integrations", c.smallImg >= 6 || c.img >= 8 ? 0.7 : 0.25, c.smallImg >= 6 || c.img >= 8 ? "integraciones + grilla de íconos" : "menciona integraciones");
  if (has(t, /\bour team\b|meet the team|nuestro equipo|el equipo detrás|\bleadership\b|quiénes somos/) && (c.img >= 3 || s.cards >= 3) && quotes < 2)
    add("team", 0.6, "equipo con fotos/tarjetas");
  if ((c.article >= 2 || c.time >= 2) && has(t, /blog|read more|leer más|min read|article|artículo|news/)) add("blog", 0.6, "artículos con fecha/lectura");
  if (c.video >= 1 || c.iframe >= 1) add("video", 0.35, "video embebido");
  if (c.img >= 8 && s.textLength < 400 && quotes < 2) add("gallery", 0.45, `${c.img} imágenes con poco texto`);

  // cuerpo de producto
  if (/bento/.test(s.cls)) add("bento", 0.8, "clase bento");
  if (s.cards >= 4 && s.columns >= 2 && s.columns <= 3 && s.layout === "grid") add("bento", 0.3, "grilla de tarjetas de 2–3 columnas");
  if (s.columns >= 3 && s.cards >= 3) add("features", 0.5, `${s.cards} tarjetas en ${s.columns} columnas`);
  if (has(t, /\bfeatures\b|everything you need|\bbenefits\b|características|funcionalidades|todo lo que necesitas/)) add("features", 0.2, "lenguaje de características");
  if (c.heading >= 4 && s.textLength > 300 && s.columns <= 2 && s.cards < 3) add("features", 0.42, `${c.heading} títulos de tarjeta`);
  const media = c.img + c.video + c.canvas;
  if (s.columns === 2 && media >= 1 && s.textLength >= 60 && s.textLength < 1600)
    add("feature-split", c.heading >= 1 ? 0.5 : 0.42, "dos columnas: medio + texto");
  if ((c.img >= 1 || c.video >= 1 || c.canvas >= 1) && s.columns <= 1 && s.height > 500 && s.textLength < 500) add("showcase", 0.4, "pieza visual grande con poco texto");

  // los CTA casi siempre son <a> con forma de botón: enlaces y botones cuentan igual
  const actions = c.button + c.link;
  const convVerb = has(t, /get started|start (for )?free|start now|try (it )?(for )?free|sign up|book a demo|request a demo|get a demo|start (building|your)|join (now|free|today)|download|empieza|comienza|regístrate|prueba gratis|agenda una demo|crea tu cuenta|\bfree trial\b/);
  if (ctx.index !== ctx.firstContentIdx && s.textLength < 420 && actions >= 1 && actions <= 6 && s.columns <= 2 && s.height < 1100 && !c.table && prices < 2) {
    if (convVerb) add("cta", 0.6, "texto corto + verbo de conversión + acción");
    else if (c.heading >= 1 && s.textLength < 260) add("cta", 0.45, "titular corto + acción, sin más contenido");
  } else if (convVerb && short) add("cta", 0.25, "verbo de conversión");

  cand.sort((a, b) => b.score - a.score);
  const best = cand[0];
  if (!best || best.score < 0.4) return { type: "content", confidence: 0.3, reasons: ["sin señales fuertes"] };
  const second = cand[1]?.score ?? 0;
  const confidence = Math.min(0.99, +(best.score / (best.score + second * 0.6 + 0.15)).toFixed(2));
  return { type: best.type, confidence, reasons: best.reasons };
}

function isBannerLike(s: RawSection, index: number) {
  return index <= 1 && s.top < 140 && s.height < 80 && s.textLength < 160 && s.counts.link <= 3 && s.counts.heading === 0;
}

export function classifySections(sections: RawSection[], viewportH: number, pageHeight: number) {
  let firstContentIdx = 0;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const navLike = (s.top < 10 && s.height < 200) || isBannerLike(s, i);
    if (!navLike) {
      firstContentIdx = i;
      break;
    }
  }
  return sections.map((s, index) =>
    classifySection(s, { index, total: sections.length, viewportH, pageHeight, firstContentIdx }),
  );
}

/** Tipo de sección mencionado en una consulta en lenguaje natural (es/en). */
export function sectionTypeFromQuery(q: string): SectionType | undefined {
  const t = q.toLowerCase();
  // gana la mención más temprana ("hero oscuro con video" = hero); a igual posición, la más larga
  let best: { type: SectionType; at: number; len: number } | undefined;
  for (const type of SECTION_TYPES) {
    for (const syn of [type, ...SECTION_SYNONYMS[type]]) {
      const re = new RegExp(`(^|[^\\p{L}])${syn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "u");
      const m = re.exec(t);
      if (!m) continue;
      const at = m.index + m[1].length;
      if (!best || at < best.at || (at === best.at && syn.length > best.len)) best = { type, at, len: syn.length };
    }
  }
  return best?.type;
}
