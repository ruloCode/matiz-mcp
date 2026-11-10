// Tema de un tablero del Estudio: los tokens con los que el agente diseña las pantallas.
// Sale de una marca medida del corpus (base_ref) o de lo que el agente fije, y se
// convierte en el @theme de Tailwind v4 que reciben TODAS las pantallas del tablero:
// así cada pantalla usa las mismas clases (bg-background, text-primary…) y el chequeo
// puede decir qué color se salió del sistema.
import type { Dna } from "../types.js";
import { contrastRatio, parseColor, toHex, tonalScale } from "../analysis/color.js";
import { fontAvailability } from "../analysis/fonts.js";

export const COLOR_ROLES = ["background", "surface", "foreground", "muted", "primary", "on-primary", "secondary", "border"] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];

export interface BoardTheme {
  scheme: "light" | "dark";
  colors: Partial<Record<ColorRole, string>> & { background: string; foreground: string; primary: string };
  /** Familias que se CARGAN (libres, de Google Fonts). */
  fonts: { heading: string; body: string; mono: string };
  /** Familias de la marca original cuando eran comerciales (solo informativo). */
  fontsOriginal?: { heading?: string; body?: string };
  radius: number;
  contentWidth: number;
  source?: { ref_id: string; name: string; url: string };
  /** Ajustes que hizo Matiz para que el tema se lea (con el motivo). Nunca en silencio. */
  adjusted?: string[];
}

export interface ThemeInput {
  scheme?: "light" | "dark";
  colors?: Partial<Record<ColorRole, string>>;
  fonts?: { heading?: string; body?: string; mono?: string };
  radius?: number;
  content_width?: number;
}

export const DEFAULT_THEME: BoardTheme = {
  scheme: "light",
  colors: {
    background: "#FFFFFF",
    surface: "#F4F4F5",
    foreground: "#0A0A0A",
    muted: "#52525B",
    primary: "#2563EB",
    "on-primary": "#FFFFFF",
    border: "#E4E4E7",
  },
  fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" },
  radius: 12,
  contentWidth: 1200,
};

const hex = (c?: string) => {
  const p = c ? parseColor(c) : null;
  return p ? toHex(p) : undefined;
};

/** Familia que se puede cargar: la misma si es libre, si no su primera alternativa libre. */
export function loadableFamily(family?: string, fallback = "Inter"): { family: string; original?: string } {
  if (!family) return { family: fallback };
  const av = fontAvailability(family);
  if (av.free) return { family: av.freeAs ?? family };
  return { family: av.alternatives?.[0] ?? fallback, original: family };
}

/** Texto legible sobre un fondo: blanco o casi negro, el de más contraste. */
export function onColor(bg: string): string {
  const c = parseColor(bg);
  if (!c) return "#FFFFFF";
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const ink = { r: 10, g: 10, b: 10, a: 1 };
  return contrastRatio(white, c) >= contrastRatio(ink, c) ? "#FFFFFF" : "#0A0A0A";
}

const rgbOf = (h: string) => parseColor(h)!;
/** Mezcla lineal en sRGB: t = cuánto de `a` (0 = todo b). */
export function mix(a: string, b: string, t: number): string {
  const x = rgbOf(a), y = rgbOf(b);
  return toHex({ r: Math.round(x.r * t + y.r * (1 - t)), g: Math.round(x.g * t + y.g * (1 - t)), b: Math.round(x.b * t + y.b * (1 - t)), a: 1 });
}
const cr = (a: string, b: string) => contrastRatio(rgbOf(a), rgbOf(b));

/** Un gris de texto secundario que pasa AA sobre el fondo: lo más suave posible sin bajar de 4.6:1. */
export function deriveMuted(fg: string, bg: string, also: string[] = []): string {
  // pasa AA sobre el fondo Y sobre las superficies donde también se usa
  for (let t = 0.45; t <= 1.001; t += 0.05) {
    const m = mix(fg, bg, t);
    if ([bg, ...also].every((b) => cr(m, b) >= 4.6)) return m;
  }
  return fg;
}

