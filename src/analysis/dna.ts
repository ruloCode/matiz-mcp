// De la extracción cruda del navegador a la "lectura de diseño" (DNA) de un sitio:
// paleta con roles, tipografía, forma, espaciado, layout, botones y secciones.
import type { ClassifiedSection, Dna, RawPage, Swatch } from "../types.js";
import {
  clusterColors,
  contrastRatio,
  deltaE,
  flatten,
  isDark,
  nameColor,
  parseColor,
  toHex,
  toOklch,
  type Rgb,
} from "./color.js";
import { analyzeTypography } from "./typography.js";
import { classifySections } from "./sections.js";
import { inferIndustry } from "./industry.js";
import { buildSystem } from "./system.js";

const WHITE: Rgb = { r: 255, g: 255, b: 255, a: 1 };

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Valores de un histograma {valor: conteo} que pesan ≥ minShare, ordenados por valor. */
function histogramScale(h: Record<string, number>, minShare = 0.03, max = 8): number[] {
  const entries = Object.entries(h).map(([k, n]) => [+k, n] as const);
  const total = entries.reduce((s, [, n]) => s + n, 0) || 1;
  return entries
    .filter(([, n]) => n / total >= minShare)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([v]) => v)
    .sort((a, b) => a - b);
}

function weightedMedian(h: Record<string, number>): number {
  const entries = Object.entries(h).map(([k, n]) => [+k, n] as const).sort((a, b) => a[0] - b[0]);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  let acc = 0;
  for (const [v, n] of entries) {
    acc += n;
    if (acc >= total / 2) return v;
  }
  return 0;
}

function swatch(hex: string, weight: number, role?: string): Swatch {
  const n = nameColor(parseColor(hex)!);
  return { hex, weight, role, en: n.en, es: n.es, family: n.family };
}

export function buildPalette(raw: RawPage) {
  const root = parseColor(raw.rootBg) ?? WHITE;
  const rootFlat = root.a < 1 ? flatten(root, WHITE) : root;
  const byProp = (prop: "bg" | "text" | "border") =>
    clusterColors(
      raw.colors
        .filter((x) => x.prop === prop)
        .map((x) => {
          const c = parseColor(x.c);
          return c ? { rgb: c.a < 1 ? flatten(c, rootFlat) : c, w: x.w } : null;
        })
        .filter((x): x is { rgb: Rgb; w: number } => !!x && x.rgb.a > 0),
    );

  const bgs = byProp("bg");
  const texts = byProp("text");
  const borders = byProp("border");

  const background = bgs[0]?.rgb ?? rootFlat;
  const surface = bgs.find((c) => deltaE(c.rgb, background) > 0.02 && Math.abs(toOklch(c.rgb).L - toOklch(background).L) < 0.15 && toOklch(c.rgb).C < 0.05);
  // texto principal = el más usado que se lee sobre el fondo; si el dominante NO se lee y no hay
  // otro con presencia comparable, se reporta tal cual (la crítica debe poder ver el problema)
  const legible = texts.filter((c) => contrastRatio(c.rgb, background) >= 3);
  const top = texts[0];
  let text =
    legible.find((c) => !top || c.weight >= top.weight * 0.35)?.rgb ??
    top?.rgb ??
    (isDark(background) ? WHITE : { r: 17, g: 17, b: 17, a: 1 });
  let muted = legible.find((c) => deltaE(c.rgb, text) > 0.06 && toOklch(c.rgb).C < 0.06);
  // jerarquía por CONTRASTE, no por cantidad: si el "secundario" contrasta más, es el principal
  if (muted && contrastRatio(muted.rgb, background) > contrastRatio(text, background) + 0.5) {
    const prev = text;
    text = muted.rgb;
    muted = { ...muted, rgb: prev, hex: toHex(prev) };
  }

  // acento: el color con más croma y presencia (botones de fondo pesan más que links)
  const chromatic = [
    ...bgs.map((c) => ({ ...c, w: c.weight * 1.5 })),
    ...texts.map((c) => ({ ...c, w: c.weight })),
    ...borders.map((c) => ({ ...c, w: c.weight * 0.3 })),
  ]
    .filter((c) => toOklch(c.rgb).C >= 0.07)
    .sort((a, b) => b.w * (0.5 + toOklch(b.rgb).C) - a.w * (0.5 + toOklch(a.rgb).C));
  // el color de los botones primarios también es candidato fuerte
  const btnColors = raw.buttons
    .map((b) => parseColor(b.bg))
    .filter((c): c is Rgb => !!c && c.a > 0.5 && toOklch(c).C >= 0.07);
  const accent = btnColors[0] ?? chromatic[0]?.rgb;
  const accent2 = chromatic.find((c) => accent && deltaE(c.rgb, accent) > 0.12)?.rgb;
  const border = borders.find((c) => deltaE(c.rgb, background) > 0.02)?.rgb;

  const all = clusterColors(
    [...bgs, ...texts, ...borders].map((c) => ({ rgb: c.rgb, w: c.weight })),
    0.03,
    10,
  );
  const roles = new Map<string, string>();
  const tag = (c: Rgb | undefined, role: string) => c && roles.set(toHex(c), role);
  tag(background, "background");
  tag(surface?.rgb, "surface");
  tag(text, "text");
  tag(muted?.rgb, "muted-text");
  tag(accent, "accent");
  tag(accent2, "accent-2");
  tag(border, "border");
  const swatches = all.map((c) => swatch(c.hex, c.weight, roles.get(c.hex)));
  for (const [hex, role] of roles) if (!swatches.some((s) => s.hex === hex)) swatches.push(swatch(hex, 0, role));

  const mood: string[] = [];
  const chromaShare = all.filter((c) => toOklch(c.rgb).C >= 0.07).reduce((s, c) => s + c.weight, 0);
  if (chromaShare < 0.03) mood.push("monochrome", "monocromático");
  else if (chromaShare > 0.25) mood.push("colorful", "colorido");
  if (accent && toOklch(accent).C > 0.18) mood.push("vivid accent", "acento vivo");
  const bgO = toOklch(background);
  if (bgO.C > 0.008 && bgO.C < 0.04 && (bgO.H < 110 || bgO.H > 330)) mood.push("warm neutrals", "neutros cálidos");
  if (bgO.C > 0.008 && bgO.C < 0.04 && bgO.H >= 180 && bgO.H <= 300) mood.push("cool neutrals", "neutros fríos");
  if (bgO.C >= 0.04) mood.push("tinted background", "fondo de color");
  mood.push(isDark(background) ? "dark" : "light", isDark(background) ? "oscuro" : "claro");

  return {
    background: toHex(background),
    surface: surface ? surface.hex : undefined,
    text: toHex(text),
    mutedText: muted ? muted.hex : undefined,
    accent: accent ? toHex(accent) : undefined,
    accent2: accent2 ? toHex(accent2) : undefined,
    border: border ? toHex(border) : undefined,
    swatches,
    mood,
  };
}

