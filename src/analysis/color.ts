// Color: parseo de lo que devuelve getComputedStyle (rgb, hex, oklch, oklab, lab,
// color(srgb|display-p3)), conversión a OKLab para medir distancias perceptuales,
// contraste WCAG y nombres de color buscables (es/en). Todo puro.

export interface Rgb {
  r: number; // 0..255
  g: number;
  b: number;
  a: number; // 0..1
}

export interface Oklab {
  L: number;
  a: number;
  b: number;
}

export interface Oklch {
  L: number;
  C: number;
  H: number; // grados
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function num(token: string, scale = 1): number {
  const t = token.trim();
  if (t.endsWith("%")) return (parseFloat(t) / 100) * scale;
  if (t === "none") return 0;
  return parseFloat(t);
}

function splitArgs(inner: string): { parts: string[]; alpha: number } {
  let alpha = 1;
  let body = inner.trim();
  const slash = body.indexOf("/");
  if (slash >= 0) {
    alpha = num(body.slice(slash + 1), 1);
    body = body.slice(0, slash);
  }
  const parts = body.includes(",") ? body.split(",") : body.split(/\s+/);
  const clean = parts.map((p) => p.trim()).filter(Boolean);
  if (clean.length === 4 && slash < 0) alpha = num(clean.pop()!, 1);
  return { parts: clean, alpha: isNaN(alpha) ? 1 : alpha };
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.sign(c) * Math.abs(c) ** (1 / 2.4) - 0.055;

function linearRgbToOklab(r: number, g: number, b: number): Oklab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToLinearRgb({ L, a, b }: Oklab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function fromLinear(lin: [number, number, number], a: number): Rgb {
  const [r, g, b] = lin.map((c) => clamp(Math.round(linearToSrgb(c) * 255), 0, 255));
  return { r, g, b, a };
}

// CIELab (D50) → XYZ D50 → XYZ D65 (Bradford) → sRGB lineal
function labToLinearRgb(L: number, A: number, B: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + A / 500;
  const fz = fy - B / 200;
  const e = 216 / 24389;
  const k = 24389 / 27;
  const xr = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k;
  const yr = L > k * e ? fy ** 3 : L / k;
  const zr = fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k;
  const X = xr * 0.3457 / 0.3585;
  const Y = yr;
  const Z = zr * (1 - 0.3457 - 0.3585) / 0.3585;
  const X65 = 0.9554734527042182 * X - 0.023098536874261423 * Y + 0.0632593086610217 * Z;
  const Y65 = -0.028369706963208136 * X + 1.0099954580058226 * Y + 0.021041398966943008 * Z;
  const Z65 = 0.012314001688319899 * X - 0.020507696433808526 * Y + 1.3303659366080753 * Z;
  return [
    3.2409699419045226 * X65 - 1.537383177570094 * Y65 - 0.4986107602930034 * Z65,
    -0.9692436362808796 * X65 + 1.8759675015077202 * Y65 + 0.04155505740717559 * Z65,
    0.05563007969699366 * X65 - 0.20397695888897652 * Y65 + 1.0569715142428786 * Z65,
  ];
}

function p3ToLinearSrgb(r: number, g: number, b: number): [number, number, number] {
  const [lr, lg, lb] = [r, g, b].map(srgbToLinear);
  return [
    1.2249401 * lr - 0.2249404 * lg + 0 * lb,
    -0.0420569 * lr + 1.0420571 * lg + 0 * lb,
    -0.0196376 * lr - 0.0786361 * lg + 1.0982735 * lb,
  ];
}

function hslToRgb(h: number, s: number, l: number): Omit<Rgb, "a"> {
  const sat = clamp(s, 0, 1);
  const lig = clamp(l, 0, 1);
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

/** Parsea un color CSS computado o un token. Devuelve null si no se reconoce. */
export function parseColor(input: string): Rgb | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  // canales HSL sueltos, el formato de las variables de shadcn/ui: "220 14% 96%"
  const bare = s.match(/^(-?\d+(?:\.\d+)?)(?:deg)?\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%(?:\s*\/\s*([\d.]+%?))?$/);
  if (bare) return { ...hslToRgb(+bare[1], +bare[2] / 100, +bare[3] / 100), a: bare[4] ? num(bare[4], 1) : 1 };
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (s.startsWith("#")) {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const v = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255, a };
  }
  const m = s.match(/^([a-z-]+)\((.*)\)$/);
  if (!m) return null;
  const [, fn, inner] = m;
  if (fn === "rgb" || fn === "rgba") {
    const { parts, alpha } = splitArgs(inner);
    if (parts.length < 3) return null;
    const [r, g, b] = parts.slice(0, 3).map((p) => clamp(num(p, 255), 0, 255));
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a: alpha };
  }
  if (fn === "hsl" || fn === "hsla") {
    const { parts, alpha } = splitArgs(inner);
    if (parts.length < 3) return null;
    return { ...hslToRgb(parseFloat(parts[0]), num(parts[1], 1), num(parts[2], 1)), a: alpha };
  }
  if (fn === "oklch") {
    const { parts, alpha } = splitArgs(inner);
    const L = num(parts[0], 1);
    const C = num(parts[1], 0.4);
    const H = (num(parts[2] ?? "0") * Math.PI) / 180;
    return fromLinear(oklabToLinearRgb({ L, a: C * Math.cos(H), b: C * Math.sin(H) }), alpha);
  }
  if (fn === "oklab") {
    const { parts, alpha } = splitArgs(inner);
    return fromLinear(
      oklabToLinearRgb({ L: num(parts[0], 1), a: num(parts[1], 0.4), b: num(parts[2], 0.4) }),
      alpha,
    );
  }
  if (fn === "lab") {
    const { parts, alpha } = splitArgs(inner);
    return fromLinear(labToLinearRgb(num(parts[0], 100), num(parts[1], 125), num(parts[2], 125)), alpha);
  }
  if (fn === "color") {
    // el espacio va primero: si no se separa, splitArgs toma el 4.º valor como alfa
    const [space, ...rest] = inner.trim().split(/\s+/);
    const { parts, alpha } = splitArgs(rest.join(" "));
    const [r, g, b] = parts.map((p) => num(p, 1));
    if (space === "srgb") return fromLinear([r, g, b].map(srgbToLinear) as [number, number, number], alpha);
    if (space === "display-p3") return fromLinear(p3ToLinearSrgb(r, g, b), alpha);
    if (space === "srgb-linear") return fromLinear([r, g, b], alpha);
    return null;
  }
  return null;
}

export function toHex({ r, g, b }: Rgb): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function toOklab({ r, g, b }: Rgb): Oklab {
  return linearRgbToOklab(srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255));
}