/**
 * Un tema medido puede traer roles que no se leen (el texto secundario igual al fondo, un borde
 * blanco sobre fondo oscuro) o que faltan (sin superficie). Se corrigen SOLO esos, y cada
 * corrección queda escrita en `adjusted` para que el agente y el humano la vean.
 */
export function ensureLegible(t: BoardTheme): BoardTheme {
  const c = { ...t.colors };
  const notes: string[] = [];
  if (cr(c.foreground, c.background) < 4.5) {
    const fixed = onColor(c.background);
    notes.push(`foreground ${c.foreground} no se lee sobre ${c.background} (${cr(c.foreground, c.background).toFixed(2)}:1) → ${fixed}`);
    c.foreground = fixed;
  }
  if (!c.surface || cr(c.surface, c.background) > 1.6) {
    const fixed = mix(c.foreground, c.background, t.scheme === "dark" ? 0.07 : 0.04);
    notes.push(c.surface ? `surface ${c.surface} está muy lejos del fondo (${cr(c.surface, c.background).toFixed(2)}:1) → ${fixed}` : `sin surface medida → ${fixed}`);
    c.surface = fixed;
  }
  // el secundario tiene que leerse (AA) Y distinguirse del principal: si da casi el mismo
  // contraste que el texto, en la práctica no hay jerarquía
  const sameAsText = c.muted && cr(c.foreground, c.background) / cr(c.muted, c.background) < 1.25;
  const onSurface = c.muted && c.surface ? cr(c.muted, c.surface) : 99;
  if (!c.muted || cr(c.muted, c.background) < 4.5 || onSurface < 4.5 || sameAsText) {
    const fixed = deriveMuted(c.foreground, c.background, c.surface ? [c.surface] : []);
    notes.push(
      !c.muted
        ? `sin muted medido → ${fixed}`
        : sameAsText
          ? `muted ${c.muted} es casi el mismo color del texto (${cr(c.muted, c.background).toFixed(1)}:1 contra ${cr(c.foreground, c.background).toFixed(1)}:1): no hay jerarquía → ${fixed}`
          : onSurface < 4.5 && cr(c.muted, c.background) >= 4.5
            ? `muted ${c.muted} no se lee sobre surface (${onSurface.toFixed(2)}:1) → ${fixed}`
            : `muted ${c.muted} no se lee sobre el fondo (${cr(c.muted, c.background).toFixed(2)}:1) → ${fixed}`,
    );
    c.muted = fixed;
  }
  if (!c.border || cr(c.border, c.background) > 2.2 || cr(c.border, c.background) < 1.08) {
    const fixed = mix(c.foreground, c.background, t.scheme === "dark" ? 0.16 : 0.12);
    notes.push(c.border ? `border ${c.border} ${cr(c.border, c.background) > 2.2 ? "grita" : "no se ve"} sobre el fondo (${cr(c.border, c.background).toFixed(2)}:1) → ${fixed}` : `sin border medido → ${fixed}`);
    c.border = fixed;
  }
  const on = c["on-primary"];
  if (!on || cr(on, c.primary) < 4.5) {
    const fixed = onColor(c.primary);
    if (fixed !== on && (!on || cr(fixed, c.primary) > cr(on, c.primary))) {
      notes.push(on ? `on-primary ${on} sobre ${c.primary} da ${cr(on, c.primary).toFixed(2)}:1 → ${fixed}` : `sin on-primary → ${fixed}`);
      c["on-primary"] = fixed;
    }
  }
  return { ...t, colors: c, adjusted: notes.length ? notes : undefined };
}

/** Avisos (sin cambiar nada) sobre colores que el AGENTE fijó a mano. */
export function legibilityWarnings(t: BoardTheme): string[] {
  const c = t.colors;
  const w: string[] = [];
  const pairs: Array<[string, string | undefined, string, number]> = [
    ["foreground", c.foreground, "background", 4.5],
    ["muted", c.muted, "background", 4.5],
    ["on-primary", c["on-primary"], "primary", 4.5],
  ];
  for (const [k, v, on, min] of pairs) {
    const bg = c[on as ColorRole];
    if (v && bg && cr(v, bg) < min) w.push(`${k} ${v} sobre ${on} ${bg} da ${cr(v, bg).toFixed(2)}:1 (mínimo ${min}:1)`);
  }
  return w;
}

