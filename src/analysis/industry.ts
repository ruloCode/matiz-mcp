// Industria inferida del texto real del sitio (título, descripción, titulares).
// Es un respaldo: las etiquetas que pone el humano al capturar mandan.

const RULES: Array<[string, RegExp]> = [
  ["ai", /\b(ai|a\.i\.|artificial intelligence|llm|agents?|copilot|gpt|machine learning|inteligencia artificial|agentes?)\b/i],
  ["devtools", /\b(developers?|api|sdk|deploy|cli|open source|infrastructure|database|backend|frontend|code|desarrolladores)\b/i],
  ["fintech", /\b(payments?|banking|bank|card|invoice|invoicing|finance|treasury|spend|crypto|wallet|pagos|banco|tarjeta|finanzas|facturación)\b/i],
  ["productivity", /\b(notes?|docs|workspace|tasks?|projects?|calendar|productivity|collaborat|team|notas|tareas|productividad|equipos?)\b/i],
  ["design", /\b(design|designers?|prototyp|figma|creative|diseño|diseñadores|creativ)\b/i],
  ["ecommerce", /\b(shop now|add to cart|cart|free shipping|online store|ecommerce|e-commerce|tienda|carrito|envío gratis|compra ahora)\b/i],
  ["health", /\b(health|wellness|meditation|sleep|fitness|clinic|medical|salud|bienestar|clínica|médic)\b/i],
  ["education", /\b(learn|course|students?|education|lessons?|academy|aprende|cursos?|estudiantes|educación|academia)\b/i],
  ["marketing", /\b(marketing|seo|analytics|growth|campaigns?|crm|sales|ventas|campañas)\b/i],
  ["media", /\b(podcast|video|music|stream|news|magazine|editorial|música|noticias|revista)\b/i],
  ["travel", /\b(travel|hotel|flights?|booking|stays|viajes?|vuelos?|reservas?)\b/i],
  ["agency", /\b(agency|studio|we craft|we design|our work|agencia|estudio creativo|nuestro trabajo)\b/i],
  ["hardware", /\b(device|hardware|headphones|speaker|wearable|ring|camera|dispositivo)\b/i],
];

export function inferIndustry(text: string): string[] {
  const scores = RULES.map(([name, re]) => {
    const g = new RegExp(re.source, "gi");
    return { name, n: (text.match(g) ?? []).length };
  })
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.n - a.n);
  return scores.slice(0, 2).map((x) => x.name);
}
