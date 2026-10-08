// Memoria de gusto por proyecto: qué referencias te gustaron o descartaste y reglas
// propias ("nada de gradientes"). Alimenta el ranking de búsqueda y un perfil agregado.
import { openDb, getSite } from "./db.js";
import { similarity } from "./analysis/similarity.js";

export type Verdict = "like" | "dislike" | "rule";

export function remember(project: string, verdict: Verdict, refId?: string, note?: string) {
  const r = openDb()
    .prepare("INSERT INTO taste (project, ref_id, verdict, note, created_at) VALUES (?,?,?,?,?)")
    .run(project, refId ?? null, verdict, note ?? null, new Date().toISOString());
  return Number(r.lastInsertRowid);
}

export function forget(id: number) {
  openDb().prepare("DELETE FROM taste WHERE id = ?").run(id);
}

interface TasteRow {
  id: number;
  project: string;
  ref_id: string | null;
  verdict: Verdict;
  note: string | null;
  created_at: string;
}

export function tasteEntries(project: string): TasteRow[] {
  return openDb().prepare("SELECT * FROM taste WHERE project = ? ORDER BY id").all(project) as unknown as TasteRow[];
}

/**
 * Empuje por sitio para el ranking: lo que te gustó y lo que se le PARECE sube,
 * lo descartado y su vecindad baja. Pequeño a propósito: ordena, no esconde.
 */
export function tasteBoosts(project: string): Map<string, number> {
  const out = new Map<string, number>();
  const entries = tasteEntries(project).filter((e) => e.ref_id && e.verdict !== "rule");
  if (!entries.length) return out;
  const all = openDb().prepare("SELECT id FROM sites").all() as Array<{ id: string }>;
  for (const e of entries) {
    const ref = getSite(e.ref_id!.split("#")[0]);
    if (!ref) continue;
    const sign = e.verdict === "like" ? 1 : -1;
    for (const { id } of all) {
      const other = id === ref.id ? ref : getSite(id);
      if (!other) continue;
      const sim = id === ref.id ? 1 : similarity(ref.dna, other.dna).score;
      if (sim < 0.6) continue;
      out.set(id, (out.get(id) ?? 0) + sign * 0.35 * sim);
    }
  }
  return out;
}

/** Perfil agregado: rasgos que se repiten en lo que te gustó. Cada rasgo cita de dónde sale. */
export function tasteProfile(project: string) {
  const entries = tasteEntries(project);
  const likes = entries.filter((e) => e.verdict === "like" && e.ref_id).map((e) => getSite(e.ref_id!.split("#")[0])).filter(Boolean);
  const dislikes = entries.filter((e) => e.verdict === "dislike" && e.ref_id).map((e) => getSite(e.ref_id!.split("#")[0])).filter(Boolean);
  const count = (vals: string[]) => {
    const m = new Map<string, number>();
    for (const v of vals) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, n }));
  };
  const L = likes.map((s) => s!.dna);
  return {
    project,
    rules: entries.filter((e) => e.verdict === "rule").map((e) => ({ id: e.id, note: e.note })),
    liked: likes.map((s) => ({ id: s!.id, name: s!.name })),
    disliked: dislikes.map((s) => ({ id: s!.id, name: s!.name })),
    notes: entries.filter((e) => e.note && e.verdict !== "rule").map((e) => ({ id: e.id, verdict: e.verdict, ref: e.ref_id, note: e.note })),
    traits: L.length
      ? {
          theme: count(L.map((d) => d.theme)),
          pairing: count(L.map((d) => d.typography.pairing)),
          headingFamilies: count(L.map((d) => d.typography.heading?.family ?? "—")),
          density: count(L.map((d) => d.layout.density)),
          shadows: count(L.map((d) => d.shape.shadows)),
          accentFamilies: count(L.map((d) => d.palette.swatches.find((s) => s.role === "accent")?.family ?? "sin acento")),
          radius: count(L.map((d) => (d.shape.radius >= 999 ? "pill" : d.shape.radius >= 12 ? "redondeado" : d.shape.radius <= 2 ? "recto" : "medio"))),
        }
      : undefined,
  };
}
