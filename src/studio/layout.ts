// Dónde va cada pantalla en el lienzo. Regla de Figma: el flujo corre de izquierda a derecha
// (una columna por pantalla, en el orden en que se crearon) y las variantes de una pantalla
// se apilan DEBAJO de ella, en su misma columna, para compararlas. Lo que el humano movió a
// mano (x/y guardados) manda sobre el cálculo.

export interface LayoutItem {
  slug: string;
  width: number;
  height: number;
  order: number;
  variantOf?: string | null;
  x?: number | null;
  y?: number | null;
}

export const GAP_X = 160;
export const GAP_Y = 200;

/** La raíz de una variante (una variante de una variante cuelga de la misma raíz). */
export function rootOf(slug: string, bySlug: Map<string, LayoutItem>): string {
  const seen = new Set<string>();
  let cur = slug;
  while (true) {
    const it = bySlug.get(cur);
    const parent = it?.variantOf;
    if (!parent || !bySlug.has(parent) || seen.has(parent)) return cur;
    seen.add(cur);
    cur = parent;
  }
}

export function layoutBoard(items: LayoutItem[]): Map<string, { x: number; y: number }> {
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const columns = new Map<string, LayoutItem[]>();
  for (const it of sorted) {
    const root = rootOf(it.slug, bySlug);
    const col = columns.get(root) ?? [];
    if (it.slug === root) col.unshift(it);
    else col.push(it);
    columns.set(root, col);
  }
  const out = new Map<string, { x: number; y: number }>();
  let x = 0;
  for (const col of columns.values()) {
    let y = 0;
    for (const it of col) {
      out.set(it.slug, { x: it.x ?? x, y: it.y ?? y });
      y += it.height + GAP_Y;
    }
    x += Math.max(...col.map((c) => c.width)) + GAP_X;
  }
  return out;
}
