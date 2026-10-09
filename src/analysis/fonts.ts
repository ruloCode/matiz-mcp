// Fuentes libres: ¿la familia que usa una referencia se puede usar gratis? Si no, cuál es
// su equivalente libre. El catálogo (data/free-fonts.json) sale de Fontsource (OFL/Apache);
// las equivalencias son una tabla curada y probada contra ese catálogo.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyFamily, type FontClass } from "./typography.js";

interface FreeFont {
  f: string;
  c: string;
  v: number;
  w: number[];
  l: string;
}

let catalog: Map<string, FreeFont> | undefined;

/** "__Inter_d65c78" (next/font), "Inter Variable", "InterVar", "GeistSans" → clave comparable. */
export function normalizeFamily(family: string): string {
  return family
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^_+/, "")
    .replace(/_(fallback|[0-9a-f]{5,})$/i, "")
    .replace(/_[0-9a-f]{5,}$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/(variable|var|vf|web|webfont|text|regular|fallback)$/g, "")
    .replace(/(variable|var|vf)$/g, "");
}

function loadCatalog(): Map<string, FreeFont> {
  if (catalog) return catalog;
  const path = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "free-fonts.json");
  const fonts = (JSON.parse(readFileSync(path, "utf8")) as { fonts: FreeFont[] }).fonts;
  catalog = new Map(fonts.map((f) => [normalizeFamily(f.f), f]));
  // alias conocidos que el catálogo no escribe igual
  for (const [alias, real] of [["geistsans", "geist"], ["geistmono", "geistmono"], ["interdisplay", "inter"]] as const) {
    const hit = catalog.get(real);
    if (hit) catalog.set(alias, hit);
  }
  return catalog;
}

export function freeFont(family: string): FreeFont | undefined {
  return loadCatalog().get(normalizeFamily(family));
}

/** Comerciales frecuentes → equivalentes libres (por estructura y sensación, no por nombre). */
const EQUIVALENTS: Array<[RegExp, string[]]> = [
  [/^sohne(mono)?$|^söhne/, ["Inter", "Hanken Grotesk"]],
  [/^sohnemono/, ["IBM Plex Mono", "JetBrains Mono"]],
  [/^circular/, ["DM Sans", "Plus Jakarta Sans"]],
  [/^gtamerica/, ["Inter Tight", "Hanken Grotesk"]],
  [/^gtwalsheim/, ["Outfit", "Urbanist"]],
  [/^gt(super|sectra|alpina)/, ["Fraunces", "Newsreader"]],
  [/^gtmaru/, ["Nunito Sans", "Outfit"]],
  [/^graphik/, ["Inter", "Public Sans"]],
  [/^(neuehaas|helveticanow|helveticaneue|helvetica|arial)/, ["Inter", "Instrument Sans"]],
  [/^(sfpro|sfprodisplay|sfprotext|applesystem|systemui|blinkmacsystemfont)/, ["Inter", "Geist"]],
  [/^(sfmono|menlo|monaco|consolas)/, ["JetBrains Mono", "Geist Mono"]],
  [/^aeonik/, ["Manrope", "Outfit"]],
  [/^(ppneuemontreal|neuemontreal)/, ["Inter Tight", "Hanken Grotesk"]],
  [/^(ppmori|mori)$/, ["Manrope", "Albert Sans"]],
  [/^roobert/, ["Manrope", "Plus Jakarta Sans"]],
  [/^suisse/, ["Inter", "Instrument Sans"]],
  [/^basier/, ["Manrope", "DM Sans"]],
  [/^(abcdiatype|diatype)/, ["Inter Tight", "Schibsted Grotesk"]],
  [/^(abcfavorit|favorit)/, ["Space Grotesk", "Familjen Grotesk"]],
  [/^apercu/, ["Work Sans", "DM Sans"]],
  [/^avenir/, ["Nunito Sans", "Mulish"]],
  [/^futura/, ["Jost", "League Spartan"]],
  [/^gilroy/, ["Plus Jakarta Sans", "Urbanist"]],
  [/^proximanova/, ["Montserrat", "Figtree"]],
  [/^(tiempos|copernicus|publico)/, ["Newsreader", "Source Serif 4"]],
  [/^canela/, ["Fraunces", "Playfair Display"]],
  [/^domaine/, ["Playfair Display", "Fraunces"]],
  [/^freight/, ["Source Serif 4", "Libre Caslon Text"]],
  [/^(berkeleymono|commitmono)/, ["JetBrains Mono", "IBM Plex Mono"]],
  [/^styrene/, ["Space Grotesk", "DM Sans"]],
  [/^whyte/, ["Inter Tight", "Onest"]],
  [/^matter/, ["Plus Jakarta Sans", "Figtree"]],
  [/^cerebri/, ["Figtree", "Albert Sans"]],
  [/^moderat/, ["Manrope", "Albert Sans"]],
  [/^untitledsans/, ["Inter", "Public Sans"]],
  [/^national2/, ["Instrument Sans", "Inter"]],
  [/^foundersgrotesk/, ["Hanken Grotesk", "Schibsted Grotesk"]],
  [/^mabry/, ["Space Grotesk", "Familjen Grotesk"]],
  [/^ginto/, ["Inter Tight", "Onest"]],
  [/^saans/, ["Geist", "Inter"]],
  [/^(rebond|ttnorms|ttcommons)/, ["Figtree", "Albert Sans"]],
  [/^(segoeui|segoe)/, ["Inter", "Public Sans"]],
];

const BY_CLASS: Record<FontClass, string[]> = {
  sans: ["Inter", "Geist", "DM Sans"],
  serif: ["Fraunces", "Newsreader", "Source Serif 4"],
  mono: ["JetBrains Mono", "Geist Mono", "IBM Plex Mono"],
  display: ["Bricolage Grotesque", "Space Grotesk", "Syne"],
  script: ["Caveat"],
};

export interface FontAvailability {
  family: string;
  free: boolean;
  /** nombre tal cual en Google Fonts/Fontsource cuando es libre */
  freeAs?: string;
  alternatives?: string[];
  reason?: string;
}

export function fontAvailability(family: string, stack = ""): FontAvailability {
  const hit = freeFont(family);
  if (hit) return { family, free: true, freeAs: hit.f };
  const key = normalizeFamily(family);
  const eq = EQUIVALENTS.find(([re]) => re.test(key));
  if (eq) return { family, free: false, alternatives: eq[1], reason: "equivalente curado" };
  const cls = classifyFamily(family, stack);
  return { family, free: false, alternatives: BY_CLASS[cls], reason: `alternativa por clase (${cls})` };
}

export const ALL_ALTERNATIVES = [...new Set([...EQUIVALENTS.flatMap(([, a]) => a), ...Object.values(BY_CLASS).flat()])];
