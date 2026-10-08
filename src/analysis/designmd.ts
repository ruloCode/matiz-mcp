// Exporta el DNA de un sitio en dos formatos estándar:
// - DESIGN.md (spec de google-labs-code/design.md): YAML de tokens + prosa por secciones.
// - Design Tokens del W3C (DTCG) en JSON.
import { stringify } from "yaml";
import type { Dna, TypeLevel } from "../types.js";
import { parseColor, tonalScale } from "./color.js";

const px = (v: number) => `${Math.round(v * 100) / 100}px`;
const em = (v: number) => `${Math.round(v * 1000) / 1000}em`;

function typo(l?: TypeLevel) {
  if (!l) return undefined;
  const out: Record<string, string | number> = {
    fontFamily: l.family,
    fontSize: px(l.size),
    fontWeight: l.weight,
    lineHeight: Math.round(l.lineHeight * 100) / 100,
  };
  if (Math.abs(l.letterSpacing) >= 0.001) out.letterSpacing = em(l.letterSpacing);
  return out;
}

export function toDesignTokens(name: string, dna: Dna) {
  const p = dna.palette;
  const colors: Record<string, string> = { background: p.background, "on-background": p.text };
  if (p.surface) colors.surface = p.surface;
  if (p.mutedText) colors["text-muted"] = p.mutedText;
  if (p.border) colors.outline = p.border;
  const primaryBtn = dna.buttons.find((b) => b.kind === "primary");
  // sitio monocromático: el "primario" es lo que pinta la acción principal (botón), o el texto
  const primary = p.accent ?? (primaryBtn && primaryBtn.bg !== "transparent" ? primaryBtn.bg : p.text);
  colors.primary = primary;
  if (p.accent2) colors.secondary = p.accent2;
  if (primaryBtn) colors["on-primary"] = primaryBtn.text;

  const t = dna.typography;
  const typography: Record<string, unknown> = {};
  const set = (k: string, l?: TypeLevel) => {
    const v = typo(l);
    if (v) typography[k] = v;
  };
  set("display", t.display);
  set("h1", t.levels.h1 ?? t.heading);
  set("h2", t.levels.h2);
  set("h3", t.levels.h3);
  set("body-md", t.body);
  set("body-sm", t.levels.small);
  set("label-caps", t.label);

  const rounded: Record<string, string> = {};
  const scale = dna.shape.scale.filter((v) => v > 0);
  const names = ["xs", "sm", "md", "lg", "xl"];
  scale.slice(0, 5).forEach((v, i) => (rounded[names[i]] = px(v)));
  if (dna.shape.pill) rounded.full = "9999px";

  const spacing: Record<string, string> = {};
  const sp = dna.spacing.scale.filter((v) => v > 0 && v <= 160);
  const spNames = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"];
  sp.slice(0, 8).forEach((v, i) => (spacing[spNames[i]] = px(v)));

  const components: Record<string, Record<string, string>> = {};
  for (const b of dna.buttons) {
    const c: Record<string, string> = {
      backgroundColor: b.bg === "transparent" ? "{colors.background}" : b.bg === primary ? "{colors.primary}" : b.bg,
      textColor: b.text,
      rounded: b.radius >= 999 ? "9999px" : px(b.radius),
      padding: `${px(b.paddingY)} ${px(b.paddingX)}`,
    };
    components[`button-${b.kind}`] = c;
  }

  return { name, colors, typography, rounded, spacing, components };
}

function describeTheme(dna: Dna): string {
  const p = dna.palette;
  const parts: string[] = [];
  parts.push(dna.theme === "dark" ? "Interfaz de tema oscuro" : "Interfaz de tema claro");
  if (p.mood.includes("monochrome")) parts.push("prácticamente monocromática");
  else if (p.accent) parts.push(`con un acento ${p.swatches.find((s) => s.hex === p.accent)?.es ?? p.accent}`);
  if (p.mood.includes("warm neutrals")) parts.push("sobre neutros cálidos");
  if (p.mood.includes("cool neutrals")) parts.push("sobre neutros fríos");
  const t = dna.typography;
  const head = t.heading?.family;
  const body = t.body?.family;
  if (head && body && head !== body) parts.push(`títulos en ${head} y texto en ${body}`);
  else if (body) parts.push(`todo en ${body}`);
  parts.push(`densidad ${({ airy: "aireada", balanced: "equilibrada", dense: "densa" } as const)[dna.layout.density]}`);
  return parts.join(", ") + ".";
}

