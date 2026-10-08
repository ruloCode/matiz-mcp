// Tipografía: clasifica familias, decide qué familia es de títulos y cuál de texto,
// y mide la escala tipográfica real (tamaño base + razón entre niveles).
import type { RawTextSample, TypeLevel } from "../types.js";

export type FontClass = "serif" | "sans" | "mono" | "display" | "script";

const SERIF = [
  "georgia", "times", "garamond", "baskerville", "playfair", "merriweather", "lora", "fraunces",
  "newsreader", "tiempos", "gt super", "gt sectra", "domaine", "canela", "freight", "source serif",
  "noto serif", "pt serif", "dm serif", "libre caslon", "cormorant", "crimson", "instrument serif",
  "editorial", "ivar", "reckless", "recoleta", "signifier", "lyon", "publico", "spectral", "eb garamond",
  "roboto serif", "ibm plex serif", "literata", "bodoni", "didot", "caslon", "tobias", "financier",
  "gambetta", "zodiak", "erode", "sentient", "boska", "young serif", "brygada", "petrona", "charter",
];
const MONO = [
  "mono", "code", "menlo", "consolas", "courier", "monaco", "jetbrains", "fira code", "ibm plex mono",
  "sf mono", "roboto mono", "space mono", "geist mono", "berkeley", "commit", "input mono", "iosevka",
];
const DISPLAY = [
  "display", "druk", "bebas", "anton", "oswald", "league gothic", "monument", "neue machina",
  "clash", "cabinet grotesk", "migra", "pp mori", "editorial new", "gt maru", "syne", "unbounded",
  "bricolage", "archivo black", "big shoulders", "alfa slab", "abril",
];
const SCRIPT = ["script", "brush", "hand", "caveat", "pacifico", "dancing", "satisfy", "marker"];

export function classifyFamily(family: string, stack = ""): FontClass {
  const f = family.toLowerCase();
  const s = stack.toLowerCase();
  if (MONO.some((k) => f.includes(k))) return "mono";
  if (SCRIPT.some((k) => f.includes(k))) return "script";
  if (f.includes("serif") && !f.includes("sans")) return "serif";
  if (SERIF.some((k) => f.includes(k))) return "serif";
  if (DISPLAY.some((k) => f.includes(k))) return "display";
  // el stack declara la categoría de respaldo: "…, serif" sin "sans-serif"
  if (/(^|,)\s*serif\s*$/.test(s)) return "serif";
  if (/(^|,)\s*monospace\s*$/.test(s)) return "mono";
  return "sans";
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

function toLevel(s: RawTextSample): TypeLevel {
  return {
    family: s.family,
    stack: s.stack,
    size: round(s.size, 1),
    weight: s.weight,
    lineHeight: round(s.lh),
    letterSpacing: round(s.ls, 3),
    transform: s.tt && s.tt !== "none" ? s.tt : undefined,
  };
}

/** Mayor `chars` primero; desempata por tamaño. */
const byChars = (a: RawTextSample, b: RawTextSample) => b.chars - a.chars || b.size - a.size;

export interface TypographyReading {
  heading?: TypeLevel;
  body?: TypeLevel;
  display?: TypeLevel;
  label?: TypeLevel;
  levels: Record<string, TypeLevel>;
  baseSize: number;
  scaleRatio: number;
  families: Array<{ family: string; class: string; share: number }>;
  pairing: string;
}

export function analyzeTypography(samples: RawTextSample[]): TypographyReading {
  const texts = samples.filter((s) => s.family && s.size > 0 && s.chars > 0);
  const totalChars = texts.reduce((n, s) => n + s.chars, 0) || 1;

  // familias por participación en caracteres
  const famMap = new Map<string, { chars: number; stack: string }>();
  for (const s of texts) {
    const f = famMap.get(s.family) ?? { chars: 0, stack: s.stack };
    f.chars += s.chars;
    famMap.set(s.family, f);
  }
  const families = [...famMap.entries()]
    .map(([family, v]) => ({ family, class: classifyFamily(family, v.stack), share: round(v.chars / totalChars, 3) }))
    .sort((a, b) => b.share - a.share)
    .filter((f) => f.share >= 0.01)
    .slice(0, 6);

  // texto corrido: 13–21px, no encabezado, el que más caracteres tiene
  const bodyCands = texts.filter((s) => !s.tag && s.size >= 13 && s.size <= 21).sort(byChars);
  const body = bodyCands[0];
  const baseSize = body ? round(body.size, 1) : 16;

  // niveles por etiqueta: el más usado de cada hN
  const levels: Record<string, TypeLevel> = {};
  for (const tag of ["h1", "h2", "h3", "h4"]) {
    const c = texts.filter((s) => s.tag === tag).sort(byChars)[0];
    if (c) levels[tag] = toLevel(c);
  }
  if (body) levels.body = toLevel(body);
  const small = texts.filter((s) => !s.tag && s.size < baseSize - 0.5 && s.size >= 10).sort(byChars)[0];
  if (small) levels.small = toLevel(small);

  // display = el texto más grande con presencia real (≥ 8 caracteres)
  const display = [...texts].filter((s) => s.chars >= 8).sort((a, b) => b.size - a.size)[0];
  const headingSample =
    texts.filter((s) => s.tag === "h1" || s.tag === "h2").sort(byChars)[0] ??
    texts.filter((s) => s.size >= baseSize * 1.5).sort(byChars)[0];

  // etiqueta: mayúsculas pequeñas con tracking (patrón "eyebrow")
  const label = texts
    .filter((s) => s.tt === "uppercase" && s.size <= baseSize + 1)
    .sort(byChars)[0];

  // razón de escala: (display / base)^(1/pasos) con los tamaños distintos que hay entre medio
  const sizes = [...new Set(texts.filter((s) => s.chars >= 4).map((s) => Math.round(s.size)))]
    .filter((v) => v >= baseSize)
    .sort((a, b) => a - b);
  const top = display ? display.size : baseSize;
  const steps = Math.max(1, Math.min(sizes.length - 1, 6));
  const scaleRatio = top > baseSize ? round((top / baseSize) ** (1 / steps), 3) : 1;

  const headClass = headingSample ? classifyFamily(headingSample.family, headingSample.stack) : undefined;
  const bodyClass = body ? classifyFamily(body.family, body.stack) : undefined;
  const pairing =
    headingSample && body && headingSample.family !== body.family
      ? `${headClass}+${bodyClass}`
      : bodyClass ?? headClass ?? "sans";

  return {
    heading: headingSample ? toLevel(headingSample) : undefined,
    body: body ? toLevel(body) : undefined,
    display: display ? toLevel(display) : undefined,
    label: label ? toLevel(label) : undefined,
    levels,
    baseSize,
    scaleRatio,
    families,
    pairing,
  };
}
