// Sistema de diseño de una marca: lo DECLARADO (variables CSS con sus nombres) ordenado por rol,
// más lo MEDIDO que hace falta para replicarla (escala tipográfica real, pesos, fuentes con su
// alternativa libre, logo, componentes, movimiento). Todo puro: entra RawPage, sale DesignSystem.
import type { RawBrand, RawTextSample } from "../types.js";
import { parseColor, toHex } from "./color.js";
import { classifyFamily } from "./typography.js";
import { fontAvailability } from "./fonts.js";

export interface DesignSystem {
  tokens: {
    total: number;
    colors: Array<{ name: string; hex: string; role?: string }>;
    scales: Array<{ name: string; steps: Array<{ step: string; hex: string }> }>;
    sizes: Array<{ name: string; value: string; px: number; kind: "space" | "radius" | "font" | "other" }>;
    fonts: Array<{ name: string; value: string }>;
    shadows: Array<{ name: string; value: string }>;
  };
  fonts: Array<{ family: string; class: string; weights: string[]; share: number; free: boolean; freeAs?: string; alternatives?: string[]; source: "google" | "self" }>;
  typeScale: Array<{ size: number; share: number; family: string; weight: number; lh: number; ls: number; role: "display" | "heading" | "body" | "small" }>;
  weights: Array<{ weight: number; share: number }>;
  logo: RawBrand["logo"];
  favicon?: string;
  gradients: string[];
  card?: { bg: string; border: string; radius: number; shadow: string; padding: string };
  link?: { color: string; underline: boolean; weight: number };
  input?: { bg: string; color: string; border: string; radius: number; height: number; paddingX: number; fontSize: number };
  motion?: { duration: string; easing: string };
  borderWidth?: number;
  icons: number;
}

const ROLE_RULES: Array<[RegExp, string]> = [
  [/primary|brand|accent|highlight|cta/i, "accent"],
  [/destructive|danger|error|negative/i, "danger"],
  [/success|positive/i, "success"],
  [/warning|caution/i, "warning"],
  [/border|stroke|outline|divider|separator|ring/i, "border"],
  [/muted|subtle|secondary|tertiary|placeholder|disabled/i, "muted"],
  [/foreground|(^|-)fg(-|$)|(^|-)text(-|$)|ink|on-/i, "text"],
  [/background|(^|-)bg(-|$)|surface|canvas|base|paper|card|popover/i, "background"],
];

export function colorRole(name: string): string | undefined {
  for (const [re, role] of ROLE_RULES) if (re.test(name)) return role;
  return undefined;
}

function toPx(v: string): number | null {
  const m = v.trim().match(/^(-?[\d.]+)(px|rem|em)$/);
  if (!m) return null;
  return Math.round(parseFloat(m[1]) * (m[2] === "px" ? 1 : 16) * 100) / 100;
}

