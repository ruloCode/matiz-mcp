// El análisis profundo (src/capture/deep.ts) en forma útil para un agente: colores en hex,
// componentes con su hover medido en palabras y el CSS listo, sin recortes ni marcas internas.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SHOTS } from "../db.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DeepJson = Record<string, any>;

export function loadDeep(id: string): DeepJson | null {
  const f = join(SHOTS, id, "deep.json");
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return null;
  }
}

/** Lo que viaja en el paquete: todo menos recortes, marcas y diagnósticos. */
export function packableDeep(d: DeepJson): DeepJson {
  const { crops: _c, marks: _m, legacyClick: _l, ...rest } = d;
  return rest;
}

export function hex(c: string | undefined | null): string {
  const m = String(c ?? "").match(/rgba?\(([^)]+)\)/);
  if (!m) return String(c ?? "");
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
  const h = "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  return a === 0 ? "transparent" : a < 1 ? h + Math.round(a * 255).toString(16).padStart(2, "0") : h;
}
const hexIn = (s: string) => String(s ?? "").replace(/rgba?\([^)]+\)/g, (m) => hex(m));

const PROP_CSS: Record<string, string> = { fondo: "background-color", texto: "color", borde: "border-color", sombra: "box-shadow", transform: "transform", opacidad: "opacity", subrayado: "text-decoration-line", filtro: "filter", degradado: "background-image", "color de outline": "outline-color", outline: "outline-style", "ancho de outline": "outline-width", escala: "scale", desplazamiento: "translate" };

function matrix(t: string) {
  const m = String(t ?? "").match(/matrix(3d)?\(([^)]+)\)/);
  if (!m) return { x: 0, y: 0, s: 1 };
  const a = m[2].split(",").map(Number);
  return m[1] ? { x: a[12], y: a[13], s: a[0] } : { x: a[4], y: a[5], s: Math.hypot(a[0], a[1]) };
}

/** Un cambio de estado medido, en una frase corta. */
export function describeChange(c: { prop: string; from: string; to: string; on: string }): string {
  const who = c.on === "hijo" ? "hijo/ícono: " : "";
  if (c.prop === "transform" || c.prop === "desplazamiento" || c.prop === "escala") {
    const a = matrix(c.from), b = matrix(c.to);
    const p: string[] = [];
    const dx = Math.round(b.x - a.x), dy = Math.round(b.y - a.y);
    if (dy) p.push(dy < 0 ? `sube ${-dy}px` : `baja ${dy}px`);
    if (dx) p.push(`se mueve ${dx}px en x`);
    if (Math.abs(b.s - a.s) > 0.004) p.push(`escala ×${(b.s / (a.s || 1)).toFixed(2)}`);
    return who + (p.join(", ") || `transform → ${c.to}`);
  }
  if (c.prop === "sombra") return who + (c.from === "none" ? `aparece sombra ${hexIn(c.to)}` : c.to === "none" ? "pierde la sombra" : `sombra → ${hexIn(c.to)}`);
  return `${who}${c.prop}: ${hexIn(c.from)} → ${hexIn(c.to)}`;
}

function cssRule(sel: string, decl: Record<string, string | number | undefined>, hover?: Array<{ prop: string; to: string; on: string }>): string {
  const body = Object.entries(decl).filter(([, v]) => v !== "" && v != null).map(([k, v]) => `  ${k}: ${v};`).join("\n");
  const h = (hover ?? []).filter((c) => c.on === "self" && PROP_CSS[c.prop]).map((c) => `  ${PROP_CSS[c.prop]}: ${hexIn(c.to)};`).join("\n");
  return `${sel} {\n${body}\n}${h ? `\n${sel}:hover {\n${h}\n}` : ""}`;
}