export function themeFromDna(d: Dna, source?: BoardTheme["source"]): BoardTheme {
  const p = d.palette;
  const btn = d.buttons.find((b) => b.kind === "primary");
  const btnBg = btn && btn.bg !== "transparent" ? hex(btn.bg) : undefined;
  const primary = hex(p.accent) ?? btnBg ?? DEFAULT_THEME.colors.primary;
  const t = d.typography;
  const heading = loadableFamily((t.heading ?? t.display)?.family);
  const body = loadableFamily(t.body?.family, heading.family);
  const colors: BoardTheme["colors"] = {
    background: hex(p.background) ?? DEFAULT_THEME.colors.background,
    foreground: hex(p.text) ?? DEFAULT_THEME.colors.foreground,
    primary,
  };
  if (hex(p.surface)) colors.surface = hex(p.surface);
  if (hex(p.mutedText)) colors.muted = hex(p.mutedText);
  if (hex(p.accent2)) colors.secondary = hex(p.accent2);
  if (hex(p.border)) colors.border = hex(p.border);
  // el texto del botón primario solo vale si es el botón del color primario
  colors["on-primary"] = btn && btnBg && hex(btn.text) && btnBg === primary ? hex(btn.text) : onColor(primary);
  return ensureLegible({
    scheme: d.theme,
    colors,
    fonts: { heading: heading.family, body: body.family, mono: DEFAULT_THEME.fonts.mono },
    fontsOriginal: heading.original || body.original ? { heading: heading.original, body: body.original } : undefined,
    radius: d.shape.pill ? Math.min(d.shape.radius, 24) : Math.round(d.shape.radius),
    contentWidth: Math.round(d.layout.contentWidth || DEFAULT_THEME.contentWidth),
    source,
  });
}

/** Aplica lo que fija el agente sobre un tema base. Colores inválidos se rechazan con motivo. */
export function applyThemeInput(base: BoardTheme, input: ThemeInput = {}): { theme: BoardTheme; rejected: string[]; warnings: string[] } {
  const rejected: string[] = [];
  const colors = { ...base.colors };
  for (const [k, v] of Object.entries(input.colors ?? {})) {
    if (!(COLOR_ROLES as readonly string[]).includes(k)) {
      rejected.push(`rol de color desconocido: ${k} (usa ${COLOR_ROLES.join(", ")})`);
      continue;
    }
    const h = hex(v);
    if (!h) rejected.push(`color inválido para ${k}: ${v}`);
    else colors[k as ColorRole] = h;
  }
  if (input.colors?.primary && !input.colors["on-primary"]) colors["on-primary"] = onColor(colors.primary);
  const fonts = { ...base.fonts };
  const fontsOriginal = { ...(base.fontsOriginal ?? {}) };
  for (const k of ["heading", "body", "mono"] as const) {
    const f = input.fonts?.[k];
    if (!f) continue;
    const l = loadableFamily(f, k === "mono" ? DEFAULT_THEME.fonts.mono : "Inter");
    fonts[k] = l.family;
    if (k !== "mono") fontsOriginal[k] = l.original;
  }
  // los ajustes de legibilidad de la base solo valen para los roles que el agente no tocó
  const touched = Object.keys(input.colors ?? {});
  const adjusted = base.adjusted?.filter((n) => !touched.some((k) => n.startsWith(`${k} `) || n.startsWith(`sin ${k}`)));
  const theme: BoardTheme = {
    ...base,
    adjusted: adjusted?.length ? adjusted : undefined,
    scheme: input.scheme ?? base.scheme,
    colors,
    fonts,
    fontsOriginal: fontsOriginal.heading || fontsOriginal.body ? fontsOriginal : undefined,
    radius: input.radius ?? base.radius,
    contentWidth: input.content_width ?? base.contentWidth,
  };
  return { theme, rejected, warnings: legibilityWarnings(theme) };
}