export function tokensFrom(vars: RawBrand["cssVars"]): DesignSystem["tokens"] {
  const colors: DesignSystem["tokens"]["colors"] = [];
  const scaleMap = new Map<string, Array<{ step: string; hex: string }>>();
  const sizes: DesignSystem["tokens"]["sizes"] = [];
  const fonts: DesignSystem["tokens"]["fonts"] = [];
  const shadows: DesignSystem["tokens"]["shadows"] = [];
  const seenHex = new Set<string>();
  for (const v of vars) {
    const value = (v.value || v.raw).trim();
    if (!value || value.includes("var(")) continue;
    const name = v.name;
    if (/shadow|elevation/i.test(name) || /\d+px\s+[^,]*rgba?\(/.test(value)) {
      if (shadows.length < 10 && value !== "none") shadows.push({ name, value: value.slice(0, 200) });
      continue;
    }
    if (/font|family|typeface/i.test(name) && /[a-z]/i.test(value) && !toPx(value) && !/^\d/.test(value)) {
      if (fonts.length < 12) fonts.push({ name, value: value.slice(0, 160) });
      continue;
    }
    const px = toPx(value);
    if (px !== null) {
      const kind = /space|spacing|gap|gutter|padding|margin|inset/i.test(name) ? "space" : /radius|rounded|round/i.test(name) ? "radius" : /font-size|text-|fs-|size-text|leading|line/i.test(name) ? "font" : "other";
      if (sizes.length < 60) sizes.push({ name, value, px, kind });
      continue;
    }
    const c = parseColor(value);
    if (!c || c.a < 0.05) continue;
    const hex = toHex(c);
    const scale = name.match(/^--(.+?)-?(\d{2,4})$/);
    if (scale && +scale[2] >= 25 && +scale[2] <= 1000) {
      const l = scaleMap.get(scale[1]) ?? [];
      l.push({ step: scale[2], hex });
      scaleMap.set(scale[1], l);
      continue;
    }
    const role = colorRole(name);
    // mismos hex con nombres distintos: se queda el primero con rol
    const key = `${hex}|${role ?? ""}`;
    if (seenHex.has(key)) continue;
    seenHex.add(key);
    colors.push({ name, hex, role });
  }
  const scales = [...scaleMap.entries()]
    .filter(([, steps]) => steps.length >= 4)
    .map(([name, steps]) => ({ name, steps: steps.sort((a, b) => +a.step - +b.step) }))
    .slice(0, 10);
  colors.sort((a, b) => Number(!!b.role) - Number(!!a.role));
  return { total: vars.length, colors: colors.slice(0, 48), scales, sizes, fonts, shadows };
}

export function typeScaleFrom(texts: RawTextSample[], baseSize: number): DesignSystem["typeScale"] {
  const total = texts.reduce((n, t) => n + t.chars, 0) || 1;
  const by = new Map<number, { chars: number; best: RawTextSample }>();
  for (const t of texts) {
    const k = Math.round(t.size);
    const e = by.get(k);
    if (!e) by.set(k, { chars: t.chars, best: t });
    else {
      e.chars += t.chars;
      if (t.chars > e.best.chars) e.best = t;
    }
  }
  const rows = [...by.entries()]
    .filter(([, e]) => e.chars / total >= 0.004)
    .sort((a, b) => b[0] - a[0])
    .slice(0, 10);
  const max = rows[0]?.[0] ?? baseSize;
  return rows.map(([size, e]) => ({
    size,
    share: +(e.chars / total).toFixed(3),
    family: e.best.family.replace(/^_+|_[0-9a-f]{5,}$/gi, ""),
    weight: e.best.weight,
    lh: e.best.lh,
    ls: e.best.ls,
    role: size === max && size >= baseSize * 1.6 ? "display" : size >= baseSize * 1.35 ? "heading" : Math.abs(size - baseSize) <= 1.5 ? "body" : size < baseSize ? "small" : "body",
  }));
}

export function buildSystem(
  texts: RawTextSample[],
  baseSize: number,
  families: Array<{ family: string; class: string; share: number }>,
  brand?: RawBrand,
): DesignSystem {
  const total = texts.reduce((n, t) => n + t.chars, 0) || 1;
  const wMap = new Map<number, number>();
  for (const t of texts) wMap.set(t.weight, (wMap.get(t.weight) ?? 0) + t.chars);
  const weights = [...wMap.entries()].map(([weight, n]) => ({ weight, share: +(n / total).toFixed(3) })).filter((w) => w.share >= 0.01).sort((a, b) => a.weight - b.weight);

  const google = (brand?.googleFonts ?? []).join(" ").toLowerCase();
  const loaded = new Map((brand?.fonts ?? []).map((f) => [f.family.toLowerCase(), f]));
  const fonts = families.map((f) => {
    const av = fontAvailability(f.family);
    const lf = loaded.get(f.family.toLowerCase());
    return {
      family: f.family.replace(/^_+|_[0-9a-f]{5,}$/gi, ""),
      class: f.class || classifyFamily(f.family),
      weights: lf?.weights ?? [],
      share: f.share,
      free: av.free,
      freeAs: av.freeAs,
      alternatives: av.alternatives,
      source: (google.includes(f.family.toLowerCase().replace(/\s+/g, "+")) ? "google" : "self") as "google" | "self",
    };
  });

  const card = brand?.cards[0];
  return {
    tokens: brand ? tokensFrom(brand.cssVars) : { total: 0, colors: [], scales: [], sizes: [], fonts: [], shadows: [] },
    fonts,
    typeScale: typeScaleFrom(texts, baseSize),
    weights,
    logo: brand?.logo ?? null,
    favicon: brand?.favicon,
    gradients: brand?.gradients.slice(0, 4) ?? [],
    card: card && { bg: card.bg, border: card.border, radius: card.radius, shadow: card.shadow, padding: card.padding },
    link: brand?.link ? { color: brand.link.color, underline: brand.link.decoration.includes("underline"), weight: brand.link.weight } : undefined,
    input: brand?.input ? { bg: brand.input.bg, color: brand.input.color, border: brand.input.border, radius: brand.input.radius, height: brand.input.height, paddingX: brand.input.paddingX, fontSize: brand.input.fontSize } : undefined,
    motion: brand?.motion.durations[0] ? { duration: brand.motion.durations[0].value, easing: brand.motion.easings[0]?.value ?? "ease" } : undefined,
    borderWidth: brand?.borders[0] ? parseFloat(brand.borders[0].value) : undefined,
    icons: brand?.icons ?? 0,
  };
}
