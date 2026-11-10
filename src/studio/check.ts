// Chequeo de una pantalla del Estudio. TODO es medición: lo que la sonda midió en el
// navegador, la paleta real de la pantalla contra el tema del tablero y, si hay una
// referencia del corpus, la misma crítica que se usa contra un localhost.
import type { Dna } from "../types.js";
import { critique } from "../analysis/critique.js";
import { deltaE, parseColor, tonalScale, toOklch } from "../analysis/color.js";
import { COLOR_ROLES, type BoardTheme } from "./theme.js";

export interface ElementDesc {
  tag: string;
  text: string;
  classes: string;
  path: string;
  box: [number, number, number, number];
  block?: boolean;
}

export interface ProbeResult {
  width: number;
  height: number;
  tailwind: boolean;
  empty: boolean;
  issues: {
    overflow: { scrollWidth: number; viewport: number; culprits: Array<ElementDesc & { right: number }> };
    brokenImages: string[];
    lowContrast: Array<ElementDesc & { ratio: number; min: number; fg: string; bg: string; size: number }>;
    missingFonts: string[];
    smallTargets: ElementDesc[];
    /** Textos que se pisan (porcentaje del más chico tapado). */
    overlaps?: Array<{ a: ElementDesc; b: ElementDesc; share: number }>;
  };
  targets: ElementDesc[];
}

export interface TellEx { tag: string; text: string; path: string; box: [number, number, number, number] }
export interface Tell { count: number; examples: TellEx[]; [k: string]: unknown }
export type Tells = { fonts?: { body: string; heading: string }; [k: string]: Tell | { body: string; heading: string } | undefined };

export type Severity = "high" | "medium" | "low";
export interface StudioFinding {
  severity: Severity;
  area: string;
  message: string;
  where?: string;
  fix: string;
}

const where = (e: ElementDesc) => `<${e.tag}>${e.text ? ` «${e.text.slice(0, 50)}»` : ""} (${e.path}${e.classes ? ` · ${e.classes}` : ""})`;

/** Problemas de render que se pueden afirmar sin ninguna referencia. Van en cada put_screen. */
export function probeFindings(p: ProbeResult): StudioFinding[] {
  const f: StudioFinding[] = [];
  if (!p.tailwind)
    f.push({ severity: "high", area: "render", message: "Tailwind no se aplicó: la pantalla salió sin estilos.", fix: "Revisa que el HTML no traiga su propio <html>/<script> de Tailwind; Matiz lo inyecta solo." });
  if (p.empty) f.push({ severity: "high", area: "render", message: "La pantalla salió vacía.", fix: "Manda el contenido del <body> (no solo estilos o scripts)." });
  const o = p.issues.overflow;
  if (o.scrollWidth > o.viewport + 1)
    f.push({
      severity: "high",
      area: "overflow",
      message: `Desborde horizontal: el contenido mide ${o.scrollWidth}px en un viewport de ${o.viewport}px (aparece scroll lateral).`,
      where: o.culprits.slice(0, 3).map((c) => `${where(c)} termina en x=${c.right}`).join(" · ") || undefined,
      fix: "Quita anchos fijos (w-[...px], min-w) del culpable; usa w-full/max-w-* y flex-wrap o grid con columnas que colapsen.",
    });
  for (const c of p.issues.lowContrast.slice(0, 6))
    f.push({
      severity: c.ratio < c.min - 1 ? "high" : "medium",
      area: "contrast",
      message: `Contraste ${c.ratio}:1 (mínimo ${c.min}:1 para ${c.size}px): ${c.fg} sobre ${c.bg}.`,
      where: where(c),
      fix: "Usa text-foreground o text-muted del tablero, o un fondo con más contraste.",
    });
  const ov = p.issues.overlaps ?? [];
  if (ov.length)
    f.push({
      severity: ov.some((o) => o.share >= 40) ? "high" : "medium",
      area: "overlap",
      message: `${ov.length} par(es) de textos encimados.`,
      where: ov.slice(0, 3).map((o) => `«${o.a.text.slice(0, 30)}» pisa «${o.b.text.slice(0, 30)}» (${o.share}%) — ${o.a.path}`).join(" · "),
      fix: "Revisa posiciones absolutas y alturas fijas: en anchos chicos usa flujo normal (flex/grid) o esconde las etiquetas secundarias.",
    });
  if (p.issues.brokenImages.length)
    f.push({ severity: "medium", area: "images", message: `${p.issues.brokenImages.length} imagen(es) no cargaron.`, where: p.issues.brokenImages.slice(0, 3).join(" · "), fix: "Usa URLs https públicas o un placeholder (div con bg-surface y aspect-ratio)." });
  if (p.issues.missingFonts.length)
    f.push({ severity: "medium", area: "typography", message: `Fuentes del tablero que no cargaron: ${p.issues.missingFonts.join(", ")}.`, fix: "Sin internet o la familia no está en Google Fonts: cámbiala en create_board (fonts) por una libre." });
  if (p.issues.smallTargets.length)
    f.push({
      severity: "medium",
      area: "touch",
      message: `${p.issues.smallTargets.length} objetivo(s) táctiles de menos de 32px.`,
      where: p.issues.smallTargets.slice(0, 3).map((e) => `${where(e)} ${e.box[2]}×${e.box[3]}`).join(" · "),
      fix: "Botones y enlaces sueltos de al menos 44px de alto en móvil (py-3, min-h-11).",
    });
  return f;
}

