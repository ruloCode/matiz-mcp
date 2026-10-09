// Exportar la marca para replicarla: variables CSS y tema de Tailwind v4 (@theme).
// Las fuentes comerciales salen con su alternativa libre como respaldo.
import type { Dna } from "../types.js";
import { parseColor, tonalScale } from "./color.js";
import { fontAvailability } from "./fonts.js";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const stack = (family?: string, cls = "sans") => {
  if (!family) return cls === "mono" ? "ui-monospace, monospace" : "system-ui, sans-serif";
  const av = fontAvailability(family);
  const alt = av.free ? "" : `, "${av.alternatives?.[0] ?? "Inter"}"`;
  return `"${family}"${alt}, ${cls === "serif" ? "Georgia, serif" : cls === "mono" ? "ui-monospace, monospace" : "system-ui, sans-serif"}`;
};

function roleColors(d: Dna): Array<[string, string]> {
  const p = d.palette;
  const primary = d.buttons.find((b) => b.kind === "primary");
  return [
    ["background", p.background], ["surface", p.surface], ["foreground", p.text], ["muted", p.mutedText],
    ["primary", p.accent ?? (primary && primary.bg !== "transparent" ? primary.bg : undefined)], ["on-primary", primary?.text],
    ["secondary", p.accent2], ["border", p.border],
  ].filter((x): x is [string, string] => !!x[1]);
}

export function toCssVariables(name: string, d: Dna): string {
  const t = d.typography;
  const lines: string[] = [`/* ${name} — medido por Matiz. Fuentes comerciales con alternativa libre de respaldo. */`, ":root {"];
  for (const [k, v] of roleColors(d)) lines.push(`  --color-${k}: ${v};`);
  const acc = d.palette.accent && parseColor(d.palette.accent);
  if (acc) for (const [k, v] of Object.entries(tonalScale(acc))) lines.push(`  --color-primary-${k}: ${v};`);
  const heading = t.heading ?? t.display;
  lines.push(`  --font-heading: ${stack(heading?.family, d.typography.families.find((f) => f.family === heading?.family)?.class)};`);
  lines.push(`  --font-body: ${stack(t.body?.family, d.typography.families.find((f) => f.family === t.body?.family)?.class)};`);
  const scale = d.system?.typeScale ?? [];
  for (const s of scale.slice(0, 7)) lines.push(`  --text-${s.size}: ${s.size}px; /* ${s.role} · ${s.weight} · lh ${s.lh}${s.ls ? ` · ${s.ls}em` : ""} */`);
  d.shape.scale.filter((r) => r > 0).forEach((r, i) => lines.push(`  --radius-${["sm", "md", "lg", "xl", "2xl"][i] ?? i}: ${r}px;`));
  if (d.shape.pill) lines.push("  --radius-full: 9999px;");
  d.spacing.scale.filter((v) => v > 0 && v <= 160).forEach((v) => lines.push(`  --space-${v}: ${v}px;`));
  d.shape.shadowSamples.forEach((s, i) => lines.push(`  --shadow-${i + 1}: ${s};`));
  if (d.system?.motion) lines.push(`  --ease: ${d.system.motion.easing};`, `  --duration: ${d.system.motion.duration};`);
  lines.push(`  --content-width: ${d.layout.contentWidth}px;`);
  const declared = (d.system?.tokens.colors ?? []).filter((c) => c.role).slice(0, 24);
  if (declared.length) {
    lines.push("", "  /* Variables que el sitio declara (nombres originales) */");
    for (const c of declared) lines.push(`  ${c.name}: ${c.hex};`);
  }
  lines.push("}");
  return lines.join("\n");
}

export function toTailwindTheme(name: string, d: Dna): string {
  const t = d.typography;
  const heading = t.heading ?? t.display;
  const lines: string[] = [`/* ${name} — tema Tailwind v4 medido por Matiz */`, '@import "tailwindcss";', "", "@theme {"];
  for (const [k, v] of roleColors(d)) lines.push(`  --color-${slug(k)}: ${v};`);
  const acc = d.palette.accent && parseColor(d.palette.accent);
  if (acc) for (const [k, v] of Object.entries(tonalScale(acc))) lines.push(`  --color-brand-${k}: ${v};`);
  lines.push(`  --font-heading: ${stack(heading?.family, d.typography.families.find((f) => f.family === heading?.family)?.class)};`);
  lines.push(`  --font-sans: ${stack(t.body?.family, d.typography.families.find((f) => f.family === t.body?.family)?.class)};`);
  for (const s of (d.system?.typeScale ?? []).slice(0, 7)) lines.push(`  --text-${s.role}-${s.size}: ${s.size / 16}rem;`);
  d.shape.scale.filter((r) => r > 0).forEach((r, i) => lines.push(`  --radius-${["sm", "md", "lg", "xl", "2xl"][i] ?? i}: ${r}px;`));
  d.shape.shadowSamples.slice(0, 3).forEach((s, i) => lines.push(`  --shadow-brand-${i + 1}: ${s};`));
  if (d.system?.motion) lines.push(`  --ease-brand: ${d.system.motion.easing};`);
  lines.push(`  --container-content: ${d.layout.contentWidth}px;`, "}");
  return lines.join("\n");
}