function shadowsKind(shadows: Record<string, number>, elements: number): "none" | "subtle" | "heavy" {
  const n = Object.values(shadows).reduce((s, v) => s + v, 0);
  if (n === 0) return "none";
  const blurs = Object.keys(shadows).map((s) => {
    const px = [...s.matchAll(/(-?\d+(\.\d+)?)px/g)].map((m) => Math.abs(+m[1]));
    return Math.max(0, ...px);
  });
  const heavy = blurs.some((b) => b >= 24) && n >= Math.max(4, elements * 0.01);
  return heavy ? "heavy" : "subtle";
}

export function buildDna(raw: RawPage, opts: { industry?: string[] } = {}): Dna {
  const palette = buildPalette(raw);
  const typography = analyzeTypography(raw.texts);
  const bgRgb = parseColor(palette.background)!;

  const classified = classifySections(raw.sections, raw.viewport.h, raw.pageHeight);
  const sections: ClassifiedSection[] = raw.sections.map((s, i) => {
    const c = parseColor(s.bg);
    const flat = c ? (c.a < 1 ? flatten(c, bgRgb) : c) : bgRgb;
    return {
      idx: s.idx,
      type: classified[i].type,
      confidence: classified[i].confidence,
      reasons: classified[i].reasons,
      top: Math.round(s.top),
      height: Math.round(s.height),
      heading: s.headings[0] ?? "",
      text: s.text.slice(0, 280),
      columns: s.columns,
      dark: isDark(flat),
      bg: toHex(flat),
    };
  });

  // el radio típico excluye las píldoras (se reportan aparte en `pill`): si no, un sitio
  // con muchos chips "pill" parecería no tener radio de tarjeta
  const nonPill = Object.fromEntries(Object.entries(raw.radii).filter(([k]) => +k < 9999));
  const radius = Object.keys(nonPill).length ? weightedMedian(nonPill) : raw.radii["9999"] ? 9999 : 0;
  const radiusScale = histogramScale(raw.radii, 0.04, 6).filter((v) => v < 9999);
  const spacingScale = histogramScale(raw.spacing, 0.03, 10);
  const spacingBase = [8, 4].find((b) => spacingScale.filter((v) => v % b === 0).length >= spacingScale.length * 0.7) ?? 4;

  const contentSections = sections.filter((s) => !["navbar", "banner", "footer"].includes(s.type));
  const avgSectionHeight = contentSections.length
    ? Math.round(contentSections.reduce((n, s) => n + s.height, 0) / contentSections.length)
    : 0;
  const textPerPx = raw.sections.reduce((n, s) => n + s.textLength, 0) / Math.max(1, raw.pageHeight);
  const density = textPerPx < 0.35 ? "airy" : textPerPx > 0.9 ? "dense" : "balanced";

  // botones: primario = el de fondo con croma (o el más oscuro/contrastado) más arriba
  const btns = raw.buttons
    .map((b) => {
      const bg = parseColor(b.bg);
      const tx = parseColor(b.color);
      const filled = !!bg && bg.a > 0.5 && deltaE(flatten(bg, bgRgb), bgRgb) > 0.05;
      return { b, bg, tx, filled };
    })
    .filter((x) => x.tx);
  const primary = btns.filter((x) => x.filled).sort((a, b) => a.b.top - b.b.top || b.b.count - a.b.count)[0];
  const secondary = btns.find((x) => x !== primary && (!x.filled || (primary && x.b.bg !== primary.b.bg)));
  const buttons: Dna["buttons"] = [];
  for (const [kind, x] of [["primary", primary], ["secondary", secondary]] as const) {
    if (!x) continue;
    const bg = x.bg && x.bg.a > 0.05 ? toHex(flatten(x.bg, bgRgb)) : "transparent";
    const border = parseColor(x.b.border);
    buttons.push({
      kind,
      bg,
      text: toHex(x.tx!),
      border: border && border.a > 0.1 ? toHex(flatten(border, bgRgb)) : undefined,
      radius: Math.min(9999, Math.round(x.b.radius)),
      paddingX: Math.round(x.b.px),
      paddingY: Math.round(x.b.py),
      weight: x.b.weight,
      label: x.b.text.slice(0, 40),
    });
  }

  const motion: string[] = [];
  const m = raw.motion;
  if (m.gsap) motion.push("gsap");
  if (m.scrollTrigger) motion.push("scrolltrigger");
  if (m.lenis) motion.push("smooth-scroll");
  if (m.framerMotion) motion.push("framer-motion");
  if (m.lottie) motion.push("lottie");
  if (m.webgl) motion.push("webgl");
  if (m.animations > 5) motion.push("css-animations");

  const text = [raw.title, raw.description, ...raw.sections.flatMap((s) => s.headings)].join(" ");
  const industry = opts.industry?.length ? opts.industry : inferIndustry(text);
  // un navbar sticky que el DOM deja al final se VE arriba: la composición lo pone primero
  const types = sections.map((s) => s.type);
  const navAt = types.indexOf("navbar");
  // solo los banners de anuncio van antes del navbar
  if (navAt > 0 && types.slice(0, navAt).some((t) => t !== "banner")) {
    types.splice(navAt, 1);
    const firstNonBanner = types.findIndex((t) => t !== "banner");
    types.splice(firstNonBanner < 0 ? types.length : firstNonBanner, 0, "navbar");
  }
  const sequence = collapseSequence(types);

  const keywords = [
    ...palette.mood,
    ...palette.swatches.filter((s) => s.weight >= 0.03 || s.role).flatMap((s) => [s.en, s.es, s.family]),
    ...typography.families.flatMap((f) => [f.family, f.class]),
    typography.pairing,
    palette.background === "#000000" ? "pure black" : "",
    radius >= 9999 || buttons[0]?.radius >= 999 ? "pill buttons" : "",
    radius === 0 ? "sharp corners" : radius >= 16 ? "rounded" : "",
    density,
    ...motion,
    ...raw.tech,
    ...industry,
  ].filter(Boolean);

  return {
    version: 1,
    system: buildSystem(raw.texts, typography.baseSize, typography.families, raw.brand),
    theme: isDark(bgRgb) ? "dark" : "light",
    palette,
    typography,
    shape: {
      radius: Math.min(9999, radius),
      scale: radiusScale,
      pill: (raw.radii["9999"] ?? 0) >= 3,
      shadows: shadowsKind(raw.shadows, raw.sections.length * 40),
      shadowSamples: Object.entries(raw.shadows)
        .sort((a, b) => b[1] - a[1])
        .map(([s]) => cleanShadow(s))
        .filter((s, i, all) => s && all.indexOf(s) === i)
        .slice(0, 3),
    },
    spacing: { base: spacingBase, scale: spacingScale },
    layout: {
      contentWidth: raw.contentWidth,
      pageHeight: raw.pageHeight,
      sectionCount: sections.length,
      avgSectionHeight,
      density,
    },
    buttons,
    sections,
    sequence,
    tech: raw.tech,
    motion,
    industry,
    keywords: [...new Set(keywords.map((k) => k.toLowerCase()))],
  };
}

/** Quita de un box-shadow las capas invisibles (alfa 0) que dejan Tailwind y similares. */
export function cleanShadow(s: string): string {
  return s
    .split(/,(?![^(]*\))/)
    .map((x) => x.trim())
    .filter((x) => !/rgba\([^)]*,\s*0\)/.test(x) && !/^(0px\s*){3,4}/.test(x.replace(/^[a-z]+\([^)]*\)\s*/, "")))
    .join(", ");
}

/** Une repeticiones consecutivas (features, features, features → features). */
export function collapseSequence(types: string[]): string[] {
  const out: string[] = [];
  for (const t of types) if (out[out.length - 1] !== t) out.push(t);
  return out;
}

export { median };