const DEFAULT_FAMILIES = /^(inter|roboto|arial|helvetica|helvetica neue|system-ui|-apple-system|segoe ui|open sans|sans-serif|ui-sans-serif)$/i;
const exWhere = (t: Tell) => t.examples.map((e) => `<${e.tag}>${e.text ? ` «${e.text.slice(0, 40)}»` : ""} (${e.path})`).join(" · ") || undefined;

/**
 * Señales de plantilla: tratamientos que un modelo pone por defecto sea cual sea el encargo.
 * Cada una es legítima si el brief la pide; por eso van como aviso (low/medium) con el conteo
 * y el lugar, y el arreglo siempre es "decide": o la justificas o la quitas.
 */
export function tellFindings(tells: Tells, theme: BoardTheme): StudioFinding[] {
  const f: StudioFinding[] = [];
  const add = (id: string, severity: Severity, message: (t: Tell) => string, fix: string) => {
    const t = tells[id] as Tell | undefined;
    if (t) f.push({ severity, area: `tell:${id}`, message: message(t), where: exWhere(t), fix });
  };
  add("gradient", "medium", (t) => `${t.count} degradado(s) de adorno${(t.purple as number) ? `, ${t.purple} hacia el morado` : ""}: es el recurso por defecto de una página generada.`, "Usa color plano del tablero, o deja UN degradado si es la idea central de la pantalla.");
  add("eyebrow", "low", (t) => `${t.count} etiqueta(s) en mayúsculas encima de un título.`, "Quita las que no aportan información; el título ya dice de qué va la sección.");
  add("accent-word", "low", (t) => `${t.count} titular(es) con una sola palabra en otro color o en cursiva.`, "Deja el titular en un solo tratamiento; el énfasis va en lo que dice.");
  add("card-kit", "medium", (t) => `${t.groups} bloques de contenido picados en tarjetas idénticas (mismo radio, misma sombra).`, "Varía la forma según el contenido: una lista, una tabla, un bloque destacado y dos menores, texto corrido. No todo es una tarjeta.");
  add("one-radius", "low", (t) => `Un solo radio (${t.radius}px) en ${t.count} elementos, sin jerarquía.`, "Usa 2–3 radios según el tamaño (contenedor > tarjeta > control) o ninguno.");
  add("one-shadow", "low", (t) => `La misma sombra bajo ${t.count} elementos.`, "Reserva la sombra para lo que flota (menús, modales); separa lo demás con borde o fondo.");
  add("emoji-icon", "medium", (t) => `${t.count} emoji usados como ícono.`, "Usa SVG en línea con el trazo y color del tablero, o quita el ícono.");
  add("arrow-suffix", "low", (t) => `${t.count} enlaces o botones terminan en flecha.`, "Deja la flecha en uno como mucho; el texto del botón ya dice la acción.");
  add("numbered", "low", (t) => `${t.count} marcadores 01/02/03.`, "Solo si el contenido es de verdad una secuencia (pasos, cronología); si no, quítalos.");
  add("middot", "low", (t) => `${t.count} líneas de metadatos unidas con «·».`, "Preséntalos como dato (etiqueta + valor) o redúcelos a lo que el usuario necesita.");
  add("glass", "low", (t) => `${t.count} panel(es) de vidrio (backdrop-filter).`, "Fondo sólido del tablero salvo que el desenfoque muestre algo que importa detrás.");
  add("long-lines", "medium", (t) => `${t.count} párrafo(s) con más de 85 caracteres por línea.`, "Limita el ancho del texto (max-w-prose / max-w-2xl): 45–75 caracteres por línea se leen mejor.");
  add("type-sizes", "low", (t) => `${t.count} tamaños de letra distintos (${(t.sizes as number[]).join(", ")}px): no hay escala.`, "Quédate con 5–7 tamaños de una escala y reúsalos.");
  add("all-centered", "low", (t) => `${t.count} de ${t.of} bloques de texto centrados.`, "Centra el hero o el cierre; el contenido de lectura va alineado a la izquierda.");
  add("animate-all", "low", (t) => `${t.count} elementos con animación de entrada.`, "Un solo momento orquestado (la carga) llega mejor que animar cada bloque.");
  const fonts = tells.fonts;
  if (fonts && !theme.source && DEFAULT_FAMILIES.test(fonts.body) && DEFAULT_FAMILIES.test(fonts.heading))
    f.push({ severity: "low", area: "tell:default-font", message: `Títulos y texto en «${fonts.heading}»: la familia por defecto, y el tablero no parte de una marca.`, fix: "Elige la tipografía a propósito: suggest_type_pairings (free_only) da pares reales del corpus; fíjala con create_board." });
  return f;
}