const SERIF = /serif|garamond|playfair|fraunces|lora|merriweather|baskerville|caslon|crimson|newsreader|instrument serif|dm serif|libre|spectral|cormorant|bodoni|georgia|times/i;
const stack = (family: string, mono = false) =>
  `"${family}", ${mono ? "ui-monospace, monospace" : SERIF.test(family) && !/sans/i.test(family) ? "Georgia, serif" : "system-ui, sans-serif"}`;

/** El bloque que recibe Tailwind v4 en el navegador (<style type="text/tailwindcss">). */
export function themeCss(t: BoardTheme): string {
  const lines = ["@theme {"];
  for (const role of COLOR_ROLES) if (t.colors[role]) lines.push(`  --color-${role}: ${t.colors[role]};`);
  const p = parseColor(t.colors.primary);
  if (p) for (const [k, v] of Object.entries(tonalScale(p))) lines.push(`  --color-primary-${k}: ${v};`);
  lines.push(
    `  --font-heading: ${stack(t.fonts.heading)};`,
    `  --font-sans: ${stack(t.fonts.body)};`,
    `  --font-mono: ${stack(t.fonts.mono, true)};`,
    `  --radius-brand: ${t.radius}px;`,
    `  --container-content: ${t.contentWidth}px;`,
    "}",
    "@layer base {",
    `  html { background: var(--color-background); color: var(--color-foreground); font-family: var(--font-sans); color-scheme: ${t.scheme}; -webkit-font-smoothing: antialiased; }`,
    "  h1, h2, h3, h4 { font-family: var(--font-heading); }",
    "}",
  );
  return lines.join("\n");
}

/** Links de Google Fonts: uno con pesos y otro simple (si la familia no trae esos pesos, el primero falla y el segundo carga 400). */
export function fontLinks(t: BoardTheme): string[] {
  const fams = [...new Set([t.fonts.heading, t.fonts.body, t.fonts.mono])];
  const enc = (f: string) => f.trim().replace(/\s+/g, "+");
  return fams.flatMap((f) => [
    `https://fonts.googleapis.com/css2?family=${enc(f)}:wght@400;500;600;700&display=swap`,
    `https://fonts.googleapis.com/css2?family=${enc(f)}&display=swap`,
  ]);
}

/** Contrastes reales de las combinaciones típicas, para que el agente sepa cuáles NO usar como texto. */
export function contrastNotes(t: BoardTheme): string[] {
  const c = t.colors;
  const combos: Array<[string, string | undefined, string, string | undefined]> = [
    ["text-foreground", c.foreground, "bg-background", c.background],
    ["text-muted", c.muted, "bg-background", c.background],
    ["text-primary", c.primary, "bg-background", c.background],
    ["text-on-primary", c["on-primary"], "bg-primary", c.primary],
    ["text-muted", c.muted, "bg-surface", c.surface],
  ];
  return combos
    .filter(([, a, , b]) => a && b)
    .map(([ta, a, tb, b]) => {
      const r = cr(a!, b!);
      const verdict = r >= 4.5 ? "OK para texto" : r >= 3 ? "solo texto grande (≥24px o ≥19px bold) o íconos" : "NO como texto";
      return `${ta} sobre ${tb}: ${r.toFixed(2)}:1 → ${verdict}`;
    });
}

/** Cómo se usan los tokens desde las clases: va en la respuesta de create_board. */
export function classGuide(t: BoardTheme) {
  const roles = COLOR_ROLES.filter((r) => t.colors[r]);
  return {
    colors: Object.fromEntries(roles.map((r) => [r, `bg-${r} · text-${r} · border-${r}`])),
    primary_scale: "bg-primary-50 … bg-primary-950 (escala tonal del primario)",
    fonts: { "font-heading": t.fonts.heading, "font-sans (por defecto)": t.fonts.body, "font-mono": t.fonts.mono },
    radius: `rounded-brand = ${t.radius}px`,
    container: `max-w-content = ${t.contentWidth}px (centrado: mx-auto px-6)`,
    contrast: contrastNotes(t),
    rule: "Usa SOLO estos colores (y sus variantes /opacidad). Los grises por defecto de Tailwind (gray-500, slate-…) se marcan como fuera del sistema en check_screen.",
  };
}