/** Resumen para get_brand_kit. */
export function deepForAgent(d: DeepJson) {
  const st = (k: string) => (d.states ?? []).find((s: DeepJson) => s.key === k);
  const hov = (k: string) => (st(k)?.changes ?? []).map(describeChange);
  const buttons = (d.buttons ?? []).map((b: DeepJson) => ({
    role: b.role,
    style: b.kind === "solid" ? "relleno" : "contorno",
    uses: b.count,
    label: b.label,
    hover: hov(b.key),
    css: cssRule(`.btn-${b.role}`, {
      "background-color": hex(b.bg), color: hex(b.color), border: b.border ? hexIn(b.border) : "0", "border-radius": b.pill ? "999px" : `${b.radius}px`, height: `${b.height}px`,
      padding: `0 ${b.padX}px`, font: `${b.weight} ${b.fontSize}px/1 "${b.family}"`, "letter-spacing": b.letterSpacing ? `${b.letterSpacing}em` : "", "text-transform": b.transform !== "none" ? b.transform : "",
      "box-shadow": b.shadow ? hexIn(b.shadow) : "", transition: b.transition || "",
    }, st(b.key)?.changes),
  }));
  const cards = (d.cards ?? []).map((c: DeepJson) => ({
    uses: c.count, size: `${c.w}×${c.h}`, with_media: c.media, title: c.title, inner_gap: c.gap, hover: hov(c.key),
    css: cssRule(".card", { "background-color": hex(c.bg), border: c.border ? hexIn(c.border) : "", "border-radius": `${c.radius}px`, "box-shadow": c.shadow ? hexIn(c.shadow) : "", padding: c.padding.map((v: number) => `${v}px`).join(" "), transition: c.transition || "" }, st(c.key)?.changes),
  }));
  const rh = (d.spacing?.rhythm ?? []).filter((r: DeepJson) => r.padTop > 0 && r.padTop < 400);
  const pads = rh.map((r: DeepJson) => r.padTop).sort((a: number, b: number) => a - b);
  const nav = d.nav && { ...d.nav, bg: hex(d.nav.bg), linkColor: hex(d.nav.linkColor), key: undefined };
  return {
    components: {
      buttons,
      nav,
      cards,
      badges: (d.badges ?? []).map((b: DeepJson) => ({ label: b.label, pill: b.pill, bg: hex(b.bg), color: hex(b.color), border: hexIn(b.border), radius: b.radius, height: b.height, padX: b.padX, fontSize: b.fontSize, weight: b.weight, transform: b.transform, hover: hov(b.key) })),
      input: d.input && { ...d.input, bg: hex(d.input.bg), color: hex(d.input.color), border: hexIn(d.input.border), key: undefined, focus: hov("input") },
      link: d.link && { color: hex(d.link.color), decoration: d.link.decoration, weight: d.link.weight, hover: hov("link") },
    },
    typography_hierarchy: Object.fromEntries(Object.entries(d.headings ?? {}).map(([k, h]) => [k, { ...(h as DeepJson), color: hex((h as DeepJson).color) }])),
    section_header: d.sectionHeader && { ...d.sectionHeader, key: undefined, eyebrow: d.sectionHeader.eyebrow && { ...d.sectionHeader.eyebrow, color: hex(d.sectionHeader.eyebrow.color), bg: hex(d.sectionHeader.eyebrow.bg) } },
    spacing: d.spacing && {
      base_unit: d.spacing.base || "libre",
      multiples_of_8: d.spacing.share8,
      multiples_of_4: d.spacing.share4,
      scale: d.spacing.scale,
      section_padding_median: pads.length ? pads[Math.floor(pads.length / 2)] : null,
      section_rhythm: (d.spacing.rhythm ?? []).slice(0, 12).map((r: DeepJson) => ({ height: r.h, pad_top: r.padTop, pad_bottom: r.padBottom, content_width: r.inner, bg: hex(r.bg) })),
      container: d.spacing.container,
      gutter: d.spacing.gutter,
      top_gaps: (d.spacing.gaps ?? []).slice(0, 6),
      top_paddings: (d.spacing.paddings ?? []).slice(0, 6),
    },
    depth: {
      shadows_by_elevation: [...(d.shadows ?? [])].sort((a: DeepJson, b: DeepJson) => a.elevation - b.elevation).map((s: DeepJson) => ({ ...s, value: hexIn(s.value) })),
      radius_by_element: d.radii,
      borders: d.borders && { widths: d.borders.widths, colors: d.borders.colors.map((c: DeepJson) => ({ ...c, value: hex(c.value) })) },
      effects: d.effects,
    },
    motion: d.motion && {
      elements_with_transition: d.motion.withTransition,
      durations: d.motion.durations,
      easings: d.motion.easings,
      animated_properties: d.motion.properties,
      reveal_on_scroll: d.reveal && { count: d.reveal.revealed, pattern: d.reveal.pattern, distance_px: d.reveal.distance, from_opacity: d.reveal.fromOpacity, duration: d.reveal.duration, easing: d.reveal.easing, staggered_groups: d.reveal.stagger },
      keyframes: (d.motion.keyframes ?? []).slice(0, 12),
      live_animations: [...(d.motion.live ?? []), ...(d.reveal?.scrollAnimations ?? [])].slice(0, 10),
      libraries: d.motion.libs,
      smooth_scroll: d.motion.smoothScroll,
      hover_states: (d.states ?? []).filter((s: DeepJson) => s.changes.length).map((s: DeepJson) => ({ element: s.key, state: s.state, changes: s.changes.map(describeChange) })),
    },
    imagery: d.imagery,
    grid_columns: d.grid?.columns,
    breakpoints: d.breakpoints,
    stack: d.stack,
    accessibility: d.a11y,
    measured_at: d.measuredAt,
  };
}