/** Colores del sistema: los roles del tema + la escala del primario. */
export function systemColors(t: BoardTheme): string[] {
  const out = COLOR_ROLES.map((r) => t.colors[r]).filter((c): c is string => !!c);
  const p = parseColor(t.colors.primary);
  if (p) out.push(...Object.values(tonalScale(p)));
  return out;
}

/**
 * Colores con peso real en la pantalla que no son del sistema del tablero. Un neutro de
 * Tailwind por defecto (gray-500) cuenta: es justo el error de olvidar text-muted.
 */
export function offPalette(d: Dna, t: BoardTheme, threshold = 0.06): Array<{ hex: string; weight: number; name: string; nearest: string; distance: number }> {
  const sys = systemColors(t)
    .map((h) => ({ h, c: parseColor(h)! }))
    .filter((x) => x.c);
  const out: Array<{ hex: string; weight: number; name: string; nearest: string; distance: number }> = [];
  for (const s of d.palette.swatches) {
    if (s.weight < 0.015) continue;
    const c = parseColor(s.hex);
    if (!c) continue;
    // blanco y negro puros se toleran (texto sobre primario, sombras)
    const { L, C } = toOklch(c);
    if (C < 0.01 && (L > 0.985 || L < 0.03)) continue;
    let best = { h: "", d: Infinity };
    for (const x of sys) {
      const dd = deltaE(c, x.c);
      if (dd < best.d) best = { h: x.h, d: dd };
    }
    if (best.d > threshold) out.push({ hex: s.hex, weight: +s.weight.toFixed(3), name: s.es, nearest: best.h, distance: +best.d.toFixed(3) });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

const norm = (f?: string) => (f ?? "").toLowerCase().replace(/["']/g, "").trim();

export function systemFindings(d: Dna, t: BoardTheme): StudioFinding[] {
  const f: StudioFinding[] = [];
  const off = offPalette(d, t);
  if (off.length)
    f.push({
      severity: off.some((o) => o.weight >= 0.05) ? "medium" : "low",
      area: "palette",
      message: `${off.length} color(es) fuera del sistema del tablero: ${off.slice(0, 5).map((o) => `${o.hex} (${o.name}, ${Math.round(o.weight * 100)}%)`).join(", ")}.`,
      fix: `Cámbialos por el rol más cercano del tablero (${off.slice(0, 3).map((o) => `${o.hex}→${o.nearest}`).join(", ")}). Si el color es intencional, agrégalo al tema con create_board.`,
    });
  const h = d.typography.heading ?? d.typography.display;
  if (h && norm(h.family) !== norm(t.fonts.heading) && norm(h.family) !== norm(t.fonts.body))
    f.push({ severity: "medium", area: "typography", message: `Los títulos usan «${h.family}»; el tablero dice «${t.fonts.heading}».`, fix: "Usa font-heading en los títulos (o quita la familia escrita a mano)." });
  const b = d.typography.body;
  if (b && norm(b.family) !== norm(t.fonts.body) && norm(b.family) !== norm(t.fonts.heading))
    f.push({ severity: "low", area: "typography", message: `El texto usa «${b.family}»; el tablero dice «${t.fonts.body}».`, fix: "Deja font-sans (el texto hereda la del tablero)." });
  if (t.radius > 0 && !d.shape.pill && Math.abs(d.shape.radius - t.radius) > 6)
    f.push({ severity: "low", area: "shape", message: `Radio típico ${d.shape.radius}px; el tablero usa ${t.radius}px.`, fix: "Usa rounded-brand en tarjetas, botones e inputs." });
  return f;
}

export interface CheckReport {
  /** Cuántas señales de plantilla distintas tiene (0 = ninguna de las 16 que se miden). */
  tells: number;
  summary: string;
  score: number;
  findings: StudioFinding[];
  reference?: { ref_id: string; name: string; composition: { similarity: number; missing: string[]; extra: string[] } };
  measured?: {
    theme: Dna["theme"];
    palette: Record<string, string | undefined>;
    heading?: string;
    body?: string;
    radius: number;
    contentWidth: number;
    sequence: string[];
  };
}

const WEIGHT: Record<Severity, number> = { high: 12, medium: 5, low: 2 };

export function checkScreen(o: {
  probe: ProbeResult;
  /** Sin ADN (pantalla sin bloques de texto) se mide lo demás: render, responsive y señales. */
  dna?: Dna;
  theme: BoardTheme;
  ref?: { id: string; name: string; dna: Dna };
  tells?: Tells;
  /** El mismo HTML medido en otros anchos (responsive): solo aporta sus problemas de render. */
  responsive?: Array<{ viewport: string; width: number; probe: ProbeResult }>;
}): CheckReport {
  const findings = [...probeFindings(o.probe), ...(o.dna ? systemFindings(o.dna, o.theme) : []), ...(o.tells ? tellFindings(o.tells, o.theme) : [])];
  for (const r of o.responsive ?? [])
    for (const x of probeFindings(r.probe).filter((x) => ["overflow", "overlap", "touch", "render"].includes(x.area)))
      findings.push({ ...x, area: `${x.area}@${r.viewport}`, message: `A ${r.width}px: ${x.message}` });
  let reference: CheckReport["reference"];
  if (o.ref && o.dna) {
    const r = critique(o.dna, o.ref.dna, o.ref.name);
    // el contraste ya lo midió la sonda texto por texto: de la crítica se toma lo de la referencia
    for (const x of r.findings.filter((x) => x.area !== "contrast"))
      findings.push({ severity: x.severity, area: `ref:${x.area}`, message: x.message, where: `tuyo: ${x.yours} · ${o.ref.name}: ${x.reference}`, fix: x.fix });
    reference = { ref_id: o.ref.id, name: o.ref.name, composition: r.composition };
  }
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const score = Math.max(0, 100 - findings.reduce((s, x) => s + WEIGHT[x.severity], 0));
  const n = (s: Severity) => findings.filter((x) => x.severity === s).length;
  const tellCount = findings.filter((x) => x.area.startsWith("tell:")).length;
  return {
    tells: tellCount,
    summary: findings.length ? `${n("high")} alta(s), ${n("medium")} media(s), ${n("low")} baja(s)${tellCount ? `, de ellas ${tellCount} señal(es) de plantilla` : ""}. Puntaje ${score}/100.` : "Sin problemas medibles. Puntaje 100/100.",
    score,
    findings,
    reference,
    measured: o.dna
      ? (() => {
          const d = o.dna!;
          const t = d.typography;
          const h = t.heading ?? t.display;
          return {
            theme: d.theme,
            palette: { background: d.palette.background, surface: d.palette.surface, text: d.palette.text, muted: d.palette.mutedText, accent: d.palette.accent, border: d.palette.border },
            heading: h && `${h.family} ${Math.round(h.size)}px`,
            body: t.body && `${t.body.family} ${t.body.size}px`,
            radius: d.shape.radius,
            contentWidth: d.layout.contentWidth,
            sequence: d.sequence,
          };
        })()
      : undefined,
  };
}

/** El elemento que señala un clic del lienzo: la caja MÁS PEQUEÑA que contiene el punto. */
export function pickTarget(targets: ElementDesc[], x: number, y: number): ElementDesc | undefined {
  let best: ElementDesc | undefined;
  for (const t of targets) {
    const [l, tp, w, h] = t.box;
    if (x < l || x > l + w || y < tp || y > tp + h) continue;
    if (!best || w * h < best.box[2] * best.box[3]) best = t;
  }
  return best;
}