export function toOklch(c: Rgb): Oklch {
  const { L, a, b } = toOklab(c);
  const C = Math.hypot(a, b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

export function oklchToRgb({ L, C, H }: Oklch): Rgb {
  const h = (H * Math.PI) / 180;
  return fromLinear(oklabToLinearRgb({ L, a: C * Math.cos(h), b: C * Math.sin(h) }), 1);
}

/** Distancia perceptual en OKLab (≈ 0.02 apenas perceptible, > 0.1 claramente distinto). */
export function deltaE(x: Rgb, y: Rgb): number {
  const a = toOklab(x);
  const b = toOklab(y);
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}

/** Mezcla un color semitransparente sobre un fondo opaco. */
export function flatten(c: Rgb, over: Rgb): Rgb {
  const a = c.a;
  return {
    r: Math.round(c.r * a + over.r * (1 - a)),
    g: Math.round(c.g * a + over.g * (1 - a)),
    b: Math.round(c.b * a + over.b * (1 - a)),
    a: 1,
  };
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  const [R, G, B] = [r, g, b].map((v) => srgbToLinear(v / 255));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function contrastRatio(x: Rgb, y: Rgb): number {
  const l1 = relativeLuminance(x);
  const l2 = relativeLuminance(y);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export const isDark = (c: Rgb) => toOklch(c).L < 0.5;

// Límites de tono en OKLCH calibrados con la paleta de Tailwind v4
// (red 25 · orange 47 · amber 70 · yellow 86 · lime 131 · green 149 · teal 182 · cyan 215 ·
//  blue 260 · indigo 277 · violet 293 · purple 304 · pink 354).
const HUES: Array<[number, string, string]> = [
  [35, "red", "rojo"],
  [60, "orange", "naranja"],
  [80, "amber", "ámbar"],
  [105, "yellow", "amarillo"],
  [140, "lime", "lima"],
  [170, "green", "verde"],
  [200, "teal", "turquesa"],
  [242, "cyan", "cian"],
  [270, "blue", "azul"],
  [286, "indigo", "índigo"],
  [298, "violet", "violeta"],
  [318, "purple", "morado"],
  [350, "pink", "rosado"],
  [360, "red", "rojo"],
];

export interface ColorName {
  en: string;
  es: string;
  family: string; // hue/neutral base en inglés: "blue", "neutral"…
  neutral: boolean;
}

/** Nombre buscable de un color: tono + claridad, y si es neutro, su temperatura. */
export function nameColor(c: Rgb): ColorName {
  const { L, C, H } = toOklch(c);
  if (C < 0.035) {
    const warm = C > 0.008 && (H < 110 || H > 330);
    const cool = C > 0.008 && H >= 180 && H <= 300;
    const tint = warm ? ["warm ", "cálido "] : cool ? ["cool ", "frío "] : ["", ""];
    if (L > 0.97) return { en: "white", es: "blanco", family: "neutral", neutral: true };
    if (L > 0.9) return { en: `${tint[0]}off-white`.trim(), es: `blanco roto${tint[1] ? " " + tint[1].trim() : ""}`, family: "neutral", neutral: true };
    if (L < 0.2) return { en: "black", es: "negro", family: "neutral", neutral: true };
    if (L < 0.32) return { en: `${tint[0]}near-black`.trim(), es: `casi negro${tint[1] ? " " + tint[1].trim() : ""}`, family: "neutral", neutral: true };
    return { en: `${tint[0]}gray`.trim(), es: `gris${tint[1] ? " " + tint[1].trim() : ""}`, family: "neutral", neutral: true };
  }
  const hue = HUES.find(([max]) => H < max) ?? HUES[0];
  const light = L > 0.8 ? ["light ", " claro"] : L < 0.42 ? ["dark ", " oscuro"] : ["", ""];
  const muted = C < 0.08 ? ["muted ", " apagado"] : C > 0.2 ? ["vivid ", " vivo"] : ["", ""];
  return {
    en: `${muted[0]}${light[0]}${hue[1]}`.trim(),
    es: `${hue[2]}${light[1]}${muted[1]}`.trim(),
    family: hue[1],
    neutral: false,
  };
}

export interface WeightedColor {
  rgb: Rgb;
  w: number;
}

export interface Cluster {
  hex: string;
  rgb: Rgb;
  weight: number; // 0..1 relativo al total de la entrada
}

/** Agrupa muestras ponderadas en OKLab (voraz por peso). */
export function clusterColors(samples: WeightedColor[], threshold = 0.035, max = 12): Cluster[] {
  const total = samples.reduce((s, x) => s + x.w, 0) || 1;
  const sorted = [...samples].filter((s) => s.rgb.a > 0.5).sort((a, b) => b.w - a.w);
  const clusters: Array<{ rgb: Rgb; w: number }> = [];
  for (const s of sorted) {
    const hit = clusters.find((c) => deltaE(c.rgb, s.rgb) < threshold);
    if (hit) hit.w += s.w;
    else clusters.push({ rgb: { ...s.rgb, a: 1 }, w: s.w });
  }
  return clusters
    .sort((a, b) => b.w - a.w)
    .slice(0, max)
    .map((c) => ({ hex: toHex(c.rgb), rgb: c.rgb, weight: +(c.w / total).toFixed(4) }));
}

/** Escala tonal 50..950 en OKLCH alrededor de un color (estilo Tailwind). */
export function tonalScale(base: Rgb): Record<string, string> {
  const { C, H } = toOklch(base);
  const steps: Array<[string, number]> = [
    ["50", 0.97], ["100", 0.93], ["200", 0.87], ["300", 0.79], ["400", 0.7],
    ["500", 0.62], ["600", 0.54], ["700", 0.46], ["800", 0.38], ["900", 0.3], ["950", 0.22],
  ];
  const out: Record<string, string> = {};
  for (const [k, L] of steps) {
    // menos croma en los extremos para no salirse del gamut
    const edge = Math.min(1, Math.min(L - 0.15, 0.99 - L) / 0.25);
    out[k] = toHex(oklchToRgb({ L, C: C * Math.max(0.25, edge), H }));
  }
  return out;
}
