// Composición como DATO: con las secuencias de secciones de N sitios, qué secciones
// aparecen, dónde suelen ir y qué orden es el típico. Cada cifra sale del corpus.

export interface SiteSequence {
  id: string;
  name: string;
  sequence: string[];
}

export interface CompositionReport {
  sites: number;
  avgSections: number;
  types: Array<{
    type: string;
    presence: number; // % de sitios que la tienen
    medianPosition: number; // 0 = arriba, 1 = abajo
    examples: string[];
  }>;
  typicalSequence: string[];
  transitions: Array<{ from: string; to: string; count: number }>;
  openings: Array<{ sequence: string[]; count: number }>;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function aggregateComposition(sites: SiteSequence[], minPresence = 0.25): CompositionReport {
  const n = sites.length;
  if (!n) return { sites: 0, avgSections: 0, types: [], typicalSequence: [], transitions: [], openings: [] };
  const byType = new Map<string, { sites: Set<string>; positions: number[]; examples: string[] }>();
  const trans = new Map<string, number>();
  const opens = new Map<string, number>();

  for (const s of sites) {
    const seq = s.sequence;
    const len = Math.max(1, seq.length - 1);
    seq.forEach((t, i) => {
      const e = byType.get(t) ?? { sites: new Set(), positions: [], examples: [] };
      if (!e.sites.has(s.id)) {
        e.sites.add(s.id);
        e.positions.push(seq.length === 1 ? 0 : i / len);
        if (e.examples.length < 6) e.examples.push(s.name);
      }
      byType.set(t, e);
      if (i > 0) {
        const k = `${seq[i - 1]}→${t}`;
        trans.set(k, (trans.get(k) ?? 0) + 1);
      }
    });
    // apertura: lo que va después de navbar/banner (los 3 primeros bloques de contenido)
    const open = seq.filter((t) => t !== "navbar" && t !== "banner").slice(0, 3).join(" → ");
    if (open) opens.set(open, (opens.get(open) ?? 0) + 1);
  }

  const types = [...byType.entries()]
    .map(([type, e]) => ({
      type,
      presence: +(e.sites.size / n).toFixed(2),
      medianPosition: +median(e.positions).toFixed(2),
      examples: e.examples,
    }))
    .sort((a, b) => b.presence - a.presence);

  const typicalSequence = types
    .filter((t) => t.presence >= minPresence && t.type !== "content")
    .sort((a, b) => a.medianPosition - b.medianPosition)
    .map((t) => t.type);

  return {
    sites: n,
    avgSections: +(sites.reduce((s, x) => s + x.sequence.length, 0) / n).toFixed(1),
    types,
    typicalSequence,
    transitions: [...trans.entries()]
      .map(([k, count]) => {
        const [from, to] = k.split("→");
        return { from, to, count };
      })
      .filter((t) => t.from !== t.to)
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    openings: [...opens.entries()]
      .map(([k, count]) => ({ sequence: k.split(" → "), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}
