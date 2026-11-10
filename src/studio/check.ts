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
  };
  targets: ElementDesc[];
}

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
  summary: string;
  score: number;
  findings: StudioFinding[];
  reference?: { ref_id: string; name: string; composition: { similarity: number; missing: string[]; extra: string[] } };
  measured: {
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

export function checkScreen(o: { probe: ProbeResult; dna: Dna; theme: BoardTheme; ref?: { id: string; name: string; dna: Dna } }): CheckReport {
  const findings = [...probeFindings(o.probe), ...systemFindings(o.dna, o.theme)];
  let reference: CheckReport["reference"];
  if (o.ref) {
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
  const t = o.dna.typography;
  return {
    summary: findings.length ? `${n("high")} alta(s), ${n("medium")} media(s), ${n("low")} baja(s). Puntaje ${score}/100.` : "Sin problemas medibles. Puntaje 100/100.",
    score,
    findings,
    reference,
    measured: {
      theme: o.dna.theme,
      palette: { background: o.dna.palette.background, surface: o.dna.palette.surface, text: o.dna.palette.text, muted: o.dna.palette.mutedText, accent: o.dna.palette.accent, border: o.dna.palette.border },
      heading: (t.heading ?? t.display) && `${(t.heading ?? t.display)!.family} ${Math.round((t.heading ?? t.display)!.size)}px`,
      body: t.body && `${t.body.family} ${t.body.size}px`,
      radius: o.dna.shape.radius,
      contentWidth: o.dna.layout.contentWidth,
      sequence: o.dna.sequence,
    },
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