export function toDesignMd(name: string, url: string, dna: Dna): string {
  const tokens = toDesignTokens(name, dna);
  const { name: _, ...rest } = tokens;
  const front = stringify({ version: "alpha", name, description: `Leído de ${url}`, ...rest }, { lineWidth: 0 });
  const p = dna.palette;
  const t = dna.typography;
  const lines: string[] = [];
  lines.push("---", front.trim(), "---", "");
  lines.push("## Overview", "", describeTheme(dna), "", `Fuente: ${url} (medido del sitio en vivo, no declarado por la marca).`, "");

  lines.push("## Colors", "");
  const role = (label: string, hex?: string, why?: string) =>
    hex && lines.push(`- **${label} (${hex}):** ${why ?? ""}`.trim());
  role("Background", p.background, "superficie base de la página.");
  role("Surface", p.surface, "tarjetas y bloques elevados.");
  role("On-background", p.text, "texto principal.");
  role("Muted text", p.mutedText, "texto secundario y metadatos.");
  role("Primary", p.accent, "acento: acciones y énfasis.");
  role("Secondary", p.accent2, "acento secundario.");
  role("Outline", p.border, "bordes y divisores.");
  if (p.accent) {
    const scale = tonalScale(parseColor(p.accent)!);
    lines.push("", `Escala tonal sugerida del primario: ${Object.entries(scale).map(([k, v]) => `${k} ${v}`).join(" · ")}.`);
  }
  lines.push("");

  lines.push("## Typography", "");
  lines.push(`- Combinación: **${t.pairing}**. Familias medidas: ${t.families.map((f) => `${f.family} (${f.class}, ${Math.round(f.share * 100)}%)`).join(", ")}.`);
  lines.push(`- Base ${t.baseSize}px, razón de escala ≈ ${t.scaleRatio}.`);
  if (t.display) lines.push(`- Display: ${t.display.family} ${Math.round(t.display.size)}px / ${t.display.weight}, interlineado ${t.display.lineHeight}, tracking ${t.display.letterSpacing}em.`);
  if (t.label) lines.push(`- Etiquetas en mayúsculas: ${t.label.family} ${t.label.size}px, tracking ${t.label.letterSpacing}em.`);
  lines.push("");

  lines.push("## Layout", "");
  lines.push(`- Ancho de contenido ≈ ${dna.layout.contentWidth}px; ${dna.layout.sectionCount} secciones; ~${dna.layout.avgSectionHeight}px por sección (${dna.layout.density}).`);
  lines.push(`- Espaciado sobre base ${dna.spacing.base}px: ${dna.spacing.scale.join(", ")}px.`);
  lines.push(`- Orden de secciones: ${dna.sequence.join(" → ")}.`);
  lines.push("");

  lines.push("## Elevation & Depth", "");
  lines.push(
    dna.shape.shadows === "none"
      ? "- Sin sombras: la profundidad sale de cambios de superficie y bordes."
      : `- Sombras ${dna.shape.shadows === "subtle" ? "sutiles" : "marcadas"}: ${dna.shape.shadowSamples.slice(0, 2).join(" | ")}.`,
  );
  lines.push("");

  lines.push("## Shapes", "");
  lines.push(`- Radio típico ${dna.shape.radius >= 999 ? "pill" : dna.shape.radius + "px"}; escala ${dna.shape.scale.join(", ") || "—"}px${dna.shape.pill ? "; usa formas pill" : ""}.`);
  lines.push("");

  if (dna.buttons.length) {
    lines.push("## Components", "");
    for (const b of dna.buttons)
      lines.push(`- **Botón ${b.kind === "primary" ? "primario" : "secundario"}** ("${b.label}"): fondo ${b.bg}, texto ${b.text}, radio ${b.radius >= 999 ? "pill" : b.radius + "px"}, padding ${b.paddingY}×${b.paddingX}px, peso ${b.weight}.`);
    lines.push("");
  }

  lines.push("## Do's and Don'ts", "");
  if (p.mood.includes("monochrome")) lines.push("- Do: mantén la paleta en neutros; el color entra por imágenes/producto.");
  else if (p.accent) lines.push(`- Do: reserva ${p.accent} para acciones y énfasis; no lo uses en superficies grandes.`);
  if (dna.shape.shadows === "none") lines.push("- Don't: agregar sombras para separar; usa borde o superficie.");
  if (t.display && t.display.letterSpacing < -0.01) lines.push(`- Do: tracking negativo (${t.display.letterSpacing}em) en titulares grandes.`);
  lines.push("");
  return lines.join("\n");
}

/** Design Tokens Community Group (W3C) — formato plano $value/$type. */
export function toDtcg(name: string, dna: Dna) {
  const tk = toDesignTokens(name, dna);
  const color: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(tk.colors)) color[k] = { $type: "color", $value: v };
  const typography: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(tk.typography)) typography[k] = { $type: "typography", $value: v };
  const dim = (o: Record<string, string>) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { $type: "dimension", $value: v }]));
  return {
    $description: `Tokens medidos de ${name}`,
    color,
    typography,
    radius: dim(tk.rounded),
    spacing: dim(tk.spacing),
  };
}
