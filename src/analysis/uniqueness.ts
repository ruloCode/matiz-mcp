// "Lo que la hace única": rasgos de una marca comparados con la distribución de TODO el corpus.
// Cada frase sale de un percentil o de una rareza medida; nada de adjetivos sin número.
import type { Dna } from "../types.js";
import { parseColor, toOklch } from "./color.js";

export interface Trait {
  kind: string;
  text: string;
  value: string;
  strength: number; // 0..1, qué tan extremo es frente al corpus
}

type Metric = { kind: string; get: (d: Dna) => number | undefined; high: (v: string, p: number) => string; low: (v: string, p: number) => string; fmt: (n: number) => string };

const accentChroma = (d: Dna) => {
  const c = d.palette.accent && parseColor(d.palette.accent);
  return c ? toOklch(c).C : undefined;
};
const chromaticCount = (d: Dna) => d.palette.swatches.filter((s) => s.family !== "neutral" && s.weight >= 0.02).length;

const METRICS: Metric[] = [
  { kind: "display", get: (d) => d.typography.display?.size, fmt: (n) => `${Math.round(n)}px`, high: (v, p) => `Titulares enormes: su display de ${v} es más grande que el de ${p}% de las marcas.`, low: (v, p) => `Titulares contenidos: su display de ${v} es más chico que el de ${p}% de las marcas.` },
  { kind: "tracking", get: (d) => d.typography.display?.letterSpacing, fmt: (n) => `${n}em`, high: (v, p) => `Titulares abiertos: tracking de ${v}, más suelto que ${p}% del corpus.`, low: (v, p) => `Tracking muy cerrado en titulares (${v}): más apretado que ${p}% del corpus.` },
  { kind: "accent", get: accentChroma, fmt: (n) => `croma ${n.toFixed(2)}`, high: (_v, p) => `Un acento muy saturado: más intenso que ${p}% de los acentos medidos.`, low: (_v, p) => `Acento discreto: menos saturado que ${p}% del corpus.` },
  { kind: "radius", get: (d) => (d.shape.radius >= 999 ? 999 : d.shape.radius), fmt: (n) => (n >= 999 ? "pill" : `${n}px`), high: (v, p) => `Formas muy redondeadas (radio ${v}): más que ${p}% de las marcas.`, low: (v, p) => `Esquinas rectas (radio ${v}): más angulosa que ${p}% del corpus.` },
  { kind: "palette", get: chromaticCount, fmt: (n) => `${n} colores`, high: (v, p) => `Paleta amplia: usa ${v} con presencia, más que ${p}% de las marcas.`, low: (v, p) => `Paleta casi monocroma (${v} con presencia): más sobria que ${p}% del corpus.` },
  { kind: "base", get: (d) => d.typography.baseSize, fmt: (n) => `${n}px`, high: (v, p) => `Texto base grande (${v}): más que ${p}% de las marcas.`, low: (v, p) => `Texto base pequeño (${v}): menor que en ${p}% del corpus.` },
  { kind: "sections", get: (d) => d.layout.sectionCount, fmt: (n) => `${n} secciones`, high: (v, p) => `Portada larga: ${v}, más que ${p}% de las portadas.`, low: (v, p) => `Portada corta: ${v}, menos que ${p}% de las portadas.` },
  { kind: "width", get: (d) => d.layout.contentWidth, fmt: (n) => `${n}px`, high: (v, p) => `Layout ancho (${v} de contenido): más que ${p}% del corpus.`, low: (v, p) => `Columna estrecha (${v}): más angosta que ${p}% del corpus.` },
];

function percentile(values: number[], v: number): number {
  const below = values.filter((x) => x < v).length;
  const equal = values.filter((x) => x === v).length;
  return (below + equal / 2) / values.length;
}

export function distinctiveTraits(d: Dna, corpus: Dna[], max = 5): Trait[] {
  const traits: Trait[] = [];
  for (const m of METRICS) {
    const v = m.get(d);
    if (v === undefined || Number.isNaN(v)) continue;
    const vals = corpus.map(m.get).filter((x): x is number => x !== undefined && !Number.isNaN(x));
    if (vals.length < 10) continue;
    const p = percentile(vals, v);
    if (p >= 0.85) traits.push({ kind: m.kind, value: m.fmt(v), strength: p, text: m.high(m.fmt(v), Math.round(p * 100)) });
    else if (p <= 0.15) traits.push({ kind: m.kind, value: m.fmt(v), strength: 1 - p, text: m.low(m.fmt(v), Math.round((1 - p) * 100)) });
  }
  // rarezas categóricas
  const share = (pred: (x: Dna) => boolean) => corpus.filter(pred).length / Math.max(1, corpus.length);
  const pair = d.typography.pairing;
  const pairShare = share((x) => x.typography.pairing === pair);
  if (pairShare <= 0.12) traits.push({ kind: "pairing", value: pair, strength: 1 - pairShare, text: `Combinación tipográfica poco común (${pair}): solo ${Math.round(pairShare * 100)}% de las marcas la usa.` });
  if (d.theme === "dark") {
    const s = share((x) => x.theme === "dark");
    if (s <= 0.3) traits.push({ kind: "theme", value: "oscuro", strength: 1 - s, text: `Portada en tema oscuro, algo que solo hace ${Math.round(s * 100)}% del corpus.` });
  }
  const serif = d.typography.families.some((f) => f.class === "serif" && f.share >= 0.1);
  if (serif) {
    const s = share((x) => x.typography.families.some((f) => f.class === "serif" && f.share >= 0.1));
    if (s <= 0.25) traits.push({ kind: "serif", value: "serif", strength: 1 - s, text: `Usa serif con presencia real; solo ${Math.round(s * 100)}% de las marcas lo hace.` });
  }
  return traits.sort((a, b) => b.strength - a.strength).slice(0, max);
}
