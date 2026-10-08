// Parecido entre dos sitios a partir de su DNA, con desglose por dimensión
// (no es una caja negra: el agente ve en qué se parecen y en qué no).
import type { Dna } from "../types.js";
import { deltaE, parseColor, toOklch } from "./color.js";

export interface SimilarityBreakdown {
  score: number; // 0..1, 1 = idénticos
  parts: Record<string, number>;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function colorSim(a?: string, b?: string, scale = 0.25): number {
  if (!a || !b) return a === b ? 1 : 0.4;
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) return 0.4;
  return clamp01(1 - deltaE(x, y) / scale);
}

/** Similitud de secuencias por subsecuencia común más larga (orden importa). */
export function sequenceSim(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return (2 * dp[a.length][b.length]) / (a.length + b.length);
}

const logRatioSim = (a: number, b: number, tol: number) =>
  a > 0 && b > 0 ? clamp01(1 - Math.abs(Math.log(a / b)) / tol) : 0.5;

export function similarity(a: Dna, b: Dna): SimilarityBreakdown {
  const accentHue = (() => {
    const x = a.palette.accent && parseColor(a.palette.accent);
    const y = b.palette.accent && parseColor(b.palette.accent);
    if (!x || !y) return a.palette.accent || b.palette.accent ? 0.3 : 0.8;
    const dh = Math.abs(toOklch(x).H - toOklch(y).H);
    return clamp01(1 - Math.min(dh, 360 - dh) / 90);
  })();

  const parts: Record<string, number> = {
    theme: a.theme === b.theme ? 1 : 0,
    background: colorSim(a.palette.background, b.palette.background, 0.2),
    text: colorSim(a.palette.text, b.palette.text, 0.3),
    accent: 0.5 * colorSim(a.palette.accent, b.palette.accent, 0.3) + 0.5 * accentHue,
    pairing: a.typography.pairing === b.typography.pairing ? 1 : a.typography.pairing.split("+")[0] === b.typography.pairing.split("+")[0] ? 0.6 : 0.1,
    typeScale: 0.5 * logRatioSim(a.typography.scaleRatio, b.typography.scaleRatio, 0.25) + 0.5 * logRatioSim(a.typography.baseSize, b.typography.baseSize, 0.3),
    radius: a.shape.radius === b.shape.radius ? 1 : logRatioSim(a.shape.radius + 2, b.shape.radius + 2, 1.5),
    shadows: a.shape.shadows === b.shape.shadows ? 1 : 0.4,
    density: a.layout.density === b.layout.density ? 1 : 0.4,
    composition: sequenceSim(a.sequence, b.sequence),
    industry: a.industry.some((i) => b.industry.includes(i)) ? 1 : 0.3,
  };
  // sin industria en ninguno de los dos no hay nada que comparar: la dimensión no cuenta
  if (!a.industry.length && !b.industry.length) delete parts.industry;
  const weights: Record<string, number> = {
    theme: 1.2, background: 1.2, text: 0.5, accent: 1.2, pairing: 1, typeScale: 0.6,
    radius: 0.7, shadows: 0.4, density: 0.6, composition: 1, industry: 0.4,
  };
  let s = 0;
  let w = 0;
  for (const [k, v] of Object.entries(parts)) {
    if (!(k in weights)) continue;
    s += v * weights[k];
    w += weights[k];
  }
  for (const k of Object.keys(parts)) parts[k] = +parts[k].toFixed(2);
  return { score: +(s / w).toFixed(3), parts };
}
